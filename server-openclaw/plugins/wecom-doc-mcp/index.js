import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { readFileSync } from "node:fs";

const PLUGIN_ID = "wecom-doc-mcp";
const VERSION = "0.1.0";
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_WECOM_CONFIG_PATH = "/home/node/.openclaw/wecomConfig/config.json";

function stringify(value) {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

function getPluginConfig(api) {
  return api?.config?.plugins?.entries?.[PLUGIN_ID]?.config ?? {};
}

function readDocUrlFromWecomConfig(api) {
  const cfg = getPluginConfig(api);
  const rawPath =
    cfg.wecomConfigPath ||
    process.env.WECOM_CONFIG_PATH ||
    DEFAULT_WECOM_CONFIG_PATH;
  const configPath = String(rawPath || "").trim();
  if (!configPath) {
    return "";
  }

  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8"));
    return String(parsed?.mcpConfig?.doc?.url || "").trim();
  } catch (error) {
    api?.logger?.debug?.(
      `[${PLUGIN_ID}] unable to read WeCom MCP config at ${configPath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return "";
  }
}

function getDocUrl(api) {
  const cfg = getPluginConfig(api);
  return String(
    cfg.docUrl ||
      process.env.WECOM_DOC_MCP_URL ||
      readDocUrlFromWecomConfig(api) ||
      ""
  ).trim();
}

function getTimeoutMs(api) {
  const cfg = getPluginConfig(api);
  const value = Number(cfg.timeoutMs || process.env.WECOM_DOC_MCP_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
}

function maskUrl(rawUrl) {
  if (!rawUrl) {
    return "";
  }
  try {
    const parsed = new URL(rawUrl);
    const entries = Array.from(parsed.searchParams.keys());
    parsed.search = "";
    if (entries.length > 0) {
      parsed.search = `?${entries.map((key) => `${key}=***`).join("&")}`;
    }
    return parsed.toString();
  } catch {
    return rawUrl.replace(/([?&][^=]+)=([^&]+)/g, "$1=***");
  }
}

function normalizeToolResult(result) {
  const textParts = [];
  for (const item of result?.content || []) {
    if (item?.type === "text" && typeof item.text === "string") {
      textParts.push(item.text);
    } else {
      textParts.push(stringify(item));
    }
  }

  return {
    isError: Boolean(result?.isError),
    text: textParts.join("\n\n").trim(),
    structuredContent: result?.structuredContent ?? null,
    raw: result
  };
}

function createPair(api) {
  const docUrl = getDocUrl(api);
  if (!docUrl) {
    throw new Error("WECOM_DOC_MCP_URL is not configured.");
  }

  const client = new Client(
    {
      name: `openclaw-${PLUGIN_ID}`,
      version: VERSION
    },
    {
      capabilities: {}
    }
  );

  client.onerror = (error) => {
    api.logger?.warn?.(
      `[${PLUGIN_ID}] client error: ${error instanceof Error ? error.message : String(error)}`
    );
  };

  return {
    client,
    transport: new StreamableHTTPClientTransport(new URL(docUrl), {
      requestInit: {
        signal: AbortSignal.timeout(getTimeoutMs(api))
      }
    })
  };
}

async function withClient(state, api) {
  if (!state.pair) {
    state.pair = createPair(api);
    await state.pair.client.connect(state.pair.transport);
  }
  return state.pair.client;
}

async function listTools(state, api) {
  const client = await withClient(state, api);
  const result = await client.listTools();
  return (result?.tools || []).map((tool) => ({
    name: tool.name,
    description: tool.description || "",
    inputSchema: tool.inputSchema || null
  }));
}

async function getStatus(state, api) {
  const docUrl = getDocUrl(api);
  if (!docUrl) {
    return {
      ok: false,
      plugin: PLUGIN_ID,
      configured: false,
      endpoint: "",
      error: "WECOM_DOC_MCP_URL is not configured."
    };
  }

  try {
    const tools = await listTools(state, api);
    return {
      ok: true,
      plugin: PLUGIN_ID,
      configured: true,
      endpoint: maskUrl(docUrl),
      toolCount: tools.length
    };
  } catch (error) {
    return {
      ok: false,
      plugin: PLUGIN_ID,
      configured: true,
      endpoint: maskUrl(docUrl),
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function register(api) {
  const state = {
    pair: null
  };

  api.registerTool({
    name: "wecom_doc_mcp_status",
    label: "WeCom Doc MCP Status",
    description: "Check whether the WeCom document MCP endpoint is reachable.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {}
    },
    execute: async () => stringify(await getStatus(state, api))
  });

  api.registerTool({
    name: "wecom_doc_mcp_list_tools",
    label: "WeCom Doc MCP List Tools",
    description: "List available tools exposed by the WeCom document MCP endpoint.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {}
    },
    execute: async () =>
      stringify({
        endpoint: maskUrl(getDocUrl(api)),
        tools: await listTools(state, api)
      })
  });

  api.registerTool({
    name: "wecom_doc_mcp_call",
    label: "WeCom Doc MCP Call",
    description: "Invoke a specific WeCom document MCP tool with a JSON input payload.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        tool: {
          type: "string",
          description: "Exact tool name returned by wecom_doc_mcp_list_tools."
        },
        input: {
          type: "object",
          additionalProperties: true,
          description: "Arguments passed through to the MCP tool."
        }
      },
      required: ["tool"]
    },
    execute: async (_toolCallId, payload = {}) => {
      const tool = String(payload?.tool || "").trim();
      if (!tool) {
        throw new Error("tool is required");
      }

      const client = await withClient(state, api);
      const result = normalizeToolResult(
        await client.callTool({
          name: tool,
          arguments:
            payload?.input && typeof payload.input === "object" && !Array.isArray(payload.input)
              ? payload.input
              : {}
        })
      );

      return stringify({
        endpoint: maskUrl(getDocUrl(api)),
        tool,
        isError: result.isError,
        text: result.text,
        structuredContent: result.structuredContent
      });
    }
  });
}

const plugin = {
  id: PLUGIN_ID,
  name: "WeCom Document MCP",
  description: "Connect OpenClaw to the WeCom document MCP endpoint.",
  register
};

export default plugin;

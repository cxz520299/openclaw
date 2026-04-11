import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const execFileAsync = promisify(execFile);

const PLUGIN_ID = "wecom-doc-mcp";
const VERSION = "0.2.0";
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_WECOM_CONFIG_PATH = "/home/node/.openclaw/wecomConfig/config.json";
const DEFAULT_WECOM_ACCESS_TOKEN_API_URL = "https://qyapi.weixin.qq.com/cgi-bin/gettoken";
const DIRECT_ENDPOINT = "https://qyapi.weixin.qq.com/cgi-bin";

const DIRECT_TOOLS = [
  {
    name: "create_doc",
    description: "Create a new Enterprise WeChat document or smart sheet through the direct server-side API.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        doc_type: {
          type: "number",
          description: "3 means normal document, 10 means smart sheet."
        },
        doc_name: {
          type: "string",
          description: "Document title."
        }
      },
      required: ["doc_type", "doc_name"]
    }
  },
  {
    name: "smartsheet_get_sheet",
    description: "Fetch smart sheet metadata for a WeCom document.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        docid: {
          type: "string"
        },
        need_all_type_sheet: {
          type: "boolean",
          description: "Whether to return all sheet types."
        }
      },
      required: ["docid"]
    }
  },
  {
    name: "smartsheet_get_fields",
    description: "Fetch fields for a smart sheet.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        docid: {
          type: "string"
        },
        sheet_id: {
          type: "string"
        }
      },
      required: ["docid", "sheet_id"]
    }
  },
  {
    name: "smartsheet_add_fields",
    description: "Add fields to a smart sheet.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        docid: {
          type: "string"
        },
        sheet_id: {
          type: "string"
        },
        fields: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: true
          }
        }
      },
      required: ["docid", "sheet_id", "fields"]
    }
  },
  {
    name: "smartsheet_update_fields",
    description: "Update smart sheet fields.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        docid: {
          type: "string"
        },
        sheet_id: {
          type: "string"
        },
        fields: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: true
          }
        }
      },
      required: ["docid", "sheet_id", "fields"]
    }
  },
  {
    name: "smartsheet_add_records",
    description: "Insert records into a smart sheet.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        docid: {
          type: "string"
        },
        sheet_id: {
          type: "string"
        },
        records: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: true
          }
        }
      },
      required: ["docid", "sheet_id", "records"]
    }
  },
  {
    name: "create_structured_report",
    description:
      "Create a directly openable Enterprise WeChat smart sheet report from a title, summary, and sections.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: {
          type: "string",
          description: "Document title."
        },
        summary: {
          type: "string",
          description: "Optional report summary."
        },
        sections: {
          type: "array",
          description: "Optional structured sections. Each item can contain section, content, and link.",
          items: {
            type: "object",
            additionalProperties: true,
            properties: {
              section: {
                type: "string"
              },
              content: {
                type: "string"
              },
              link: {
                type: "string"
              }
            }
          }
        },
        content: {
          description: "Fallback content. Can be a string, an array of strings, or an array of section objects."
        }
      },
      required: ["title"]
    }
  }
];

let cachedDirectToken = {
  cacheKey: "",
  token: "",
  expiresAtMs: 0
};

function stringify(value) {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

function maybeParseJson(value) {
  if (typeof value !== "string") {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeMode(rawMode) {
  const mode = String(rawMode || "auto").trim().toLowerCase();
  return mode === "direct" || mode === "mcp" ? mode : "auto";
}

function getPluginConfig(api) {
  return api?.config?.plugins?.entries?.[PLUGIN_ID]?.config ?? {};
}

function getMode(api) {
  const cfg = getPluginConfig(api);
  return normalizeMode(cfg.mode || process.env.WECOM_DOC_MCP_MODE || "auto");
}

function readDocUrlFromWecomConfig(api) {
  const cfg = getPluginConfig(api);
  const rawPath = cfg.wecomConfigPath || process.env.WECOM_CONFIG_PATH || DEFAULT_WECOM_CONFIG_PATH;
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
  return String(cfg.docUrl || process.env.WECOM_DOC_MCP_URL || readDocUrlFromWecomConfig(api) || "").trim();
}

function getTimeoutMs(api) {
  const cfg = getPluginConfig(api);
  const value = Number(cfg.timeoutMs || process.env.WECOM_DOC_MCP_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
}

function getDirectConfig(api) {
  const cfg = getPluginConfig(api);
  return {
    accessTokenApiUrl: String(
      cfg.accessTokenApiUrl || process.env.WECOM_UPLOAD_ACCESS_TOKEN_API_URL || DEFAULT_WECOM_ACCESS_TOKEN_API_URL
    ).trim(),
    accessToken: String(cfg.accessToken || process.env.WECOM_UPLOAD_IMAGE_ACCESS_TOKEN || "").trim(),
    accessTokenCommand: String(
      cfg.accessTokenCommand || process.env.WECOM_UPLOAD_IMAGE_ACCESS_TOKEN_COMMAND || ""
    ).trim(),
    corpid: String(cfg.corpid || process.env.WECOM_UPLOAD_CORPID || "").trim(),
    secret: String(cfg.secret || process.env.WECOM_UPLOAD_SECRET || "").trim()
  };
}

function hasDirectCredentialSource(api) {
  const cfg = getDirectConfig(api);
  return Boolean(cfg.accessToken || cfg.accessTokenCommand || (cfg.corpid && cfg.secret));
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

async function listRemoteTools(state, api) {
  const client = await withClient(state, api);
  const result = await client.listTools();
  return (result?.tools || []).map((tool) => ({
    name: tool.name,
    description: tool.description || "",
    inputSchema: tool.inputSchema || null
  }));
}

async function resolveDirectAccessToken(api) {
  const direct = getDirectConfig(api);

  if (direct.accessToken) {
    return direct.accessToken;
  }

  if (direct.accessTokenCommand) {
    const { stdout } = await execFileAsync("sh", ["-lc", direct.accessTokenCommand], {
      timeout: getTimeoutMs(api),
      maxBuffer: 1024 * 1024
    });
    return String(stdout || "").trim().split(/\s+/u)[0] || "";
  }

  if (!direct.corpid || !direct.secret) {
    return "";
  }

  const cacheKey = `${direct.corpid}:${direct.secret}`;
  if (
    cachedDirectToken.cacheKey === cacheKey &&
    cachedDirectToken.token &&
    cachedDirectToken.expiresAtMs > Date.now() + 60_000
  ) {
    return cachedDirectToken.token;
  }

  const tokenUrl = new URL(direct.accessTokenApiUrl || DEFAULT_WECOM_ACCESS_TOKEN_API_URL);
  tokenUrl.searchParams.set("corpid", direct.corpid);
  tokenUrl.searchParams.set("corpsecret", direct.secret);

  const response = await fetch(tokenUrl, {
    signal: AbortSignal.timeout(getTimeoutMs(api))
  });
  const rawText = await response.text();
  const parsed = maybeParseJson(rawText);
  if (!response.ok) {
    throw new Error(`Fetch WeCom access token failed: HTTP ${response.status}: ${rawText}`);
  }
  if (Number(parsed?.errcode || 0) !== 0 || !parsed?.access_token) {
    throw new Error(`Fetch WeCom access token failed: ${parsed?.errmsg || rawText || "unknown error"}`);
  }

  const token = String(parsed.access_token || "").trim();
  const expiresInMs = Math.max(60, Number(parsed?.expires_in || 7200)) * 1000;
  cachedDirectToken = {
    cacheKey,
    token,
    expiresAtMs: Date.now() + expiresInMs
  };
  return token;
}

async function callDirectApi(api, endpoint, payload = {}) {
  const accessToken = await resolveDirectAccessToken(api);
  if (!accessToken) {
    throw new Error("Direct WeCom document API credentials are not configured.");
  }

  const url = new URL(`${DIRECT_ENDPOINT}/${String(endpoint || "").replace(/^\/+/u, "")}`);
  url.searchParams.set("access_token", accessToken);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload || {}),
    signal: AbortSignal.timeout(getTimeoutMs(api))
  });
  const rawText = await response.text();
  const parsed = maybeParseJson(rawText);
  if (!response.ok) {
    throw new Error(`Direct WeCom API ${endpoint} failed: HTTP ${response.status}: ${rawText}`);
  }
  if (Number(parsed?.errcode || 0) !== 0) {
    throw new Error(`Direct WeCom API ${endpoint} failed: ${parsed?.errmsg || rawText || "unknown error"}`);
  }
  return parsed || {};
}

function extractFieldTitle(field) {
  return String(field?.field_title || field?.title || "").trim();
}

function buildTextCell(text) {
  return [{ type: "text", text: String(text || "") }];
}

function normalizeStructuredSections(payload) {
  const sections = [];

  if (typeof payload?.summary === "string" && payload.summary.trim()) {
    sections.push({
      section: "摘要",
      content: payload.summary.trim(),
      link: ""
    });
  }

  const source = Array.isArray(payload?.sections)
    ? payload.sections
    : Array.isArray(payload?.content)
      ? payload.content
      : typeof payload?.content === "string" && payload.content.trim()
        ? [{ section: "正文", content: payload.content.trim(), link: "" }]
        : [];

  for (const item of source) {
    if (typeof item === "string") {
      const content = item.trim();
      if (content) {
        sections.push({
          section: "正文",
          content,
          link: ""
        });
      }
      continue;
    }

    if (!item || typeof item !== "object") {
      continue;
    }

    const section = String(item.section || item.title || item.name || "正文").trim() || "正文";
    const content = String(item.content || item.text || item.body || "").trim();
    const link = String(item.link || item.url || "").trim();
    if (!content && !link) {
      continue;
    }
    sections.push({
      section,
      content,
      link
    });
  }

  if (sections.length === 0) {
    sections.push({
      section: "正文",
      content: "已创建文档，可继续追加内容。",
      link: ""
    });
  }

  return sections;
}

async function ensureStructuredReportFields(api, docid, sheetId) {
  const fieldsResult = await callDirectApi(api, "wedoc/smartsheet/get_fields", {
    docid,
    sheet_id: sheetId
  });
  const fields = Array.isArray(fieldsResult?.fields) ? fieldsResult.fields : [];
  let sectionFieldId = "";
  let contentFieldId = "";
  let linkFieldId = "";

  const titleToId = new Map(
    fields.map((field) => [extractFieldTitle(field), String(field?.field_id || "").trim()]).filter(([, fieldId]) => fieldId)
  );

  sectionFieldId = titleToId.get("章节") || "";
  contentFieldId = titleToId.get("内容") || "";
  linkFieldId = titleToId.get("链接") || "";

  if (!sectionFieldId) {
    const defaultTextField = fields.find((field) => String(field?.field_type || "").trim() === "FIELD_TYPE_TEXT");
    if (defaultTextField?.field_id) {
      sectionFieldId = String(defaultTextField.field_id);
      if (extractFieldTitle(defaultTextField) !== "章节") {
        await callDirectApi(api, "wedoc/smartsheet/update_fields", {
          docid,
          sheet_id: sheetId,
          fields: [
            {
              field_id: sectionFieldId,
              field_title: "章节",
              field_type: "FIELD_TYPE_TEXT"
            }
          ]
        });
      }
    }
  }

  const missingFields = [];
  if (!contentFieldId) {
    missingFields.push({
      field_title: "内容",
      field_type: "FIELD_TYPE_TEXT"
    });
  }
  if (!linkFieldId) {
    missingFields.push({
      field_title: "链接",
      field_type: "FIELD_TYPE_TEXT"
    });
  }

  if (missingFields.length > 0) {
    await callDirectApi(api, "wedoc/smartsheet/add_fields", {
      docid,
      sheet_id: sheetId,
      fields: missingFields
    });
  }

  const refreshedResult = await callDirectApi(api, "wedoc/smartsheet/get_fields", {
    docid,
    sheet_id: sheetId
  });
  const refreshedFields = Array.isArray(refreshedResult?.fields) ? refreshedResult.fields : [];
  const refreshedMap = new Map(
    refreshedFields
      .map((field) => [extractFieldTitle(field), String(field?.field_id || "").trim()])
      .filter(([, fieldId]) => fieldId)
  );

  return {
    sectionFieldId: refreshedMap.get("章节") || sectionFieldId,
    contentFieldId: refreshedMap.get("内容") || contentFieldId,
    linkFieldId: refreshedMap.get("链接") || linkFieldId
  };
}

function buildStructuredReportRecords(fieldMap, sections) {
  return sections.map((section) => {
    const values = {};
    if (fieldMap.sectionFieldId) {
      values[fieldMap.sectionFieldId] = buildTextCell(section.section || "正文");
    }
    if (fieldMap.contentFieldId) {
      values[fieldMap.contentFieldId] = buildTextCell(section.content || "");
    }
    if (fieldMap.linkFieldId && section.link) {
      values[fieldMap.linkFieldId] = buildTextCell(section.link);
    }
    return { values };
  });
}

async function createStructuredReport(api, payload = {}) {
  const title = String(payload?.title || "").trim();
  if (!title) {
    throw new Error("title is required");
  }

  const created = await callDirectApi(api, "wedoc/create_doc", {
    doc_type: 10,
    doc_name: title
  });
  const docid = String(created?.docid || "").trim();
  const url = String(created?.url || "").trim();
  if (!docid) {
    throw new Error(`WeCom create_doc succeeded but docid is missing: ${stringify(created)}`);
  }

  const sheetResult = await callDirectApi(api, "wedoc/smartsheet/get_sheet", {
    docid,
    need_all_type_sheet: true
  });
  const sheetId = String(
    (sheetResult?.sheet_list || []).find((item) => String(item?.type || "").trim() === "smartsheet")?.sheet_id ||
      sheetResult?.sheet_list?.[0]?.sheet_id ||
      ""
  ).trim();
  if (!sheetId) {
    throw new Error(`WeCom smartsheet created but sheet_id is missing: ${stringify(sheetResult)}`);
  }

  const sections = normalizeStructuredSections(payload);
  const fieldMap = await ensureStructuredReportFields(api, docid, sheetId);
  const records = buildStructuredReportRecords(fieldMap, sections);
  if (records.length > 0) {
    await callDirectApi(api, "wedoc/smartsheet/add_records", {
      docid,
      sheet_id: sheetId,
      key_type: "CELL_VALUE_KEY_TYPE_FIELD_ID",
      records
    });
  }

  return {
    errcode: 0,
    errmsg: "ok",
    docid,
    url,
    sheet_id: sheetId,
    record_count: records.length,
    message: "已创建企业微信文档（智能表），可直接打开查看。"
  };
}

async function executeQuickReport(state, api, payload = {}) {
  const input =
    payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  const transportState = await getTransportState(state, api, payload?.transport || "auto");

  if (transportState.transport === "direct") {
    const result = await createStructuredReport(api, input);
    return stringify({
      transport: "direct",
      endpoint: DIRECT_ENDPOINT,
      tool: "create_structured_report",
      isError: false,
      text: stringify(result),
      structuredContent: result
    });
  }

  const client = await withClient(state, api);
  const result = normalizeToolResult(
    await client.callTool({
      name: "create_structured_report",
      arguments: input
    })
  );

  return stringify({
    transport: "mcp",
    endpoint: maskUrl(getDocUrl(api)),
    tool: "create_structured_report",
    isError: result.isError,
    text: result.text,
    structuredContent: result.structuredContent
  });
}

async function getTransportState(state, api, requestedTransport = "auto") {
  const requested = normalizeMode(requestedTransport === "auto" ? getMode(api) : requestedTransport);
  const directConfigured = hasDirectCredentialSource(api);
  const mcpConfigured = Boolean(getDocUrl(api));

  if (requested === "direct") {
    if (!directConfigured) {
      throw new Error("Direct WeCom document API credentials are not configured.");
    }
    await resolveDirectAccessToken(api);
    return {
      transport: "direct",
      directConfigured,
      mcpConfigured
    };
  }

  if (requested === "mcp") {
    if (!mcpConfigured) {
      throw new Error("WECOM_DOC_MCP_URL is not configured.");
    }
    return {
      transport: "mcp",
      directConfigured,
      mcpConfigured
    };
  }

  if (directConfigured) {
    try {
      await resolveDirectAccessToken(api);
      return {
        transport: "direct",
        directConfigured,
        mcpConfigured
      };
    } catch (error) {
      api?.logger?.warn?.(
        `[${PLUGIN_ID}] direct mode unavailable, falling back to MCP: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      if (!mcpConfigured) {
        throw error;
      }
    }
  }

  if (mcpConfigured) {
    return {
      transport: "mcp",
      directConfigured,
      mcpConfigured
    };
  }

  throw new Error("Neither direct WeCom API credentials nor WECOM_DOC_MCP_URL are configured.");
}

async function listTools(state, api, requestedTransport = "auto") {
  const transportState = await getTransportState(state, api, requestedTransport);
  if (transportState.transport === "direct") {
    return {
      transport: "direct",
      tools: DIRECT_TOOLS
    };
  }
  return {
    transport: "mcp",
    tools: await listRemoteTools(state, api)
  };
}

async function getStatus(state, api, requestedTransport = "auto") {
  const docUrl = getDocUrl(api);
  const directConfigured = hasDirectCredentialSource(api);
  const status = {
    ok: false,
    plugin: PLUGIN_ID,
    configured: directConfigured || Boolean(docUrl),
    requestedTransport: normalizeMode(requestedTransport === "auto" ? getMode(api) : requestedTransport),
    selectedTransport: "",
    direct: {
      configured: directConfigured
    },
    mcp: {
      configured: Boolean(docUrl),
      endpoint: maskUrl(docUrl)
    }
  };

  try {
    const listed = await listTools(state, api, requestedTransport);
    status.ok = true;
    status.selectedTransport = listed.transport;
    status.toolCount = listed.tools.length;
    return status;
  } catch (error) {
    status.error = error instanceof Error ? error.message : String(error);
    return status;
  }
}

function getDirectToolDefinition(toolName) {
  return DIRECT_TOOLS.find((tool) => tool.name === toolName) || null;
}

function getRequiredString(payload, key) {
  const value = String(payload?.[key] || "").trim();
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}

function getObjectArray(payload, key) {
  if (!Array.isArray(payload?.[key])) {
    throw new Error(`${key} must be an array`);
  }
  return payload[key];
}

async function callDirectTool(api, tool, input = {}) {
  switch (tool) {
    case "create_doc":
      return callDirectApi(api, "wedoc/create_doc", {
        doc_type: Number(input?.doc_type),
        doc_name: getRequiredString(input, "doc_name")
      });
    case "smartsheet_get_sheet":
      return callDirectApi(api, "wedoc/smartsheet/get_sheet", {
        docid: getRequiredString(input, "docid"),
        need_all_type_sheet: Boolean(input?.need_all_type_sheet)
      });
    case "smartsheet_get_fields":
      return callDirectApi(api, "wedoc/smartsheet/get_fields", {
        docid: getRequiredString(input, "docid"),
        sheet_id: getRequiredString(input, "sheet_id")
      });
    case "smartsheet_add_fields":
      return callDirectApi(api, "wedoc/smartsheet/add_fields", {
        docid: getRequiredString(input, "docid"),
        sheet_id: getRequiredString(input, "sheet_id"),
        fields: getObjectArray(input, "fields")
      });
    case "smartsheet_update_fields":
      return callDirectApi(api, "wedoc/smartsheet/update_fields", {
        docid: getRequiredString(input, "docid"),
        sheet_id: getRequiredString(input, "sheet_id"),
        fields: getObjectArray(input, "fields")
      });
    case "smartsheet_add_records":
      return callDirectApi(api, "wedoc/smartsheet/add_records", {
        docid: getRequiredString(input, "docid"),
        sheet_id: getRequiredString(input, "sheet_id"),
        records: getObjectArray(input, "records")
      });
    case "create_structured_report":
      return createStructuredReport(api, input);
    default:
      throw new Error(`Unsupported direct tool: ${tool}`);
  }
}

function register(api) {
  const state = {
    pair: null
  };

  api.registerTool({
    name: "wecom_doc_quick_report",
    label: "WeCom Doc Quick Report",
    description:
      "Fast path for creating an Enterprise WeChat document or smart sheet report without listing tools first.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        transport: {
          type: "string",
          description: "Optional transport override: auto, direct, or mcp."
        },
        title: {
          type: "string",
          description: "Document title."
        },
        summary: {
          type: "string",
          description: "Optional report summary."
        },
        sections: {
          type: "array",
          description: "Optional structured sections. Each item can contain section, content, and link.",
          items: {
            type: "object",
            additionalProperties: true
          }
        },
        content: {
          description: "Fallback content. Can be a string, an array of strings, or an array of section objects."
        }
      },
      required: ["title"]
    },
    execute: async (_toolCallId, payload = {}) => executeQuickReport(state, api, payload)
  });

  api.registerTool({
    name: "wecom_doc_mcp_status",
    label: "WeCom Doc MCP Status",
    description: "Check whether direct WeCom document APIs or the WeCom document MCP endpoint are reachable.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        transport: {
          type: "string",
          description: "Optional transport override: auto, direct, or mcp."
        }
      }
    },
    execute: async (_toolCallId, payload = {}) => stringify(await getStatus(state, api, payload?.transport || "auto"))
  });

  api.registerTool({
    name: "wecom_doc_mcp_list_tools",
    label: "WeCom Doc MCP List Tools",
    description: "List available Enterprise WeChat document tools from direct mode or the MCP endpoint.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        transport: {
          type: "string",
          description: "Optional transport override: auto, direct, or mcp."
        }
      }
    },
    execute: async (_toolCallId, payload = {}) => {
      const listed = await listTools(state, api, payload?.transport || "auto");
      return stringify({
        transport: listed.transport,
        endpoint: listed.transport === "mcp" ? maskUrl(getDocUrl(api)) : DIRECT_ENDPOINT,
        tools: listed.tools
      });
    }
  });

  api.registerTool({
    name: "wecom_doc_mcp_call",
    label: "WeCom Doc MCP Call",
    description: "Invoke a specific Enterprise WeChat document tool. In auto mode, direct server-side APIs are preferred.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        tool: {
          type: "string",
          description: "Exact tool name returned by wecom_doc_mcp_list_tools."
        },
        transport: {
          type: "string",
          description: "Optional transport override: auto, direct, or mcp."
        },
        input: {
          type: "object",
          additionalProperties: true,
          description: "Arguments passed through to the selected tool."
        }
      },
      required: ["tool"]
    },
    execute: async (_toolCallId, payload = {}) => {
      const tool = String(payload?.tool || "").trim();
      if (!tool) {
        throw new Error("tool is required");
      }

      const transportState = await getTransportState(state, api, payload?.transport || "auto");
      if (transportState.transport === "direct") {
        const toolDefinition = getDirectToolDefinition(tool);
        if (!toolDefinition) {
          throw new Error(`Tool ${tool} is not available in direct mode.`);
        }
        const result = await callDirectTool(
          api,
          tool,
          payload?.input && typeof payload.input === "object" && !Array.isArray(payload.input) ? payload.input : {}
        );
        return stringify({
          transport: "direct",
          endpoint: DIRECT_ENDPOINT,
          tool,
          isError: false,
          text: stringify(result),
          structuredContent: result
        });
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
        transport: "mcp",
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
  description: "Connect OpenClaw to Enterprise WeChat document capabilities with direct APIs and MCP fallback.",
  register
};

export default plugin;

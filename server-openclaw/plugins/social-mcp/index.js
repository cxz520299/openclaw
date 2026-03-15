import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const PLUGIN_ID = "social-mcp";
const VERSION = "0.1.0";
const WORKSPACE_ROOT = process.env.OPENCLAW_WORKSPACE_DIR || "/home/node/.openclaw/workspace";
const REPORT_SCRIPT = path.join(WORKSPACE_ROOT, "reports/scripts/social_report.py");
const REPORTS_ROOT = path.join(WORKSPACE_ROOT, "reports");
const DASHBOARD_SCRIPT = path.join(WORKSPACE_ROOT, "reports/scripts/generate_reports_dashboard.py");
const BILIBILI_FALLBACK_TOOLS = [
  {
    name: "general_search",
    description: "Search Bilibili content by keyword.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        keyword: { type: "string" }
      },
      required: ["keyword"]
    }
  },
  {
    name: "search_user",
    description: "Search Bilibili users by keyword.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        keyword: { type: "string" },
        page: { type: "integer" }
      },
      required: ["keyword"]
    }
  },
  {
    name: "get_precise_results",
    description: "Search Bilibili by type with a keyword.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        keyword: { type: "string" },
        search_type: { type: "string" }
      },
      required: ["keyword"]
    }
  }
];
const XIAOHONGSHU_FALLBACK_TOOLS = [
  {
    name: "xhs_auth_status",
    description: "Check whether the XiaoHongShu account is logged in.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {}
    }
  },
  {
    name: "xhs_auth_login",
    description: "Open the XiaoHongShu login flow.",
    inputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {}
    }
  },
  {
    name: "xhs_search_note",
    description: "Search XiaoHongShu notes by keyword.",
    inputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        keyword: {
          type: "string"
        }
      },
      required: ["keyword"]
    }
  },
  {
    name: "xhs_discover_feeds",
    description: "Fetch recommended XiaoHongShu feed items.",
    inputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {}
    }
  },
  {
    name: "xhs_get_note_detail",
    description: "Get details for a XiaoHongShu note.",
    inputSchema: {
      type: "object",
      additionalProperties: true,
      properties: {
        note_id: {
          type: "string"
        }
      },
      required: ["note_id"]
    }
  }
];

function getPluginConfig(api) {
  return api?.config?.plugins?.entries?.[PLUGIN_ID]?.config ?? {};
}

function getPlatformConfig(api) {
  const cfg = getPluginConfig(api);
  return {
    bilibili: {
      mode: "stdio",
      command: cfg.bilibiliCommand || "python3",
      args: Array.isArray(cfg.bilibiliArgs)
        ? cfg.bilibiliArgs
        : ["/opt/openclaw/social-sources/bilibili.py"]
    },
    weibo: {
      mode: "http",
      url: cfg.weiboUrl || "http://weibo-mcp:4200/mcp"
    },
    xiaohongshu: {
      mode: cfg.xiaohongshuUrl ? "http" : "stdio",
      url: cfg.xiaohongshuUrl || null,
      command: cfg.xiaohongshuCommand || "npx",
      args: Array.isArray(cfg.xiaohongshuArgs)
        ? cfg.xiaohongshuArgs
        : ["-y", "xhs-mcp", "mcp"]
    }
  };
}

function stringify(value) {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function slugify(value, fallback = "task") {
  const text = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return text || fallback;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function dateStamp(timeZone = "Asia/Shanghai") {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function safeNumber(value) {
  const cleaned =
    typeof value === "string"
      ? value.replace(/[^\d.-]/g, "")
      : value;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function tryParseJson(text) {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function unwrapNode(node) {
  if (node == null) return null;
  if (Array.isArray(node)) return node;
  if (typeof node !== "object") return node;

  const preferredKeys = ["items", "list", "data", "notes", "feeds", "results", "records"];
  for (const key of preferredKeys) {
    if (Array.isArray(node[key])) {
      return node[key];
    }
  }
  return node;
}

function collectObjects(node, rows = []) {
  const unwrapped = unwrapNode(node);
  if (Array.isArray(unwrapped)) {
    for (const item of unwrapped) {
      collectObjects(item, rows);
    }
    return rows;
  }

  if (!unwrapped || typeof unwrapped !== "object") {
    return rows;
  }

  const signalKeys = [
    "title",
    "note_title",
    "desc",
    "content",
    "author",
    "user",
    "nickname",
    "liked_count",
    "likes",
    "comment_count",
    "comments",
    "share_count",
    "shares",
    "note_id",
    "id",
    "url"
  ];
  if (signalKeys.some((key) => key in unwrapped)) {
    rows.push(unwrapped);
  }

  for (const value of Object.values(unwrapped)) {
    if (value && typeof value === "object") {
      collectObjects(value, rows);
    }
  }
  return rows;
}

function pickFirst(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return cleanText(value);
  }
  return "";
}

function countChineseChars(value) {
  const matches = String(value || "").match(/[\u3400-\u9fff]/g);
  return matches ? matches.length : 0;
}

function countMojibakeMarkers(value) {
  const matches = String(value || "").match(/[ÃÂÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ]/g);
  return matches ? matches.length : 0;
}

function maybeRepairMojibake(value) {
  const text = String(value || "");
  if (!text) return "";

  const suspicious = /[ÃÂÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ]/.test(text);
  if (!suspicious) {
    return text;
  }

  try {
    const repaired = Buffer.from(text, "latin1").toString("utf8");
    const repairedChinese = countChineseChars(repaired);
    const originalChinese = countChineseChars(text);
    const repairedMarkers = countMojibakeMarkers(repaired);
    const originalMarkers = countMojibakeMarkers(text);
    if (repairedChinese > originalChinese || repairedMarkers < originalMarkers) {
      return repaired;
    }
  } catch {
    return text;
  }

  return text;
}

function cleanText(value) {
  return maybeRepairMojibake(value).replace(/\s+/g, " ").trim();
}

function isLikelyPlaceholderTitle(value) {
  const text = cleanText(value).toLowerCase();
  if (!text) return true;

  const blockedTerms = [
    "沪icp",
    "公网安备",
    "营业执照",
    "网络文化经营许可",
    "互联网药品信息服务",
    "互联网举报中心",
    "有害信息举报专区",
    "搜索小红书",
    "小红书_沪",
    "小红书_网文",
    "小红书_医疗器械网络交易服务"
  ];

  return blockedTerms.some((term) => text.includes(term));
}

function toRecord(item, context) {
  const author =
    pickFirst(
      item.author,
      item.user,
      item.nickname,
      item?.user_info?.nickname,
      item?.author?.nickname,
      item?.user?.nickname
    );
  const title = pickFirst(item.title, item.note_title, item.desc, item.content, item.name);
  const url = pickFirst(item.url, item.link, item.note_url, item.jump_url);
  const publishedAt = pickFirst(
    item.published_at,
    item.publish_time,
    item.time,
    item.create_time,
    item.updated_at
  );
  const noteId = pickFirst(item.note_id, item.id);
  if (context.platform === "xiaohongshu" && isLikelyPlaceholderTitle(title)) {
    return null;
  }
  return {
    platform: context.platform,
    keyword: context.keyword || "",
    title,
    author,
    likes: safeNumber(item.likes ?? item.liked_count ?? item.like_count ?? item.favorite_count),
    comments: safeNumber(item.comments ?? item.comment_count),
    shares: safeNumber(item.shares ?? item.share_count),
    published_at: publishedAt,
    url,
    note_id: noteId
  };
}

function uniqueRecords(records) {
  const seen = new Set();
  const rows = [];
  for (const record of records) {
    const key = [record.platform, record.title, record.author, record.url, record.note_id].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(record);
  }
  return rows;
}

function extractStructuredRecords(result, context) {
  const candidates = [];
  if (result?.structuredContent) {
    candidates.push(result.structuredContent);
  }
  const parsedText = tryParseJson(result?.text);
  if (parsedText) {
    candidates.push(parsedText);
  }

  const records = [];
  for (const candidate of candidates) {
    for (const item of collectObjects(candidate, [])) {
      const record = toRecord(item, context);
      if (record && (record.title || record.author || record.url || record.note_id)) {
        records.push(record);
      }
    }
  }
  return uniqueRecords(records);
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function runReportScript(inputPath, outdir) {
  await ensureDir(outdir);
  return new Promise((resolve, reject) => {
    const child = spawn(
      "python3",
      [REPORT_SCRIPT, "--input", inputPath, "--outdir", outdir],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`social_report.py exited with code ${code}: ${stderr || stdout}`));
    });
  });
}

async function refreshReportsDashboard() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "python3",
      [DASHBOARD_SCRIPT, "--reports-root", REPORTS_ROOT],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`generate_reports_dashboard.py exited with code ${code}: ${stderr || stdout}`));
    });
  });
}

async function runPythonJson(code, payload) {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", ["-c", code], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || stdout || `python exited with code ${code}`));
        return;
      }
      resolve(stdout);
    });
    child.stdin.write(JSON.stringify(payload || {}));
    child.stdin.end();
  });
}

async function callBilibiliFallback(tool, args) {
  const code = `
import json, sys
from bilibili_api import search, sync
from bilibili_api.search import OrderUser, SearchObjectType

payload = json.load(sys.stdin)
tool = payload.get("tool")
args = payload.get("args", {})
keyword = args.get("keyword", "")

if tool == "general_search":
    result = sync(search.search(keyword))
elif tool == "search_user":
    result = sync(search.search_by_type(
        keyword=keyword,
        search_type=SearchObjectType.USER,
        order_type=OrderUser.FANS,
        page=int(args.get("page", 1)),
    ))
elif tool == "get_precise_results":
    mapping = {
        "user": SearchObjectType.USER,
        "video": SearchObjectType.VIDEO,
        "live": SearchObjectType.LIVE,
        "article": SearchObjectType.ARTICLE,
    }
    search_type = str(args.get("search_type", "video")).lower()
    result = sync(search.search_by_type(
        keyword=keyword,
        search_type=mapping.get(search_type, SearchObjectType.VIDEO),
        page=1,
        page_size=20,
    ))
else:
    raise SystemExit(f"unsupported bilibili tool: {tool}")

print(json.dumps(result, ensure_ascii=False))
`;
  const stdout = await runPythonJson(code, { tool, args });
  let structuredContent = null;
  try {
    structuredContent = JSON.parse(stdout);
  } catch {
    structuredContent = null;
  }
  return {
    isError: false,
    text: typeof stdout === "string" ? stdout.trim() : "",
    structuredContent,
    raw: structuredContent
  };
}

async function buildArtifacts({ platform, keyword, tool, result }) {
  const stamp = timestamp();
  const baseName = `${stamp}-${slugify(platform)}-${slugify(keyword || tool || "report")}`;
  const rawDir = path.join(WORKSPACE_ROOT, "reports/raw");
  const chartDir = path.join(WORKSPACE_ROOT, "reports/charts", baseName);
  const rawPayloadPath = path.join(rawDir, `${baseName}-raw.json`);
  const rawRecordsPath = path.join(rawDir, `${baseName}-records.json`);

  const records = extractStructuredRecords(result, { platform, keyword });
  await writeJson(rawPayloadPath, {
    fetched_at: new Date().toISOString(),
    platform,
    keyword: keyword || "",
    tool,
    result
  });
  await writeJson(rawRecordsPath, records);

  let report = null;
  if (records.length > 0) {
    await runReportScript(rawRecordsPath, chartDir);
    await refreshReportsDashboard();
    report = {
      outdir: chartDir,
      csv: path.join(chartDir, "report.csv"),
      summary: path.join(chartDir, "summary.md"),
      charts: [
        path.join(chartDir, "platforms.png"),
        path.join(chartDir, "keywords.png"),
        path.join(chartDir, "authors.png"),
        path.join(chartDir, "publish_time_trend.png")
      ]
    };
  }

  return {
    baseName,
    rawPayloadPath,
    rawRecordsPath,
    recordCount: records.length,
    report
  };
}

async function writeText(filePath, content) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, "utf8");
}

function buildDailySummaryMarkdown({ keyword, date, successes, failures, reportDir }) {
  const lines = [
    `# ${date} 热点整合日报`,
    "",
    `- 关键词：${keyword}`,
    `- 成功平台：${successes.map((item) => item.platform).join("、") || "无"}`,
    `- 失败平台：${failures.map((item) => item.platform).join("、") || "无"}`,
    reportDir ? `- 图表目录：${reportDir}` : "- 图表目录：未生成",
    "",
    "## 平台摘要",
    ""
  ];

  for (const item of successes) {
    lines.push(`### ${item.platform}`);
    lines.push("");
    lines.push(`- 工具：${item.tool}`);
    lines.push(`- 记录数：${item.recordCount}`);
    if (item.preview.length > 0) {
      lines.push("- 热点预览：");
      for (const text of item.preview) {
        lines.push(`  - ${text}`);
      }
    } else {
      lines.push("- 热点预览：无结构化标题，保留原始结果");
    }
    lines.push("");
  }

  if (failures.length > 0) {
    lines.push("## 失败说明");
    lines.push("");
    for (const item of failures) {
      lines.push(`- ${item.platform}：${item.error}`);
    }
    lines.push("");
  }

  lines.push("## 简短结论");
  lines.push("");
  lines.push("- 今日热点已完成自动整合，可优先根据图表和高频话题制作短视频。");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function buildDouyinScriptMarkdown({ keyword, date, successes, failures }) {
  const hooks = successes.flatMap((item) => item.preview).filter(Boolean).slice(0, 5);
  const lines = [
    `# ${date} 抖音口播稿`,
    "",
    `## 开场钩子`,
    "",
    hooks.length > 0 ? `今天的${keyword}热点，真正值得看的有这${Math.min(hooks.length, 5)}条。` : `今天带你快速看完${keyword}的核心热点。`,
    "",
    "## 口播正文",
    ""
  ];

  if (hooks.length > 0) {
    hooks.forEach((item, index) => {
      lines.push(`${index + 1}. ${item}`);
    });
  } else {
    lines.push("1. 先讲今天最热的核心趋势。");
    lines.push("2. 再讲平台之间的共同话题。");
    lines.push("3. 最后给出一句判断。");
  }

  lines.push("");
  lines.push("## 结尾一句");
  lines.push("");
  lines.push("如果你想让我每天继续帮你盯热点，记得关注后看下一条。");
  lines.push("");
  lines.push("## 封面标题建议");
  lines.push("");
  lines.push(`${keyword}热点日报｜今天最值得看的几条`);
  lines.push("");
  lines.push("## 话题标签");
  lines.push("");
  lines.push(`#${keyword} #热点 #抖音选题 #内容创作 #小智日报`);

  if (failures.length > 0) {
    lines.push("");
    lines.push("## 备注");
    lines.push("");
    lines.push(`以下平台本次抓取失败：${failures.map((item) => item.platform).join("、")}`);
  }

  return `${lines.join("\n")}\n`;
}

async function collectOnePlatform(state, platform, keyword, api) {
  const toolMap = {
    xiaohongshu: "xhs_search_note",
    bilibili: "general_search",
    weibo: "search_content"
  };
  const tool = toolMap[platform];
  const args = { keyword };
  const result = await callToolForPlatform(state, platform, tool, args, api);
  const records = extractStructuredRecords(result, { platform, keyword });
  return {
    platform,
    tool,
    result,
    records,
    recordCount: records.length,
    preview: records
      .map((item) => item.title || item.author || item.url)
      .filter(Boolean)
      .slice(0, 5)
  };
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

function createClient(platform, api) {
  const cfg = getPlatformConfig(api)[platform];
  if (!cfg) {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  const client = new Client({
    name: `openclaw-${PLUGIN_ID}-${platform}`,
    version: VERSION
  });

  client.onerror = (error) => {
    api.logger?.warn?.(`[${PLUGIN_ID}] ${platform} client error: ${error instanceof Error ? error.message : String(error)}`);
  };

  if (cfg.mode === "http") {
    return {
      client,
      transport: new StreamableHTTPClientTransport(new URL(cfg.url))
    };
  }

  return {
    client,
    transport: new StdioClientTransport({
      command: cfg.command,
      args: cfg.args,
      stderr: "pipe",
      env: {
        ...process.env,
        FORCE_COLOR: "0"
      }
    })
  };
}

async function withClient(state, platform, api) {
  if (!state.clients.has(platform)) {
    const pair = createClient(platform, api);
    await pair.client.connect(pair.transport);
    state.clients.set(platform, pair);
  }
  return state.clients.get(platform).client;
}

async function listToolsForPlatform(state, platform, api) {
  const client = await withClient(state, platform, api);
  const result = await client.listTools();
  return (result?.tools || []).map((tool) => ({
    name: tool.name,
    description: tool.description || "",
    inputSchema: tool.inputSchema || null
  }));
}

function isToolSchemaError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("inputSchema") || message.includes("Invalid input");
}

function inferPlatformFromToolName(toolName) {
  if (typeof toolName !== "string") return null;
  if (toolName.startsWith("xhs_") || toolName.startsWith("xiaohongshu-mcp_")) {
    return "xiaohongshu";
  }
  if (
    toolName.startsWith("search_users") ||
    toolName.startsWith("get_profile") ||
    toolName.startsWith("get_feeds") ||
    toolName.startsWith("get_hot_feeds") ||
    toolName.startsWith("get_trendings") ||
    toolName.startsWith("search_content") ||
    toolName.startsWith("search_topics") ||
    toolName.startsWith("get_followers") ||
    toolName.startsWith("get_fans") ||
    toolName.startsWith("get_comments")
  ) {
    return "weibo";
  }
  if (
    toolName.startsWith("general_search") ||
    toolName.startsWith("search_user") ||
    toolName.startsWith("get_precise_results") ||
    toolName.startsWith("get_video_danmaku")
  ) {
    return "bilibili";
  }
  return null;
}

function normalizePlatformInput(platform, toolName, args) {
  if (typeof platform === "string" && platform) {
    return platform;
  }

  const nestedPlatform =
    args && typeof args === "object" && typeof args.platform === "string"
      ? args.platform
      : null;
  if (nestedPlatform) {
    return nestedPlatform;
  }

  return inferPlatformFromToolName(toolName);
}

function normalizeToolArgs(payload) {
  if (payload && typeof payload === "object") {
    if (payload.input && typeof payload.input === "object") {
      return payload.input;
    }
    if (payload.arguments && typeof payload.arguments === "object") {
      return payload.arguments;
    }
  }
  return {};
}

function inferToolFromPayload(platform, payload) {
  if (payload?.tool && typeof payload.tool === "string") {
    return payload.tool;
  }

  const action = typeof payload?.action === "string" ? payload.action : null;
  const keyword =
    typeof payload?.keyword === "string"
      ? payload.keyword
      : (typeof payload?.input?.keyword === "string" ? payload.input.keyword : null);

  if (!action) {
    if (platform === "bilibili" && keyword) {
      return "general_search";
    }
    if (platform === "weibo" && keyword) {
      return "search_content";
    }
    if (platform === "xiaohongshu" && keyword) {
      return "xhs_search_note";
    }
    return null;
  }

  if (platform === "xiaohongshu") {
    const mapping = {
      status: "xhs_auth_status",
      login: "xhs_auth_login",
      search: "xhs_search_note",
      discover: "xhs_discover_feeds",
      detail: "xhs_get_note_detail"
    };
    return mapping[action] || null;
  }

  if (platform === "bilibili") {
    const mapping = {
      search: "general_search",
      detail: "get_precise_results"
    };
    return mapping[action] || null;
  }

  if (platform === "weibo") {
    const mapping = {
      search: "search_content",
      discover: "get_hot_feeds",
      detail: "get_comments"
    };
    return mapping[action] || null;
  }

  return null;
}

function buildFlatInput(tool, payload) {
  const input = normalizeToolArgs(payload);
  if (Object.keys(input).length > 0) {
    return input;
  }

  const flat = {};
  if (typeof payload?.keyword === "string" && payload.keyword) {
    flat.keyword = payload.keyword;
  }
  if (typeof payload?.note_id === "string" && payload.note_id) {
    flat.note_id = payload.note_id;
  }

  if (tool === "xhs_search_note" && flat.keyword) {
    return flat;
  }
  if (tool === "xhs_get_note_detail" && flat.note_id) {
    return flat;
  }

  return flat;
}

async function probeXiaohongshu(state, api) {
  const probes = [
    { tool: "xhs_auth_status", args: {} },
    { tool: "xiaohongshu-mcp_is_login", args: {} }
  ];

  for (const probe of probes) {
    try {
      const result = await callToolForPlatform(state, "xiaohongshu", probe.tool, probe.args, api);
      return {
        ok: true,
        probeTool: probe.tool,
        probeResult: result
      };
    } catch (error) {
      api.logger?.warn?.(`[${PLUGIN_ID}] xiaohongshu probe ${probe.tool} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    ok: false
  };
}

async function getPlatformStatus(state, platform, api) {
  if (platform === "bilibili") {
    return {
      platform,
      ok: true,
      tools: BILIBILI_FALLBACK_TOOLS.map((tool) => tool.name),
      degraded: true,
      note: "using direct python fallback for bilibili"
    };
  }
  try {
    const tools = await listToolsForPlatform(state, platform, api);
    return {
      platform,
      ok: true,
      tools: tools.map((tool) => tool.name)
    };
  } catch (error) {
    if (platform === "xiaohongshu" && isToolSchemaError(error)) {
      const probe = await probeXiaohongshu(state, api);
      if (probe.ok) {
        return {
          platform,
          ok: true,
          tools: XIAOHONGSHU_FALLBACK_TOOLS.map((tool) => tool.name),
          degraded: true,
          note: "listTools schema is incompatible, using fallback tool registry",
          probeTool: probe.probeTool
        };
      }
    }

    return {
      platform,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function getToolsForPlatform(state, platform, api) {
  if (platform === "bilibili") {
    return BILIBILI_FALLBACK_TOOLS;
  }
  try {
    return await listToolsForPlatform(state, platform, api);
  } catch (error) {
    if (platform === "xiaohongshu" && isToolSchemaError(error)) {
      const probe = await probeXiaohongshu(state, api);
      if (probe.ok) {
        return XIAOHONGSHU_FALLBACK_TOOLS;
      }
    }
    throw error;
  }
}

async function callToolForPlatform(state, platform, tool, args, api) {
  if (platform === "bilibili") {
    return callBilibiliFallback(tool, args);
  }
  const client = await withClient(state, platform, api);
  const result = await client.callTool({
    name: tool,
    arguments: args || {}
  });
  return normalizeToolResult(result);
}

export default function register(api) {
  const state = {
    clients: new Map()
  };

  api.registerTool({
    name: "social_mcp_status",
    label: "Social MCP Status",
    description: "Check whether the Bilibili, Weibo, and Xiaohongshu MCP backends are reachable.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        platform: {
          type: "string",
          enum: ["all", "bilibili", "weibo", "xiaohongshu"]
        }
      }
    },
    execute: async ({ platform = "all" }) => {
      const platforms = platform === "all" ? ["bilibili", "weibo", "xiaohongshu"] : [platform];
      const rows = [];

      for (const item of platforms) {
        rows.push(await getPlatformStatus(state, item, api));
      }

      return stringify(rows);
    }
  });

  api.registerTool({
    name: "social_mcp_list_tools",
    label: "Social MCP List Tools",
    description: "List available MCP tools for Bilibili, Weibo, or Xiaohongshu before making a social crawling request.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        platform: {
          type: "string",
          enum: ["bilibili", "weibo", "xiaohongshu"]
        }
      },
      required: ["platform"]
    },
    execute: async (payload = {}) => {
      const platform = payload?.platform;
      const tool = payload?.tool;
      const args =
        (payload?.arguments && typeof payload.arguments === "object" && payload.arguments) ||
        (payload?.input && typeof payload.input === "object" && payload.input) ||
        {};
      const resolvedPlatform = normalizePlatformInput(platform, tool, args);
      if (!resolvedPlatform) {
        throw new Error("Platform is required. Supported values: bilibili, weibo, xiaohongshu.");
      }

      const tools = await getToolsForPlatform(state, resolvedPlatform, api);
      return stringify({
        platform: resolvedPlatform,
        tools
      });
    }
  });

  api.registerTool({
    name: "social_mcp_call",
    label: "Social MCP Call",
    description: "Invoke a specific MCP crawler tool on Bilibili, Weibo, or Xiaohongshu. Use social_mcp_list_tools first if unsure which tool to call.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        platform: {
          type: "string",
          enum: ["bilibili", "weibo", "xiaohongshu"]
        },
        tool: {
          type: "string"
        },
        action: {
          type: "string",
          enum: ["status", "login", "search", "discover", "detail"]
        },
        keyword: {
          type: "string"
        },
        note_id: {
          type: "string"
        },
        input: {
          type: "object",
          additionalProperties: true
        },
        arguments: {
          type: "object",
          additionalProperties: true
        }
      },
      required: ["tool"]
    },
    execute: async (payload) => {
      const platform = payload?.platform;
      const fallbackPlatform =
        typeof platform === "string" && platform
          ? platform
          : (typeof payload?.action === "string" ? "xiaohongshu" : null);
      const tool = payload?.tool || inferToolFromPayload(fallbackPlatform, payload);
      const args = buildFlatInput(tool, payload);
      const resolvedPlatform = normalizePlatformInput(platform, tool, args);
      if (!resolvedPlatform) {
        throw new Error(`Unable to infer platform for tool: ${tool || "<empty>"}`);
      }

      const resolvedTool = tool || inferToolFromPayload(resolvedPlatform, payload);
      if (!resolvedTool) {
        throw new Error("Tool is required. For Xiaohongshu you can also use action=status|login|search|discover|detail.");
      }

      const result = await callToolForPlatform(state, resolvedPlatform, resolvedTool, args, api);
      return stringify({
        platform: resolvedPlatform,
        tool: resolvedTool,
        isError: result.isError,
        text: result.text,
        structuredContent: result.structuredContent
      });
    }
  });

  api.registerTool({
    name: "social_mcp_collect_and_report",
    label: "Social MCP Collect And Report",
    description: "Collect social data, save raw JSON into the workspace, generate CSV and charts, and return artifact paths.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        platform: {
          type: "string",
          enum: ["bilibili", "weibo", "xiaohongshu"]
        },
        tool: {
          type: "string"
        },
        action: {
          type: "string",
          enum: ["status", "login", "search", "discover", "detail"]
        },
        keyword: {
          type: "string"
        },
        note_id: {
          type: "string"
        },
        input: {
          type: "object",
          additionalProperties: true
        },
        arguments: {
          type: "object",
          additionalProperties: true
        }
      }
    },
    execute: async (payload) => {
      const platform = payload?.platform;
      const fallbackPlatform =
        typeof platform === "string" && platform
          ? platform
          : (typeof payload?.action === "string" ? "xiaohongshu" : null);
      const tool = payload?.tool || inferToolFromPayload(fallbackPlatform, payload);
      const args = buildFlatInput(tool, payload);
      const resolvedPlatform = normalizePlatformInput(platform, tool, args);
      if (!resolvedPlatform) {
        throw new Error(`Unable to infer platform for tool: ${tool || "<empty>"}`);
      }

      const resolvedTool = tool || inferToolFromPayload(resolvedPlatform, payload);
      if (!resolvedTool) {
        throw new Error("Tool is required. For Xiaohongshu you can also use action=status|login|search|discover|detail.");
      }

      const result = await callToolForPlatform(state, resolvedPlatform, resolvedTool, args, api);
      const artifacts = await buildArtifacts({
        platform: resolvedPlatform,
        keyword: payload?.keyword || args?.keyword || "",
        tool: resolvedTool,
        result
      });

      return stringify({
        platform: resolvedPlatform,
        tool: resolvedTool,
        isError: result.isError,
        text: result.text,
        structuredContent: result.structuredContent,
        artifacts
      });
    }
  });

  api.registerTool({
    name: "social_report_build",
    label: "Social Report Build",
    description: "Generate CSV, summary, and charts from an existing raw social JSON or JSONL file in the workspace.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        input_path: {
          type: "string"
        },
        outdir: {
          type: "string"
        }
      },
      required: ["input_path", "outdir"]
    },
    execute: async ({ input_path: inputPath, outdir }) => {
      await runReportScript(inputPath, outdir);
      await refreshReportsDashboard();
      return stringify({
        ok: true,
        input_path: inputPath,
        outdir,
        files: [
          path.join(outdir, "report.csv"),
          path.join(outdir, "summary.md"),
          path.join(outdir, "platforms.png"),
          path.join(outdir, "keywords.png"),
          path.join(outdir, "authors.png"),
          path.join(outdir, "publish_time_trend.png")
        ]
      });
    }
  });

  api.registerTool({
    name: "social_daily_digest",
    label: "Social Daily Digest",
    description: "Collect daily hot topics from supported platforms, generate a readable markdown brief and a Douyin-ready script, and save artifacts into the workspace.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        keyword: {
          type: "string"
        },
        platforms: {
          type: "array",
          items: {
            type: "string",
            enum: ["xiaohongshu", "bilibili", "weibo"]
          }
        }
      }
    },
    execute: async ({ keyword = "AI", platforms = ["xiaohongshu", "bilibili", "weibo"] }) => {
      const date = dateStamp();
      const rawDir = path.join(WORKSPACE_ROOT, "reports/raw/daily-hot", date);
      const summaryPath = path.join(WORKSPACE_ROOT, "reports/summary", `${date}-daily-hot.md`);
      const douyinPath = path.join(WORKSPACE_ROOT, "reports/summary/douyin", `${date}-douyin-script.md`);
      const chartDir = path.join(WORKSPACE_ROOT, "reports/charts", `${date}-${slugify(keyword)}-daily-hot`);

      const successes = [];
      const failures = [];
      const mergedRecords = [];

      for (const platform of platforms) {
        try {
          const item = await collectOnePlatform(state, platform, keyword, api);
          successes.push(item);
          mergedRecords.push(...item.records);
          await writeJson(path.join(rawDir, `${platform}-raw.json`), item.result);
          await writeJson(path.join(rawDir, `${platform}-records.json`), item.records);
        } catch (error) {
          failures.push({
            platform,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      let report = null;
      if (mergedRecords.length > 0) {
        const mergedPath = path.join(rawDir, `${slugify(keyword)}-merged-records.json`);
        await writeJson(mergedPath, mergedRecords);
        await runReportScript(mergedPath, chartDir);
        report = {
          input: mergedPath,
          outdir: chartDir
        };
      }

      const summary = buildDailySummaryMarkdown({
        keyword,
        date,
        successes,
        failures,
        reportDir: report?.outdir || null
      });
      const douyin = buildDouyinScriptMarkdown({
        keyword,
        date,
        successes,
        failures
      });

      await writeText(summaryPath, summary);
      await writeText(douyinPath, douyin);
      await refreshReportsDashboard();

      return stringify({
        ok: true,
        keyword,
        date,
        summary_path: summaryPath,
        douyin_script_path: douyinPath,
        summary_url: `https://ai.euzhi.com/reports/${path.relative(REPORTS_ROOT, summaryPath).split(path.sep).join("/")}`,
        douyin_script_url: `https://ai.euzhi.com/reports/${path.relative(REPORTS_ROOT, douyinPath).split(path.sep).join("/")}`,
        dashboard_url: "https://ai.euzhi.com/reports/",
        raw_dir: rawDir,
        report,
        successes: successes.map((item) => ({
          platform: item.platform,
          tool: item.tool,
          recordCount: item.recordCount,
          preview: item.preview
        })),
        failures
      });
    }
  });

  api.registerTool({
    name: "xiaohongshu_mcp_call",
    label: "Xiaohongshu MCP Call",
    description: "Invoke a XiaoHongShu MCP tool directly. Prefer this tool for Xiaohongshu tasks.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        tool: {
          type: "string",
          description: "For example: xhs_auth_status, xhs_search_note, xhs_get_note_detail."
        },
        input: {
          type: "object",
          additionalProperties: true
        }
      },
      required: ["tool"]
    },
    execute: async ({ tool, input = {} }) => {
      const result = await callToolForPlatform(state, "xiaohongshu", tool, input, api);
      return stringify({
        platform: "xiaohongshu",
        tool,
        isError: result.isError,
        text: result.text,
        structuredContent: result.structuredContent
      });
    }
  });

  api.registerTool({
    name: "xiaohongshu_mcp_list_tools",
    label: "Xiaohongshu MCP List Tools",
    description: "List available XiaoHongShu MCP tools.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {}
    },
    execute: async () => {
      const tools = await getToolsForPlatform(state, "xiaohongshu", api);
      return stringify({
        platform: "xiaohongshu",
        tools
      });
    }
  });

  api.registerTool({
    name: "xiaohongshu_mcp_status",
    label: "Xiaohongshu MCP Status",
    description: "Check whether the XiaoHongShu MCP backend is reachable.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {}
    },
    execute: async () => stringify([await getPlatformStatus(state, "xiaohongshu", api)])
  });
}

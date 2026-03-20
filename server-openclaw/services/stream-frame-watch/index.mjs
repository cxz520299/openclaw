import { copyFile, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { execFile, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";

const execFileAsync = promisify(execFile);

const DEFAULT_CONFIG_PATH =
  process.env.STREAM_FRAME_WATCH_CONFIG || "/opt/openclaw/config/stream-frame-watch.json";
const DEFAULT_LOOP_SECONDS = Number.parseInt(process.env.STREAM_FRAME_WATCH_LOOP_SECONDS || "15", 10);
const DEFAULT_FRAME_WIDTH = 640;
const DEFAULT_FRAME_HEIGHT = 360;
const DEFAULT_RANDOM_WINDOW_SECONDS = 300;
const DEFAULT_INTERVAL_SECONDS = 300;
const DEFAULT_THRESHOLD = 0.12;
const DEFAULT_DESCRIPTION_MATCH_THRESHOLD_PERCENT = 80;
const DEFAULT_DESCRIPTION_REVIEW_MARGIN_PERCENT = 12;
const DEFAULT_COOLDOWN_SECONDS = 1800;
const DEFAULT_OUTPUT_ROOT = "/home/node/.openclaw/workspace/reports/stream-watch";
const DEFAULT_REPORTS_ROOT = "/home/node/.openclaw/workspace/reports";
const DEFAULT_STATE_ROOT = "/home/node/.openclaw/workspace/stream-watch/state";
const DEFAULT_CACHE_ROOT = "/home/node/.openclaw/workspace/stream-watch/cache";
const DEFAULT_WECOM_CONFIG_PATH = "/home/node/.openclaw/wecomConfig/config.json";
const DEFAULT_VISION_BASE_URL =
  process.env.STREAM_FRAME_WATCH_VISION_BASE_URL || "http://127.0.0.1:19080/v1";
const DEFAULT_VISION_MODEL = process.env.STREAM_FRAME_WATCH_VISION_MODEL || "gpt-5.4";
const DEFAULT_REPORT_DOC_TITLE_PREFIX = "巡检记录";
const DEFAULT_REPORT_TIMEZONE = process.env.TZ || "Asia/Shanghai";
const DEFAULT_REPORT_PUBLIC_BASE_URL =
  process.env.STREAM_FRAME_WATCH_REPORT_PUBLIC_BASE_URL || "https://ai.euzhi.com/reports";
const DEFAULT_WECOM_DOC_TIMEOUT_MS = 20000;
const DEFAULT_WECOM_UPLOAD_IMAGE_API_URL =
  process.env.WECOM_UPLOAD_IMAGE_API_URL || "https://qyapi.weixin.qq.com/cgi-bin/media/uploadimg";

let cachedFfmpegBinary = "";
let cachedWecomDocSdk = null;

function usage() {
  console.log(`Usage:
  node index.mjs daemon [--config /path/to/config.json]
  node index.mjs once [--config /path/to/config.json]
  node index.mjs list-scenes [--config /path/to/config.json]
  node index.mjs resolve-scene --query <text> [--config /path/to/config.json]
  node index.mjs analyze --scene <id> [--config /path/to/config.json]
  node index.mjs analyze --source <url> --baseline <path-or-url> [options]
`);
}

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const args = [...argv];
  const mode = args.shift();
  const options = {
    configPath: DEFAULT_CONFIG_PATH,
  };
  while (args.length > 0) {
    const token = args.shift();
    if (token === "--config") {
      options.configPath = args.shift() || options.configPath;
      continue;
    }
    if (token === "--scene") {
      options.sceneId = args.shift() || "";
      continue;
    }
    if (token === "--source") {
      options.source = args.shift() || "";
      continue;
    }
    if (token === "--baseline") {
      options.baselineImage = args.shift() || "";
      continue;
    }
    if (token === "--description-text") {
      options.descriptionText = args.shift() || "";
      continue;
    }
    if (token === "--match-threshold-percent") {
      options.matchThresholdPercent = args.shift() || "";
      continue;
    }
    if (token === "--threshold") {
      options.compareThreshold = args.shift() || "";
      continue;
    }
    if (token === "--frame-pick-mode") {
      options.framePickMode = args.shift() || "";
      continue;
    }
    if (token === "--frame-width") {
      options.frameWidth = args.shift() || "";
      continue;
    }
    if (token === "--frame-height") {
      options.frameHeight = args.shift() || "";
      continue;
    }
    if (token === "--random-window-seconds") {
      options.randomWindowSeconds = args.shift() || "";
      continue;
    }
    if (token === "--min-offset-seconds") {
      options.minOffsetSeconds = args.shift() || "";
      continue;
    }
    if (token === "--max-offset-seconds") {
      options.maxOffsetSeconds = args.shift() || "";
      continue;
    }
    if (token === "--rule-name") {
      options.ruleName = args.shift() || "";
      continue;
    }
    if (token === "--expected-description") {
      options.expectedDescription = args.shift() || "";
      continue;
    }
    if (token === "--violation-message") {
      options.violationMessage = args.shift() || "";
      continue;
    }
    if (token === "--query") {
      options.query = args.shift() || "";
      continue;
    }
    if (token === "--write-report") {
      options.writeReport = true;
      continue;
    }
    if (token === "--output-root") {
      options.outputRoot = args.shift() || "";
      continue;
    }
    if (token === "-h" || token === "--help") {
      usage();
      process.exit(0);
    }
    fail(`Unknown argument: ${token}`);
  }

  if (!["daemon", "once", "list-scenes", "resolve-scene", "analyze"].includes(mode)) {
    usage();
    fail(`Unsupported mode: ${mode || "<empty>"}`);
  }
  return { mode, options };
}

function log(jobId, message, extra = null) {
  const prefix = jobId ? `[stream-watch:${jobId}]` : "[stream-watch]";
  if (extra == null) {
    console.log(`${prefix} ${message}`);
    return;
  }
  console.log(`${prefix} ${message}`, extra);
}

async function readJson(filePath, fallback) {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

async function loadConfig(configPath) {
  const config = await readJson(configPath, null);
  if (!config || typeof config !== "object") {
    throw new Error(`Invalid config JSON: ${configPath}`);
  }
  return {
    defaults: config.defaults && typeof config.defaults === "object" ? config.defaults : {},
    jobs: Array.isArray(config.jobs) ? config.jobs : [],
    configPath,
  };
}

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

function clampNumber(value, fallback, min = Number.NEGATIVE_INFINITY) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min) {
    return fallback;
  }
  return parsed;
}

function pickDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return undefined;
}

function clampUnitInterval(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

function normalizeLookupToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function dedupeStrings(values) {
  const seen = new Set();
  const result = [];
  for (const value of values || []) {
    const text = String(value || "").trim();
    if (!text) {
      continue;
    }
    const key = normalizeLookupToken(text);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(text);
  }
  return result;
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined || value === null || value === "") {
    return [];
  }
  return [value];
}

function formatDateParts(timestampMs, timezone) {
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone || DEFAULT_REPORT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(new Date(timestampMs))
      .filter((item) => item.type !== "literal")
      .map((item) => [item.type, item.value]),
  );
  return {
    year: parts.year || "0000",
    month: parts.month || "00",
    day: parts.day || "00",
    hour: parts.hour || "00",
    minute: parts.minute || "00",
    second: parts.second || "00",
  };
}

function formatDateKey(timestampMs, timezone) {
  const parts = formatDateParts(timestampMs, timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatDateTimeLabel(timestampMs, timezone) {
  const parts = formatDateParts(timestampMs, timezone);
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function escapeMarkdownText(value) {
  return String(value || "").replace(/[<>]/g, "");
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/u, "");
}

function toPublicReportUrl(filePath, publicBaseUrl) {
  const absolutePath = path.resolve(String(filePath || ""));
  const reportsRoot = path.resolve(DEFAULT_REPORTS_ROOT);
  if (!absolutePath || !absolutePath.startsWith(reportsRoot)) {
    return "";
  }
  const relativePath = path.relative(reportsRoot, absolutePath).split(path.sep).join("/");
  if (!relativePath || relativePath.startsWith("..")) {
    return "";
  }
  return `${trimTrailingSlash(publicBaseUrl || DEFAULT_REPORT_PUBLIC_BASE_URL)}/${relativePath}`;
}

function normalizeReportingConfig(reporting, defaultsReporting) {
  const merged = {
    ...(defaultsReporting && typeof defaultsReporting === "object" ? defaultsReporting : {}),
    ...(reporting && typeof reporting === "object" ? reporting : {}),
  };
  return {
    enabled: Boolean(merged.enabled),
    writeToWecomDoc: pickDefined(merged.writeToWecomDoc, true) !== false,
    reportFormat: String(merged.reportFormat || "smartsheet").trim() === "document" ? "document" : "smartsheet",
    docTitlePrefix: String(merged.docTitlePrefix || DEFAULT_REPORT_DOC_TITLE_PREFIX).trim() || DEFAULT_REPORT_DOC_TITLE_PREFIX,
    timezone: String(merged.timezone || DEFAULT_REPORT_TIMEZONE).trim() || DEFAULT_REPORT_TIMEZONE,
    publicBaseUrl: String(merged.publicBaseUrl || DEFAULT_REPORT_PUBLIC_BASE_URL).trim() || DEFAULT_REPORT_PUBLIC_BASE_URL,
    wecomConfigPath: String(
      merged.wecomConfigPath || process.env.WECOM_CONFIG_PATH || DEFAULT_WECOM_CONFIG_PATH,
    ).trim(),
    wecomDocUrl: String(merged.wecomDocUrl || process.env.WECOM_DOC_MCP_URL || "").trim(),
    timeoutMs: clampNumber(
      merged.timeoutMs,
      clampNumber(process.env.WECOM_DOC_MCP_TIMEOUT_MS, DEFAULT_WECOM_DOC_TIMEOUT_MS, 1000),
      1000,
    ),
    uploadImageApiUrl: String(
      merged.uploadImageApiUrl || process.env.WECOM_UPLOAD_IMAGE_API_URL || DEFAULT_WECOM_UPLOAD_IMAGE_API_URL,
    ).trim(),
    uploadImageAccessToken: String(
      merged.uploadImageAccessToken || process.env.WECOM_UPLOAD_IMAGE_ACCESS_TOKEN || "",
    ).trim(),
    uploadImageAccessTokenCommand: String(
      merged.uploadImageAccessTokenCommand || process.env.WECOM_UPLOAD_IMAGE_ACCESS_TOKEN_COMMAND || "",
    ).trim(),
  };
}

async function resolveWecomDocUrl(reporting) {
  const explicitUrl = String(reporting?.wecomDocUrl || process.env.WECOM_DOC_MCP_URL || "").trim();
  if (explicitUrl) {
    return explicitUrl;
  }
  const configPath = String(
    reporting?.wecomConfigPath || process.env.WECOM_CONFIG_PATH || DEFAULT_WECOM_CONFIG_PATH,
  ).trim();
  if (!configPath) {
    return "";
  }
  const config = await readJson(configPath, null);
  return String(config?.mcpConfig?.doc?.url || "").trim();
}

async function loadWecomDocSdk() {
  if (cachedWecomDocSdk) {
    return cachedWecomDocSdk;
  }
  const candidates = [
    async () => {
      const clientModule = await import("@modelcontextprotocol/sdk/client/index.js");
      const transportModule = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
      return {
        Client: clientModule.Client,
        StreamableHTTPClientTransport: transportModule.StreamableHTTPClientTransport,
      };
    },
    async () => {
      const clientModule = await import("file:///app/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js");
      const transportModule = await import(
        "file:///app/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js"
      );
      return {
        Client: clientModule.Client,
        StreamableHTTPClientTransport: transportModule.StreamableHTTPClientTransport,
      };
    },
    async () => {
      const sdkRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../node_modules/@modelcontextprotocol/sdk/dist/esm/client");
      const clientModule = await import(pathToFileURL(path.join(sdkRoot, "index.js")).href);
      const transportModule = await import(pathToFileURL(path.join(sdkRoot, "streamableHttp.js")).href);
      return {
        Client: clientModule.Client,
        StreamableHTTPClientTransport: transportModule.StreamableHTTPClientTransport,
      };
    },
  ];
  let lastError = null;
  for (const candidate of candidates) {
    try {
      cachedWecomDocSdk = await candidate();
      return cachedWecomDocSdk;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Unable to load MCP SDK: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

function maybeParseJson(text) {
  if (typeof text !== "string" || !text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function recursiveFindFirst(value, keys) {
  if (!value || typeof value !== "object") {
    return "";
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = recursiveFindFirst(item, keys);
      if (found) {
        return found;
      }
    }
    return "";
  }
  for (const key of keys) {
    if (typeof value[key] === "string" && String(value[key]).trim()) {
      return String(value[key]).trim();
    }
  }
  for (const item of Object.values(value)) {
    const found = recursiveFindFirst(item, keys);
    if (found) {
      return found;
    }
  }
  return "";
}

function extractToolResultText(result) {
  const parts = [];
  if (typeof result?.text === "string" && result.text.trim()) {
    parts.push(result.text.trim());
  }
  for (const item of result?.content || []) {
    if (typeof item?.text === "string" && item.text.trim()) {
      parts.push(item.text.trim());
    }
  }
  return parts.join("\n").trim();
}

function extractDocIdFromToolResult(result) {
  const directStructured = result?.structuredContent ?? null;
  const textPayload = extractToolResultText(result);
  const parsedText = maybeParseJson(textPayload);
  const docId =
    recursiveFindFirst(directStructured, ["docid", "docId", "docID", "document_id", "doc_id"]) ||
    recursiveFindFirst(parsedText, ["docid", "docId", "docID", "document_id", "doc_id"]);
  if (docId) {
    return docId;
  }
  const matches = textPayload.match(/(?:docid|docId|doc_id)["'\s:=]+([A-Za-z0-9_-]+)/u);
  return matches?.[1] || "";
}

function extractDocUrlFromToolResult(result) {
  const directStructured = result?.structuredContent ?? null;
  const textPayload = extractToolResultText(result);
  const parsedText = maybeParseJson(textPayload);
  return (
    recursiveFindFirst(directStructured, ["url", "docUrl", "documentUrl"]) ||
    recursiveFindFirst(parsedText, ["url", "docUrl", "documentUrl"]) ||
    textPayload.match(/https?:\/\/\S+/u)?.[0] ||
    ""
  );
}

async function withWecomDocClient(reporting, callback) {
  const docUrl = await resolveWecomDocUrl(reporting);
  if (!docUrl) {
    throw new Error("企业微信文档 MCP 地址未配置");
  }
  const { Client, StreamableHTTPClientTransport } = await loadWecomDocSdk();
  const client = new Client(
    {
      name: "openclaw-stream-frame-watch",
      version: "1.0.0",
    },
    {
      capabilities: {},
    },
  );
  const transport = new StreamableHTTPClientTransport(new URL(docUrl), {
    requestInit: {
      signal: AbortSignal.timeout(clampNumber(reporting?.timeoutMs, DEFAULT_WECOM_DOC_TIMEOUT_MS, 1000)),
    },
  });
  await client.connect(transport);
  try {
    return await callback(client);
  } finally {
    try {
      if (typeof client.close === "function") {
        await client.close();
      }
    } catch {}
    try {
      if (typeof transport.close === "function") {
        await transport.close();
      }
    } catch {}
  }
}

async function callWecomDocTool(reporting, toolName, input) {
  return await withWecomDocClient(reporting, async (client) => {
    return await client.callTool({
      name: toolName,
      arguments: input || {},
    });
  });
}

function inspectionTypeOfJob(job) {
  return job.descriptionText ? "description" : "baseline";
}

function toPercent(value) {
  return Number((clampUnitInterval(value) * 100).toFixed(2));
}

function differenceToSimilarity(score) {
  return clampUnitInterval(1 - clampUnitInterval(score));
}

function matchPercentToScore(matchPercent) {
  return clampUnitInterval((Number(matchPercent) || 0) / 100);
}

function jsonSchemaTextFormat(name, schema) {
  return {
    format: {
      type: "json_schema",
      name,
      schema,
      strict: true,
    },
  };
}

function stripCodeFence(text) {
  const raw = String(text || "").trim();
  if (!raw.startsWith("```")) {
    return raw;
  }
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractJsonObject(text) {
  const raw = stripCodeFence(text);
  try {
    return JSON.parse(raw);
  } catch {}

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
  }
  throw new Error("Model response did not contain valid JSON");
}

function extractResponseText(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  if (Array.isArray(payload.output)) {
    const parts = [];
    for (const item of payload.output) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const content = Array.isArray(item.content) ? item.content : [];
      for (const part of content) {
        if (!part || typeof part !== "object") {
          continue;
        }
        if (typeof part.text === "string" && part.text.trim()) {
          parts.push(part.text.trim());
        } else if (typeof part.output_text === "string" && part.output_text.trim()) {
          parts.push(part.output_text.trim());
        }
      }
    }
    if (parts.length > 0) {
      return parts.join("\n");
    }
  }
  if (Array.isArray(payload.choices)) {
    const choice = payload.choices[0];
    const content = choice?.message?.content;
    if (typeof content === "string" && content.trim()) {
      return content.trim();
    }
    if (Array.isArray(content)) {
      const parts = content
        .map((part) => (typeof part?.text === "string" ? part.text.trim() : ""))
        .filter(Boolean);
      if (parts.length > 0) {
        return parts.join("\n");
      }
    }
  }
  return "";
}

function buildDescriptionInspectionPrompt(job) {
  const threshold = Number(job.matchThresholdPercent || DEFAULT_DESCRIPTION_MATCH_THRESHOLD_PERCENT);
  const checklist = normalizeDescriptionChecklist(job.descriptionText);
  return [
    "你在做视频流巡检。",
    "请根据给定图片，逐条判断画面是否符合点检项描述。",
    "只输出 JSON，不要输出 markdown。",
    `点检项: ${job.descriptionText}`,
    `条款列表: ${JSON.stringify(checklist, null, 2)}`,
    `当前报警阈值: 匹配度低于 ${threshold}% 视为不通过。`,
    "JSON schema:",
    JSON.stringify(
      {
        observedSummary: "一句话描述画面",
        clauseResults: [
          {
            clause: "条款原文",
            clauseType: "scene_expectation",
            matched: true,
            evidence: "结合画面给出的简短依据",
          },
        ],
        reasons: ["最多3条简短理由"],
        pluginRecommendation: "none",
        pluginRecommendationReason: "是否需要额外物品识别/检测插件，简短说明",
      },
      null,
      2,
    ),
    "规则:",
    "- 必须逐条输出 clauseResults，数量要与条款列表一致，顺序保持一致。",
    "- clauseType 必须与输入条款列表里的 clauseType 保持一致。",
    "- matched 表示该单条点检项是否满足，不要考虑阈值。",
    "- clauseType=scene_expectation 表示整体场景应符合该描述；如果主场景不符，就判 matched=false。",
    "- clauseType=must_have 表示条款中的主体、物品、动作或状态必须能从画面中明确看到；看不清、无法确认时，优先判 matched=false。",
    "- clauseType=must_not_have 表示条款中的内容不应出现；只有画面能支持“没有出现该内容”时，才能判 matched=true；如果画面里明显出现了该内容，或无法确认，就判 matched=false。",
    "- clauseType=generic 表示按字面意思保守判断；拿不准时优先判 matched=false。",
    "- 如果点检项带否定表达，例如“不是仓库监控”“不得出现明火”，只有画面确实不满足被否定对象时，才能判 matched=true。",
    "- evidence 要直接解释这一条为什么满足或不满足，尽量引用画面里看得到或看不到的具体线索。",
    "- pluginRecommendation 只能是 `none` 或 `consider_detector_plugin`。",
    "- 如果普通多模态理解已经足够，就返回 `none`。",
    "- 如果需要精确计数、稳定框选、细粒度物品检测或 OCR 才能可靠判断，再返回 `consider_detector_plugin`。",
  ].join("\n");
}

function stripDescriptionLabel(text) {
  let value = String(text || "").trim();
  const patterns = [
    /^(?:点检项|巡检项|检查项|描述|要求|巡检要求|点检要求)\s*[:：]\s*/iu,
    /^(?:场景要求|场景描述)\s*[:：]\s*/iu,
  ];
  for (const pattern of patterns) {
    value = value.replace(pattern, "").trim();
  }
  return value;
}

function cleanupClauseText(text) {
  return String(text || "")
    .replace(/^[\s,，;；:：]+/u, "")
    .replace(/[\s,，;；。.!！?？]+$/u, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function stripLeadingConnector(text) {
  return cleanupClauseText(
    String(text || "").replace(/^(?:并且|而且|同时|另外|此外|还有|以及|且|也(?:要|需|应)?|还(?:要|需|应)?)/u, ""),
  );
}

function inferClauseType(text) {
  const value = cleanupClauseText(text);
  if (!value) {
    return "generic";
  }
  if (
    /^(?:画面|场景).{0,8}(?:应|应当|需要|需|应该|必须)?为/u.test(value) ||
    /^(?:画面|场景).{0,4}是/u.test(value) ||
    /^(?:应|需|需要|应该|必须)为/u.test(value)
  ) {
    return "scene_expectation";
  }
  if (
    /(?:不得|禁止|不能|不可|不应|无|没有|不存在|不是|并非|非)/u.test(value) ||
    /^未/u.test(value)
  ) {
    return "must_not_have";
  }
  if (
    /(?:必须|需要|需|应当|应|在位|可见|完整|正常|开启|关闭|有人|有货架|有设备|有物料)/u.test(value) ||
    /^有/u.test(value)
  ) {
    return "must_have";
  }
  return "generic";
}

function splitClauseContent(content) {
  const cleaned = cleanupClauseText(content);
  if (!cleaned) {
    return [];
  }
  let normalized = cleaned
    .replace(/\s*(?:、|\/|和|与|及|以及|并且|而且|同时|或者|或)\s*/gu, "\n")
    .replace(/[，,]+/gu, "\n");
  const parts = normalized
    .split(/\n+/u)
    .map((item) => cleanupClauseText(item))
    .filter(Boolean);
  if (
    parts.length <= 1 ||
    parts.some((item) => item.length > 24 && /(?:画面|场景|监控|视频|办公|仓库|测试|样片|人员|作业|通道)/u.test(item))
  ) {
    return [cleaned];
  }
  return parts;
}

function buildTypedClause(clauseType, text) {
  const clause = cleanupClauseText(text);
  if (!clause) {
    return null;
  }
  return {
    clause,
    clauseType,
  };
}

function isOperationalDirectiveClause(text) {
  const value = cleanupClauseText(text);
  if (!value) {
    return true;
  }
  return (
    /^(?:匹配度|相似度|差异(?:度)?|阈值|报警阈值)/u.test(value) ||
    /(?:低于|高于|达到|超过|不少于|不高于)\s*\d+(?:\.\d+)?\s*%.*(?:报警|告警|预警|提醒|通过|不通过|触发)/u.test(value) ||
    /(?:报警|告警|预警|提醒).*\d+(?:\.\d+)?\s*%/u.test(value) ||
    /^(?:抽帧方式|取样方式|采样方式|流地址|链接|url)\b/iu.test(value) ||
    /^(?:第一帧|首帧|随机帧|随机抽帧|随机抽取)$/u.test(value)
  );
}

function expandSegmentWithPrefix(segment, matcher, clauseType, prefix) {
  const match = cleanupClauseText(segment).match(matcher);
  if (!match) {
    return null;
  }
  const content = cleanupClauseText(match[1]);
  if (!content) {
    return null;
  }
  return splitClauseContent(content)
    .map((item) => buildTypedClause(clauseType, `${prefix}${item}`))
    .filter(Boolean);
}

function splitSegmentByConnectors(segment) {
  const normalized = cleanupClauseText(segment)
    .replace(/[，,](?=\s*(?:并且|而且|同时|另外|此外|还有|以及|且|也不|也要|必须|需要|需|应当|应|不得|禁止|不能|不可|无|没有|不存在|不是|并非|非|有|有人|有货架|有设备|有物料|画面|场景))/gu, "；")
    .replace(/\s+(?=(?:必须包含|需要包含|需包含|应包含|不得出现|禁止出现|不能出现|不可出现|画面应为|场景应为|画面是|场景是))/gu, "；");
  return normalized
    .split(/[\n\r；;]+/u)
    .map((item) => stripLeadingConnector(item))
    .filter(Boolean);
}

function splitCompactClauseList(segment) {
  const cleaned = cleanupClauseText(segment);
  if (!cleaned) {
    return [];
  }
  if (
    /^(?:必须包含|需要包含|需包含|应包含|必须有|需要有|需有|应有|不得出现|禁止出现|不能出现|不可出现|不得有|禁止有|不能有|不可有)\s*[:：]?/u.test(
      cleaned,
    )
  ) {
    return [cleaned];
  }
  const parts = cleaned
    .split(/[，,]+/u)
    .map((item) => cleanupClauseText(item))
    .filter(Boolean);
  if (parts.length < 2) {
    return [cleaned];
  }
  const totalLength = parts.reduce((sum, item) => sum + item.length, 0);
  if (parts.every((item) => item.length <= 14) && totalLength <= 42) {
    return parts;
  }
  return [cleaned];
}

function normalizeDescriptionChecklist(text) {
  const sourceText = stripDescriptionLabel(text);
  if (!sourceText) {
    return [];
  }
  const rawSegments = splitSegmentByConnectors(sourceText).flatMap((segment) => splitCompactClauseList(segment));
  const checklist = [];

  const pushClause = (clauseType, clauseText) => {
    const item = buildTypedClause(clauseType, clauseText);
    if (!item) {
      return;
    }
    if (isOperationalDirectiveClause(item.clause)) {
      return;
    }
    const exists = checklist.some((entry) => entry.clause === item.clause && entry.clauseType === item.clauseType);
    if (!exists) {
      checklist.push(item);
    }
  };

  for (const rawSegment of rawSegments) {
    const segment = stripLeadingConnector(rawSegment);
    if (!segment) {
      continue;
    }

    const expanded =
      expandSegmentWithPrefix(
        segment,
        /^(?:画面(?:中)?|场景(?:中)?)?(?:不得|禁止|不能|不可|不应)出现\s*[:：]?\s*(.+)$/u,
        "must_not_have",
        "不得出现",
      ) ||
      expandSegmentWithPrefix(segment, /^(?:不得有|禁止有|不能有|不可有)\s*[:：]?\s*(.+)$/u, "must_not_have", "不得有") ||
      expandSegmentWithPrefix(segment, /^(?:必须包含|需要包含|需包含|应包含)\s*[:：]?\s*(.+)$/u, "must_have", "必须包含") ||
      expandSegmentWithPrefix(segment, /^(?:必须有|需要有|需有|应有)\s*[:：]?\s*(.+)$/u, "must_have", "必须有");

    if (expanded && expanded.length > 0) {
      for (const item of expanded) {
        pushClause(item.clauseType, item.clause);
      }
      continue;
    }

    const negativeListMatch = segment.match(/^(?:不是|并非|非)(.+)$/u);
    if (negativeListMatch) {
      const items = splitClauseContent(negativeListMatch[1]);
      for (const item of items) {
        pushClause("must_not_have", `不是${item}`);
      }
      continue;
    }

    if (/^(?:画面|场景).{0,8}(?:应|应当|需要|需|应该|必须)?为/u.test(segment) || /^(?:画面|场景).{0,4}是/u.test(segment)) {
      pushClause("scene_expectation", segment);
      continue;
    }

    const inferredType = inferClauseType(segment);
    pushClause(inferredType, segment);
  }

  if (checklist.length === 0) {
    const fallback = cleanupClauseText(sourceText);
    if (fallback) {
      pushClause(inferClauseType(fallback), fallback);
    }
  }

  return checklist.slice(0, 12);
}

function splitDescriptionChecklist(text) {
  return normalizeDescriptionChecklist(text).map((item) => item.clause);
}

function contentTypeForImagePath(filePath) {
  const lower = String(filePath || "").toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lower.endsWith(".webp")) {
    return "image/webp";
  }
  if (lower.endsWith(".gif")) {
    return "image/gif";
  }
  return "image/png";
}

async function localImageToDataUrl(filePath) {
  const buffer = await readFile(filePath);
  const mimeType = contentTypeForImagePath(filePath);
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function buildDescriptionInspectionSchema(checklist) {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "observedSummary",
      "clauseResults",
      "reasons",
      "pluginRecommendation",
      "pluginRecommendationReason",
    ],
    properties: {
      observedSummary: { type: "string" },
      clauseResults: {
        type: "array",
        minItems: Math.max(1, checklist.length),
        maxItems: Math.max(1, checklist.length),
        items: {
          type: "object",
          additionalProperties: false,
          required: ["clause", "clauseType", "matched", "evidence"],
          properties: {
            clause: { type: "string" },
            clauseType: {
              type: "string",
              enum: ["scene_expectation", "must_have", "must_not_have", "generic"],
            },
            matched: { type: "boolean" },
            evidence: { type: "string" },
          },
        },
      },
      reasons: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: 3,
      },
      pluginRecommendation: {
        type: "string",
        enum: ["none", "consider_detector_plugin"],
      },
      pluginRecommendationReason: { type: "string" },
    },
  };
}

function parseDescriptionInspectionResult(checklist, parsed) {
  const rawClauseResults = Array.isArray(parsed?.clauseResults) ? parsed.clauseResults : [];
  const clauseResults = checklist.map((entry, index) => {
    const item = rawClauseResults[index];
    return {
      clause: entry.clause,
      clauseType: entry.clauseType,
      matched: Boolean(item?.matched),
      evidence: String(item?.evidence || "").trim() || "模型未返回明确依据",
    };
  });
  const matchedCount = clauseResults.filter((item) => item.matched).length;
  const matchPercent = checklist.length > 0 ? Number(((matchedCount / checklist.length) * 100).toFixed(2)) : 0;
  const reasons = Array.isArray(parsed?.reasons)
    ? parsed.reasons.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 3)
    : [];
  return {
    matchPercent,
    observedSummary: String(parsed?.observedSummary || "").trim(),
    matched: clauseResults.every((item) => item.matched),
    clauseResults,
    reasons: reasons.length > 0 ? reasons : ["模型未返回明确原因"],
    pluginRecommendation:
      parsed?.pluginRecommendation === "consider_detector_plugin"
        ? "consider_detector_plugin"
        : "none",
    pluginRecommendationReason: String(parsed?.pluginRecommendationReason || "").trim(),
  };
}

async function callVisionDescriptionModel(job, framePath, promptText, schemaName) {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing for description inspection");
  }
  const checklist = normalizeDescriptionChecklist(job.descriptionText);

  const response = await fetch(`${DEFAULT_VISION_BASE_URL}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_VISION_MODEL,
      temperature: 0.2,
      max_output_tokens: 700,
      text: jsonSchemaTextFormat(schemaName, buildDescriptionInspectionSchema(checklist)),
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: promptText },
            { type: "input_image", image_url: await localImageToDataUrl(framePath) },
          ],
        },
      ],
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      `Vision inspection request failed: ${response.status} ${response.statusText} ${JSON.stringify(payload || {})}`,
    );
  }

  const rawText = extractResponseText(payload);
  const parsed = extractJsonObject(rawText);
  return parseDescriptionInspectionResult(checklist, parsed);
}

async function callVisionDescriptionInspector(job, framePath) {
  return await callVisionDescriptionModel(
    job,
    framePath,
    buildDescriptionInspectionPrompt(job),
    "stream_watch_description_inspection",
  );
}

function buildDescriptionFallbackPrompt(job, primaryAnalysis, fallbackReason) {
  const checklist = normalizeDescriptionChecklist(job.descriptionText);
  return [
    "你在做视频流巡检的兜底复核。",
    "请重新独立核验图片是否符合点检项。只输出 JSON，不要输出 markdown。",
    "这次复核比初审更保守：只有在画面证据明确时才判 matched=true；只要看不清、拿不准、被遮挡、需要推测，就判 matched=false。",
    "不要机械复用初审结论；如果初审过松，请纠正它。",
    `点检项: ${job.descriptionText}`,
    `条款列表: ${JSON.stringify(checklist, null, 2)}`,
    `触发兜底原因: ${fallbackReason || "命中复核规则"}`,
    "初审结果参考:",
    JSON.stringify(
      {
        observedSummary: primaryAnalysis.observedSummary,
        matchPercent: primaryAnalysis.matchPercent,
        clauseResults: primaryAnalysis.clauseResults,
        reasons: primaryAnalysis.reasons,
        pluginRecommendation: primaryAnalysis.pluginRecommendation,
        pluginRecommendationReason: primaryAnalysis.pluginRecommendationReason,
      },
      null,
      2,
    ),
    "复核规则:",
    "- 必须逐条输出 clauseResults，数量和顺序必须与条款列表一致。",
    "- 如果条款是 must_have，只有明确看到对应物体/动作/状态时才算满足。",
    "- 如果条款是 must_not_have，只有明确看不到对应内容时才算满足；只要有疑似出现或无法确认，就判不满足。",
    "- 如果条款是 scene_expectation，主场景不明确或不符合，就判不满足。",
    "- reasons 只保留最多 3 条，优先写你为什么维持或推翻初审。",
    "- pluginRecommendation 仍然只能是 `none` 或 `consider_detector_plugin`。",
  ].join("\n");
}

function containsUncertaintyText(text) {
  return /(?:无法确认|无法判断|不能确认|不确定|疑似|可能|看不清|模糊|遮挡|难以辨认|不够清晰)/u.test(
    String(text || ""),
  );
}

function shouldRunDescriptionFallback(job, analysis) {
  const threshold = Number(job.matchThresholdPercent || DEFAULT_DESCRIPTION_MATCH_THRESHOLD_PERCENT);
  const reasons = [];
  if (analysis.pluginRecommendation === "consider_detector_plugin") {
    reasons.push("模型主动建议补充检测插件");
  }
  if (Math.abs(Number(analysis.matchPercent || 0) - threshold) <= DEFAULT_DESCRIPTION_REVIEW_MARGIN_PERCENT) {
    reasons.push("匹配度接近报警阈值");
  }
  if ((analysis.clauseResults || []).some((item) => item.clauseType === "generic")) {
    reasons.push("存在通用条款，语义边界较宽");
  }
  if ((analysis.clauseResults || []).some((item) => containsUncertaintyText(item.evidence))) {
    reasons.push("存在不确定或看不清的证据描述");
  }
  if (containsUncertaintyText(analysis.observedSummary) || (analysis.reasons || []).some((item) => containsUncertaintyText(item))) {
    reasons.push("初审摘要或理由带不确定性");
  }
  return {
    shouldRun: reasons.length > 0,
    reason: reasons.join("；"),
  };
}

function mergeDescriptionAnalyses(primaryAnalysis, fallbackAnalysis, fallbackReason) {
  const fallbackMap = new Map((fallbackAnalysis.clauseResults || []).map((item) => [item.clause, item]));
  const clauseResults = (primaryAnalysis.clauseResults || []).map((item) => {
    const reviewed = fallbackMap.get(item.clause);
    if (!reviewed) {
      return item;
    }
    const matched = Boolean(item.matched) && Boolean(reviewed.matched);
    const evidence =
      item.matched === reviewed.matched
        ? String(reviewed.evidence || item.evidence || "").trim() || "复核后未返回明确依据"
        : `初审: ${item.evidence}；复核: ${reviewed.evidence}`;
    return {
      clause: item.clause,
      clauseType: item.clauseType,
      matched,
      evidence,
    };
  });
  const matchedCount = clauseResults.filter((item) => item.matched).length;
  const matchPercent = clauseResults.length > 0 ? Number(((matchedCount / clauseResults.length) * 100).toFixed(2)) : 0;
  const pluginRecommendation =
    primaryAnalysis.pluginRecommendation === "consider_detector_plugin" ||
    fallbackAnalysis.pluginRecommendation === "consider_detector_plugin"
      ? "consider_detector_plugin"
      : "none";
  const pluginRecommendationReason = [...new Set([
    String(primaryAnalysis.pluginRecommendationReason || "").trim(),
    String(fallbackAnalysis.pluginRecommendationReason || "").trim(),
  ].filter(Boolean))]
    .join("；");
  return {
    matchPercent,
    observedSummary: String(fallbackAnalysis.observedSummary || primaryAnalysis.observedSummary || "").trim(),
    matched: clauseResults.every((item) => item.matched),
    clauseResults,
    reasons: [...new Set((fallbackAnalysis.reasons || []).filter(Boolean))].slice(0, 3),
    pluginRecommendation,
    pluginRecommendationReason,
    fallbackUsed: true,
    fallbackReason: fallbackReason || "命中复核规则",
  };
}

function normalizeJob(job, defaults) {
  const defaultsReporting = defaults.reporting && typeof defaults.reporting === "object" ? defaults.reporting : {};
  const frameWidth = clampNumber(job.frameWidth, clampNumber(defaults.frameWidth, DEFAULT_FRAME_WIDTH, 16), 16);
  const frameHeight = clampNumber(
    job.frameHeight,
    clampNumber(defaults.frameHeight, DEFAULT_FRAME_HEIGHT, 16),
    16,
  );
  const compareThreshold = clampNumber(
    job.compareThreshold,
    clampNumber(defaults.compareThreshold, DEFAULT_THRESHOLD, 0),
    0,
  );
  const matchThresholdPercent = clampNumber(
    job.matchThresholdPercent,
    clampNumber(defaults.matchThresholdPercent, DEFAULT_DESCRIPTION_MATCH_THRESHOLD_PERCENT, 0),
    0,
  );
  const intervalSeconds = clampNumber(
    job.intervalSeconds,
    clampNumber(defaults.intervalSeconds, DEFAULT_INTERVAL_SECONDS, 1),
    1,
  );
  const cooldownSeconds = clampNumber(
    job.cooldownSeconds,
    clampNumber(defaults.cooldownSeconds, DEFAULT_COOLDOWN_SECONDS, 0),
    0,
  );
  const randomWindowSeconds = clampNumber(
    job.randomWindowSeconds,
    clampNumber(defaults.randomWindowSeconds, DEFAULT_RANDOM_WINDOW_SECONDS, 1),
    1,
  );
  const outputRoot =
    String(job.outputRoot || defaults.outputRoot || DEFAULT_OUTPUT_ROOT).trim();
  const notifier = job.notifier && typeof job.notifier === "object" ? job.notifier : {};
  const framePickMode = String(job.framePickMode || defaults.framePickMode || "random").trim();
  const storeName = String(job.storeName || job.name || job.id || "").trim();
  const aliases = dedupeStrings([
    ...toArray(job.aliases),
    ...toArray(job.storeAliases),
    storeName,
    String(job.name || "").trim(),
    String(job.id || "").trim(),
  ]);
  return {
    id: String(job.id || "").trim(),
    name: String(job.name || job.id || "").trim(),
    storeName,
    aliases,
    enabled: Boolean(job.enabled),
    source: String(job.source || "").trim(),
    baselineImage: String(job.baselineImage || "").trim(),
    descriptionText: String(job.descriptionText || defaults.descriptionText || "").trim(),
    frameWidth,
    frameHeight,
    compareThreshold,
    matchThresholdPercent: Math.min(100, matchThresholdPercent),
    intervalSeconds,
    cooldownSeconds,
    randomWindowSeconds,
    minOffsetSeconds: clampNumber(job.minOffsetSeconds, 0, 0),
    maxOffsetSeconds: clampNumber(job.maxOffsetSeconds, Number.NaN, 0),
    outputRoot,
    notifier,
    framePickMode: framePickMode === "first" ? "first" : "random",
    ruleName: String(job.ruleName || defaults.ruleName || "").trim(),
    expectedDescription: String(job.expectedDescription || defaults.expectedDescription || "").trim(),
    violationMessage: String(job.violationMessage || defaults.violationMessage || "").trim(),
    reporting: normalizeReportingConfig(job.reporting, defaultsReporting),
  };
}

async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function downloadIfRemote(input, outputPath) {
  if (!/^https?:\/\//i.test(input)) {
    return input;
  }
  const res = await fetch(input);
  if (!res.ok) {
    throw new Error(`Failed to download ${input}: ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(outputPath, buf);
  return outputPath;
}

async function runBinary(binary, args, options = {}) {
  try {
    return await execFileAsync(binary, args, {
      maxBuffer: 1024 * 1024 * 16,
      ...options,
    });
  } catch (error) {
    const stderr = error?.stderr ? String(error.stderr).trim() : "";
    const stdout = error?.stdout ? String(error.stdout).trim() : "";
    const detail = stderr || stdout || error.message;
    throw new Error(`${binary} ${args.join(" ")} failed: ${detail}`);
  }
}

function getFfmpegBinary() {
  if (cachedFfmpegBinary) {
    return cachedFfmpegBinary;
  }

  if (process.env.FFMPEG_BIN) {
    cachedFfmpegBinary = process.env.FFMPEG_BIN;
    return cachedFfmpegBinary;
  }

  const systemFfmpeg = spawnSync("sh", ["-lc", "command -v ffmpeg"], {
    encoding: "utf8",
  });
  if (systemFfmpeg.status === 0) {
    const resolved = String(systemFfmpeg.stdout || "").trim();
    if (resolved) {
      cachedFfmpegBinary = resolved;
      return cachedFfmpegBinary;
    }
    cachedFfmpegBinary = "ffmpeg";
    return cachedFfmpegBinary;
  }

  cachedFfmpegBinary = ffmpegPath || "ffmpeg";
  return cachedFfmpegBinary;
}

function pickOffsetSeconds(job) {
  if (job.framePickMode === "first") {
    return Math.max(0, job.minOffsetSeconds);
  }
  const minOffset = Math.max(0, job.minOffsetSeconds);
  const upperBound = Number.isFinite(job.maxOffsetSeconds)
    ? Math.max(minOffset, job.maxOffsetSeconds)
    : Math.max(minOffset, job.randomWindowSeconds);
  return minOffset + Math.random() * Math.max(0, upperBound - minOffset);
}

async function normalizeImage(inputPath, outputPath, job) {
  await sharp(inputPath)
    .resize({
      width: job.frameWidth,
      height: job.frameHeight,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    })
    .png()
    .toFile(outputPath);
}

function isRemoteInput(input) {
  return /^https?:\/\//i.test(String(input || ""));
}

async function resolveBaselineCachePath(inputPath, job) {
  if (isRemoteInput(inputPath)) {
    return "";
  }

  const info = await stat(inputPath);
  const cacheRoot = String(process.env.STREAM_FRAME_WATCH_CACHE_DIR || DEFAULT_CACHE_ROOT).trim();
  const key = [
    "baseline",
    path.resolve(inputPath),
    String(info.size),
    String(Math.trunc(info.mtimeMs)),
    String(job.frameWidth),
    String(job.frameHeight),
  ].join("|");
  const digest = createHash("sha1").update(key).digest("hex");
  const cacheDir = path.join(cacheRoot, "baselines");
  await ensureDir(cacheDir);
  return path.join(cacheDir, `${digest}.png`);
}

async function prepareBaselineImage(inputPath, tempRoot, job) {
  const cachePath = await resolveBaselineCachePath(inputPath, job);
  if (cachePath && (await fileExists(cachePath))) {
    return cachePath;
  }

  const normalizedPath = cachePath || path.join(tempRoot, "baseline.png");
  if (!cachePath) {
    await normalizeImage(inputPath, normalizedPath, job);
    return normalizedPath;
  }

  const tempCachePath = `${normalizedPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await normalizeImage(inputPath, tempCachePath, job);
    try {
      await rename(tempCachePath, normalizedPath);
    } catch (error) {
      if (error && typeof error === "object" && error.code === "EEXIST") {
        await rm(tempCachePath, { force: true });
      } else {
        throw error;
      }
    }
    return normalizedPath;
  } catch (error) {
    await rm(tempCachePath, { force: true }).catch(() => {});
    throw error;
  }
}

async function extractFrame(job, sourcePath, outputPath, offsetSeconds) {
  const ffmpegBinary = getFfmpegBinary();
  const remoteInputArgs = isRemoteInput(sourcePath)
    ? [
        "-rw_timeout",
        "8000000",
        "-analyzeduration",
        "1000000",
        "-probesize",
        "1000000",
        "-fflags",
        "nobuffer",
      ]
    : [];
  try {
    await runBinary(ffmpegBinary, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-ss",
      offsetSeconds.toFixed(3),
      ...remoteInputArgs,
      "-i",
      sourcePath,
      "-frames:v",
      "1",
      "-vf",
      `scale=${job.frameWidth}:${job.frameHeight}:force_original_aspect_ratio=decrease,pad=${job.frameWidth}:${job.frameHeight}:(ow-iw)/2:(oh-ih)/2:color=black`,
      outputPath,
    ]);
  } catch (error) {
    if (job.framePickMode === "random" && offsetSeconds > 0) {
      await runBinary(ffmpegBinary, [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        "0",
        ...remoteInputArgs,
        "-i",
        sourcePath,
        "-frames:v",
        "1",
        "-vf",
        `scale=${job.frameWidth}:${job.frameHeight}:force_original_aspect_ratio=decrease,pad=${job.frameWidth}:${job.frameHeight}:(ow-iw)/2:(oh-ih)/2:color=black`,
        outputPath,
      ]);
      return;
    }
    throw error;
  }
}

async function compareImages(baselinePath, framePath, diffPath) {
  const width = (await sharp(baselinePath).metadata()).width;
  const height = (await sharp(baselinePath).metadata()).height;
  if (!width || !height) {
    throw new Error("Unable to determine normalized image size");
  }

  const baseline = await sharp(baselinePath).raw().ensureAlpha().toBuffer();
  const frame = await sharp(framePath).raw().ensureAlpha().toBuffer();
  const diff = Buffer.alloc(baseline.length);

  let total = 0;
  let pixelCount = 0;
  for (let i = 0; i < baseline.length; i += 4) {
    const dr = Math.abs(baseline[i] - frame[i]);
    const dg = Math.abs(baseline[i + 1] - frame[i + 1]);
    const db = Math.abs(baseline[i + 2] - frame[i + 2]);
    const delta = (dr + dg + db) / (255 * 3);
    total += delta;
    pixelCount += 1;

    diff[i] = dr;
    diff[i + 1] = dg;
    diff[i + 2] = db;
    diff[i + 3] = 255;
  }

  await sharp(diff, {
    raw: {
      width,
      height,
      channels: 4,
    },
  })
    .png()
    .toFile(diffPath);

  return {
    score: pixelCount > 0 ? total / pixelCount : 0,
  };
}

function resolveStatePath(configPath, defaults = {}) {
  const configuredRoot = String(
    process.env.STREAM_FRAME_WATCH_STATE_DIR || defaults.stateRoot || DEFAULT_STATE_ROOT,
  ).trim();
  const stateRoot = configuredRoot || DEFAULT_STATE_ROOT;
  const baseName = path.basename(configPath).replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(stateRoot, `${baseName}.state.json`);
}

function buildInitialState() {
  return {
    jobs: {},
    reports: {
      dailyDocs: {},
    },
  };
}

async function loadState(configPath, defaults = {}) {
  const statePath = resolveStatePath(configPath, defaults);
  await ensureDir(path.dirname(statePath));
  const state = await readJson(statePath, buildInitialState());
  return {
    statePath,
    jobs: state && typeof state.jobs === "object" && state.jobs ? state.jobs : {},
    reports:
      state && typeof state.reports === "object" && state.reports
        ? {
            dailyDocs:
              state.reports && typeof state.reports.dailyDocs === "object" && state.reports.dailyDocs
                ? state.reports.dailyDocs
                : {},
          }
        : { dailyDocs: {} },
  };
}

async function saveState(state) {
  await writeFile(
    state.statePath,
    `${JSON.stringify(
      {
        version: 2,
        updatedAtMs: Date.now(),
        jobs: state.jobs || {},
        reports: state.reports || { dailyDocs: {} },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

function buildViolationReasons(job, score) {
  const reasons = [];
  if (score < job.compareThreshold) {
    reasons.push(
      `当前帧与基准图差异未超过阈值（差异度 ${toPercent(score)}% < ${toPercent(
        job.compareThreshold,
      )}%）`,
    );
    return reasons;
  }
  if (job.ruleName) {
    reasons.push(`触发规则: ${job.ruleName}`);
  }
  if (job.expectedDescription) {
    reasons.push(`预期场景: ${job.expectedDescription}`);
  }
  if (job.violationMessage) {
    reasons.push(job.violationMessage);
  } else {
    reasons.push("当前帧与基准图差异过大，判定为异常场景");
  }
  return reasons;
}

function describeClauseType(clauseType) {
  switch (clauseType) {
    case "scene_expectation":
      return "场景";
    case "must_have":
      return "必有项";
    case "must_not_have":
      return "禁有项";
    default:
      return "条款";
  }
}

function buildDescriptionReasons(job, analysis) {
  const reasons = [];
  const threshold = Number(job.matchThresholdPercent || DEFAULT_DESCRIPTION_MATCH_THRESHOLD_PERCENT);
  if (analysis.fallbackUsed) {
    reasons.push(`兜底复核: 已启用${analysis.fallbackReason ? `（${analysis.fallbackReason}）` : ""}`);
  }
  if (analysis.observedSummary) {
    reasons.push(`画面摘要: ${analysis.observedSummary}`);
  }
  if (Array.isArray(analysis.clauseResults) && analysis.clauseResults.length > 0) {
    const orderedClauseResults = [...analysis.clauseResults].sort((left, right) => Number(left.matched) - Number(right.matched));
    for (const item of orderedClauseResults.slice(0, 6)) {
      reasons.push(
        `${item.matched ? "满足" : "不满足"}[${describeClauseType(item.clauseType)}]: ${item.clause}（${item.evidence}）`,
      );
    }
  }
  reasons.push(...analysis.reasons);
  if (analysis.matchPercent < threshold) {
    reasons.push(`匹配度 ${analysis.matchPercent.toFixed(2)}% 低于阈值 ${threshold.toFixed(2)}%`);
  } else {
    reasons.push(`匹配度 ${analysis.matchPercent.toFixed(2)}% 达到阈值 ${threshold.toFixed(2)}%`);
  }
  if (analysis.pluginRecommendationReason) {
    reasons.push(`插件建议: ${analysis.pluginRecommendationReason}`);
  }
  return [...new Set(reasons.filter(Boolean))];
}

function buildAlertMessage(job, result) {
  const mentionText = String(job.notifier.mentionText || "").trim();
  const mentionUserIds = Array.isArray(job.notifier.mentionUserIds)
    ? job.notifier.mentionUserIds
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    : [];
  const mentionAll = Boolean(job.notifier.mentionAll);
  const mentionTokens = [];
  if (mentionAll) {
    mentionTokens.push("<@all>");
  }
  for (const userId of mentionUserIds) {
    mentionTokens.push(`<@${userId}>`);
  }
  if (mentionText) {
    mentionTokens.push(mentionText);
  }
  const prefix = mentionTokens.length > 0 ? `${mentionTokens.join(" ")} ` : "";
  const firstReason = result.reasons[0] || "检测到异常";
  const differencePercent = toPercent(result.score);
  const similarityPercent = toPercent(differenceToSimilarity(result.score));
  const thresholdPercent = toPercent(job.compareThreshold);
  const thresholdSimilarityPercent = toPercent(differenceToSimilarity(job.compareThreshold));
  if (job.descriptionText) {
    return `${prefix}流画面文字巡检告警

门店: ${job.storeName || job.name || job.id}
任务: ${job.name || job.id}
点检项: ${job.descriptionText}
结论: ${result.verdict}
匹配度: ${result.matchPercent.toFixed(2)}%
报警阈值: 匹配度 < ${Number(job.matchThresholdPercent).toFixed(2)}%
抽帧时间: ${result.offsetSeconds.toFixed(3)}s
原因: ${(result.reasons || [])[0] || "点检项不匹配"}
时间: ${new Date(result.capturedAtMs).toLocaleString("zh-CN", { hour12: false })}`;
  }
  return `${prefix}流画面差异告警

门店: ${job.storeName || job.name || job.id}
任务: ${job.name || job.id}
结论: ${result.verdict}
差异度: ${differencePercent}%
相似度: ${similarityPercent}%
报警阈值: 差异度 >= ${thresholdPercent}% / 相似度 <= ${thresholdSimilarityPercent}%
抽帧时间: ${result.offsetSeconds.toFixed(3)}s
原因: ${firstReason}
时间: ${new Date(result.capturedAtMs).toLocaleString("zh-CN", { hour12: false })}`;
}

async function sendOpenClawMessage(job, message, mediaPath = "") {
  const channel = String(job.notifier.channel || "wecom").trim();
  const target = String(job.notifier.target || "").trim();
  if (!target) {
    throw new Error(`Notifier target is required for job ${job.id}`);
  }
  let binary = String(job.notifier.openclawBin || "openclaw").trim() || "openclaw";
  const args = [];
  if (!job.notifier.openclawBin && !(await fileExists("/usr/local/bin/openclaw")) && (await fileExists("/app/openclaw.mjs"))) {
    binary = "node";
    args.push("/app/openclaw.mjs");
  }
  args.push("message", "send", "--channel", channel, "--target", target);
  if (job.notifier.account) {
    args.push("--account", String(job.notifier.account));
  }
  if (message) {
    args.push("--message", message);
  }
  if (mediaPath) {
    args.push("--media", mediaPath);
  }
  if (job.notifier.verbose) {
    args.push("--verbose");
  }
  if (job.notifier.json) {
    args.push("--json");
  }
  await runBinary(binary, args, {
    env: {
      ...process.env,
      HOME: process.env.HOME || "/home/node",
    },
  });
}

async function notify(job, result) {
  if (job.notifier?.dryRun) {
    log(job.id, "dry-run notify", {
      score: result.score,
      framePath: result.savedFramePath,
      diffPath: result.savedDiffPath,
    });
    return;
  }
  await sendOpenClawMessage(job, buildAlertMessage(job, result), "");
  await sendOpenClawMessage(job, "", result.savedFramePath);
}

function buildAnalyzePayload(job, result) {
  if (job.descriptionText) {
    return {
      ok: true,
      sceneId: job.id,
      sceneName: job.name || job.id,
      storeName: job.storeName || job.name || job.id,
      inspectionType: "description",
      source: job.source,
      descriptionText: job.descriptionText,
      verdict: result.verdict,
      matchScore: Number(matchPercentToScore(result.matchPercent).toFixed(6)),
      matchPercent: Number(result.matchPercent.toFixed(2)),
      thresholdMatchPercent: Number(Number(job.matchThresholdPercent).toFixed(2)),
      framePickMode: job.framePickMode,
      sampledAtSeconds: Number(result.offsetSeconds.toFixed(3)),
      observedSummary: result.observedSummary,
      reasons: result.reasons,
      clauseResults: result.clauseResults,
      pluginRecommendation: result.pluginRecommendation,
      pluginRecommendationReason: result.pluginRecommendationReason,
      fallbackUsed: Boolean(result.fallbackUsed),
      fallbackReason: String(result.fallbackReason || ""),
      artifacts: {
        frame: result.savedFramePath,
        diff: "",
      },
      report: result.report || null,
    };
  }
  const differencePercent = toPercent(result.score);
  const similarityPercent = toPercent(differenceToSimilarity(result.score));
  const thresholdDifferencePercent = toPercent(job.compareThreshold);
  const thresholdSimilarityPercent = toPercent(differenceToSimilarity(job.compareThreshold));
  return {
    ok: true,
    sceneId: job.id,
    sceneName: job.name || job.id,
    storeName: job.storeName || job.name || job.id,
    inspectionType: "baseline",
    source: job.source,
    baselineImage: job.baselineImage,
    verdict: result.verdict,
    differenceScore: Number(result.score.toFixed(6)),
    differencePercent,
    similarityPercent,
    threshold: job.compareThreshold,
    thresholdDifferencePercent,
    thresholdSimilarityPercent,
    framePickMode: job.framePickMode,
    sampledAtSeconds: Number(result.offsetSeconds.toFixed(3)),
    reasons: result.reasons,
    artifacts: {
      frame: result.savedFramePath,
      diff: result.savedDiffPath,
    },
    report: result.report || null,
  };
}

function formatInspectionVerdict(verdict) {
  return verdict === "violation" ? "异常" : "通过";
}

function buildReportRecord(job, result) {
  const timezone = job.reporting?.timezone || DEFAULT_REPORT_TIMEZONE;
  return {
    id: `${job.id}-${result.capturedAtMs}`,
    capturedAtMs: result.capturedAtMs,
    capturedAtText: formatDateTimeLabel(result.capturedAtMs, timezone),
    storeName: job.storeName || job.name || job.id,
    sceneId: job.id,
    sceneName: job.name || job.id,
    inspectionType: inspectionTypeOfJob(job),
    verdict: result.verdict,
    verdictLabel: formatInspectionVerdict(result.verdict),
    source: job.source,
    framePickMode: job.framePickMode,
    sampledAtSeconds: Number(result.offsetSeconds || 0).toFixed(3),
    baselineImage: job.baselineImage || "",
    descriptionText: job.descriptionText || "",
    reasons: Array.isArray(result.reasons) ? result.reasons.slice(0, 8) : [],
    observedSummary: String(result.observedSummary || "").trim(),
    differencePercent: Number.isFinite(result.score) ? toPercent(result.score) : null,
    similarityPercent: Number.isFinite(result.score) ? toPercent(differenceToSimilarity(result.score)) : null,
    thresholdDifferencePercent: job.descriptionText ? null : toPercent(job.compareThreshold),
    thresholdSimilarityPercent: job.descriptionText ? null : toPercent(differenceToSimilarity(job.compareThreshold)),
    matchPercent: Number.isFinite(result.matchPercent) ? Number(result.matchPercent.toFixed(2)) : null,
    thresholdMatchPercent: job.descriptionText ? Number(Number(job.matchThresholdPercent).toFixed(2)) : null,
    fallbackUsed: Boolean(result.fallbackUsed),
    fallbackReason: String(result.fallbackReason || "").trim(),
    clauseResults: Array.isArray(result.clauseResults) ? result.clauseResults.slice(0, 12) : [],
    framePath: result.savedFramePath || "",
    frameUrl: toPublicReportUrl(result.savedFramePath, job.reporting?.publicBaseUrl),
    diffPath: result.savedDiffPath || "",
    diffUrl: toPublicReportUrl(result.savedDiffPath, job.reporting?.publicBaseUrl),
  };
}

const SMARTSHEET_REPORT_FIELDS = [
  { title: "记录ID", type: "FIELD_TYPE_TEXT", defaultField: true },
  { title: "巡检时间", type: "FIELD_TYPE_DATE_TIME" },
  { title: "巡检门店", type: "FIELD_TYPE_TEXT" },
  { title: "巡检任务", type: "FIELD_TYPE_TEXT" },
  { title: "巡检类型", type: "FIELD_TYPE_TEXT" },
  { title: "巡检结果", type: "FIELD_TYPE_TEXT" },
  { title: "匹配度(%)", type: "FIELD_TYPE_NUMBER" },
  { title: "相似度(%)", type: "FIELD_TYPE_NUMBER" },
  { title: "差异度(%)", type: "FIELD_TYPE_NUMBER" },
  { title: "抽帧方式", type: "FIELD_TYPE_TEXT" },
  { title: "抽帧时间(s)", type: "FIELD_TYPE_NUMBER" },
  { title: "点检项", type: "FIELD_TYPE_TEXT" },
  { title: "画面摘要", type: "FIELD_TYPE_TEXT" },
  { title: "兜底复核", type: "FIELD_TYPE_TEXT" },
  { title: "结论说明", type: "FIELD_TYPE_TEXT" },
  { title: "巡检缩略图", type: "FIELD_TYPE_IMAGE" },
  { title: "差异缩略图", type: "FIELD_TYPE_IMAGE" },
  { title: "巡检图片", type: "FIELD_TYPE_URL" },
  { title: "差异图", type: "FIELD_TYPE_URL" },
  { title: "流地址", type: "FIELD_TYPE_URL" },
];

const DIRECT_SMARTSHEET_EXTRA_FIELDS = [
  { key: "capturedAt", title: "巡检时间", type: "FIELD_TYPE_TEXT" },
  { key: "storeName", title: "巡检门店", type: "FIELD_TYPE_TEXT" },
  { key: "sceneName", title: "巡检任务", type: "FIELD_TYPE_TEXT" },
  { key: "inspectionType", title: "巡检类型", type: "FIELD_TYPE_TEXT" },
  { key: "verdictLabel", title: "巡检结果", type: "FIELD_TYPE_TEXT" },
  { key: "matchPercent", title: "匹配度(%)", type: "FIELD_TYPE_TEXT" },
  { key: "similarityPercent", title: "相似度(%)", type: "FIELD_TYPE_TEXT" },
  { key: "differencePercent", title: "差异度(%)", type: "FIELD_TYPE_TEXT" },
  { key: "framePickMode", title: "抽帧方式", type: "FIELD_TYPE_TEXT" },
  { key: "sampledAtSeconds", title: "抽帧时间(s)", type: "FIELD_TYPE_TEXT" },
  { key: "descriptionText", title: "点检项", type: "FIELD_TYPE_TEXT" },
  { key: "observedSummary", title: "画面摘要", type: "FIELD_TYPE_TEXT" },
  { key: "fallback", title: "兜底复核", type: "FIELD_TYPE_TEXT" },
  { key: "reasons", title: "结论说明", type: "FIELD_TYPE_TEXT" },
  { key: "frameImage", title: "巡检缩略图", type: "FIELD_TYPE_IMAGE" },
  { key: "diffImage", title: "差异缩略图", type: "FIELD_TYPE_IMAGE" },
  { key: "frameUrl", title: "巡检图片", type: "FIELD_TYPE_TEXT" },
  { key: "diffUrl", title: "差异图", type: "FIELD_TYPE_TEXT" },
  { key: "sourceUrl", title: "流地址", type: "FIELD_TYPE_TEXT" },
];

function parseToolResultJson(result) {
  return maybeParseJson(extractToolResultText(result)) || {};
}

function assertWecomToolOk(result, actionLabel) {
  const parsed = parseToolResultJson(result);
  if (parsed && Object.prototype.hasOwnProperty.call(parsed, "errcode") && Number(parsed.errcode) !== 0) {
    throw new Error(`${actionLabel} failed: ${parsed.errmsg || JSON.stringify(parsed)}`);
  }
  if (result?.isError) {
    throw new Error(`${actionLabel} failed: ${extractToolResultText(result) || "unknown error"}`);
  }
  return parsed;
}

function extractSheetIdFromToolResult(result) {
  const parsed = parseToolResultJson(result);
  return String(parsed?.sheet_list?.[0]?.sheet_id || parsed?.sheets?.[0]?.sheet_id || "").trim();
}

function extractFieldsFromToolResult(result) {
  const parsed = parseToolResultJson(result);
  return Array.isArray(parsed?.fields) ? parsed.fields : [];
}

function extractRecordsFromToolResult(result) {
  const parsed = parseToolResultJson(result);
  return Array.isArray(parsed?.records) ? parsed.records : [];
}

function extractFieldTitle(field) {
  return String(field?.field_title || field?.title || "").trim();
}

function buildTextCell(text) {
  return [{ type: "text", text: String(text || "") }];
}

function buildUrlCell(link, text = "查看") {
  if (!link) {
    return undefined;
  }
  return [{ type: "url", text, link }];
}

function buildImageCell(imageUrl) {
  if (!imageUrl) {
    return undefined;
  }
  return [{ image_url: String(imageUrl) }];
}

function buildDetailedImageCell(imageUrl, options = {}) {
  if (!imageUrl) {
    return undefined;
  }
  const width = Number(options.width) || DEFAULT_FRAME_WIDTH;
  const height = Number(options.height) || DEFAULT_FRAME_HEIGHT;
  return [
    {
      id: String(options.id || "").trim() || undefined,
      title: String(options.title || "").trim() || undefined,
      image_url: String(imageUrl),
      width,
      height,
    },
  ];
}

function guessImageMimeType(filePath) {
  const extension = path.extname(String(filePath || "")).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }
  if (extension === ".webp") {
    return "image/webp";
  }
  if (extension === ".gif") {
    return "image/gif";
  }
  return "image/png";
}

async function resolveWecomUploadImageAccessToken(reporting) {
  const explicitToken = String(reporting?.uploadImageAccessToken || "").trim();
  if (explicitToken) {
    return explicitToken;
  }
  const command = String(reporting?.uploadImageAccessTokenCommand || "").trim();
  if (!command) {
    return "";
  }
  const { stdout } = await runBinary("sh", ["-lc", command]);
  return String(stdout || "").trim().split(/\s+/u)[0] || "";
}

async function uploadWecomImage(reporting, filePath) {
  const imagePath = String(filePath || "").trim();
  if (!imagePath || !(await fileExists(imagePath))) {
    return "";
  }
  const accessToken = await resolveWecomUploadImageAccessToken(reporting);
  if (!accessToken) {
    return "";
  }

  const uploadUrl = new URL(String(reporting?.uploadImageApiUrl || DEFAULT_WECOM_UPLOAD_IMAGE_API_URL).trim());
  uploadUrl.searchParams.set("access_token", accessToken);

  const fileBuffer = await readFile(imagePath);
  const form = new FormData();
  form.set("media", new Blob([fileBuffer], { type: guessImageMimeType(imagePath) }), path.basename(imagePath));

  const response = await fetch(uploadUrl, {
    method: "POST",
    body: form,
  });
  const rawText = await response.text();
  const parsed = maybeParseJson(rawText);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${rawText}`);
  }
  if (Number(parsed?.errcode || 0) !== 0) {
    throw new Error(parsed?.errmsg || rawText || "unknown uploadimg error");
  }
  return String(parsed?.url || "").trim();
}

async function readImageDimensions(filePath) {
  const metadata = await sharp(filePath).metadata();
  return {
    width: Number(metadata.width) || DEFAULT_FRAME_WIDTH,
    height: Number(metadata.height) || DEFAULT_FRAME_HEIGHT,
  };
}

async function prepareSmartsheetRecordMedia(job, record) {
  const prepared = {
    ...record,
    frameImageUrl: "",
    diffImageUrl: "",
    frameImageValue: undefined,
    diffImageValue: undefined,
  };
  try {
    prepared.frameImageUrl = await uploadWecomImage(job.reporting, record.framePath);
    if (prepared.frameImageUrl) {
      const dimensions = await readImageDimensions(record.framePath);
      prepared.frameImageValue = buildDetailedImageCell(prepared.frameImageUrl, {
        id: `${record.id}-frame`,
        title: `${record.storeName || record.sceneName || record.id}巡检图`,
        width: dimensions.width,
        height: dimensions.height,
      });
    }
  } catch (error) {
    log(job.id, "upload frame image to wecom failed; fallback to URL column", {
      error: error instanceof Error ? error.message : String(error),
      framePath: record.framePath,
    });
  }
  try {
    prepared.diffImageUrl = await uploadWecomImage(job.reporting, record.diffPath);
    if (prepared.diffImageUrl) {
      const dimensions = await readImageDimensions(record.diffPath);
      prepared.diffImageValue = buildDetailedImageCell(prepared.diffImageUrl, {
        id: `${record.id}-diff`,
        title: `${record.storeName || record.sceneName || record.id}差异图`,
        width: dimensions.width,
        height: dimensions.height,
      });
    }
  } catch (error) {
    log(job.id, "upload diff image to wecom failed; fallback to URL column", {
      error: error instanceof Error ? error.message : String(error),
      diffPath: record.diffPath,
    });
  }
  return prepared;
}

async function supportsDirectSmartsheetReporting(reporting) {
  try {
    return Boolean(await resolveWecomUploadImageAccessToken(reporting));
  } catch {
    return false;
  }
}

async function callWecomDirectApi(reporting, endpoint, payload = {}) {
  const accessToken = await resolveWecomUploadImageAccessToken(reporting);
  if (!accessToken) {
    throw new Error("Direct WeCom API access token is unavailable");
  }
  const url = new URL(`https://qyapi.weixin.qq.com/cgi-bin/${String(endpoint || "").replace(/^\/+/u, "")}`);
  url.searchParams.set("access_token", accessToken);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload || {}),
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

async function ensureSmartsheetFields(reporting, dailyDoc) {
  const fieldsResult = await callWecomDocTool(reporting, "smartsheet_get_fields", {
    docid: dailyDoc.docId,
    sheet_id: dailyDoc.sheetId,
  });
  assertWecomToolOk(fieldsResult, "get smartsheet fields");
  const existingTitles = new Set(extractFieldsFromToolResult(fieldsResult).map((field) => extractFieldTitle(field)));
  const missingFields = SMARTSHEET_REPORT_FIELDS.slice(1).filter((field) => !existingTitles.has(field.title));
  if (missingFields.length === 0) {
    return;
  }
  const addFieldsResult = await callWecomDocTool(reporting, "smartsheet_add_fields", {
    docid: dailyDoc.docId,
    sheet_id: dailyDoc.sheetId,
    fields: missingFields.map((field) => ({
      field_title: field.title,
      field_type: field.type,
    })),
  });
  assertWecomToolOk(addFieldsResult, "add missing smartsheet fields");
}

async function ensureDirectSmartsheetFields(reporting, dailyDoc) {
  const fieldsResult = await callWecomDirectApi(reporting, "wedoc/smartsheet/get_fields", {
    docid: dailyDoc.docId,
    sheet_id: dailyDoc.sheetId,
  });
  const fields = Array.isArray(fieldsResult?.fields) ? fieldsResult.fields : [];
  const fieldMap = dailyDoc.fieldMap && typeof dailyDoc.fieldMap === "object" ? dailyDoc.fieldMap : {};

  const existingRecordIdField = fields.find((field) => extractFieldTitle(field) === "记录ID");
  const textField = fields.find((field) => String(field?.field_type || "").trim() === "FIELD_TYPE_TEXT");
  if (existingRecordIdField?.field_id) {
    fieldMap.recordId = String(existingRecordIdField.field_id);
  } else if (textField?.field_id) {
    fieldMap.recordId = String(textField.field_id);
    const textTitle = extractFieldTitle(textField);
    if (textTitle && textTitle !== "记录ID") {
      await callWecomDirectApi(reporting, "wedoc/smartsheet/update_fields", {
        docid: dailyDoc.docId,
        sheet_id: dailyDoc.sheetId,
        fields: [
          {
            field_id: String(textField.field_id),
            field_title: "记录ID",
            field_type: "FIELD_TYPE_TEXT",
          },
        ],
      });
    }
  }

  const existingTitles = new Set(fields.map((field) => extractFieldTitle(field)));
  const missingFields = DIRECT_SMARTSHEET_EXTRA_FIELDS.filter((field) => !existingTitles.has(field.title));
  if (missingFields.length > 0) {
    await callWecomDirectApi(reporting, "wedoc/smartsheet/add_fields", {
      docid: dailyDoc.docId,
      sheet_id: dailyDoc.sheetId,
      fields: missingFields.map((field) => ({
        field_title: field.title,
        field_type: field.type,
      })),
    });
  }

  const refreshedFieldsResult = await callWecomDirectApi(reporting, "wedoc/smartsheet/get_fields", {
    docid: dailyDoc.docId,
    sheet_id: dailyDoc.sheetId,
  });
  const refreshedFields = Array.isArray(refreshedFieldsResult?.fields) ? refreshedFieldsResult.fields : [];
  const titleToId = new Map(
    refreshedFields
      .map((field) => [extractFieldTitle(field), String(field?.field_id || "").trim()])
      .filter(([, fieldId]) => fieldId),
  );
  fieldMap.recordId = titleToId.get("记录ID") || fieldMap.recordId || "";
  for (const field of DIRECT_SMARTSHEET_EXTRA_FIELDS) {
    fieldMap[field.key] = titleToId.get(field.title) || fieldMap[field.key] || "";
  }
  dailyDoc.fieldMap = fieldMap;
}

function buildSmartsheetRecordValues(record) {
  const values = {
    记录ID: buildTextCell(record.id),
    巡检时间: record.capturedAtText,
    巡检门店: buildTextCell(record.storeName),
    巡检任务: buildTextCell(record.sceneName),
    巡检类型: buildTextCell(record.inspectionType === "description" ? "计划二·文字点检" : "计划一·基准图比对"),
    巡检结果: buildTextCell(record.verdictLabel),
    抽帧方式: buildTextCell(`${record.framePickMode === "first" ? "第一帧" : "随机帧"} · ${record.sampledAtSeconds}s`),
    "抽帧时间(s)": Number(record.sampledAtSeconds || 0),
    结论说明: buildTextCell((record.reasons || []).slice(0, 4).join("；")),
  };
  if (record.inspectionType === "description") {
    values["匹配度(%)"] = Number(record.matchPercent || 0);
    if (record.descriptionText) {
      values["点检项"] = buildTextCell(record.descriptionText);
    }
    if (record.observedSummary) {
      values["画面摘要"] = buildTextCell(record.observedSummary);
    }
    if (record.fallbackUsed) {
      values["兜底复核"] = buildTextCell(
        `已启用${record.fallbackReason ? `（${record.fallbackReason}）` : ""}`,
      );
    }
  } else {
    values["相似度(%)"] = Number(record.similarityPercent || 0);
    values["差异度(%)"] = Number(record.differencePercent || 0);
  }
  const frameImageValue = buildImageCell(record.frameImageUrl);
  if (frameImageValue) {
    values["巡检缩略图"] = frameImageValue;
  }
  const diffImageValue = buildImageCell(record.diffImageUrl);
  if (diffImageValue) {
    values["差异缩略图"] = diffImageValue;
  }
  const frameUrlValue = buildUrlCell(record.frameUrl, "查看巡检图");
  if (frameUrlValue) {
    values["巡检图片"] = frameUrlValue;
  }
  const diffUrlValue = buildUrlCell(record.diffUrl, "查看差异图");
  if (diffUrlValue) {
    values["差异图"] = diffUrlValue;
  }
  const sourceUrlValue = buildUrlCell(record.source, "打开流地址");
  if (sourceUrlValue) {
    values["流地址"] = sourceUrlValue;
  }
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

function buildDirectSmartsheetRecordValues(dailyDoc, record) {
  const fieldMap = dailyDoc?.fieldMap && typeof dailyDoc.fieldMap === "object" ? dailyDoc.fieldMap : {};
  const values = {};
  const setTextField = (key, text) => {
    if (!fieldMap[key] || text === undefined || text === null || text === "") {
      return;
    }
    values[fieldMap[key]] = buildTextCell(text);
  };

  setTextField("recordId", record.id);
  setTextField("capturedAt", record.capturedAtText);
  setTextField("storeName", record.storeName);
  setTextField("sceneName", record.sceneName);
  setTextField(
    "inspectionType",
    record.inspectionType === "description" ? "计划二·文字点检" : "计划一·基准图比对",
  );
  setTextField("verdictLabel", record.verdictLabel);
  if (record.matchPercent !== null && record.matchPercent !== undefined) {
    setTextField("matchPercent", String(record.matchPercent));
  }
  if (record.similarityPercent !== null && record.similarityPercent !== undefined) {
    setTextField("similarityPercent", String(record.similarityPercent));
  }
  if (record.differencePercent !== null && record.differencePercent !== undefined) {
    setTextField("differencePercent", String(record.differencePercent));
  }
  setTextField(
    "framePickMode",
    `${record.framePickMode === "first" ? "第一帧" : "随机帧"} · ${record.sampledAtSeconds}s`,
  );
  setTextField("sampledAtSeconds", record.sampledAtSeconds);
  setTextField("descriptionText", record.descriptionText);
  setTextField("observedSummary", record.observedSummary);
  if (record.fallbackUsed) {
    setTextField("fallback", `已启用${record.fallbackReason ? `（${record.fallbackReason}）` : ""}`);
  }
  setTextField("reasons", (record.reasons || []).slice(0, 4).join("；"));
  if (fieldMap.frameImage && record.frameImageValue) {
    values[fieldMap.frameImage] = record.frameImageValue;
  }
  if (fieldMap.diffImage && record.diffImageValue) {
    values[fieldMap.diffImage] = record.diffImageValue;
  }
  setTextField("frameUrl", record.frameUrl);
  setTextField("diffUrl", record.diffUrl);
  setTextField("sourceUrl", record.source);

  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
}

function buildReportDocMarkdown(dateKey, docName, records, timezone) {
  const lines = [
    `# ${escapeMarkdownText(docName)}`,
    "",
    `日期: ${dateKey}`,
    `时区: ${timezone}`,
    `记录数: ${records.length}`,
    "",
  ];

  const orderedRecords = [...records].sort((left, right) => Number(right.capturedAtMs || 0) - Number(left.capturedAtMs || 0));
  for (const record of orderedRecords) {
    lines.push(`## ${escapeMarkdownText(record.capturedAtText)} · ${escapeMarkdownText(record.storeName)}`);
    lines.push("");
    lines.push(`- 巡检门店: ${escapeMarkdownText(record.storeName)}`);
    lines.push(`- 巡检任务: ${escapeMarkdownText(record.sceneName)}`);
    lines.push(`- 巡检类型: ${record.inspectionType === "description" ? "计划二·文字点检" : "计划一·基准图比对"}`);
    lines.push(`- 巡检结果: ${escapeMarkdownText(record.verdictLabel)}`);
    lines.push(`- 抽帧方式: ${record.framePickMode === "first" ? "第一帧" : "随机帧"} · ${record.sampledAtSeconds}s`);
    if (record.inspectionType === "description") {
      lines.push(`- 匹配度: ${Number(record.matchPercent || 0).toFixed(2)}%`);
      lines.push(`- 报警阈值: 匹配度 < ${Number(record.thresholdMatchPercent || 0).toFixed(2)}%`);
      if (record.descriptionText) {
        lines.push(`- 点检项: ${escapeMarkdownText(record.descriptionText)}`);
      }
      if (record.observedSummary) {
        lines.push(`- 画面摘要: ${escapeMarkdownText(record.observedSummary)}`);
      }
      if (record.fallbackUsed) {
        lines.push(`- 兜底复核: 已启用${record.fallbackReason ? `（${escapeMarkdownText(record.fallbackReason)}）` : ""}`);
      }
    } else {
      lines.push(`- 差异度: ${Number(record.differencePercent || 0).toFixed(2)}%`);
      lines.push(`- 相似度: ${Number(record.similarityPercent || 100).toFixed(2)}%`);
      lines.push(
        `- 报警阈值: 差异度 >= ${Number(record.thresholdDifferencePercent || 0).toFixed(2)}% / 相似度 <= ${Number(record.thresholdSimilarityPercent || 100).toFixed(2)}%`,
      );
    }
    if (record.reasons && record.reasons.length > 0) {
      lines.push(`- 结论说明: ${escapeMarkdownText(record.reasons.slice(0, 4).join("；"))}`);
    }
    if (record.frameUrl) {
      lines.push(`- 巡检图片: ${record.frameUrl}`);
      lines.push(`![${escapeMarkdownText(record.storeName)}巡检图](${record.frameUrl})`);
    }
    if (record.diffUrl) {
      lines.push(`- 差异图: ${record.diffUrl}`);
      lines.push(`![${escapeMarkdownText(record.storeName)}差异图](${record.diffUrl})`);
    }
    if (record.source) {
      lines.push(`- 流地址: ${record.source}`);
    }
    if (record.clauseResults && record.clauseResults.length > 0) {
      lines.push("- 条款明细:");
      for (const clauseResult of record.clauseResults.slice(0, 6)) {
        lines.push(
          `  - ${clauseResult.matched ? "通过" : "未通过"} ${escapeMarkdownText(clauseResult.clause)}：${escapeMarkdownText(clauseResult.evidence)}`,
        );
      }
    }
    lines.push("");
  }
  return `${lines.join("\n").trim()}\n`;
}

async function ensureDailyReportDoc(state, reporting, timestampMs) {
  const timezone = reporting.timezone || DEFAULT_REPORT_TIMEZONE;
  const dateKey = formatDateKey(timestampMs, timezone);
  const docName = `${reporting.docTitlePrefix || DEFAULT_REPORT_DOC_TITLE_PREFIX}-${dateKey}`;
  if (!state.reports.dailyDocs[dateKey]) {
    state.reports.dailyDocs[dateKey] = {
      docId: "",
      docName,
      docUrl: "",
      records: [],
      timezone,
      docType: "",
      sheetId: "",
      remoteRecordIds: {},
      fieldMap: {},
    };
  }
  const dailyDoc = state.reports.dailyDocs[dateKey];
  dailyDoc.docName = docName;
  dailyDoc.timezone = timezone;
  dailyDoc.records = Array.isArray(dailyDoc.records) ? dailyDoc.records : [];
  dailyDoc.remoteRecordIds =
    dailyDoc.remoteRecordIds && typeof dailyDoc.remoteRecordIds === "object" ? dailyDoc.remoteRecordIds : {};
  dailyDoc.fieldMap = dailyDoc.fieldMap && typeof dailyDoc.fieldMap === "object" ? dailyDoc.fieldMap : {};
  const useDirectSmartsheet = reporting.reportFormat !== "document" && (await supportsDirectSmartsheetReporting(reporting));
  const expectedDocType =
    reporting.reportFormat === "document" ? "document" : useDirectSmartsheet ? "smartsheet-direct" : "smartsheet";
  if (dailyDoc.docId && dailyDoc.docType !== expectedDocType) {
    dailyDoc.docId = "";
    dailyDoc.docUrl = "";
    dailyDoc.sheetId = "";
    dailyDoc.remoteRecordIds = {};
    dailyDoc.fieldMap = {};
    dailyDoc.docType = expectedDocType;
  }
  if (dailyDoc.docId) {
    if (dailyDoc.docType === "smartsheet-direct") {
      await ensureDirectSmartsheetFields(reporting, dailyDoc);
    }
    return { dateKey, dailyDoc };
  }

  if (expectedDocType === "document") {
    const created = await callWecomDocTool(reporting, "create_doc", {
      doc_type: 3,
      doc_name: docName,
    });
    assertWecomToolOk(created, "create report document");
    dailyDoc.docId = extractDocIdFromToolResult(created);
    dailyDoc.docUrl = extractDocUrlFromToolResult(created);
    dailyDoc.docType = "document";
    if (!dailyDoc.docId) {
      throw new Error(`企业微信文档创建成功但未解析到 docId: ${extractToolResultText(created) || "<empty>"}`);
    }
    return { dateKey, dailyDoc };
  }

  if (expectedDocType === "smartsheet-direct") {
    const created = await callWecomDirectApi(reporting, "wedoc/create_doc", {
      doc_type: 10,
      doc_name: docName,
    });
    dailyDoc.docId = String(created?.docid || "").trim();
    dailyDoc.docUrl = String(created?.url || "").trim();
    dailyDoc.docType = "smartsheet-direct";
    if (!dailyDoc.docId) {
      throw new Error(`Direct WeCom smartsheet create succeeded but docId is missing: ${JSON.stringify(created)}`);
    }
    const sheetResult = await callWecomDirectApi(reporting, "wedoc/smartsheet/get_sheet", {
      docid: dailyDoc.docId,
      need_all_type_sheet: true,
    });
    dailyDoc.sheetId = String(
      (sheetResult?.sheet_list || []).find((item) => String(item?.type || "").trim() === "smartsheet")?.sheet_id ||
        sheetResult?.sheet_list?.[0]?.sheet_id ||
        "",
    ).trim();
    if (!dailyDoc.sheetId) {
      throw new Error(`Direct WeCom smartsheet create succeeded but sheetId is missing: ${JSON.stringify(sheetResult)}`);
    }
    await ensureDirectSmartsheetFields(reporting, dailyDoc);
    return { dateKey, dailyDoc };
  }

  const created = await callWecomDocTool(reporting, "create_doc", {
    doc_type: 10,
    doc_name: docName,
  });
  assertWecomToolOk(created, "create report smartsheet");
  dailyDoc.docId = extractDocIdFromToolResult(created);
  dailyDoc.docUrl = extractDocUrlFromToolResult(created);
  if (!dailyDoc.docId) {
    throw new Error(`企业微信文档创建成功但未解析到 docId: ${extractToolResultText(created) || "<empty>"}`);
  }
  dailyDoc.docType = "smartsheet";
  const sheetResult = await callWecomDocTool(reporting, "smartsheet_get_sheet", {
    docid: dailyDoc.docId,
  });
  assertWecomToolOk(sheetResult, "get smartsheet sheet");
  dailyDoc.sheetId = extractSheetIdFromToolResult(sheetResult);
  if (!dailyDoc.sheetId) {
    throw new Error(`智能表格创建成功但未解析到 sheetId: ${extractToolResultText(sheetResult) || "<empty>"}`);
  }

  const fieldsResult = await callWecomDocTool(reporting, "smartsheet_get_fields", {
    docid: dailyDoc.docId,
    sheet_id: dailyDoc.sheetId,
  });
  assertWecomToolOk(fieldsResult, "get smartsheet fields");
  const fields = extractFieldsFromToolResult(fieldsResult);
  const defaultField = fields[0];
  if (!defaultField?.field_id) {
    throw new Error(`智能表格默认字段读取失败: ${extractToolResultText(fieldsResult) || "<empty>"}`);
  }
  const firstField = SMARTSHEET_REPORT_FIELDS[0];
  const updateFieldsResult = await callWecomDocTool(reporting, "smartsheet_update_fields", {
    docid: dailyDoc.docId,
    sheet_id: dailyDoc.sheetId,
    fields: [
      {
        field_id: String(defaultField.field_id),
        field_title: firstField.title,
        field_type: String(defaultField.field_type || firstField.type),
      },
    ],
  });
  assertWecomToolOk(updateFieldsResult, "rename default smartsheet field");
  const addFieldsResult = await callWecomDocTool(reporting, "smartsheet_add_fields", {
    docid: dailyDoc.docId,
    sheet_id: dailyDoc.sheetId,
    fields: SMARTSHEET_REPORT_FIELDS.slice(1).map((field) => ({
      field_title: field.title,
      field_type: field.type,
    })),
  });
  assertWecomToolOk(addFieldsResult, "add smartsheet fields");
  return { dateKey, dailyDoc };
}

async function writeInspectionReportDocument(state, job, result, dateKey, dailyDoc) {
  const record = buildReportRecord(job, result);
  const existingIndex = dailyDoc.records.findIndex((item) => item?.id === record.id);
  if (existingIndex >= 0) {
    dailyDoc.records[existingIndex] = record;
  } else {
    dailyDoc.records.push(record);
  }
  const content = buildReportDocMarkdown(dateKey, dailyDoc.docName, dailyDoc.records, dailyDoc.timezone);
  const editResult = await callWecomDocTool(job.reporting, "edit_doc_content", {
    docid: dailyDoc.docId,
    content,
    content_type: 1,
  });
  assertWecomToolOk(editResult, "edit report document");
  dailyDoc.updatedAtMs = Date.now();
  return {
    dateKey,
    docId: dailyDoc.docId,
    docName: dailyDoc.docName,
    docUrl: dailyDoc.docUrl || "",
    recordCount: dailyDoc.records.length,
    frameUrl: record.frameUrl,
    diffUrl: record.diffUrl,
    reportFormat: "document",
  };
}

async function writeInspectionReportSmartsheet(state, job, result, dateKey, dailyDoc) {
  const record = await prepareSmartsheetRecordMedia(job, buildReportRecord(job, result));
  const existingIndex = dailyDoc.records.findIndex((item) => item?.id === record.id);
  if (existingIndex >= 0) {
    dailyDoc.records[existingIndex] = record;
  } else {
    dailyDoc.records.push(record);
  }
  await ensureSmartsheetFields(job.reporting, dailyDoc);
  const pendingRecords = dailyDoc.records.filter((item) => !dailyDoc.remoteRecordIds?.[item.id]);
  if (pendingRecords.length > 0) {
    const addResult = await callWecomDocTool(job.reporting, "smartsheet_add_records", {
      docid: dailyDoc.docId,
      sheet_id: dailyDoc.sheetId,
      records: pendingRecords.map((item) => ({
        values: buildSmartsheetRecordValues(item),
      })),
    });
    assertWecomToolOk(addResult, "add smartsheet records");
    const createdRecords = extractRecordsFromToolResult(addResult);
    createdRecords.forEach((remoteRecord, index) => {
      const localRecord = pendingRecords[index];
      if (localRecord?.id && remoteRecord?.record_id) {
        dailyDoc.remoteRecordIds[localRecord.id] = String(remoteRecord.record_id);
      }
    });
  }
  dailyDoc.updatedAtMs = Date.now();
  return {
    dateKey,
    docId: dailyDoc.docId,
    docName: dailyDoc.docName,
    docUrl: dailyDoc.docUrl || "",
    recordCount: dailyDoc.records.length,
    frameUrl: record.frameUrl,
    diffUrl: record.diffUrl,
    reportFormat: "smartsheet",
    sheetId: dailyDoc.sheetId,
  };
}

async function writeInspectionReportSmartsheetDirect(state, job, result, dateKey, dailyDoc) {
  const record = await prepareSmartsheetRecordMedia(job, buildReportRecord(job, result));
  const existingIndex = dailyDoc.records.findIndex((item) => item?.id === record.id);
  if (existingIndex >= 0) {
    dailyDoc.records[existingIndex] = record;
  } else {
    dailyDoc.records.push(record);
  }

  await ensureDirectSmartsheetFields(job.reporting, dailyDoc);
  const pendingRecords = dailyDoc.records.filter((item) => !dailyDoc.remoteRecordIds?.[item.id]);
  if (pendingRecords.length > 0) {
    const addResult = await callWecomDirectApi(job.reporting, "wedoc/smartsheet/add_records", {
      docid: dailyDoc.docId,
      sheet_id: dailyDoc.sheetId,
      key_type: "CELL_VALUE_KEY_TYPE_FIELD_ID",
      records: pendingRecords.map((item) => ({
        values: buildDirectSmartsheetRecordValues(dailyDoc, item),
      })),
    });
    const createdRecords = Array.isArray(addResult?.records) ? addResult.records : [];
    createdRecords.forEach((remoteRecord, index) => {
      const localRecord = pendingRecords[index];
      if (localRecord?.id && remoteRecord?.record_id) {
        dailyDoc.remoteRecordIds[localRecord.id] = String(remoteRecord.record_id);
      }
    });
  }

  dailyDoc.updatedAtMs = Date.now();
  return {
    dateKey,
    docId: dailyDoc.docId,
    docName: dailyDoc.docName,
    docUrl: dailyDoc.docUrl || "",
    recordCount: dailyDoc.records.length,
    frameUrl: record.frameUrl,
    diffUrl: record.diffUrl,
    reportFormat: "smartsheet-direct",
    sheetId: dailyDoc.sheetId,
  };
}

async function writeInspectionReport(state, job, result) {
  if (!job.reporting?.enabled || !job.reporting?.writeToWecomDoc) {
    return null;
  }
  const { dateKey, dailyDoc } = await ensureDailyReportDoc(state, job.reporting, result.capturedAtMs);
  if (dailyDoc.docType === "document") {
    return await writeInspectionReportDocument(state, job, result, dateKey, dailyDoc);
  }
  if (dailyDoc.docType === "smartsheet-direct") {
    return await writeInspectionReportSmartsheetDirect(state, job, result, dateKey, dailyDoc);
  }
  return await writeInspectionReportSmartsheet(state, job, result, dateKey, dailyDoc);
}

async function analyzeJob(job) {
  if (!job.id || !job.source || (!job.baselineImage && !job.descriptionText)) {
    throw new Error("Job is missing id/source/baselineImage-or-descriptionText");
  }

  const nowMs = Date.now();
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), `stream-watch-${job.id}-`));
  try {
    const framePath = path.join(tempRoot, "frame.png");
    const diffPath = path.join(tempRoot, "diff.png");
    const offsetSeconds = pickOffsetSeconds(job);
    await extractFrame(job, job.source, framePath, offsetSeconds);
    const outputDir = path.join(job.outputRoot, job.id);
    await ensureDir(outputDir);

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const savedFramePath = path.join(outputDir, `${stamp}-frame.png`);
    await copyFile(framePath, savedFramePath);

    if (job.descriptionText) {
      const primaryAnalysis = await callVisionDescriptionInspector(job, framePath);
      const fallbackDecision = shouldRunDescriptionFallback(job, primaryAnalysis);
      let analysis = primaryAnalysis;
      if (fallbackDecision.shouldRun) {
        const fallbackAnalysis = await callVisionDescriptionModel(
          job,
          framePath,
          buildDescriptionFallbackPrompt(job, primaryAnalysis, fallbackDecision.reason),
          "stream_watch_description_inspection_review",
        );
        analysis = mergeDescriptionAnalyses(primaryAnalysis, fallbackAnalysis, fallbackDecision.reason);
      }
      const verdict =
        analysis.matchPercent < Number(job.matchThresholdPercent || DEFAULT_DESCRIPTION_MATCH_THRESHOLD_PERCENT)
          ? "violation"
          : "pass";
      return {
        verdict,
        reasons: buildDescriptionReasons(job, analysis),
        offsetSeconds,
        capturedAtMs: nowMs,
        savedFramePath,
        savedDiffPath: "",
        matchPercent: analysis.matchPercent,
        observedSummary: analysis.observedSummary,
        clauseResults: analysis.clauseResults,
        pluginRecommendation: analysis.pluginRecommendation,
        pluginRecommendationReason: analysis.pluginRecommendationReason,
        fallbackUsed: Boolean(analysis.fallbackUsed),
        fallbackReason: String(analysis.fallbackReason || ""),
      };
    }

    const workingBaseline = await downloadIfRemote(
      job.baselineImage,
      path.join(tempRoot, "baseline-source.bin"),
    );
    const baselinePath = await prepareBaselineImage(workingBaseline, tempRoot, job);
    const { score } = await compareImages(baselinePath, framePath, diffPath);
    const savedDiffPath = path.join(outputDir, `${stamp}-diff.png`);
    await copyFile(diffPath, savedDiffPath);

    const verdict = score >= job.compareThreshold ? "violation" : "pass";
    const reasons = buildViolationReasons(job, score);

    return {
      score,
      verdict,
      reasons,
      offsetSeconds,
      capturedAtMs: nowMs,
      savedFramePath,
      savedDiffPath,
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function executeScheduledJob(job, state) {
  if (!job.enabled) {
    return null;
  }

  const nowMs = Date.now();
  const jobState = state.jobs[job.id] || {};
  if (
    Number.isFinite(jobState.lastRunAtMs) &&
    nowMs - jobState.lastRunAtMs < job.intervalSeconds * 1000
  ) {
    return null;
  }

  const result = await analyzeJob(job);
  if (job.reporting?.enabled) {
    try {
      result.report = await writeInspectionReport(state, job, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(job.id, `report write failed: ${message}`);
      result.reportError = message;
    }
  }
  const shouldAlert = result.verdict === "violation";
  const cooldownReady =
    !Number.isFinite(jobState.lastAlertAtMs) ||
    nowMs - jobState.lastAlertAtMs >= job.cooldownSeconds * 1000;

  jobState.lastRunAtMs = nowMs;
  jobState.lastScore = Number.isFinite(result.score) ? result.score : undefined;
  jobState.lastMatchPercent = Number.isFinite(result.matchPercent) ? result.matchPercent : undefined;
  jobState.lastOffsetSeconds = result.offsetSeconds;
  jobState.lastStatus = shouldAlert ? "alert" : "ok";
  jobState.lastFramePath = result.savedFramePath;
  jobState.lastDiffPath = result.savedDiffPath;
  jobState.lastReasons = result.reasons;

  if (shouldAlert && cooldownReady) {
    await notify(job, result);
    jobState.lastAlertAtMs = nowMs;
    jobState.lastAlertFramePath = result.savedFramePath;
    jobState.lastAlertDiffPath = result.savedDiffPath;
    log(
      job.id,
      job.descriptionText
        ? `alert sent (matchPercent=${Number(result.matchPercent || 0).toFixed(2)}%)`
        : `alert sent (score=${result.score.toFixed(4)})`,
    );
  } else {
    log(
      job.id,
      job.descriptionText
        ? shouldAlert
          ? `matchPercent ${Number(result.matchPercent || 0).toFixed(2)}% below threshold but still in cooldown`
          : `matchPercent ${Number(result.matchPercent || 0).toFixed(2)}% meets threshold`
        : shouldAlert
          ? `diff ${result.score.toFixed(4)} exceeds threshold but still in cooldown`
          : `diff ${result.score.toFixed(4)} below threshold`,
    );
  }

  state.jobs[job.id] = jobState;
  if (result.report) {
    jobState.lastReport = result.report;
  }
  if (result.reportError) {
    jobState.lastReportError = result.reportError;
  }
  await saveState(state);
  return result;
}

async function runOnce(configPath) {
  const config = await loadConfig(configPath);
  const state = await loadState(configPath, config.defaults);
  for (const rawJob of config.jobs) {
    const job = normalizeJob(rawJob, config.defaults);
    if (!job.id) {
      continue;
    }
    try {
      await executeScheduledJob(job, state);
    } catch (error) {
      state.jobs[job.id] = {
        ...(state.jobs[job.id] || {}),
        lastRunAtMs: Date.now(),
        lastStatus: "error",
        lastError: error instanceof Error ? error.message : String(error),
      };
      await saveState(state);
      console.error(`[stream-watch:${job.id}] ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function mergeAnalyzeOptionsIntoJob(job, options) {
  return normalizeJob(
    {
      ...job,
      source: pickDefined(options.source, job.source),
      baselineImage: pickDefined(options.baselineImage, job.baselineImage),
      descriptionText: pickDefined(options.descriptionText, job.descriptionText),
      compareThreshold: pickDefined(options.compareThreshold, job.compareThreshold),
      matchThresholdPercent: pickDefined(options.matchThresholdPercent, job.matchThresholdPercent),
      framePickMode: pickDefined(options.framePickMode, job.framePickMode),
      frameWidth: pickDefined(options.frameWidth, job.frameWidth),
      frameHeight: pickDefined(options.frameHeight, job.frameHeight),
      randomWindowSeconds: pickDefined(options.randomWindowSeconds, job.randomWindowSeconds),
      minOffsetSeconds: pickDefined(options.minOffsetSeconds, job.minOffsetSeconds),
      maxOffsetSeconds: pickDefined(options.maxOffsetSeconds, job.maxOffsetSeconds),
      outputRoot: pickDefined(options.outputRoot, job.outputRoot),
      ruleName: pickDefined(options.ruleName, job.ruleName),
      expectedDescription: pickDefined(options.expectedDescription, job.expectedDescription),
      violationMessage: pickDefined(options.violationMessage, job.violationMessage),
    },
    {},
  );
}

async function listScenes(configPath) {
  const config = await loadConfig(configPath);
  const scenes = config.jobs.map((rawJob) => {
    const job = normalizeJob(rawJob, config.defaults);
    return {
      id: job.id,
      name: job.name,
      storeName: job.storeName,
      aliases: job.aliases,
      enabled: job.enabled,
      source: job.source,
      baselineImage: job.baselineImage,
      descriptionText: job.descriptionText,
      inspectionType: inspectionTypeOfJob(job),
      framePickMode: job.framePickMode,
      threshold: job.compareThreshold,
      thresholdDifferencePercent: toPercent(job.compareThreshold),
      thresholdSimilarityPercent: toPercent(differenceToSimilarity(job.compareThreshold)),
      thresholdMatchPercent: Number(job.matchThresholdPercent),
      ruleName: job.ruleName,
      expectedDescription: job.expectedDescription,
      violationMessage: job.violationMessage,
      reportingEnabled: Boolean(job.reporting?.enabled),
    };
  });
  console.log(JSON.stringify({ ok: true, scenes }, null, 2));
}

function scoreSceneCandidate(query, candidate) {
  const normalizedQuery = normalizeLookupToken(query);
  const normalizedCandidate = normalizeLookupToken(candidate);
  if (!normalizedQuery || !normalizedCandidate) {
    return 0;
  }
  if (normalizedQuery === normalizedCandidate) {
    return 1000 + normalizedCandidate.length;
  }
  if (normalizedQuery.includes(normalizedCandidate)) {
    return 800 + normalizedCandidate.length;
  }
  if (normalizedCandidate.includes(normalizedQuery)) {
    return 500 + normalizedQuery.length;
  }
  return 0;
}

function findSceneByQuery(config, queryText) {
  const normalizedJobs = config.jobs
    .map((rawJob) => normalizeJob(rawJob, config.defaults))
    .filter((job) => job.id);
  const query = String(queryText || "").trim();
  let best = null;
  for (const job of normalizedJobs) {
    const matchFields = dedupeStrings([job.id, job.name, job.storeName, ...(job.aliases || [])]);
    for (const field of matchFields) {
      const score = scoreSceneCandidate(query, field);
      if (!score) {
        continue;
      }
      if (!best || score > best.score) {
        best = {
          score,
          matchedBy: field,
          job,
        };
      }
    }
  }
  if (!best) {
    const defaultSceneId = String(config.defaults?.defaultSceneId || "").trim();
    if (defaultSceneId) {
      const fallback = normalizedJobs.find((job) => job.id === defaultSceneId);
      if (fallback) {
        return {
          matchedBy: defaultSceneId,
          matchedByType: "default",
          job: fallback,
        };
      }
    }
    if (normalizedJobs.length === 1) {
      return {
        matchedBy: normalizedJobs[0].id,
        matchedByType: "single",
        job: normalizedJobs[0],
      };
    }
    return null;
  }
  return {
    matchedBy: best.matchedBy,
    matchedByType: "alias",
    job: best.job,
  };
}

async function resolveScene(configPath, queryText) {
  const config = await loadConfig(configPath);
  const matched = findSceneByQuery(config, queryText);
  if (!matched) {
    throw new Error(`未找到匹配的巡检场景: ${queryText}`);
  }
  const job = matched.job;
  console.log(
    JSON.stringify(
      {
        ok: true,
        sceneId: job.id,
        sceneName: job.name,
        storeName: job.storeName,
        aliases: job.aliases,
        inspectionType: inspectionTypeOfJob(job),
        source: job.source,
        baselineImage: job.baselineImage,
        descriptionText: job.descriptionText,
        matchedBy: matched.matchedBy,
        matchedByType: matched.matchedByType,
        framePickMode: job.framePickMode,
        thresholdDifferencePercent: toPercent(job.compareThreshold),
        thresholdSimilarityPercent: toPercent(differenceToSimilarity(job.compareThreshold)),
        thresholdMatchPercent: Number(job.matchThresholdPercent),
        reportingEnabled: Boolean(job.reporting?.enabled),
      },
      null,
      2,
    ),
  );
}

async function runAnalyze(options) {
  const config = await loadConfig(options.configPath);
  let job = null;
  const defaultSceneId = String(config.defaults?.defaultSceneId || "").trim();
  if (!options.sceneId && !options.source && !options.baselineImage) {
    const fallbackJob =
      (defaultSceneId
        ? config.jobs.find((entry) => String(entry?.id || "").trim() === defaultSceneId)
        : null) ||
      config.jobs.find((entry) => Boolean(entry?.enabled)) ||
      config.jobs[0] ||
      null;
    if (fallbackJob) {
      job = normalizeJob(fallbackJob, config.defaults);
    }
  }
  if (!job && options.sceneId) {
    const found = config.jobs.find((entry) => String(entry?.id || "").trim() === options.sceneId);
    if (!found) {
      throw new Error(`Scene not found: ${options.sceneId}`);
    }
    job = normalizeJob(found, config.defaults);
  } else if (!job) {
    job = normalizeJob(
      {
        id: "adhoc-stream-watch",
        name: "adhoc-stream-watch",
        enabled: true,
        source: options.source,
        baselineImage: options.baselineImage,
        descriptionText: options.descriptionText,
        compareThreshold: options.compareThreshold,
        matchThresholdPercent: options.matchThresholdPercent,
        framePickMode: options.framePickMode,
        frameWidth: options.frameWidth,
        frameHeight: options.frameHeight,
        randomWindowSeconds: options.randomWindowSeconds,
        minOffsetSeconds: options.minOffsetSeconds,
        maxOffsetSeconds: options.maxOffsetSeconds,
        outputRoot: options.outputRoot,
        ruleName: options.ruleName,
        expectedDescription: options.expectedDescription,
        violationMessage: options.violationMessage,
      },
      config.defaults,
    );
  }

  job = mergeAnalyzeOptionsIntoJob(job, options);
  if (!job.source || (!job.baselineImage && !job.descriptionText)) {
    throw new Error(
      "analyze mode requires --scene or a source plus either --baseline or --description-text",
    );
  }
  const result = await analyzeJob(job);
  if (options.writeReport) {
    const state = await loadState(options.configPath, config.defaults);
    result.report = await writeInspectionReport(state, job, result);
    await saveState(state);
  }
  console.log(JSON.stringify(buildAnalyzePayload(job, result), null, 2));
}

async function main() {
  const { mode, options } = parseArgs(process.argv.slice(2));
  if (!(await fileExists(options.configPath)) && mode !== "analyze") {
    throw new Error(`Config file not found: ${options.configPath}`);
  }
  if (mode === "list-scenes") {
    await listScenes(options.configPath);
    return;
  }
  if (mode === "resolve-scene") {
    await resolveScene(options.configPath, options.query);
    return;
  }
  if (mode === "analyze") {
    await runAnalyze(options);
    return;
  }
  if (mode === "once") {
    await runOnce(options.configPath);
    return;
  }
  log("", `daemon started with config ${options.configPath}`);
  await runOnce(options.configPath);
  setInterval(() => {
    runOnce(options.configPath).catch((error) => {
      console.error(`[stream-watch] daemon tick failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }, Math.max(5, DEFAULT_LOOP_SECONDS) * 1000);
}

main().catch((error) => {
  console.error(`[stream-watch] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

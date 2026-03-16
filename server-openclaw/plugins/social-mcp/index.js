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
const XHS_LOGIN_ROOT = path.join(REPORTS_ROOT, "xiaohongshu-login");
const XHS_LOGIN_SCREENSHOT = path.join(XHS_LOGIN_ROOT, "latest.png");
const XHS_LOGIN_META = path.join(XHS_LOGIN_ROOT, "session.json");
const XHS_LOGIN_LOG = path.join(XHS_LOGIN_ROOT, "login.log");
const XHS_LOGIN_PID = path.join(XHS_LOGIN_ROOT, "login.pid");
const XHS_LOGIN_XVFB_PID = path.join(XHS_LOGIN_ROOT, "xvfb.pid");
const XHS_LOGIN_DISPLAY = ":98";
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
const DOUYIN_SEARCH_TOOL_CANDIDATES = [
  "search_content",
  "search_video",
  "search_videos",
  "search_general",
  "search_aweme",
  "search_note",
  "search"
];
const DOUYIN_DISCOVER_TOOL_CANDIDATES = [
  "get_trending",
  "get_trendings",
  "get_hot_list",
  "get_hot_feeds",
  "discover",
  "feed"
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
    },
    douyin: {
      mode: cfg.douyinUrl ? "http" : "stdio",
      url: cfg.douyinUrl || null,
      command: cfg.douyinCommand || "npx",
      args: Array.isArray(cfg.douyinArgs)
        ? cfg.douyinArgs
        : ["-y", "@mcpflow.io/mcp-douyin"]
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

async function fetchJson(url, { headers = {}, timeoutMs = 20000 } = {}) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json, text/plain, */*",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
      ...headers
    },
    signal: AbortSignal.timeout(timeoutMs)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}: ${text.slice(0, 200)}`);
  }

  const parsed = tryParseJson(text);
  if (!parsed) {
    throw new Error(`Expected JSON from ${url}, got: ${text.slice(0, 200)}`);
  }
  return parsed;
}

async function fetchText(url, { headers = {}, timeoutMs = 20000 } = {}) {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
      ...headers
    },
    signal: AbortSignal.timeout(timeoutMs)
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}: ${text.slice(0, 200)}`);
  }
  return text;
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

function decodeJsString(value) {
  if (typeof value !== "string") return "";
  try {
    return JSON.parse(`"${value.replace(/"/g, '\\"')}"`);
  } catch {
    return value
      .replace(/\\u002F/g, "/")
      .replace(/\\"/g, '"')
      .replace(/<em class=\\"keyword\\">/g, "")
      .replace(/<\\\/em>/g, "");
  }
}

function stripHtml(value) {
  return cleanText(String(value || "").replace(/<[^>]+>/g, ""));
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
      item.uname,
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

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
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
  const keyword = String(args?.keyword || "").trim();
  const page = Math.max(1, Number(args?.page || 1) || 1);
  const searchTypeMap = {
    user: "bili_user",
    video: "video",
    live: "live",
    article: "article"
  };

  if (!keyword) {
    throw new Error("keyword is required for bilibili search tools");
  }

  const scrapeBilibiliHtmlSearch = async () => {
    const html = await fetchText(
      `https://search.bilibili.com/all?keyword=${encodeURIComponent(keyword)}&page=${page}`,
      {
        headers: {
          referer: "https://www.bilibili.com/"
        }
      }
    );

    const objectMatches = html.match(/\{type:f,id:[\s\S]*?is_charge_video:[a-z]\}/g) || [];
    const results = objectMatches.slice(0, 20).map((chunk) => {
      const getField = (pattern) => {
        const match = chunk.match(pattern);
        return match ? match[1] : "";
      };
      const toNumber = (pattern) => {
        const match = chunk.match(pattern);
        return match ? Number(match[1]) : 0;
      };
      return {
        type: "video",
        bvid: getField(/bvid:"([^"]+)"/),
        arcurl: decodeJsString(getField(/arcurl:"([^"]+)"/)),
        title: stripHtml(decodeJsString(getField(/title:"([^"]+)"/))),
        description: stripHtml(decodeJsString(getField(/description:"([^"]*)"/))),
        author: stripHtml(decodeJsString(getField(/author:"([^"]*)"/))),
        play: toNumber(/play:(\d+)/),
        favorites: toNumber(/favorites:(\d+)/),
        review: toNumber(/review:(\d+)/),
        pubdate: toNumber(/pubdate:(\d+)/)
      };
    }).filter((item) => item.bvid && item.title);

    return {
      code: 0,
      message: "OK",
      data: {
        result: results,
        numResults: results.length,
        page
      },
      source: "html-scrape"
    };
  };

  let structuredContent;
  try {
    if (tool === "general_search") {
      const url = new URL("https://api.bilibili.com/x/web-interface/search/type");
      url.search = new URLSearchParams({
        search_type: "video",
        keyword,
        page: String(page)
      }).toString();
      structuredContent = await fetchJson(url.toString(), {
        headers: {
          referer: `https://search.bilibili.com/all?keyword=${encodeURIComponent(keyword)}`,
          origin: "https://search.bilibili.com"
        }
      });
    } else if (tool === "search_user") {
      const url = new URL("https://api.bilibili.com/x/web-interface/search/type");
      url.search = new URLSearchParams({
        search_type: "bili_user",
        keyword,
        page: String(page)
      }).toString();
      structuredContent = await fetchJson(url.toString(), {
        headers: {
          referer: `https://search.bilibili.com/upuser?keyword=${encodeURIComponent(keyword)}`,
          origin: "https://search.bilibili.com"
        }
      });
    } else if (tool === "get_precise_results") {
      const searchType = String(args?.search_type || "video").toLowerCase();
      if (searchType === "video") {
        structuredContent = await scrapeBilibiliHtmlSearch();
      } else {
        const url = new URL("https://api.bilibili.com/x/web-interface/search/type");
        url.search = new URLSearchParams({
          search_type: searchTypeMap[searchType] || "video",
          keyword,
          page: "1"
        }).toString();
        structuredContent = await fetchJson(url.toString(), {
          headers: {
            referer: `https://search.bilibili.com/all?keyword=${encodeURIComponent(keyword)}`,
            origin: "https://search.bilibili.com"
          }
        });
      }
    } else {
      throw new Error(`unsupported bilibili tool: ${tool}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if ((tool === "general_search" || tool === "get_precise_results") && /-412|banned/i.test(message)) {
      structuredContent = await scrapeBilibiliHtmlSearch();
    } else {
      throw error;
    }
  }

  if (!structuredContent) {
    throw new Error(`unsupported bilibili tool: ${tool}`);
  }

  if (structuredContent?.code && structuredContent.code !== 0) {
    throw new Error(
      `bilibili API error ${structuredContent.code}: ${structuredContent.message || "unknown error"}`
    );
  }

  return {
    isError: false,
    text: JSON.stringify(structuredContent, null, 2),
    structuredContent,
    raw: structuredContent
  };
}

async function callWeiboTrendingFallback(args = {}) {
  const limit = Math.max(1, Number(args?.limit || 15) || 15);
  const data = await fetchJson("https://weibo.com/ajax/statuses/hot_band", {
    headers: {
      referer: "https://weibo.com/",
      "x-requested-with": "XMLHttpRequest"
    }
  });

  const items = Array.isArray(data?.data?.band_list) ? data.data.band_list : [];
  const structuredContent = items.slice(0, limit).map((item, index) => ({
    id: item.realpos || index + 1,
    trending: Number(item.num || 0),
    description: cleanText(item.word || item.word_scheme || ""),
    url:
      item.scheme ||
      (item.word_scheme
        ? `https://s.weibo.com/weibo?q=${encodeURIComponent(item.word_scheme)}`
        : `https://s.weibo.com/weibo?q=${encodeURIComponent(item.word || "")}`)
  }));

  return {
    isError: false,
    text: JSON.stringify(structuredContent, null, 2),
    structuredContent,
    raw: data
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

function toReportUrl(filePath) {
  return `https://ai.euzhi.com/reports/${path.relative(REPORTS_ROOT, filePath).split(path.sep).join("/")}`;
}

async function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...options
    });
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
      reject(new Error(`${command} exited with code ${code}: ${stderr || stdout}`));
    });
  });
}

async function writePidFile(pidFile, pid) {
  await fs.writeFile(pidFile, `${pid}\n`, "utf8");
}

async function removeFile(filePath) {
  try {
    await fs.rm(filePath, { force: true });
  } catch {}
}

async function spawnDetached(command, args, options = {}) {
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    ...options
  });
  child.unref();
  if (!child.pid) {
    throw new Error(`failed to start detached process: ${command}`);
  }
  return child.pid;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function isPidAlive(pidFile) {
  if (!(await fileExists(pidFile))) return false;
  const rawPid = cleanText(await fs.readFile(pidFile, "utf8"));
  if (!rawPid) return false;
  try {
    process.kill(Number(rawPid), 0);
    return true;
  } catch {
    return false;
  }
}

async function captureXiaohongshuLoginScreenshot() {
  await ensureDir(XHS_LOGIN_ROOT);
  await runCommand(
    "sh",
    [
      "-lc",
      `DISPLAY=${XHS_LOGIN_DISPLAY} import -display ${XHS_LOGIN_DISPLAY} -window root png:${XHS_LOGIN_SCREENSHOT}`
    ],
    {
      env: {
        ...process.env,
        DISPLAY: XHS_LOGIN_DISPLAY
      }
    }
  );
  return {
    screenshot_path: XHS_LOGIN_SCREENSHOT,
    screenshot_url: toReportUrl(XHS_LOGIN_SCREENSHOT)
  };
}

async function stopXiaohongshuLoginSession() {
  for (const pidFile of [XHS_LOGIN_PID, XHS_LOGIN_XVFB_PID]) {
    if (!(await fileExists(pidFile))) continue;
    const pid = cleanText(await fs.readFile(pidFile, "utf8"));
    if (!pid) continue;
    try {
      process.kill(Number(pid), "SIGTERM");
    } catch {}
    await removeFile(pidFile);
  }
  await writeJson(XHS_LOGIN_META, {
    active: false,
    stopped_at: new Date().toISOString()
  });
}

async function startXiaohongshuLoginSession() {
  await ensureDir(XHS_LOGIN_ROOT);

  if (await isPidAlive(XHS_LOGIN_PID)) {
    const snapshot = await captureXiaohongshuLoginScreenshot();
    const meta = await readJsonFile(XHS_LOGIN_META, {});
    return {
      active: true,
      reused: true,
      ...meta,
      ...snapshot
    };
  }

  await stopXiaohongshuLoginSession();
  await removeFile(XHS_LOGIN_LOG);
  await removeFile(XHS_LOGIN_SCREENSHOT);
  await removeFile("/tmp/.X98-lock");

  const xvfbPid = await spawnDetached("Xvfb", [
    XHS_LOGIN_DISPLAY,
    "-screen",
    "0",
    "1280x1024x24",
    "-nolisten",
    "tcp"
  ]);
  await writePidFile(XHS_LOGIN_XVFB_PID, xvfbPid);

  await sleep(1500);

  const logHandle = await fs.open(XHS_LOGIN_LOG, "a");
  const loginProcess = spawn("xhs-mcp", ["login", "--timeout", "600"], {
    detached: true,
    stdio: ["ignore", logHandle.fd, logHandle.fd],
    env: {
      ...process.env,
      HOME: "/home/node",
      DISPLAY: XHS_LOGIN_DISPLAY,
      PUPPETEER_EXECUTABLE_PATH: "/usr/bin/chromium",
      PUPPETEER_SKIP_DOWNLOAD: "true"
    }
  });
  loginProcess.unref();
  await logHandle.close();
  if (!loginProcess.pid) {
    throw new Error("failed to start xhs-mcp login process");
  }
  const loginPid = loginProcess.pid;
  await writePidFile(XHS_LOGIN_PID, loginPid);

  await sleep(8000);

  const active = await isPidAlive(XHS_LOGIN_PID);
  const snapshot = active ? await captureXiaohongshuLoginScreenshot() : {};
  const meta = {
    active,
    started_at: new Date().toISOString(),
    display: XHS_LOGIN_DISPLAY,
    log_path: XHS_LOGIN_LOG
  };
  await writeJson(XHS_LOGIN_META, meta);
  return {
    ...meta,
    ...snapshot
  };
}

async function getXiaohongshuLoginSession(api, { capture = true } = {}) {
  const status = await callToolForPlatform(api.__socialState, "xiaohongshu", "xhs_auth_status", {}, api);
  const meta = await readJsonFile(XHS_LOGIN_META, {});
  const active = await isPidAlive(XHS_LOGIN_PID);
  const screenshot = capture && active ? await captureXiaohongshuLoginScreenshot() : {
    screenshot_path: await fileExists(XHS_LOGIN_SCREENSHOT) ? XHS_LOGIN_SCREENSHOT : null,
    screenshot_url: await fileExists(XHS_LOGIN_SCREENSHOT) ? toReportUrl(XHS_LOGIN_SCREENSHOT) : null
  };

  if (status?.text && /"loggedIn":\s*true|"status":\s*"logged_in"/i.test(String(status.text))) {
    await stopXiaohongshuLoginSession();
  }

  return {
    active,
    ...meta,
    ...screenshot,
    status: status.structuredContent || tryParseJson(status.text) || status.text
  };
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
    toolName.startsWith("douyin_") ||
    toolName.startsWith("dy_") ||
    toolName.startsWith("aweme_") ||
    toolName.startsWith("tiktok_")
  ) {
    return "douyin";
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
  if (
    toolName.startsWith("search_video") ||
    toolName.startsWith("search_videos") ||
    toolName.startsWith("search_aweme") ||
    toolName.startsWith("get_hot_list") ||
    toolName.startsWith("get_video_detail")
  ) {
    return "douyin";
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
    if (platform === "douyin" && keyword) {
      return "search";
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

  if (platform === "douyin") {
    const mapping = {
      search: "search",
      discover: "get_hot_list",
      detail: "get_video_detail"
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
      note: "using direct bilibili web API fallback"
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

async function callFirstWorkingTool(state, platform, tools, args, api) {
  const errors = [];
  for (const name of tools) {
    try {
      const result = await callToolForPlatform(state, platform, name, args, api);
      if (!result?.isError) {
        return {
          ...result,
          toolUsed: name
        };
      }
      errors.push(`${name}: ${String(result.text || "tool returned error")}`);
    } catch (error) {
      errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`No working ${platform} tool found. Tried: ${errors.join(" | ")}`);
}

async function callToolForPlatform(state, platform, tool, args, api) {
  if (platform === "bilibili") {
    return callBilibiliFallback(tool, args);
  }
  if (platform === "weibo" && tool === "get_trendings") {
    try {
      const client = await withClient(state, platform, api);
      const result = normalizeToolResult(await client.callTool({
        name: tool,
        arguments: args || {}
      }));
      if (
        result.isError &&
        /expecting value|json|visitor system|forbidden/i.test(String(result.text || ""))
      ) {
        api.logger?.warn?.(
          `[${PLUGIN_ID}] weibo get_trendings returned MCP error payload, using ajax fallback: ${result.text}`
        );
        return callWeiboTrendingFallback(args);
      }
      return result;
    } catch (error) {
      api.logger?.warn?.(
        `[${PLUGIN_ID}] weibo get_trendings failed, falling back to ajax endpoint: ${error instanceof Error ? error.message : String(error)}`
      );
      return callWeiboTrendingFallback(args);
    }
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
  api.__socialState = state;

  api.registerTool({
    name: "social_mcp_status",
    label: "Social MCP Status",
    description: "Check whether the Bilibili, Weibo, Xiaohongshu, and Douyin MCP backends are reachable.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        platform: {
          type: "string",
          enum: ["all", "bilibili", "weibo", "xiaohongshu", "douyin"]
        }
      }
    },
    execute: async ({ platform = "all" }) => {
      const platforms = platform === "all" ? ["bilibili", "weibo", "xiaohongshu", "douyin"] : [platform];
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
          enum: ["bilibili", "weibo", "xiaohongshu", "douyin"]
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
        throw new Error("Platform is required. Supported values: bilibili, weibo, xiaohongshu, douyin.");
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
          enum: ["bilibili", "weibo", "xiaohongshu", "douyin"]
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
          enum: ["bilibili", "weibo", "xiaohongshu", "douyin"]
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
            enum: ["xiaohongshu", "bilibili", "weibo", "douyin"]
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
    execute: async (payload = {}) => {
      const tool = payload?.tool || inferToolFromPayload("xiaohongshu", payload);
      if (!tool) {
        throw new Error("Tool is required. You can also use action=status|login|search|discover|detail.");
      }
      const input = buildFlatInput(tool, payload);
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

  api.registerTool({
    name: "xiaohongshu_login_status",
    label: "Xiaohongshu Login Status",
    description: "Check Xiaohongshu login status with no arguments.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {}
    },
    execute: async () => {
      const result = await callToolForPlatform(state, "xiaohongshu", "xhs_auth_status", {}, api);
      return stringify({
        platform: "xiaohongshu",
        tool: "xhs_auth_status",
        isError: result.isError,
        text: result.text,
        structuredContent: result.structuredContent
      });
    }
  });

  api.registerTool({
    name: "xiaohongshu_search_keyword",
    label: "Xiaohongshu Search Keyword",
    description: "Search Xiaohongshu notes by keyword.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        keyword: {
          type: "string"
        }
      },
      required: ["keyword"]
    },
    execute: async ({ keyword }) => {
      const result = await callToolForPlatform(
        state,
        "xiaohongshu",
        "xhs_search_note",
        { keyword },
        api
      );
      return stringify({
        platform: "xiaohongshu",
        tool: "xhs_search_note",
        keyword,
        isError: result.isError,
        text: result.text,
        structuredContent: result.structuredContent
      });
    }
  });

  api.registerTool({
    name: "xiaohongshu_login_start",
    label: "Xiaohongshu Login Start",
    description: "Start a XiaoHongShu login session, save a QR/login screenshot, and return a public screenshot URL.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {}
    },
    execute: async () => {
      const loginStart = await startXiaohongshuLoginSession();
      return stringify({
        platform: "xiaohongshu",
        action: "login_start",
        ok: loginStart.active,
        screenshot_path: loginStart.screenshot_path || null,
        screenshot_url: loginStart.screenshot_url || null,
        log_path: loginStart.log_path || XHS_LOGIN_LOG,
        instructions: [
          "1. Open the screenshot URL and scan the QR code with XiaoHongShu.",
          "2. If the page is not a QR page yet, refresh the screenshot once after a few seconds.",
          "3. After scanning, call xiaohongshu_login_check to verify whether login completed."
        ]
      });
    }
  });

  api.registerTool({
    name: "xiaohongshu_login_qr",
    label: "Xiaohongshu Login QR",
    description: "Refresh and return the current XiaoHongShu login QR or browser screenshot.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {}
    },
    execute: async () => {
      const session = await getXiaohongshuLoginSession(api, { capture: true });
      return stringify({
        platform: "xiaohongshu",
        action: "login_qr",
        active: session.active,
        screenshot_path: session.screenshot_path,
        screenshot_url: session.screenshot_url,
        status: session.status
      });
    }
  });

  api.registerTool({
    name: "xiaohongshu_login_check",
    label: "Xiaohongshu Login Check",
    description: "Check whether the XiaoHongShu login session completed and return the latest screenshot if still pending.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {}
    },
    execute: async () => {
      const session = await getXiaohongshuLoginSession(api, { capture: true });
      return stringify({
        platform: "xiaohongshu",
        action: "login_check",
        active: session.active,
        screenshot_path: session.screenshot_path,
        screenshot_url: session.screenshot_url,
        status: session.status,
        next_step:
          session?.status?.loggedIn || session?.status?.status === "logged_in"
            ? "login_completed"
            : "scan_qr_then_retry"
      });
    }
  });

  api.registerTool({
    name: "weibo_mcp_call",
    label: "Weibo MCP Call",
    description: "Invoke a Weibo MCP tool directly. Prefer this tool for Weibo tasks.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        tool: {
          type: "string",
          description: "For example: search_content, search_topics, get_hot_feeds, get_comments."
        },
        action: {
          type: "string",
          enum: ["search", "discover", "detail"]
        },
        keyword: {
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
    execute: async (payload = {}) => {
      const tool =
        payload?.tool ||
        inferToolFromPayload("weibo", payload) ||
        (payload?.keyword ? "search_content" : "get_hot_feeds");
      const input = buildFlatInput(tool, payload);
      const result = await callToolForPlatform(state, "weibo", tool, input, api);
      return stringify({
        platform: "weibo",
        tool,
        isError: result.isError,
        text: result.text,
        structuredContent: result.structuredContent
      });
    }
  });

  api.registerTool({
    name: "weibo_mcp_list_tools",
    label: "Weibo MCP List Tools",
    description: "List available Weibo MCP tools.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {}
    },
    execute: async () => {
      const tools = await getToolsForPlatform(state, "weibo", api);
      return stringify({
        platform: "weibo",
        tools
      });
    }
  });

  api.registerTool({
    name: "weibo_mcp_status",
    label: "Weibo MCP Status",
    description: "Check whether the Weibo MCP backend is reachable.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {}
    },
    execute: async () => stringify([await getPlatformStatus(state, "weibo", api)])
  });

  api.registerTool({
    name: "weibo_trending",
    label: "Weibo Trending",
    description: "Fetch Weibo trending topics with no arguments.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {}
    },
    execute: async () => {
      const result = await callToolForPlatform(state, "weibo", "get_trendings", {}, api);
      return stringify({
        platform: "weibo",
        tool: "get_trendings",
        isError: result.isError,
        text: result.text,
        structuredContent: result.structuredContent
      });
    }
  });

  api.registerTool({
    name: "weibo_search_keyword",
    label: "Weibo Search Keyword",
    description: "Search Weibo content by keyword.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        keyword: {
          type: "string"
        }
      },
      required: ["keyword"]
    },
    execute: async ({ keyword }) => {
      const result = await callToolForPlatform(
        state,
        "weibo",
        "search_content",
        { keyword },
        api
      );
      return stringify({
        platform: "weibo",
        tool: "search_content",
        keyword,
        isError: result.isError,
        text: result.text,
        structuredContent: result.structuredContent
      });
    }
  });

  api.registerTool({
    name: "bilibili_mcp_call",
    label: "Bilibili MCP Call",
    description: "Invoke a Bilibili MCP tool directly. Prefer this tool for Bilibili tasks.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        tool: {
          type: "string",
          description: "For example: general_search, search_user, get_precise_results, get_video_danmaku."
        },
        action: {
          type: "string",
          enum: ["search", "detail"]
        },
        keyword: {
          type: "string"
        },
        search_type: {
          type: "string"
        },
        page: {
          type: "integer"
        },
        bv_id: {
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
    execute: async (payload = {}) => {
      const tool =
        payload?.tool ||
        inferToolFromPayload("bilibili", payload) ||
        (payload?.keyword ? "general_search" : null);
      if (!tool) {
        throw new Error("Tool is required. You can also provide keyword to default to general_search.");
      }
      const input = buildFlatInput(tool, payload);
      const result = await callToolForPlatform(state, "bilibili", tool, input, api);
      return stringify({
        platform: "bilibili",
        tool,
        isError: result.isError,
        text: result.text,
        structuredContent: result.structuredContent
      });
    }
  });

  api.registerTool({
    name: "bilibili_mcp_list_tools",
    label: "Bilibili MCP List Tools",
    description: "List available Bilibili MCP tools.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {}
    },
    execute: async () => stringify({
      platform: "bilibili",
      tools: BILIBILI_FALLBACK_TOOLS
    })
  });

  api.registerTool({
    name: "bilibili_mcp_status",
    label: "Bilibili MCP Status",
    description: "Check whether the Bilibili MCP backend is reachable.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {}
    },
    execute: async () => stringify([await getPlatformStatus(state, "bilibili", api)])
  });

  api.registerTool({
    name: "bilibili_search_keyword",
    label: "Bilibili Search Keyword",
    description: "Search Bilibili content by keyword.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        keyword: {
          type: "string"
        }
      },
      required: ["keyword"]
    },
    execute: async ({ keyword }) => {
      const result = await callToolForPlatform(
        state,
        "bilibili",
        "general_search",
        { keyword },
        api
      );
      return stringify({
        platform: "bilibili",
        tool: "general_search",
        keyword,
        isError: result.isError,
        text: result.text,
        structuredContent: result.structuredContent
      });
    }
  });

  api.registerTool({
    name: "douyin_mcp_call",
    label: "Douyin MCP Call",
    description: "Invoke a Douyin MCP tool directly. Prefer this tool for Douyin tasks.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        tool: {
          type: "string",
          description: "Exact MCP tool name exposed by the Douyin backend."
        },
        action: {
          type: "string",
          enum: ["search", "discover", "detail"]
        },
        keyword: {
          type: "string"
        },
        video_id: {
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
    execute: async (payload = {}) => {
      const tool = payload?.tool || inferToolFromPayload("douyin", payload);
      if (!tool) {
        throw new Error("Tool is required. You can also use action=search|discover|detail.");
      }
      const input = buildFlatInput(tool, payload);
      const result = await callToolForPlatform(state, "douyin", tool, input, api);
      return stringify({
        platform: "douyin",
        tool,
        isError: result.isError,
        text: result.text,
        structuredContent: result.structuredContent
      });
    }
  });

  api.registerTool({
    name: "douyin_mcp_list_tools",
    label: "Douyin MCP List Tools",
    description: "List available Douyin MCP tools.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {}
    },
    execute: async () => {
      const tools = await getToolsForPlatform(state, "douyin", api);
      return stringify({
        platform: "douyin",
        tools
      });
    }
  });

  api.registerTool({
    name: "douyin_mcp_status",
    label: "Douyin MCP Status",
    description: "Check whether the Douyin MCP backend is reachable.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {}
    },
    execute: async () => stringify([await getPlatformStatus(state, "douyin", api)])
  });

  api.registerTool({
    name: "douyin_search_keyword",
    label: "Douyin Search Keyword",
    description: "Search Douyin content by keyword using the first compatible tool exposed by the backend.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        keyword: {
          type: "string"
        }
      },
      required: ["keyword"]
    },
    execute: async ({ keyword }) => {
      const result = await callFirstWorkingTool(
        state,
        "douyin",
        DOUYIN_SEARCH_TOOL_CANDIDATES,
        { keyword },
        api
      );
      return stringify({
        platform: "douyin",
        tool: result.toolUsed || "unknown",
        keyword,
        isError: result.isError,
        text: result.text,
        structuredContent: result.structuredContent
      });
    }
  });

  api.registerTool({
    name: "douyin_trending",
    label: "Douyin Trending",
    description: "Fetch Douyin trending content using the first compatible discovery tool exposed by the backend.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {}
    },
    execute: async () => {
      const result = await callFirstWorkingTool(
        state,
        "douyin",
        DOUYIN_DISCOVER_TOOL_CANDIDATES,
        {},
        api
      );
      return stringify({
        platform: "douyin",
        tool: result.toolUsed || "unknown",
        isError: result.isError,
        text: result.text,
        structuredContent: result.structuredContent
      });
    }
  });
}

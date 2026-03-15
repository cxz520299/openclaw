import crypto from "node:crypto";
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const bindHost = process.env.OPENCLAW_QQ_BIND || "0.0.0.0";
const port = Number.parseInt(process.env.OPENCLAW_QQ_PORT || "3400", 10);
const appId = process.env.QQ_BOT_APP_ID || "";
const appSecret = process.env.QQ_BOT_APP_SECRET || "";
const agentId = process.env.OPENCLAW_QQ_AGENT || "main";
const agentTimeout = Number.parseInt(process.env.OPENCLAW_QQ_TIMEOUT_SECONDS || "300", 10);

if (!appId || !appSecret) {
  console.error("[qq-bridge] Missing QQ_BOT_APP_ID or QQ_BOT_APP_SECRET");
  process.exit(1);
}

const seenEvents = new Map();
let cachedToken = "";
let cachedTokenExpiresAt = 0;
let tokenRefreshPromise = null;

function now() {
  return Date.now();
}

function json(res, statusCode, body) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function buildEd25519PrivateKey(secret) {
  let seed = String(secret || "");
  while (seed.length < 32) {
    seed += seed;
  }
  const seedBytes = Buffer.from(seed.slice(0, 32), "utf8");
  const pkcs8Prefix = Buffer.from("302e020100300506032b657004220420", "hex");
  return crypto.createPrivateKey({
    key: Buffer.concat([pkcs8Prefix, seedBytes]),
    format: "der",
    type: "pkcs8",
  });
}

function signValidation(eventTs, plainToken) {
  const privateKey = buildEd25519PrivateKey(appSecret);
  const payload = Buffer.from(`${eventTs}${plainToken}`, "utf8");
  return crypto.sign(null, payload, privateKey).toString("hex");
}

function rememberEvent(key) {
  const ts = now();
  seenEvents.set(key, ts);
  const cutoff = ts - 1000 * 60 * 60;
  for (const [entryKey, entryTs] of seenEvents.entries()) {
    if (entryTs < cutoff) {
      seenEvents.delete(entryKey);
    }
  }
}

function isDuplicate(key) {
  if (!key) {
    return false;
  }
  return seenEvents.has(key);
}

async function getAccessToken() {
  const refreshBufferMs = 60 * 1000;
  if (cachedToken && now() < cachedTokenExpiresAt - refreshBufferMs) {
    return cachedToken;
  }

  if (!tokenRefreshPromise) {
    tokenRefreshPromise = (async () => {
      const response = await fetch("https://bots.qq.com/app/getAppAccessToken", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "OpenClawQQBridge/1.0",
        },
        body: JSON.stringify({
          appId,
          clientSecret: appSecret,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.access_token) {
        throw new Error(`QQ access token failed: ${response.status} ${JSON.stringify(payload)}`);
      }

      cachedToken = payload.access_token;
      cachedTokenExpiresAt = now() + Number(payload.expires_in || 7200) * 1000;
      return cachedToken;
    })().finally(() => {
      tokenRefreshPromise = null;
    });
  }

  return tokenRefreshPromise;
}

function inferEventType(packet) {
  return String(packet?.t || packet?.type || "");
}

function inferPayload(packet) {
  if (packet && typeof packet.d === "object" && packet.d) {
    return packet.d;
  }
  return packet || {};
}

function inferMessageKind(eventType, payload) {
  if (payload.group_openid || payload.group_id || eventType.includes("GROUP")) {
    return "group";
  }
  if (payload.user_openid || payload.openid || eventType.includes("C2C") || eventType.includes("FRIEND")) {
    return "private";
  }
  if (payload.author?.member_openid && !payload.author?.user_openid) {
    return "group";
  }
  return "private";
}

function cleanupContent(input) {
  return String(input || "")
    .replace(/<qqbot-at-user[^>]*\/>/g, " ")
    .replace(/<@!?\d+>/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function inferConversation(packet) {
  const eventType = inferEventType(packet);
  const payload = inferPayload(packet);
  const kind = inferMessageKind(eventType, payload);
  const content = cleanupContent(payload.content);
  const senderOpenId =
    payload.user_openid ||
    payload.openid ||
    payload.author?.user_openid ||
    payload.author?.member_openid ||
    payload.author?.id ||
    "";
  const groupOpenId = payload.group_openid || payload.group_id || "";
  const messageId = payload.id || payload.msg_id || "";
  const eventId = packet?.id || payload.event_id || "";
  const dedupeKey = `${eventType}:${eventId || messageId}:${senderOpenId || groupOpenId}`;

  return {
    kind,
    eventType,
    payload,
    content,
    senderOpenId,
    groupOpenId,
    messageId,
    eventId,
    dedupeKey,
    sessionId:
      kind === "group"
        ? `qq-group-${groupOpenId || senderOpenId || "unknown"}`
        : `qq-c2c-${senderOpenId || "unknown"}`,
  };
}

async function runOpenClawAgent(message, sessionId) {
  const args = [
    "agent",
    "--json",
    "--agent",
    agentId,
    "--session-id",
    sessionId,
    "--message",
    message,
    "--thinking",
    "minimal",
    "--timeout",
    String(agentTimeout),
  ];

  const { stdout, stderr } = await execFileAsync("openclaw", args, {
    timeout: (agentTimeout + 15) * 1000,
    maxBuffer: 1024 * 1024 * 8,
    env: process.env,
  });

  const payload = JSON.parse(stdout);
  if (payload?.status !== "ok") {
    throw new Error(stderr || stdout || "OpenClaw agent failed");
  }

  const texts = Array.isArray(payload?.result?.payloads)
    ? payload.result.payloads.map((entry) => entry?.text || "").filter(Boolean)
    : [];

  const finalText = texts.join("\n\n").trim();
  return finalText || "已收到，我这边暂时没有生成可返回的文本结果。";
}

function splitReply(text, maxLength = 1500) {
  const source = String(text || "").trim();
  if (!source) {
    return ["已收到。"];
  }

  const chunks = [];
  let rest = source;
  while (rest.length > maxLength) {
    let sliceAt = rest.lastIndexOf("\n", maxLength);
    if (sliceAt < Math.floor(maxLength * 0.5)) {
      sliceAt = maxLength;
    }
    chunks.push(rest.slice(0, sliceAt).trim());
    rest = rest.slice(sliceAt).trim();
  }
  if (rest) {
    chunks.push(rest);
  }
  return chunks.filter(Boolean);
}

async function sendQqMessage(conversation, text) {
  const accessToken = await getAccessToken();
  const chunks = splitReply(text);
  const baseUrl =
    conversation.kind === "group"
      ? `https://api.sgroup.qq.com/v2/groups/${encodeURIComponent(conversation.groupOpenId)}/messages`
      : `https://api.sgroup.qq.com/v2/users/${encodeURIComponent(conversation.senderOpenId)}/messages`;

  let seq = 1;
  for (const chunk of chunks) {
    const body = {
      content: chunk,
      msg_type: 0,
    };

    if (conversation.messageId) {
      body.msg_id = conversation.messageId;
      body.msg_seq = seq;
    } else if (conversation.eventId) {
      body.event_id = conversation.eventId;
    }

    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `QQBot ${accessToken}`,
        "X-Union-Appid": appId,
      },
      body: JSON.stringify(body),
    });

    const payload = await response.text();
    if (!response.ok) {
      throw new Error(`QQ send failed: ${response.status} ${payload}`);
    }

    seq += 1;
  }
}

async function handlePacket(packet, res) {
  if (packet?.op === 13) {
    const plainToken = packet?.d?.plain_token || "";
    const eventTs = packet?.d?.event_ts || "";
    const signature = signValidation(eventTs, plainToken);
    return json(res, 200, {
      plain_token: plainToken,
      signature,
    });
  }

  if (packet?.op !== 0) {
    return json(res, 200, { code: 0, message: "ignored" });
  }

  const conversation = inferConversation(packet);
  if (!conversation.content) {
    return json(res, 200, { code: 0, message: "empty" });
  }

  if (
    !conversation.senderOpenId ||
    (conversation.kind === "group" && !conversation.groupOpenId)
  ) {
    console.warn("[qq-bridge] Missing routing ids", {
      eventType: conversation.eventType,
      senderOpenId: conversation.senderOpenId,
      groupOpenId: conversation.groupOpenId,
    });
    return json(res, 200, { code: 0, message: "missing-route" });
  }

  if (isDuplicate(conversation.dedupeKey)) {
    return json(res, 200, { code: 0, message: "duplicate" });
  }
  rememberEvent(conversation.dedupeKey);

  json(res, 200, { code: 0, message: "accepted" });

  try {
    const reply = await runOpenClawAgent(conversation.content, conversation.sessionId);
    await sendQqMessage(conversation, reply);
  } catch (error) {
    console.error("[qq-bridge] dispatch failed", error);
    try {
      await sendQqMessage(conversation, "我刚刚处理失败了，请稍后再试一次。");
    } catch (sendError) {
      console.error("[qq-bridge] fallback send failed", sendError);
    }
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/healthz") {
    return json(res, 200, { ok: true });
  }

  if (req.method !== "POST" || req.url !== "/qq/callback") {
    return json(res, 404, { error: "not_found" });
  }

  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const rawBody = Buffer.concat(chunks).toString("utf8");
    const packet = rawBody ? JSON.parse(rawBody) : {};
    await handlePacket(packet, res);
  } catch (error) {
    console.error("[qq-bridge] request failed", error);
    if (!res.headersSent) {
      json(res, 500, { error: "internal_error" });
    }
  }
});

server.listen(port, bindHost, () => {
  console.log(`[qq-bridge] listening on http://${bindHost}:${port}`);
});

#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const sessionsDir = process.env.OPENCLAW_SESSIONS_DIR || "/home/node/.openclaw/agents/main/sessions";
const sessionsStorePath = path.join(sessionsDir, "sessions.json");
const cwd = process.env.OPENCLAW_WORKSPACE_DIR || "/home/node/.openclaw/workspace";
const provider = process.env.OPENCLAW_MODEL_PROVIDER || "okinto";
const modelId = process.env.OPENCLAW_MODEL_ID || "gpt-5.4";

function createSeedTranscript(sessionId) {
  const timestamp = new Date().toISOString();
  const modelChangeId = "seed-model";
  const thinkingId = "seed-thinking";
  return [
    {
      type: "session",
      version: 3,
      id: sessionId,
      timestamp,
      cwd
    },
    {
      type: "model_change",
      id: modelChangeId,
      parentId: null,
      timestamp,
      provider,
      modelId
    },
    {
      type: "thinking_level_change",
      id: thinkingId,
      parentId: modelChangeId,
      timestamp,
      thinkingLevel: "off"
    },
    {
      type: "custom",
      customType: "model-snapshot",
      data: {
        timestamp: Date.now(),
        provider,
        modelApi: "openai-responses",
        modelId
      },
      id: "seed-snapshot",
      parentId: thinkingId,
      timestamp
    }
  ].map((entry) => JSON.stringify(entry)).join("\n") + "\n";
}

function main() {
  if (!fs.existsSync(sessionsStorePath)) {
    console.log(`[repair-session-files] sessions store not found: ${sessionsStorePath}`);
    return;
  }

  const raw = fs.readFileSync(sessionsStorePath, "utf8");
  const store = JSON.parse(raw);
  let repaired = 0;

  for (const entry of Object.values(store)) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const sessionId = typeof entry.sessionId === "string" ? entry.sessionId.trim() : "";
    if (!sessionId) {
      continue;
    }

    const sessionFile = typeof entry.sessionFile === "string" && entry.sessionFile.trim()
      ? entry.sessionFile.trim()
      : path.join(sessionsDir, `${sessionId}.jsonl`);

    if (fs.existsSync(sessionFile)) {
      continue;
    }

    fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
    fs.writeFileSync(sessionFile, createSeedTranscript(sessionId), "utf8");

    const lockPath = `${sessionFile}.lock`;
    if (fs.existsSync(lockPath)) {
      fs.rmSync(lockPath, { force: true });
    }

    repaired += 1;
    console.log(`[repair-session-files] repaired missing transcript for ${sessionId}`);
  }

  if (repaired === 0) {
    console.log("[repair-session-files] no repair needed");
  }
}

main();

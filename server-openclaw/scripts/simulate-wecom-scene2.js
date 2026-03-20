#!/usr/bin/env node

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const target = process.argv[2] || "";
const source =
  process.argv[3] ||
  "http://devimages.apple.com.edgekey.net/streaming/examples/bipbop_16x9/gear5/prog_index.m3u8";
const descriptionText =
  process.argv[4] || "画面是彩色视频样片，不是仓库监控，也不是真人办公场景";
const matchThresholdPercent = Number(process.argv[5] || "70");

if (!target) {
  console.error(
    "Usage: node simulate-wecom-scene2.js <chatId> [source] [descriptionText] [matchThresholdPercent]",
  );
  process.exit(1);
}

function buildReply(result) {
  const verdict = result?.verdict === "violation" ? "发现异常" : "符合点检项";
  const matchPercent = Number.isFinite(result?.matchPercent)
    ? Number(result.matchPercent).toFixed(2)
    : "0.00";
  const threshold = Number.isFinite(result?.thresholdMatchPercent)
    ? Number(result.thresholdMatchPercent).toFixed(2)
    : String(matchThresholdPercent.toFixed(2));
  const framePickMode = result?.framePickMode === "first" ? "第一帧" : "随机帧";
  const sampledAtSeconds = Number.isFinite(result?.sampledAtSeconds)
    ? Number(result.sampledAtSeconds).toFixed(3)
    : "0.000";
  const observedSummary = typeof result?.observedSummary === "string" ? result.observedSummary.trim() : "";
  const clauseResults = Array.isArray(result?.clauseResults) ? result.clauseResults : [];
  const passedClauses = clauseResults.filter((item) => item?.matched);
  const failedClauses = clauseResults.filter((item) => !item?.matched);
  const fallbackText = result?.fallbackUsed
    ? `已启用${result?.fallbackReason ? `（${String(result.fallbackReason).trim()}）` : ""}`
    : "未启用";
  const pluginRecommendation =
    result?.pluginRecommendation === "consider_detector_plugin"
      ? "建议补充检测插件做深度复核"
      : "普通视觉已足够，本次未启用额外插件";
  const pluginReason =
    typeof result?.pluginRecommendationReason === "string"
      ? result.pluginRecommendationReason.trim()
      : "";
  const reasons = Array.isArray(result?.reasons) && result.reasons.length > 0
    ? result.reasons.join("；")
    : result?.verdict === "violation"
      ? "当前巡检未通过"
      : "当前巡检通过";

  return [
    "文字巡检已完成",
    `结果: ${verdict}`,
    clauseResults.length > 0 ? `命中条款: ${passedClauses.length}/${clauseResults.length} 条符合` : "",
    `匹配度: ${matchPercent}%`,
    `报警规则: 匹配度 < ${threshold}%`,
    `抽帧: ${framePickMode} · ${sampledAtSeconds}s`,
    observedSummary ? `画面概况: ${observedSummary}` : "",
    `兜底复核: ${fallbackText}`,
    failedClauses.length > 0
      ? `未通过项: ${failedClauses
          .slice(0, 3)
          .map((item) => `${item.clause}（${item.evidence || "未返回依据"}）`)
          .join("；")}`
      : "未通过项: 无",
    passedClauses.length > 0
      ? `通过项: ${passedClauses
          .slice(0, 3)
          .map((item) => item.clause)
          .join("；")}`
      : "",
    `插件建议: ${pluginRecommendation}${pluginReason ? `（${pluginReason}）` : ""}`,
    `说明: ${reasons}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function runOpenClaw(args) {
  const env = {
    ...process.env,
    HOME: process.env.HOME || "/home/node",
  };
  try {
    return await execFileAsync("openclaw", args, {
      env,
      maxBuffer: 1024 * 1024 * 16,
    });
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return await execFileAsync("node", ["/app/openclaw.mjs", ...args], {
        env,
        maxBuffer: 1024 * 1024 * 16,
      });
    }
    throw error;
  }
}

async function sendText(message) {
  await runOpenClaw(["message", "send", "--channel", "wecom", "--target", target, "--message", message]);
}

async function sendMedia(mediaPath) {
  await runOpenClaw(["message", "send", "--channel", "wecom", "--target", target, "--media", mediaPath]);
}

async function runAnalyze() {
  const { stdout } = await execFileAsync(
    "node",
    [
      "/opt/openclaw/services/stream-frame-watch/index.mjs",
      "analyze",
      "--config",
      "/opt/openclaw/config/stream-frame-watch.json",
      "--source",
      source,
      "--description-text",
      descriptionText,
      "--match-threshold-percent",
      String(matchThresholdPercent),
      "--frame-pick-mode",
      "random",
      "--min-offset-seconds",
      "5",
      "--max-offset-seconds",
      "25",
      "--rule-name",
      "企业微信文字巡检计划",
    ],
    {
      env: process.env,
      maxBuffer: 1024 * 1024 * 16,
    },
  );
  return JSON.parse(String(stdout || "{}").trim());
}

async function main() {
  await sendText("已接收，正在抓取流画面并按点检项分析，通常需要 3-8 秒。");
  const result = await runAnalyze();
  await sendText(buildReply(result));
  if (result?.artifacts?.frame) {
    await sendMedia(result.artifacts.frame);
  }
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(String(error));
  process.exit(1);
});

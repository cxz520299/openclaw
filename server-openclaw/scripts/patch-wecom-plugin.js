#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const pluginDir = process.argv[2];

if (!pluginDir) {
  console.error("Usage: node patch-wecom-plugin.js <plugin-dir>");
  process.exit(1);
}

const DIST_FILES = ["dist/index.cjs.js", "dist/index.esm.js"];
const MARKER = "Uploaded media saved locally:";

function findFunctionEnd(source, startIndex) {
  const braceStart = source.indexOf("{", startIndex);
  if (braceStart < 0) {
    throw new Error(`function body start not found at ${startIndex}`);
  }

  let depth = 0;
  let quote = "";
  let escaped = false;

  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\\\") {
        escaped = true;
        continue;
      }
      if (char === quote) {
        quote = "";
      }
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char !== "}") {
      continue;
    }

    depth -= 1;
    if (depth === 0) {
      return index + 1;
    }
  }

  throw new Error(`function body end not found at ${startIndex}`);
}

function dedupeNamedFunction(source, signature) {
  let firstIndex = source.indexOf(signature);
  if (firstIndex < 0) {
    return source;
  }

  let searchFrom = firstIndex + signature.length;
  while (true) {
    const duplicateIndex = source.indexOf(signature, searchFrom);
    if (duplicateIndex < 0) {
      return source;
    }

    const duplicateEnd = findFunctionEnd(source, duplicateIndex);
    source = `${source.slice(0, duplicateIndex)}${source.slice(duplicateEnd)}`.replace(/\n{3,}/g, "\n\n");
    searchFrom = firstIndex + signature.length;
  }
}

function replaceNamedFunction(source, signature, replacement) {
  const startIndex = source.indexOf(signature);
  if (startIndex < 0) {
    return { source, replaced: false };
  }

  const endIndex = findFunctionEnd(source, startIndex);
  return {
    source: `${source.slice(0, startIndex)}${replacement}${source.slice(endIndex)}`,
    replaced: true,
  };
}

const helperNeedle = 'const MEDIA_DOCUMENT_PLACEHOLDER = "<media:document>";';
const sendWeComReplySignature = "async function sendWeComReply(params) {";
const sendWeComReplyWithFallback = `async function sendWeComReply(params) {
    const { wsClient, frame, text, runtime, finish = true, streamId: existingStreamId } = params;
    if (!text) {
        return "";
    }
    const streamId = existingStreamId || aibotNodeSdk.generateReqId("stream");
    if (!wsClient.isConnected) {
        runtime.error?.(\`[wecom] WSClient not connected, cannot send reply\`);
        throw new Error("WSClient not connected");
    }
    const replyTarget = frame?.body?.chatid
        || frame?.body?.from?.userid
        || frame?.body?.external_userid
        || frame?.body?.from?.external_userid
        || "";
    try {
        await withTimeout(wsClient.replyStream(frame, streamId, text, finish), REPLY_SEND_TIMEOUT_MS, \`Reply send timed out (streamId=\${streamId})\`);
        runtime.log?.(\`[plugin -> server] streamId=\${streamId}, finish=\${finish}, text=\${text}\`);
        return streamId;
    }
    catch (error) {
        const detail = String(error?.message || error || "unknown error");
        const shouldFallback = /846609|aibot websocket not subscribed|Reply ack|Reply send timed out|ack timeout/i.test(detail);
        if (!shouldFallback || !replyTarget) {
            throw error;
        }
        runtime.error?.(\`[wecom] replyStream failed, fallback to proactive send: \${detail}\`);
        await withTimeout(sendWeComMessage({ to: replyTarget, content: text }), REPLY_SEND_TIMEOUT_MS, \`Fallback send timed out (streamId=\${streamId})\`);
        runtime.log?.(\`[plugin -> server] proactive fallback target=\${replyTarget}, finish=\${finish}, text=\${text}\`);
        return streamId;
    }
}`;
const helperInsert = `${helperNeedle}
const INBOUND_MEDIA_SECTION_TITLE = "Uploaded media saved locally:";
function buildInboundMediaNotice(mediaList) {
    if (!Array.isArray(mediaList) || mediaList.length === 0) {
        return "";
    }
    const lines = [INBOUND_MEDIA_SECTION_TITLE];
    let imageIndex = 0;
    let fileIndex = 0;
    for (const media of mediaList) {
        if (!media?.path) {
            continue;
        }
        const contentType = typeof media.contentType === "string" ? media.contentType : "";
        const isImage = contentType.startsWith("image/");
        if (isImage) {
            imageIndex += 1;
        }
        else {
            fileIndex += 1;
        }
        const label = isImage ? \`image\${imageIndex}\` : \`file\${fileIndex}\`;
        const mimeLabel = contentType || "application/octet-stream";
        lines.push(\`- \${label}: \${media.path} (\${mimeLabel})\`);
    }
    return lines.length > 1 ? lines.join("\\n") : "";
}
function mergeMessageBodyWithInboundMedia(text, mediaList) {
    const hasImages = mediaList.some((m) => m.contentType?.startsWith("image/"));
    const baseBody = text || (mediaList.length > 0 ? (hasImages ? MEDIA_IMAGE_PLACEHOLDER : MEDIA_DOCUMENT_PLACEHOLDER) : "");
    const mediaNotice = buildInboundMediaNotice(mediaList);
    return [baseBody, mediaNotice].filter(Boolean).join("\\n\\n");
}
function shouldSuppressInlineMediaForStreamFrameWatch(text) {
    const normalized = String(text || "").replace(/\\s+/g, "");
    const sourceText = String(text || "");
    const hasInspectionPlanPrefix = /^[\\s,，:：;；]*[@＠]?\\S*?[\\s,，:：;；]*(?:执行|运行|启动)巡检计划/iu.test(sourceText);
    const hasStoreLikeText = /门店|分店|店铺|成都小智零食有鸣/u.test(sourceText);
    const hasPlanLikeText = /基准图巡检|营业画面点检|随机巡场点检|巡检计划|点检|巡检|巡场/u.test(sourceText);
    return normalized.includes("按图片基准检查这个流")
        || normalized.includes("按照图片基准检查这个流")
        || normalized.includes("按基准图检查这个流")
        || normalized.includes("按照基准图检查这个流")
        || hasInspectionPlanPrefix
        || (hasInspectionPlanPrefix && hasStoreLikeText && hasPlanLikeText);
}
function shouldUseWecomDocFastAck(text) {
    const sourceText = String(text || "");
    if (!sourceText) {
        return false;
    }
    const hasWriteVerb = /整理|生成|创建|写入|同步|追加|记录|保存|输出|做成|转成/u.test(sourceText);
    const hasDocTarget = /企业微信文档|企业微信表格|智能表|文档|表格/u.test(sourceText);
    return hasWriteVerb && hasDocTarget;
}
function getWecomDocFastAckText(text) {
    const sourceText = String(text || "");
    if (/智能表|表格/u.test(sourceText)) {
        return "已接收，正在整理并写入企业微信表格，通常需要 3-8 秒。";
    }
    return "已接收，正在整理并写入企业微信文档，通常需要 3-8 秒。";
}`;

const bodyNeedle = `    const hasImages = mediaList.some((m) => m.contentType?.startsWith("image/"));
    const messageBody = text || (mediaList.length > 0 ? (hasImages ? MEDIA_IMAGE_PLACEHOLDER : MEDIA_DOCUMENT_PLACEHOLDER) : "");`;

const bodyInsert = `    const messageBody = mergeMessageBodyWithInboundMedia(text, mediaList);
    const suppressInlineMedia = shouldSuppressInlineMediaForStreamFrameWatch(messageBody);`;

const mediaPathsNeedle = `    const mediaPaths = mediaList.length > 0 ? mediaList.map((m) => m.path) : undefined;
    const mediaTypes = mediaList.length > 0
        ? mediaList.map((m) => m.contentType).filter(Boolean)
        : undefined;`;

const mediaPathsInsert = `    const mediaPaths = !suppressInlineMedia && mediaList.length > 0 ? mediaList.map((m) => m.path) : undefined;
    const mediaTypes = !suppressInlineMedia && mediaList.length > 0
        ? mediaList.map((m) => m.contentType).filter(Boolean)
        : undefined;`;

const mediaContextNeedle = `        MediaPath: mediaList[0]?.path,
        MediaType: mediaList[0]?.contentType,
        MediaPaths: mediaPaths,
        MediaTypes: mediaTypes,
        MediaUrls: mediaPaths,`;

const mediaContextInsert = `        MediaPath: suppressInlineMedia ? undefined : mediaList[0]?.path,
        MediaType: suppressInlineMedia ? undefined : mediaList[0]?.contentType,
        MediaPaths: mediaPaths,
        MediaTypes: mediaTypes,
        MediaUrls: mediaPaths,`;

const directStreamHelperLegacyNeedle = `function shouldSuppressInlineMediaForStreamFrameWatch(text) {
    const normalized = String(text || "").replace(/\\s+/g, "");
    return normalized.includes("按图片基准检查这个流")
        || normalized.includes("按照图片基准检查这个流")
        || normalized.includes("按基准图检查这个流")
        || normalized.includes("按照基准图检查这个流")
}`;

const directStreamHelperNeedle = `function shouldSuppressInlineMediaForStreamFrameWatch(text) {
    const normalized = String(text || "").replace(/\\s+/g, "");
    const sourceText = String(text || "");
    const hasInspectionPlanPrefix = /^[\\s,，:：;；]*[@＠]?\\S*?[\\s,，:：;；]*(?:执行|运行|启动)巡检计划/iu.test(sourceText);
    const hasStoreLikeText = /门店|分店|店铺|成都小智零食有鸣/u.test(sourceText);
    const hasPlanLikeText = /基准图巡检|营业画面点检|随机巡场点检|巡检计划|点检|巡检|巡场/u.test(sourceText);
    return normalized.includes("按图片基准检查这个流")
        || normalized.includes("按照图片基准检查这个流")
        || normalized.includes("按基准图检查这个流")
        || normalized.includes("按照基准图检查这个流")
        || hasInspectionPlanPrefix
        || (hasInspectionPlanPrefix && hasStoreLikeText && hasPlanLikeText);
}`;

const directStreamHelperWithDocAck = `${directStreamHelperNeedle}
function shouldUseWecomDocFastAck(text) {
    const sourceText = String(text || "");
    if (!sourceText) {
        return false;
    }
    const hasWriteVerb = /整理|生成|创建|写入|同步|追加|记录|保存|输出|做成|转成/u.test(sourceText);
    const hasDocTarget = /企业微信文档|企业微信表格|智能表|文档|表格/u.test(sourceText);
    return hasWriteVerb && hasDocTarget;
}
function getWecomDocFastAckText(text) {
    const sourceText = String(text || "");
    if (/智能表|表格/u.test(sourceText)) {
        return "已接收，正在整理并写入企业微信表格，通常需要 3-8 秒。";
    }
    return "已接收，正在整理并写入企业微信文档，通常需要 3-8 秒。";
}`;

const directStreamPlanLegacyNeedle = `    const compareThreshold = similarityPercent !== undefined
        ? Number((1 - similarityPercent / 100).toFixed(4))
        : differencePercent !== undefined
            ? Number((differencePercent / 100).toFixed(4))
            : 0.12;
    const framePickMode = /第一帧/u.test(sourceText) ? "first" : "random";
    const thresholdSimilarityText = Number((100 - compareThreshold * 100).toFixed(2));
    return {
        source,
        baselineImage,
        compareThreshold,
        framePickMode,
        ruleName: "企微基准图检查",
        expectedDescription: "基准图一致画面",
        violationMessage: \`相似度低于\${thresholdSimilarityText}%\`,
    };`;

const directStreamPlanInsert = `    const isInspectionPlanShortcut = /(?:执行|运行|启动)巡检计划/u.test(sourceText);
    const compareThreshold = similarityPercent !== undefined
        ? Number((1 - similarityPercent / 100).toFixed(4))
        : differencePercent !== undefined
            ? Number((differencePercent / 100).toFixed(4))
            : 0.12;
    const framePickMode = /随机帧/u.test(sourceText)
        ? "random"
        : /第一帧/u.test(sourceText) || isInspectionPlanShortcut
            ? "first"
            : "random";
    const thresholdSimilarityText = Number((100 - compareThreshold * 100).toFixed(2));
    return {
        source,
        baselineImage,
        compareThreshold,
        framePickMode,
        ruleName: isInspectionPlanShortcut ? "企业微信巡检计划" : "企微基准图检查",
        expectedDescription: "基准图一致画面",
        violationMessage: \`相似度低于\${thresholdSimilarityText}%\`,
    };`;

const directStreamHelperInsertLegacy = `${directStreamHelperWithDocAck}
function extractFirstInboundImagePath(mediaList) {
    if (!Array.isArray(mediaList)) {
        return "";
    }
    for (const media of mediaList) {
        const mediaPath = typeof media?.path === "string" ? media.path.trim() : "";
        const contentType = typeof media?.contentType === "string" ? media.contentType : "";
        if (mediaPath && contentType.startsWith("image/")) {
            return mediaPath;
        }
    }
    return "";
}
function parsePercentNumber(raw) {
    const value = Number(raw);
    if (!Number.isFinite(value)) {
        return undefined;
    }
    return Math.min(100, Math.max(0, value));
}
function parseDirectStreamFrameWatchRequest(text, mediaList) {
    const sourceText = String(text || "");
    if (!shouldSuppressInlineMediaForStreamFrameWatch(sourceText)) {
        return null;
    }
    const sourceMatch = sourceText.match(/https?:\\/\\/\\S+/i);
    const baselineImage = extractFirstInboundImagePath(mediaList);
    if (!sourceMatch || !baselineImage) {
        return null;
    }
    const source = sourceMatch[0].replace(/[),，。；;]+$/u, "");
    const similarityMatch = sourceText.match(/相似度[^0-9]{0,8}(\\d+(?:\\.\\d+)?)\\s*%/u);
    const differenceMatch = sourceText.match(/(?:差异(?:度)?|阈值|差异阈值)[^0-9]{0,8}(\\d+(?:\\.\\d+)?)\\s*%/u);
    const similarityPercent = similarityMatch ? parsePercentNumber(similarityMatch[1]) : undefined;
    const differencePercent = differenceMatch ? parsePercentNumber(differenceMatch[1]) : undefined;
    const isInspectionPlanShortcut = /(?:执行|运行|启动)巡检计划/u.test(sourceText);
    const compareThreshold = similarityPercent !== undefined
        ? Number((1 - similarityPercent / 100).toFixed(4))
        : differencePercent !== undefined
            ? Number((differencePercent / 100).toFixed(4))
            : 0.12;
    const framePickMode = /随机帧/u.test(sourceText)
        ? "random"
        : /第一帧/u.test(sourceText) || isInspectionPlanShortcut
            ? "first"
            : "random";
    const thresholdSimilarityText = Number((100 - compareThreshold * 100).toFixed(2));
    return {
        source,
        baselineImage,
        compareThreshold,
        framePickMode,
        ruleName: isInspectionPlanShortcut ? "企业微信巡检计划" : "企微基准图检查",
        expectedDescription: "基准图一致画面",
        violationMessage: \`相似度低于\${thresholdSimilarityText}%\`,
    };
}
async function runDirectStreamFrameWatchCompare(request) {
    const childProcess = await import("node:child_process");
    const args = [
        "/opt/openclaw/services/stream-frame-watch/index.mjs",
        "analyze",
        "--config",
        "/opt/openclaw/config/stream-frame-watch.json",
        "--source",
        request.source,
        "--baseline",
        request.baselineImage,
        "--threshold",
        String(request.compareThreshold),
        "--frame-pick-mode",
        request.framePickMode,
        "--rule-name",
        request.ruleName,
        "--expected-description",
        request.expectedDescription,
        "--violation-message",
        request.violationMessage,
    ];
    return await new Promise((resolve, reject) => {
        childProcess.execFile("node", args, {
            env: process.env,
            maxBuffer: 1024 * 1024 * 16,
        }, (error, stdout, stderr) => {
            if (error) {
                const detail = String(stderr || stdout || error.message || "unknown error").trim();
                reject(new Error(\`direct stream watch failed: \${detail}\`));
                return;
            }
            try {
                resolve(JSON.parse(String(stdout || "{}").trim() || "{}"));
            }
            catch (parseError) {
                reject(new Error(\`direct stream watch returned invalid JSON: \${String(parseError)}\`));
            }
        });
    });
}
function formatDirectStreamFrameWatchReply(result) {
    const verdict = result?.verdict === "violation" ? "违规" : "正常";
    const reasons = Array.isArray(result?.reasons) && result.reasons.length > 0
        ? result.reasons.join("；")
        : result?.verdict === "violation"
            ? "当前帧与基准图差异过大"
            : "当前帧与基准图差异未超过阈值";
    const framePickMode = result?.framePickMode === "first" ? "第一帧" : "随机帧";
    const sampledAtSeconds = Number.isFinite(result?.sampledAtSeconds)
        ? Number(result.sampledAtSeconds).toFixed(3)
        : "0.000";
    const differencePercent = Number.isFinite(result?.differencePercent)
        ? Number(result.differencePercent).toFixed(2)
        : "0.00";
    const similarityPercent = Number.isFinite(result?.similarityPercent)
        ? Number(result.similarityPercent).toFixed(2)
        : "100.00";
    const thresholdDifferencePercent = Number.isFinite(result?.thresholdDifferencePercent)
        ? Number(result.thresholdDifferencePercent).toFixed(2)
        : "0.00";
    const thresholdSimilarityPercent = Number.isFinite(result?.thresholdSimilarityPercent)
        ? Number(result.thresholdSimilarityPercent).toFixed(2)
        : "100.00";
    const framePath = typeof result?.artifacts?.frame === "string" ? result.artifacts.frame : "";
    const diffPath = typeof result?.artifacts?.diff === "string" ? result.artifacts.diff : "";
    return [
        "图片基准比对完成",
        \`结论: \${verdict}\`,
        \`差异度: \${differencePercent}%\`,
        \`相似度: \${similarityPercent}%\`,
        \`报警阈值: 差异度 >= \${thresholdDifferencePercent}% / 相似度 <= \${thresholdSimilarityPercent}%\`,
        \`抽帧方式: \${framePickMode}\`,
        \`抽帧时间: \${sampledAtSeconds}s\`,
        \`原因: \${reasons}\`,
        framePath ? \`抽帧图: \${framePath}\` : "",
        diffPath ? \`差异图: \${diffPath}\` : "",
    ].filter(Boolean).join("\\n");
}`;

const directStreamHelperInsert = `${directStreamHelperWithDocAck}
function extractFirstInboundImagePath(mediaList) {
    if (!Array.isArray(mediaList)) {
        return "";
    }
    for (const media of mediaList) {
        const mediaPath = typeof media?.path === "string" ? media.path.trim() : "";
        const contentType = typeof media?.contentType === "string" ? media.contentType : "";
        if (mediaPath && contentType.startsWith("image/")) {
            return mediaPath;
        }
    }
    return "";
}
function collectDirectStreamFrameWatchArtifacts(result) {
    const artifacts = [];
    const framePath = typeof result?.artifacts?.frame === "string" ? result.artifacts.frame.trim() : "";
    const diffPath = typeof result?.artifacts?.diff === "string" ? result.artifacts.diff.trim() : "";
    const inspectionType = typeof result?.inspectionType === "string" ? result.inspectionType.trim() : "";
    if (framePath) {
        artifacts.push({ label: "抽帧图", mediaUrl: framePath });
    }
    if (diffPath && inspectionType !== "description") {
        artifacts.push({ label: "差异图", mediaUrl: diffPath });
    }
    return artifacts;
}
function parsePercentNumber(raw) {
    const value = Number(raw);
    if (!Number.isFinite(value)) {
        return undefined;
    }
    return Math.min(100, Math.max(0, value));
}
function parseDirectStreamFrameWatchRequest(text, mediaList) {
    const sourceText = String(text || "");
    if (!shouldSuppressInlineMediaForStreamFrameWatch(sourceText)) {
        return null;
    }
    const sourceMatch = sourceText.match(/https?:\\/\\/\\S+/i);
    const baselineImage = extractFirstInboundImagePath(mediaList);
    if (!sourceMatch || !baselineImage) {
        return null;
    }
    const source = sourceMatch[0].replace(/[),，。；;]+$/u, "");
    const similarityMatch = sourceText.match(/相似度[^0-9]{0,8}(\\d+(?:\\.\\d+)?)\\s*%/u);
    const differenceMatch = sourceText.match(/(?:差异(?:度)?|阈值|差异阈值)[^0-9]{0,8}(\\d+(?:\\.\\d+)?)\\s*%/u);
    const similarityPercent = similarityMatch ? parsePercentNumber(similarityMatch[1]) : undefined;
    const differencePercent = differenceMatch ? parsePercentNumber(differenceMatch[1]) : undefined;
    const isInspectionPlanShortcut = /(?:执行|运行|启动)巡检计划/u.test(sourceText);
    const compareThreshold = similarityPercent !== undefined
        ? Number((1 - similarityPercent / 100).toFixed(4))
        : differencePercent !== undefined
            ? Number((differencePercent / 100).toFixed(4))
            : 0.12;
    const framePickMode = /随机帧/u.test(sourceText)
        ? "random"
        : /第一帧/u.test(sourceText) || isInspectionPlanShortcut
            ? "first"
            : "random";
    const thresholdSimilarityText = Number((100 - compareThreshold * 100).toFixed(2));
    return {
        source,
        baselineImage,
        compareThreshold,
        framePickMode,
        ruleName: isInspectionPlanShortcut ? "企业微信巡检计划" : "企微基准图检查",
        expectedDescription: "基准图一致画面",
        violationMessage: \`相似度低于\${thresholdSimilarityText}%\`,
    };
}
async function runDirectStreamFrameWatchCompare(request) {
    const childProcess = await import("node:child_process");
    const args = [
        "/opt/openclaw/services/stream-frame-watch/index.mjs",
        "analyze",
        "--config",
        "/opt/openclaw/config/stream-frame-watch.json",
        "--source",
        request.source,
        "--baseline",
        request.baselineImage,
        "--threshold",
        String(request.compareThreshold),
        "--frame-pick-mode",
        request.framePickMode,
        "--rule-name",
        request.ruleName,
        "--expected-description",
        request.expectedDescription,
        "--violation-message",
        request.violationMessage,
    ];
    return await new Promise((resolve, reject) => {
        childProcess.execFile("node", args, {
            env: process.env,
            maxBuffer: 1024 * 1024 * 16,
        }, (error, stdout, stderr) => {
            if (error) {
                const detail = String(stderr || stdout || error.message || "unknown error").trim();
                reject(new Error(\`direct stream watch failed: \${detail}\`));
                return;
            }
            try {
                resolve(JSON.parse(String(stdout || "{}").trim() || "{}"));
            }
            catch (parseError) {
                reject(new Error(\`direct stream watch returned invalid JSON: \${String(parseError)}\`));
            }
        });
    });
}
function formatDirectStreamFrameWatchReply(result) {
    const verdict = result?.verdict === "violation" ? "违规" : "正常";
    const reasons = Array.isArray(result?.reasons) && result.reasons.length > 0
        ? result.reasons.join("；")
        : result?.verdict === "violation"
            ? "当前帧与基准图差异过大"
            : "当前帧与基准图差异未超过阈值";
    const framePickMode = result?.framePickMode === "first" ? "第一帧" : "随机帧";
    const sampledAtSeconds = Number.isFinite(result?.sampledAtSeconds)
        ? Number(result.sampledAtSeconds).toFixed(3)
        : "0.000";
    const differencePercent = Number.isFinite(result?.differencePercent)
        ? Number(result.differencePercent).toFixed(2)
        : "0.00";
    const similarityPercent = Number.isFinite(result?.similarityPercent)
        ? Number(result.similarityPercent).toFixed(2)
        : "100.00";
    const thresholdDifferencePercent = Number.isFinite(result?.thresholdDifferencePercent)
        ? Number(result.thresholdDifferencePercent).toFixed(2)
        : "0.00";
    const thresholdSimilarityPercent = Number.isFinite(result?.thresholdSimilarityPercent)
        ? Number(result.thresholdSimilarityPercent).toFixed(2)
        : "100.00";
    return [
        "图片基准比对完成",
        \`结论: \${verdict}\`,
        \`差异度: \${differencePercent}%\`,
        \`相似度: \${similarityPercent}%\`,
        \`报警阈值: 差异度 >= \${thresholdDifferencePercent}% / 相似度 <= \${thresholdSimilarityPercent}%\`,
        \`抽帧方式: \${framePickMode}\`,
        \`抽帧时间: \${sampledAtSeconds}s\`,
        \`原因: \${reasons}\`,
    ].filter(Boolean).join("\\n");
}
async function sendDirectStreamFrameWatchArtifacts(params) {
    const { wsClient, frame, account, runtime, result } = params;
    const artifacts = collectDirectStreamFrameWatchArtifacts(result);
    if (artifacts.length === 0) {
        return { failures: [] };
    }
    const chatId = frame.body.chatid || frame.body.from.userid;
    const mediaLocalRoots = await getExtendedMediaLocalRoots(account.config);
    const failures = [];
    for (const artifact of artifacts) {
        const mediaResult = await uploadAndSendMedia({
            wsClient,
            mediaUrl: artifact.mediaUrl,
            chatId,
            mediaLocalRoots,
            log: (...args) => runtime.log?.(...args),
            errorLog: (...args) => runtime.error?.(...args),
        });
        if (!mediaResult.ok) {
            failures.push(\`\${artifact.label}发送失败: \${mediaResult.rejectReason || mediaResult.error || "unknown error"}\`);
        }
    }
    return { failures };
}`;

const directStreamFlowNeedle = `    const shouldSendThinking = account.sendThinkingMessage ?? true;
    if (shouldSendThinking) {
        await sendThinkingReply({ wsClient, frame, streamId, runtime });
    }
    // Step 7: 构建上下文并路由到核心处理流程（带整体超时保护）
    const ctxPayload = buildMessageContext(frame, account, config, text, mediaList, quoteContent);`;

const directStreamFlowInsertLegacy = `    const directStreamWatchCommand = shouldSuppressInlineMediaForStreamFrameWatch(text);
    const shouldSendThinking = account.sendThinkingMessage ?? true;
    const shouldUseDocFastAck = shouldUseWecomDocFastAck(text);
    if (directStreamWatchCommand) {
        await sendWeComReply({
            wsClient,
            frame,
            text: "已接收，正在抓取流画面并比对，通常需要 2-5 秒。",
            runtime,
            finish: false,
            streamId,
        });
    }
    else if (shouldUseDocFastAck) {
        runtime.log?.("[wecom][plugin] fast ack for document request");
        await sendWeComReply({
            wsClient,
            frame,
            text: getWecomDocFastAckText(text),
            runtime,
            finish: false,
            streamId,
        });
    }
    else if (shouldSendThinking) {
        await sendThinkingReply({ wsClient, frame, streamId, runtime });
    }
    const directStreamWatchRequest = directStreamWatchCommand ? parseDirectStreamFrameWatchRequest(text, mediaList) : null;
    if (directStreamWatchCommand && !directStreamWatchRequest) {
        await sendWeComReply({
            wsClient,
            frame,
            text: "已接收，但没有找到可用的基准图，请重新发送图片后再试。",
            runtime,
            finish: true,
            streamId,
        });
        cleanupState();
        return;
    }
    if (directStreamWatchRequest) {
        runtime.log?.(\`[wecom][plugin] direct stream watch request: \${JSON.stringify({
            source: directStreamWatchRequest.source,
            baselineImage: directStreamWatchRequest.baselineImage,
            compareThreshold: directStreamWatchRequest.compareThreshold,
            framePickMode: directStreamWatchRequest.framePickMode,
        })}\`);
        try {
            const directResult = await withTimeout(runDirectStreamFrameWatchCompare(directStreamWatchRequest), MESSAGE_PROCESS_TIMEOUT_MS, \`Direct stream watch timed out (msgId=\${messageId})\`);
            await sendWeComReply({
                wsClient,
                frame,
                text: formatDirectStreamFrameWatchReply(directResult),
                runtime,
                finish: true,
                streamId,
            });
        }
        catch (err) {
            runtime.error?.(\`[wecom][plugin] Direct stream watch failed: \${String(err)}\`);
            await sendWeComReply({
                wsClient,
                frame,
                text: \`图片基准比对失败：\${String(err)}\`,
                runtime,
                finish: true,
                streamId,
            });
        }
        cleanupState();
        return;
    }
    // Step 7: 构建上下文并路由到核心处理流程（带整体超时保护）
    const ctxPayload = buildMessageContext(frame, account, config, text, mediaList, quoteContent);`;

const directStreamFlowInsert = `    const directStreamWatchCommand = shouldSuppressInlineMediaForStreamFrameWatch(text);
    const shouldSendThinking = account.sendThinkingMessage ?? true;
    const shouldUseDocFastAck = shouldUseWecomDocFastAck(text);
    if (directStreamWatchCommand) {
        await sendWeComReply({
            wsClient,
            frame,
            text: "已接收，正在抓取流画面并比对，通常需要 2-5 秒。",
            runtime,
            finish: false,
            streamId,
        });
    }
    else if (shouldUseDocFastAck) {
        runtime.log?.("[wecom][plugin] fast ack for document request");
        await sendWeComReply({
            wsClient,
            frame,
            text: getWecomDocFastAckText(text),
            runtime,
            finish: false,
            streamId,
        });
    }
    else if (shouldSendThinking) {
        await sendThinkingReply({ wsClient, frame, streamId, runtime });
    }
    const directStreamWatchRequest = directStreamWatchCommand ? parseDirectStreamFrameWatchRequest(text, mediaList) : null;
    if (directStreamWatchCommand && !directStreamWatchRequest) {
        await sendWeComReply({
            wsClient,
            frame,
            text: "已接收，但没有找到可用的基准图，请重新发送图片后再试。",
            runtime,
            finish: true,
            streamId,
        });
        cleanupState();
        return;
    }
    if (directStreamWatchRequest) {
        runtime.log?.(\`[wecom][plugin] direct stream watch request: \${JSON.stringify({
            source: directStreamWatchRequest.source,
            baselineImage: directStreamWatchRequest.baselineImage,
            compareThreshold: directStreamWatchRequest.compareThreshold,
            framePickMode: directStreamWatchRequest.framePickMode,
        })}\`);
        try {
            const directResult = await withTimeout(runDirectStreamFrameWatchCompare(directStreamWatchRequest), MESSAGE_PROCESS_TIMEOUT_MS, \`Direct stream watch timed out (msgId=\${messageId})\`);
            await sendWeComReply({
                wsClient,
                frame,
                text: formatDirectStreamFrameWatchReply(directResult),
                runtime,
                finish: true,
                streamId,
            });
            const directArtifactReply = await sendDirectStreamFrameWatchArtifacts({
                wsClient,
                frame,
                account,
                runtime,
                result: directResult,
            });
            if (directArtifactReply.failures.length > 0) {
                await sendWeComReply({
                    wsClient,
                    frame,
                    text: \`结果图片回传失败：\${directArtifactReply.failures.join("；")}\`,
                    runtime,
                    finish: true,
                });
            }
        }
        catch (err) {
            runtime.error?.(\`[wecom][plugin] Direct stream watch failed: \${String(err)}\`);
            await sendWeComReply({
                wsClient,
                frame,
                text: \`图片基准比对失败：\${String(err)}\`,
                runtime,
                finish: true,
                streamId,
            });
        }
        cleanupState();
        return;
    }
    // Step 7: 构建上下文并路由到核心处理流程（带整体超时保护）
    const ctxPayload = buildMessageContext(frame, account, config, text, mediaList, quoteContent);`;

const directStreamFlowUpgradeNeedle = `    const shouldSendThinking = account.sendThinkingMessage ?? true;
    if (shouldSendThinking) {
        await sendThinkingReply({ wsClient, frame, streamId, runtime });
    }
    const directStreamWatchRequest = parseDirectStreamFrameWatchRequest(text, mediaList);
    if (directStreamWatchRequest) {
        runtime.log?.(\`[wecom][plugin] direct stream watch request: \${JSON.stringify({
            source: directStreamWatchRequest.source,
            baselineImage: directStreamWatchRequest.baselineImage,
            compareThreshold: directStreamWatchRequest.compareThreshold,
            framePickMode: directStreamWatchRequest.framePickMode,
        })}\`);
        try {
            const directResult = await withTimeout(runDirectStreamFrameWatchCompare(directStreamWatchRequest), MESSAGE_PROCESS_TIMEOUT_MS, \`Direct stream watch timed out (msgId=\${messageId})\`);
            await sendWeComReply({
                wsClient,
                frame,
                text: formatDirectStreamFrameWatchReply(directResult),
                runtime,
                finish: true,
                streamId,
            });
        }
        catch (err) {
            runtime.error?.(\`[wecom][plugin] Direct stream watch failed: \${String(err)}\`);
            await sendWeComReply({
                wsClient,
                frame,
                text: \`图片基准比对失败：\${String(err)}\`,
                runtime,
                finish: true,
                streamId,
            });
        }
        cleanupState();
        return;
    }
    // Step 7: 构建上下文并路由到核心处理流程（带整体超时保护）
    const ctxPayload = buildMessageContext(frame, account, config, text, mediaList, quoteContent);`;

const directStreamArtifactUpgradeNeedle = `        try {
            const directResult = await withTimeout(runDirectStreamFrameWatchCompare(directStreamWatchRequest), MESSAGE_PROCESS_TIMEOUT_MS, \`Direct stream watch timed out (msgId=\${messageId})\`);
            await sendWeComReply({
                wsClient,
                frame,
                text: formatDirectStreamFrameWatchReply(directResult),
                runtime,
                finish: true,
                streamId,
            });
        }`;

const directStreamArtifactUpgradeInsert = `        try {
            const directResult = await withTimeout(runDirectStreamFrameWatchCompare(directStreamWatchRequest), MESSAGE_PROCESS_TIMEOUT_MS, \`Direct stream watch timed out (msgId=\${messageId})\`);
            await sendWeComReply({
                wsClient,
                frame,
                text: formatDirectStreamFrameWatchReply(directResult),
                runtime,
                finish: true,
                streamId,
            });
            const directArtifactReply = await sendDirectStreamFrameWatchArtifacts({
                wsClient,
                frame,
                account,
                runtime,
                result: directResult,
            });
            if (directArtifactReply.failures.length > 0) {
                await sendWeComReply({
                    wsClient,
                    frame,
                    text: \`结果图片回传失败：\${directArtifactReply.failures.join("；")}\`,
                    runtime,
                    finish: true,
                });
            }
        }`;

const wecomWatchdogCleanupNeedle = `        // 清理函数：确保所有资源被释放
        const cleanup = async () => {
            stopMessageStateCleanup();
            await cleanupAccount(account.accountId);
        };`;

const wecomWatchdogCleanupInsert = `        let lastInboundAt = Date.now();
        let wecomWatchdogTimer = null;
        let forcingWatchdogReconnect = false;
        let hasAuthenticated = false;
        const clearWecomWatchdog = () => {
            if (wecomWatchdogTimer) {
                clearInterval(wecomWatchdogTimer);
                wecomWatchdogTimer = null;
            }
        };
        const armWecomWatchdog = () => {
            if (wecomWatchdogTimer) {
                return;
            }
            wecomWatchdogTimer = setInterval(async () => {
                if (!hasAuthenticated || forcingWatchdogReconnect) {
                    return;
                }
                const idleMs = Date.now() - lastInboundAt;
                if (idleMs < 10 * 60 * 1000) {
                    return;
                }
                forcingWatchdogReconnect = true;
                runtime.error?.(\`[\${account.accountId}] Inbound watchdog triggered after \${idleMs}ms without inbound frames; forcing reconnect\`);
                try {
                    wsClient.disconnect();
                }
                catch (disconnectError) {
                    runtime.error?.(\`[\${account.accountId}] Watchdog disconnect failed: \${String(disconnectError)}\`);
                }
                setTimeout(() => {
                    try {
                        wsClient.connect();
                    }
                    catch (connectError) {
                        runtime.error?.(\`[\${account.accountId}] Watchdog reconnect failed: \${String(connectError)}\`);
                    }
                    finally {
                        lastInboundAt = Date.now();
                        forcingWatchdogReconnect = false;
                    }
                }, 1000);
            }, 60 * 1000);
            if (wecomWatchdogTimer && typeof wecomWatchdogTimer === "object" && "unref" in wecomWatchdogTimer) {
                wecomWatchdogTimer.unref();
            }
        };
        // 清理函数：确保所有资源被释放
        const cleanup = async () => {
            clearWecomWatchdog();
            stopMessageStateCleanup();
            await cleanupAccount(account.accountId);
        };`;

const wecomWatchdogConnectedNeedle = `        // 监听连接事件
        wsClient.on("connected", () => {
            runtime.log?.(\`[\${account.accountId}] WebSocket connected\`);
        });`;

const wecomWatchdogConnectedInsert = `        // 监听连接事件
        wsClient.on("connected", () => {
            lastInboundAt = Date.now();
            runtime.log?.(\`[\${account.accountId}] WebSocket connected\`);
        });`;

const wecomWatchdogAuthenticatedNeedle = `        // 监听认证成功事件
        wsClient.on("authenticated", () => {
            runtime.log?.(\`[\${account.accountId}] Authentication successful\`);
            setWeComWebSocket(account.accountId, wsClient);
            // 认证成功后自动拉取 MCP 配置（异步，失败不影响主流程）
            fetchAndSaveMcpConfig(wsClient, account.accountId, runtime);
        });`;

const wecomWatchdogAuthenticatedInsert = `        // 监听认证成功事件
        wsClient.on("authenticated", () => {
            hasAuthenticated = true;
            lastInboundAt = Date.now();
            runtime.log?.(\`[\${account.accountId}] Authentication successful\`);
            setWeComWebSocket(account.accountId, wsClient);
            armWecomWatchdog();
            // 认证成功后自动拉取 MCP 配置（异步，失败不影响主流程）
            fetchAndSaveMcpConfig(wsClient, account.accountId, runtime);
        });`;

const wecomWatchdogDisconnectedNeedle = `        // 监听断开事件
        wsClient.on("disconnected", (reason) => {
            runtime.log?.(\`[\${account.accountId}] WebSocket disconnected: \${reason}\`);
        });`;

const wecomWatchdogDisconnectedInsert = `        // 监听断开事件
        wsClient.on("disconnected", (reason) => {
            hasAuthenticated = false;
            runtime.log?.(\`[\${account.accountId}] WebSocket disconnected: \${reason}\`);
        });`;

const wecomWatchdogReconnectingNeedle = `        // 监听重连事件
        wsClient.on("reconnecting", (attempt) => {
            runtime.log?.(\`[\${account.accountId}] Reconnecting attempt \${attempt}...\`);
        });`;

const wecomWatchdogReconnectingInsert = `        // 监听重连事件
        wsClient.on("reconnecting", (attempt) => {
            hasAuthenticated = false;
            runtime.log?.(\`[\${account.accountId}] Reconnecting attempt \${attempt}...\`);
        });`;

const wecomWatchdogMessageNeedle = `        // 监听所有消息
        wsClient.on("message", async (frame) => {
            try {
                await processWeComMessage({
                    frame,
                    account,
                    config,
                    runtime,
                    wsClient,
                });
            }
            catch (err) {
                runtime.error?.(\`[\${account.accountId}] Failed to process message: \${String(err)}\`);
            }
        });`;

const wecomWatchdogMessageInsert = `        // 监听所有消息
        wsClient.on("message", async (frame) => {
            lastInboundAt = Date.now();
            const inboundCmd = frame?.cmd || frame?.command || "unknown";
            const inboundMsgId = frame?.body?.msgid || "N/A";
            runtime.log?.(\`[\${account.accountId}] Inbound frame received: cmd=\${inboundCmd}, msgid=\${inboundMsgId}\`);
            try {
                await processWeComMessage({
                    frame,
                    account,
                    config,
                    runtime,
                    wsClient,
                });
            }
            catch (err) {
                runtime.error?.(\`[\${account.accountId}] Failed to process message: \${String(err)}\`);
            }
        });`;

const wecomDocSkillContent = `---
name: wecom-doc
description: Use direct Enterprise WeChat document tools through wecom_doc_quick_report and wecom_doc_mcp_* and never ask to install mcporter.
always: true
---

# WeCom Doc

Use this skill when the user wants to create, inspect, or update Enterprise WeChat documents.

Important rules:
- Do not ask to install \`mcporter\`.
- Prefer the service-side \`wecom_doc_quick_report\` and \`wecom_doc_mcp_*\` tools first.
- Never suggest \`npm install -g mcporter\`, even if earlier chat context mentioned it.
- Call \`wecom_doc_quick_report\` first for common "整理成企业微信文档/表格" requests.
- Call \`wecom_doc_mcp_status\` only when you need to check which transport is available.
- Call \`wecom_doc_mcp_list_tools\` only for low-level or unfamiliar document operations.
- Call \`wecom_doc_mcp_call\` with the exact tool name and JSON input when low-level control is required.

Preferred behavior:
1. In auto mode, direct server-side APIs are preferred over MCP.
2. For generic requests like "整理成企业微信文档", prefer \`wecom_doc_quick_report\`.
3. \`wecom_doc_quick_report\` creates a directly openable Enterprise WeChat smart sheet document and returns the open URL.
4. If the user needs low-level operations, use \`create_doc\`, \`smartsheet_get_sheet\`, \`smartsheet_get_fields\`, \`smartsheet_add_fields\`, \`smartsheet_update_fields\`, or \`smartsheet_add_records\`.

Examples:
- "把今天成都天气整理成企业微信文档，我能直接打开查看"
  - Prefer \`wecom_doc_quick_report\`
- "给这个智能表新增字段"
  - Prefer low-level smart sheet tools after listing tools

Never expose the endpoint URL or any secret in replies.
`;

async function patchFile(filePath) {
  let source = await readFile(filePath, "utf8");
  const originalSource = source;
  source = dedupeNamedFunction(source, "function shouldUseWecomDocFastAck(text) {");
  source = dedupeNamedFunction(source, "function getWecomDocFastAckText(text) {");
  const hadDuplicateDocFastAckHelpers =
    originalSource.indexOf("function shouldUseWecomDocFastAck(text) {") !== originalSource.lastIndexOf("function shouldUseWecomDocFastAck(text) {")
    || originalSource.indexOf("function getWecomDocFastAckText(text) {") !== originalSource.lastIndexOf("function getWecomDocFastAckText(text) {");
  const hasDirectArtifactFlow = source.includes("const directArtifactReply = await sendDirectStreamFrameWatchArtifacts({");
  const hasDirectArtifactHelper = source.includes("collectDirectStreamFrameWatchArtifacts");
  const hasInspectionPlanShortcut = source.includes("执行巡检计划");
  const hasBareStorePlanShortcut = source.includes("const hasStoreLikeText = /门店|分店|店铺|成都小智零食有鸣/u.test(sourceText);");
  const hasInspectionPlanRule = source.includes("企业微信巡检计划");
  const hasDescriptionArtifactPolicy = source.includes("if (diffPath && inspectionType !== \"description\") {");
  const hasWecomWatchdog = source.includes("Inbound watchdog triggered after");
  const hasWecomDocFastAck = source.includes("正在整理并写入企业微信文档，通常需要 3-8 秒。");
  const hasWecomDocQuickReportSkill = source.includes("wecom_doc_quick_report");
  const hasWecomReplyFallback = source.includes("replyStream failed, fallback to proactive send");
  if (
    source.includes(MARKER) &&
    hasDirectArtifactHelper &&
    hasDirectArtifactFlow &&
    hasInspectionPlanShortcut &&
    hasBareStorePlanShortcut &&
    hasInspectionPlanRule &&
    hasDescriptionArtifactPolicy &&
    hasWecomWatchdog &&
    hasWecomDocFastAck &&
    hasWecomDocQuickReportSkill &&
    hasWecomReplyFallback &&
    !hadDuplicateDocFastAckHelpers &&
    source.includes("const suppressInlineMedia = shouldSuppressInlineMediaForStreamFrameWatch(messageBody);") &&
    source.includes("const directStreamWatchRequest = directStreamWatchCommand ? parseDirectStreamFrameWatchRequest(text, mediaList) : null;")
  ) {
    return false;
  }

  let changed = false;
  if (source !== originalSource) {
    changed = true;
  }

  if (!hasWecomReplyFallback) {
    const replyPatch = replaceNamedFunction(source, sendWeComReplySignature, sendWeComReplyWithFallback);
    if (replyPatch.replaced) {
      source = replyPatch.source;
      changed = true;
    }
  }

  if (
    source.includes(helperNeedle) &&
    source.includes(bodyNeedle) &&
    source.includes(mediaPathsNeedle) &&
    source.includes(mediaContextNeedle)
  ) {
    source = source.replace(helperNeedle, helperInsert);
    source = source.replace(bodyNeedle, bodyInsert);
    source = source.replace(mediaPathsNeedle, mediaPathsInsert);
    source = source.replace(mediaContextNeedle, mediaContextInsert);
    changed = true;
  }

  if (source.includes(directStreamHelperLegacyNeedle) && !hasInspectionPlanShortcut) {
    source = source.replace(directStreamHelperLegacyNeedle, directStreamHelperNeedle);
    changed = true;
  }

  if (!source.includes("function shouldUseWecomDocFastAck(text) {") && source.includes(directStreamHelperNeedle)) {
    source = source.replace(directStreamHelperNeedle, directStreamHelperWithDocAck);
    changed = true;
  }

  if (source.includes(directStreamPlanLegacyNeedle) && !hasInspectionPlanRule) {
    source = source.replace(directStreamPlanLegacyNeedle, directStreamPlanInsert);
    changed = true;
  }

  if (source.includes(directStreamHelperInsertLegacy) && !hasDirectArtifactHelper) {
    source = source.replace(directStreamHelperInsertLegacy, directStreamHelperInsert);
    changed = true;
    source = source.replace(directStreamFlowInsertLegacy, directStreamFlowInsert);
  }

  if (!source.includes("runDirectStreamFrameWatchCompare")) {
    if (!source.includes(directStreamHelperNeedle) || !source.includes(directStreamFlowNeedle)) {
      console.warn(`wecom plugin patch skipped for ${filePath}: anchors not matched`);
      return changed;
    }
    source = source.replace(directStreamHelperNeedle, directStreamHelperInsert);
    source = source.replace(directStreamFlowNeedle, directStreamFlowInsert);
    changed = true;
  } else if (source.includes(directStreamFlowInsertLegacy) && !hasDirectArtifactFlow) {
    source = source.replace(directStreamFlowInsertLegacy, directStreamFlowInsert);
    changed = true;
  } else if (source.includes(directStreamArtifactUpgradeNeedle) && !hasDirectArtifactFlow) {
    source = source.replace(directStreamArtifactUpgradeNeedle, directStreamArtifactUpgradeInsert);
    changed = true;
  } else if (!source.includes('text: "已接收，正在抓取流画面并比对，通常需要 2-5 秒。"')) {
    if (!source.includes(directStreamFlowUpgradeNeedle)) {
      console.warn(`wecom plugin patch skipped for ${filePath}: direct stream upgrade anchor not matched`);
      return changed;
    }
    source = source.replace(directStreamFlowUpgradeNeedle, directStreamFlowInsert);
    changed = true;
  }

  if (!hasWecomDocFastAck && source.includes(directStreamFlowInsertLegacy)) {
    source = source.replace(directStreamFlowInsertLegacy, directStreamFlowInsert);
    changed = true;
  }

  if (
    !hasWecomWatchdog &&
    source.includes(wecomWatchdogCleanupNeedle) &&
    source.includes(wecomWatchdogConnectedNeedle) &&
    source.includes(wecomWatchdogAuthenticatedNeedle) &&
    source.includes(wecomWatchdogDisconnectedNeedle) &&
    source.includes(wecomWatchdogReconnectingNeedle) &&
    source.includes(wecomWatchdogMessageNeedle)
  ) {
    source = source.replace(wecomWatchdogCleanupNeedle, wecomWatchdogCleanupInsert);
    source = source.replace(wecomWatchdogConnectedNeedle, wecomWatchdogConnectedInsert);
    source = source.replace(wecomWatchdogAuthenticatedNeedle, wecomWatchdogAuthenticatedInsert);
    source = source.replace(wecomWatchdogDisconnectedNeedle, wecomWatchdogDisconnectedInsert);
    source = source.replace(wecomWatchdogReconnectingNeedle, wecomWatchdogReconnectingInsert);
    source = source.replace(wecomWatchdogMessageNeedle, wecomWatchdogMessageInsert);
    changed = true;
  }

  const normalizedSource = dedupeNamedFunction(
    dedupeNamedFunction(source, "function shouldUseWecomDocFastAck(text) {"),
    "function getWecomDocFastAckText(text) {",
  );
  if (normalizedSource !== source) {
    source = normalizedSource;
    changed = true;
  }

  if (!changed) {
    console.warn(`wecom plugin patch skipped for ${filePath}: anchors not matched`);
    return false;
  }

  await writeFile(filePath, source, "utf8");
  return true;
}

async function patchSkillFile(skillPath) {
  await mkdir(path.dirname(skillPath), { recursive: true });
  let existing = "";
  try {
    existing = await readFile(skillPath, "utf8");
  } catch {
    existing = "";
  }

  if (existing === wecomDocSkillContent) {
    return false;
  }

  await writeFile(skillPath, wecomDocSkillContent, "utf8");
  return true;
}

let changed = false;
for (const relativePath of DIST_FILES) {
  const fullPath = path.join(pluginDir, relativePath);
  const patched = await patchFile(fullPath);
  changed = changed || patched;
}

const skillPath = path.join(pluginDir, "skills/wecom-doc/SKILL.md");
const skillPatched = await patchSkillFile(skillPath);
changed = changed || skillPatched;

console.log(changed ? "wecom plugin patched" : "wecom plugin already patched");

#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const pluginDir = process.argv[2];

if (!pluginDir) {
  console.error("Usage: node patch-wecom-plugin.js <plugin-dir>");
  process.exit(1);
}

const DIST_FILES = ["dist/index.cjs.js", "dist/index.esm.js"];
const MARKER = "Uploaded media saved locally:";

const helperNeedle = 'const MEDIA_DOCUMENT_PLACEHOLDER = "<media:document>";';
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
    return normalized.includes("按图片基准检查这个流")
        || normalized.includes("按照图片基准检查这个流")
        || normalized.includes("按基准图检查这个流")
        || normalized.includes("按照基准图检查这个流")
        || normalized.includes("执行巡检计划")
        || normalized.includes("运行巡检计划")
        || normalized.includes("启动巡检计划");
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
    return normalized.includes("按图片基准检查这个流")
        || normalized.includes("按照图片基准检查这个流")
        || normalized.includes("按基准图检查这个流")
        || normalized.includes("按照基准图检查这个流")
        || normalized.includes("执行巡检计划")
        || normalized.includes("运行巡检计划")
        || normalized.includes("启动巡检计划");
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

const directStreamHelperInsertLegacy = `${directStreamHelperNeedle}
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

const directStreamHelperInsert = `${directStreamHelperNeedle}
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
    if (framePath) {
        artifacts.push({ label: "抽帧图", mediaUrl: framePath });
    }
    if (diffPath) {
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

async function patchFile(filePath) {
  let source = await readFile(filePath, "utf8");
  const hasDirectArtifactFlow = source.includes("const directArtifactReply = await sendDirectStreamFrameWatchArtifacts({");
  const hasDirectArtifactHelper = source.includes("collectDirectStreamFrameWatchArtifacts");
  const hasInspectionPlanShortcut = source.includes("执行巡检计划");
  const hasInspectionPlanRule = source.includes("企业微信巡检计划");
  if (
    source.includes(MARKER) &&
    hasDirectArtifactHelper &&
    hasDirectArtifactFlow &&
    hasInspectionPlanShortcut &&
    hasInspectionPlanRule &&
    source.includes("const suppressInlineMedia = shouldSuppressInlineMediaForStreamFrameWatch(messageBody);") &&
    source.includes("const directStreamWatchRequest = directStreamWatchCommand ? parseDirectStreamFrameWatchRequest(text, mediaList) : null;")
  ) {
    return false;
  }

  let changed = false;

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

  if (!changed) {
    console.warn(`wecom plugin patch skipped for ${filePath}: anchors not matched`);
    return false;
  }

  await writeFile(filePath, source, "utf8");
  return true;
}

let changed = false;
for (const relativePath of DIST_FILES) {
  const fullPath = path.join(pluginDir, relativePath);
  const patched = await patchFile(fullPath);
  changed = changed || patched;
}

console.log(changed ? "wecom plugin patched" : "wecom plugin already patched");

#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const pluginDir = process.argv[2];

if (!pluginDir) {
  console.error("Usage: node upgrade-wecom-inspection-scene2.js <plugin-dir>");
  process.exit(1);
}

const DIST_FILES = ["dist/index.cjs.js", "dist/index.esm.js"];

function replaceSection(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) {
    throw new Error(`start marker not found for ${label}`);
  }
  const end = source.indexOf(endMarker, start);
  if (end < 0) {
    throw new Error(`end marker not found for ${label}`);
  }
  return `${source.slice(0, start)}${replacement}\n${source.slice(end)}`;
}

function collapseDuplicateHelpers(source) {
  const helper = `function stripDescriptionControlPhrases(text) {
    return String(text || "")
        .replace(/[；;，,\\s]*(?:匹配度|相似度|差异(?:度)?|阈值)[^；;，,\\n]{0,32}?\\d+(?:\\.\\d+)?\\s*%[^；;，,\\n]{0,16}?(?:报警|告警|预警|提醒|通过|不通过|触发)?/gu, "")
        .replace(/[；;，,\\s]*(?:第一帧|首帧|随机帧|随机抽帧|随机抽取|抽帧方式|取样方式|采样方式)[^；;，,\\n]*/gu, "")
        .replace(/[；;，,\\s]+$/u, "")
        .trim();
}`;
  const duplicated = `${helper}\n${helper}`;
  while (source.includes(duplicated)) {
    source = source.replace(duplicated, helper);
  }
  return source;
}

const parseBlock = `function stripDescriptionControlPhrases(text) {
    return String(text || "")
        .replace(/[；;，,\\s]*(?:匹配度|相似度|差异(?:度)?|阈值)[^；;，,\\n]{0,32}?\\d+(?:\\.\\d+)?\\s*%[^；;，,\\n]{0,16}?(?:报警|告警|预警|提醒|通过|不通过|触发)?/gu, "")
        .replace(/[；;，,\\s]*(?:第一帧|首帧|随机帧|随机抽帧|随机抽取|抽帧方式|取样方式|采样方式)[^；;，,\\n]*/gu, "")
        .replace(/[；;，,\\s]+$/u, "")
        .trim();
}
function extractDescriptionInspectionText(sourceText) {
    const patterns = [
        /(?:点检项|巡检项|检查项)\\s*[:：]\\s*([\\s\\S]+)/u,
        /(?:描述|要求)\\s*[:：]\\s*([\\s\\S]+)/u,
    ];
    for (const pattern of patterns) {
        const match = sourceText.match(pattern);
        if (!match) {
            continue;
        }
        const raw = String(match[1] || "").trim();
        if (!raw) {
            continue;
        }
        const lines = raw
            .split(/\\r?\\n/u)
            .map((line) => line.trim())
            .filter(Boolean);
        const kept = [];
        for (const line of lines) {
            if (/^(?:匹配度|相似度|差异(?:度)?|阈值|抽帧方式|取样方式|采样方式|流地址|链接|url)(?:\\s*[:：]|.*\\d+(?:\\.\\d+)?\\s*%.*(?:报警|告警|预警|提醒|触发))/iu.test(line)) {
                break;
            }
            if (/^https?:\\/\\//i.test(line)) {
                break;
            }
            const cleanedLine = stripDescriptionControlPhrases(line);
            if (cleanedLine) {
                kept.push(cleanedLine);
            }
        }
        const text = kept.join("；").replace(/[；;，,。\\s]+$/u, "").trim();
        if (text) {
            return text;
        }
    }
    return "";
}
function stripSceneLookupNoise(text) {
    return String(text || "")
        .replace(/https?:\\/\\/\\S+/gi, " ")
        .replace(/(?:点检项|巡检项|检查项|描述|要求)\\s*[:：][\\s\\S]*/u, " ")
        .replace(/[；;，,\\s]*(?:匹配度|相似度|差异(?:度)?|阈值)[^；;，,\\n]{0,32}?\\d+(?:\\.\\d+)?\\s*%[^；;，,\\n]{0,16}?(?:报警|告警|预警|提醒|通过|不通过|触发)?/gu, " ")
        .replace(/[；;，,\\s]*(?:第一帧|首帧|随机帧|随机抽帧|随机抽取|抽帧方式|取样方式|采样方式)[^；;，,\\n]*/gu, " ")
        .replace(/(?:执行|运行|启动)巡检计划/gu, " ")
        .replace(/[@＠]\\S+/gu, " ")
        .replace(/[()（）\\[\\]【】]/gu, " ")
        .replace(/\\s+/gu, " ")
        .trim();
}
function parseDescriptionMatchThresholdPercent(sourceText) {
    const patterns = [
        /匹配度[^0-9]{0,12}(\\d+(?:\\.\\d+)?)\\s*%/u,
        /阈值[^0-9]{0,12}(\\d+(?:\\.\\d+)?)\\s*%/u,
    ];
    for (const pattern of patterns) {
        const match = sourceText.match(pattern);
        if (!match) {
            continue;
        }
        const value = parsePercentNumber(match[1]);
        if (value !== undefined) {
            return value;
        }
    }
    return 80;
}
function parseDirectStreamFrameWatchRequest(text, mediaList) {
    const sourceText = String(text || "");
    if (!shouldSuppressInlineMediaForStreamFrameWatch(sourceText)) {
        return null;
    }
    const sourceMatch = sourceText.match(/https?:\\/\\/\\S+/i);
    const source = sourceMatch ? sourceMatch[0].replace(/[),，。；;]+$/u, "") : "";
    const baselineImage = extractFirstInboundImagePath(mediaList);
    const descriptionText = extractDescriptionInspectionText(sourceText);
    const similarityMatch = sourceText.match(/相似度[^0-9]{0,8}(\\d+(?:\\.\\d+)?)\\s*%/u);
    const differenceMatch = sourceText.match(/(?:差异(?:度)?|阈值|差异阈值)[^0-9]{0,8}(\\d+(?:\\.\\d+)?)\\s*%/u);
    const similarityPercent = similarityMatch ? parsePercentNumber(similarityMatch[1]) : undefined;
    const differencePercent = differenceMatch ? parsePercentNumber(differenceMatch[1]) : undefined;
    const isInspectionPlanShortcut = /(?:执行|运行|启动)巡检计划/u.test(sourceText);
    const explicitRandomFrame = /随机帧|随机抽帧|随机抽取/u.test(sourceText);
    const explicitFirstFrame = /第一帧|首帧/u.test(sourceText);
    const sceneLookupText = stripSceneLookupNoise(sourceText);
    if (baselineImage) {
        const compareThreshold = similarityPercent !== undefined
            ? Number((1 - similarityPercent / 100).toFixed(4))
            : differencePercent !== undefined
                ? Number((differencePercent / 100).toFixed(4))
                : 0.12;
        const framePickMode = explicitRandomFrame
            ? "random"
            : explicitFirstFrame || isInspectionPlanShortcut
                ? "first"
                : "random";
        const thresholdSimilarityText = Number((100 - compareThreshold * 100).toFixed(2));
        return {
            inspectionType: "baseline",
            source,
            sceneLookupText,
            baselineImage,
            compareThreshold,
            framePickMode,
            ruleName: isInspectionPlanShortcut ? "企业微信巡检计划" : "企微基准图检查",
            expectedDescription: "基准图一致画面",
            violationMessage: \`相似度低于\${thresholdSimilarityText}%\`,
        };
    }
    if (descriptionText) {
        return {
            inspectionType: "description",
            source,
            sceneLookupText,
            descriptionText,
            matchThresholdPercent: parseDescriptionMatchThresholdPercent(sourceText),
            framePickMode: explicitFirstFrame ? "first" : "random",
            ruleName: isInspectionPlanShortcut ? "企业微信文字巡检计划" : "企微文字点检",
        };
    }
    if (!isInspectionPlanShortcut || (!sceneLookupText && !source)) {
        return null;
    }
    return {
        inspectionType: "scene",
        source,
        sceneLookupText,
        framePickMode: explicitRandomFrame ? "random" : "first",
        ruleName: "企业微信巡检计划",
    };
}`;

const runBlock = `async function runDirectStreamFrameWatchCompare(request) {
    const childProcess = await import("node:child_process");
    const execJson = (args, errorPrefix) => new Promise((resolve, reject) => {
        childProcess.execFile("node", args, {
            env: process.env,
            maxBuffer: 1024 * 1024 * 16,
        }, (error, stdout, stderr) => {
            if (error) {
                const detail = String(stderr || stdout || error.message || "unknown error").trim();
                reject(new Error(\`\${errorPrefix}: \${detail}\`));
                return;
            }
            try {
                resolve(JSON.parse(String(stdout || "{}").trim() || "{}"));
            }
            catch (parseError) {
                reject(new Error(\`\${errorPrefix}: invalid JSON - \${String(parseError)}\`));
            }
        });
    });
    let resolvedScene = null;
    if (request.sceneLookupText) {
        resolvedScene = await execJson([
            "/opt/openclaw/services/stream-frame-watch/index.mjs",
            "resolve-scene",
            "--config",
            "/opt/openclaw/config/stream-frame-watch.json",
            "--query",
            request.sceneLookupText,
        ], "scene resolve failed");
    }
    const args = [
        "/opt/openclaw/services/stream-frame-watch/index.mjs",
        "analyze",
        "--config",
        "/opt/openclaw/config/stream-frame-watch.json",
        "--frame-pick-mode",
        request.framePickMode,
        "--rule-name",
        request.ruleName,
        "--write-report",
    ];
    if (resolvedScene?.sceneId) {
        args.push("--scene", resolvedScene.sceneId);
    }
    else if (request.source) {
        args.push("--source", request.source);
    }
    else {
        throw new Error("没有找到可用的流地址或门店映射");
    }
    if (request.inspectionType === "description") {
        args.push("--description-text", request.descriptionText);
        args.push("--match-threshold-percent", String(request.matchThresholdPercent));
    }
    else if (request.inspectionType === "baseline") {
        args.push("--baseline", request.baselineImage);
        args.push("--threshold", String(request.compareThreshold));
        args.push("--expected-description", request.expectedDescription);
        args.push("--violation-message", request.violationMessage);
    }
    const result = await execJson(args, "direct stream watch failed");
    if (resolvedScene?.storeName && !result.storeName) {
        result.storeName = resolvedScene.storeName;
    }
    return result;
}`;

const formatBlock = `function formatDirectStreamFrameWatchReply(result) {
    const framePickMode = result?.framePickMode === "first" ? "第一帧" : "随机帧";
    const sampledAtSeconds = Number.isFinite(result?.sampledAtSeconds)
        ? Number(result.sampledAtSeconds).toFixed(3)
        : "0.000";
    const storeName = typeof result?.storeName === "string" && result.storeName.trim()
        ? result.storeName.trim()
        : "";
    const reasons = Array.isArray(result?.reasons) && result.reasons.length > 0
        ? result.reasons.join("；")
        : result?.verdict === "violation"
            ? "当前巡检未通过"
            : "当前巡检通过";
    const reportText = result?.report?.docName
        ? \`日报文档: \${result.report.docName}\${result.report.docUrl ? \`（\${result.report.docUrl}）\` : ""}\`
        : "";
    if (result?.inspectionType === "description") {
        const verdict = result?.verdict === "violation" ? "发现异常" : "符合点检项";
        const matchPercent = Number.isFinite(result?.matchPercent)
            ? Number(result.matchPercent).toFixed(2)
            : "0.00";
        const threshold = Number.isFinite(result?.thresholdMatchPercent)
            ? Number(result.thresholdMatchPercent).toFixed(2)
            : "80.00";
        const observedSummary = typeof result?.observedSummary === "string" ? result.observedSummary.trim() : "";
        const clauseResults = Array.isArray(result?.clauseResults) ? result.clauseResults : [];
        const passedClauses = clauseResults.filter((item) => item?.matched);
        const failedClauses = clauseResults.filter((item) => !item?.matched);
        const totalClauses = clauseResults.length || 0;
        const fallbackText = result?.fallbackUsed
            ? "已启用" + (result?.fallbackReason ? \`（\${String(result.fallbackReason).trim()}）\` : "")
            : "未启用";
        const pluginRecommendation = result?.pluginRecommendation === "consider_detector_plugin"
            ? "建议补充检测插件做深度复核"
            : "普通视觉已足够，本次未启用额外插件";
        const pluginRecommendationReason = typeof result?.pluginRecommendationReason === "string"
            ? result.pluginRecommendationReason.trim()
            : "";
        return [
            "文字巡检已完成",
            storeName ? \`门店: \${storeName}\` : "",
            \`结果: \${verdict}\`,
            totalClauses > 0 ? \`命中条款: \${passedClauses.length}/\${totalClauses} 条符合\` : "",
            \`匹配度: \${matchPercent}%\`,
            \`报警规则: 匹配度 < \${threshold}%\`,
            \`抽帧: \${framePickMode} · \${sampledAtSeconds}s\`,
            observedSummary ? \`画面概况: \${observedSummary}\` : "",
            \`兜底复核: \${fallbackText}\`,
            failedClauses.length > 0
                ? \`未通过项: \${failedClauses
                    .slice(0, 3)
                    .map((item) => \`\${item.clause}（\${item.evidence || "未返回依据"}）\`)
                    .join("；")}\`
                : "未通过项: 无",
            passedClauses.length > 0
                ? \`通过项: \${passedClauses
                    .slice(0, 3)
                    .map((item) => item.clause)
                    .join("；")}\`
                : "",
            \`插件建议: \${pluginRecommendation}\${pluginRecommendationReason ? \`（\${pluginRecommendationReason}）\` : ""}\`,
            reportText,
            \`说明: \${reasons}\`,
        ].filter(Boolean).join("\\n");
    }
    const verdict = result?.verdict === "violation" ? "违规" : "正常";
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
        storeName ? \`门店: \${storeName}\` : "",
        \`结论: \${verdict}\`,
        \`差异度: \${differencePercent}%\`,
        \`相似度: \${similarityPercent}%\`,
        \`报警阈值: 差异度 >= \${thresholdDifferencePercent}% / 相似度 <= \${thresholdSimilarityPercent}%\`,
        \`抽帧方式: \${framePickMode}\`,
        \`抽帧时间: \${sampledAtSeconds}s\`,
        reportText,
        \`原因: \${reasons}\`,
    ].filter(Boolean).join("\\n");
}`;

const flowBlock = `    const directStreamWatchCommand = shouldSuppressInlineMediaForStreamFrameWatch(text);
    const directStreamWatchRequest = directStreamWatchCommand ? parseDirectStreamFrameWatchRequest(text, mediaList) : null;
    const shouldSendThinking = account.sendThinkingMessage ?? true;
    if (directStreamWatchCommand) {
        await sendWeComReply({
            wsClient,
            frame,
            text: directStreamWatchRequest?.inspectionType === "description"
                ? "已接收，正在按门店场景抓取流画面并做文字点检，通常需要 3-8 秒。"
                : directStreamWatchRequest?.sceneLookupText && !directStreamWatchRequest?.source
                    ? "已接收，正在按门店场景抓取流画面巡检，通常需要 2-6 秒。"
                    : "已接收，正在抓取流画面并比对，通常需要 2-5 秒。",
            runtime,
            finish: false,
            streamId,
        });
    }
    else if (shouldSendThinking) {
        await sendThinkingReply({ wsClient, frame, streamId, runtime });
    }
    if (directStreamWatchCommand && !directStreamWatchRequest) {
        await sendWeComReply({
            wsClient,
            frame,
            text: "已接收，但没有找到可用的巡检参数。计划一请附图片，计划二请写“点检项: ...”，也可以直接说“xxx门店 执行巡检计划”。",
            runtime,
            finish: true,
            streamId,
        });
        cleanupState();
        return;
    }
    if (directStreamWatchRequest) {
        runtime.log?.(\`[wecom][plugin] direct stream watch request: \${JSON.stringify({
            inspectionType: directStreamWatchRequest.inspectionType,
            source: directStreamWatchRequest.source,
            sceneLookupText: directStreamWatchRequest.sceneLookupText,
            baselineImage: directStreamWatchRequest.baselineImage,
            descriptionText: directStreamWatchRequest.descriptionText,
            compareThreshold: directStreamWatchRequest.compareThreshold,
            matchThresholdPercent: directStreamWatchRequest.matchThresholdPercent,
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
                text: \`\${directStreamWatchRequest.inspectionType === "description" ? "文字点检失败" : "巡检执行失败"}：\${String(err)}\`,
                runtime,
                finish: true,
                streamId,
            });
        }
        cleanupState();
        return;
    }`;

let changed = false;

for (const relativePath of DIST_FILES) {
  const filePath = path.join(pluginDir, relativePath);
  let source = await readFile(filePath, "utf8");
  const before = source;

  source = replaceSection(
    source,
    source.includes("function stripDescriptionControlPhrases(text) {")
      ? "function stripDescriptionControlPhrases(text) {"
      : "function extractDescriptionInspectionText(sourceText) {",
    "async function runDirectStreamFrameWatchCompare(request) {",
    parseBlock,
    `${relativePath}:parse`,
  );
  source = replaceSection(
    source,
    "async function runDirectStreamFrameWatchCompare(request) {",
    "function formatDirectStreamFrameWatchReply(result) {",
    runBlock,
    `${relativePath}:run`,
  );
  source = replaceSection(
    source,
    "function formatDirectStreamFrameWatchReply(result) {",
    "async function sendDirectStreamFrameWatchArtifacts(params) {",
    formatBlock,
    `${relativePath}:format`,
  );
  source = replaceSection(
    source,
    "    const directStreamWatchCommand = shouldSuppressInlineMediaForStreamFrameWatch(text);",
    "    // Step 7: 构建上下文并路由到核心处理流程（带整体超时保护）",
    flowBlock,
    `${relativePath}:flow`,
  );

  if (source !== before) {
    source = collapseDuplicateHelpers(source);
    await writeFile(filePath, source, "utf8");
    changed = true;
  }
}

console.log(changed ? "wecom inspection scene2 upgraded" : "wecom inspection scene2 already upgraded");

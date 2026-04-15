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
        .replace(/^[\\s,，:：;；]*[@＠]?\\S*?[\\s,，:：;；]*(?:执行|运行|启动)巡检计划[\\s,，:：;；-]*/u, " ")
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
function normalizeStorePlanText(text) {
    return String(text || "")
        .replace(/[@＠]\\S+/gu, " ")
        .replace(/^[\\s,，:：;；-]*(?:执行|运行|启动)巡检计划[\\s,，:：;；-]*/u, " ")
        .replace(/(?:执行|运行|启动)\\s*(?=(?:门店基准图巡检|营业画面点检|随机巡场点检|[^\\s]{2,}计划))/gu, " ")
        .replace(/(?:执行|运行|启动)\\s*巡检计划/gu, " ")
        .replace(/[()（）\\[\\]【】]/gu, " ")
        .replace(/\\s+/gu, " ")
        .trim();
}
function extractStorePlanShortcut(sourceText) {
    const cleaned = normalizeStorePlanText(sourceText);
    if (!cleaned) {
        return null;
    }
    const repeatedTextMatch = cleaned.match(/^(.{2,}?)\\s+\\1$/u);
    if (repeatedTextMatch) {
        const repeatedText = String(repeatedTextMatch[1] || "").trim();
        if (repeatedText) {
            return {
                storeName: repeatedText,
                planName: repeatedText,
            };
        }
    }
    const tokens = cleaned.split(/\s+/u).filter(Boolean);
    if (tokens.length === 2 && tokens[0] === tokens[1]) {
        return {
            storeName: tokens[0],
            planName: tokens[1],
        };
    }
    const knownPlanNames = [
        "门店基准图巡检",
        "营业画面点检",
        "随机巡场点检",
    ];
    for (const planName of knownPlanNames) {
        if (!cleaned.includes(planName)) {
            continue;
        }
        const storeName = cleaned.replace(planName, "").trim();
        if (storeName) {
            return {
                storeName,
                planName,
            };
        }
    }
    const genericPlanMatch = cleaned.match(/(.+?)\\s+([^\\s]{2,}计划)$/u);
    if (genericPlanMatch) {
        const storeName = String(genericPlanMatch[1] || "").trim();
        const planName = String(genericPlanMatch[2] || "").trim();
        if (storeName && planName) {
            return {
                storeName,
                planName,
            };
        }
    }
    if (tokens.length >= 2 && !/https?:\\/\\//i.test(cleaned)) {
        const storeName = String(tokens[0] || "").trim();
        const planName = String(tokens.slice(1).join(" ") || "").trim();
        if (storeName && planName) {
            return {
                storeName,
                planName,
            };
        }
    }
    if (/^[^\\s]{2,}计划$/u.test(cleaned)) {
        const planName = cleaned;
        const inferredStoreName = planName
            .replace(/[-－—_]?[^-－—_\\s]*计划$/u, "")
            .trim();
        if (inferredStoreName && inferredStoreName !== planName) {
            return {
                storeName: inferredStoreName,
                planName,
            };
        }
    }
    if (tokens.length === 1 && !/https?:\\/\\//i.test(cleaned)) {
        return {
            storeName: tokens[0],
            planName: tokens[0],
        };
    }
    return null;
}
function isBatchOwnerInspectionRequest(text) {
    const sourceText = normalizeStorePlanText(text);
    if (!/(?:执行|运行|启动)巡检计划/u.test(sourceText)) {
        return false;
    }
    return /我名下门店|我的门店|名下门店|负责门店|负责的门店|批量|抽查|全量|全部门店|所有门店/u.test(sourceText);
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
    const isInspectionPlanShortcut = /^[\\s,，:：;；]*[@＠]?\\S*?[\\s,，:：;；]*(?:执行|运行|启动)巡检计划/iu.test(sourceText);
    const isBatchOwnerIntent = isBatchOwnerInspectionRequest(sourceText);
    if (isBatchOwnerIntent) {
        return null;
    }
    const shouldUseStorePlanShortcut = isInspectionPlanShortcut;
    const storePlanShortcut = shouldUseStorePlanShortcut ? extractStorePlanShortcut(sourceText) : null;
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
            : explicitFirstFrame || shouldUseStorePlanShortcut
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
            ruleName: shouldUseStorePlanShortcut ? "企业微信巡检计划" : "企微基准图检查",
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
            ruleName: shouldUseStorePlanShortcut ? "企业微信文字巡检计划" : "企微文字点检",
        };
    }
    if (storePlanShortcut?.storeName && storePlanShortcut?.planName) {
        return {
            inspectionType: "db_plan",
            source,
            sceneLookupText,
            storeName: storePlanShortcut.storeName,
            planName: storePlanShortcut.planName,
            framePickMode: explicitRandomFrame ? "random" : "first",
            ruleName: "企业微信巡检计划",
        };
    }
    if (!shouldUseStorePlanShortcut || (!sceneLookupText && !source)) {
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
    if (!resolvedScene?.sceneId && request.source) {
        try {
            resolvedScene = await execJson([
                "/opt/openclaw/services/stream-frame-watch/index.mjs",
                "resolve-scene",
                "--config",
                "/opt/openclaw/config/stream-frame-watch.json",
                "--query",
                request.source,
            ], "source resolve failed");
            if (resolvedScene?.matchedByType === "default" || resolvedScene?.matchedByType === "single") {
                resolvedScene = null;
            }
        }
        catch (_error) {
        }
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
    if (request.storeName || request.planName) {
        if (request.storeName) {
            args.push("--store-name", request.storeName);
        }
        if (request.planName) {
            args.push("--plan-name", request.planName);
        }
    }
    else if (resolvedScene?.sceneId) {
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
}
function normalizeInspectionApiBaseUrl(rawUrl) {
    const value = String(rawUrl || process.env.INSPECTION_API_BASE_URL || "http://inspection-api:8080/api").trim().replace(/\/+$/u, "");
    if (!value) {
        return "http://inspection-api:8080/api";
    }
    return /\/api$/u.test(value) ? value : value + "/api";
}
async function postInspectionApiJson(url, payload) {
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload || {}),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
        const message = String(body?.message || body?.error || "").trim() || \`\${response.status} \${response.statusText}\`.trim();
        throw new Error(message || "inspection api request failed");
    }
    if (body && typeof body === "object" && Number(body.code || 0) !== 0) {
        throw new Error(String(body.message || "inspection api returned non-zero code").trim());
    }
    return body?.data || body || {};
}
function buildBatchExecutionApiPayload(messageContext) {
    const payload = messageContext?.WeComBatchExecutionPayload || null;
    if (!payload) {
        return null;
    }
    return {
        planName: String(payload.planNameHint || "").trim(),
        ownerName: String(payload.ownerName || payload.ownerLookupName || "").trim(),
        ownerWecomUserId: String(payload.ownerWecomUserId || "").trim(),
        ownerSource: String(payload.ownerSource || "").trim() || "sender",
        managerName: String(payload.ownerName || payload.ownerLookupName || "").trim(),
        managerWecomUserId: String(payload.ownerWecomUserId || "").trim(),
        operatorName: "企业微信批量巡检",
        operatorWecomUserId: String(payload.operatorWecomUserId || messageContext?.FromUserId || "").trim(),
        triggerSource: String(payload.triggerSource || "wecom_batch_owner").trim(),
        executionMode: String(payload.executionMode || "all").trim() || "all",
    };
}
function formatBatchExecutionModeLabel(mode) {
    return mode === "sample" ? "抽查" : "全量";
}
function formatBatchExecutionSuccessReply(result) {
    const batch = result?.batch || {};
    const summary = result?.summary || {};
    const planName = String(batch.planName || summary.planName || "").trim() || "未命名计划";
    const ownerName = String(batch.ownerName || summary.ownerName || "").trim();
    const ownerWecomUserId = String(batch.ownerWecomUserId || summary.ownerWecomUserId || "").trim();
    const ownerDisplay = ownerName || (ownerWecomUserId ? \`负责人ID:\${ownerWecomUserId}\` : "当前发起人");
    const selectedStoreCount = Number(summary.selectedStoreCount || batch.selectedStoreCount || 0);
    const matchedStoreCount = Number(summary.storeCount || batch.matchedStoreCount || 0);
    const skippedStoreCount = Number(summary.skippedStoreCount || 0);
    const jobCount = Number(summary.jobCount || batch.totalJobs || 0);
    const monitorCount = Number(summary.monitorCount || 0);
    const planItemCount = Number(summary.planItemCount || 0);
    const estimatedLabel = String(summary.estimatedLabel || "").trim();
    const batchNo = String(batch.batchNo || "").trim();
    const modeLabel = formatBatchExecutionModeLabel(String(batch.executionMode || summary.executionMode || "all").trim());
    return [
        "批量巡检已创建",
        \`负责人: \${ownerDisplay}\`,
        \`巡检计划: \${planName}\`,
        \`执行方式: \${modeLabel}\`,
        \`门店范围: 选中 \${selectedStoreCount} 家，命中 \${matchedStoreCount} 家\`,
        skippedStoreCount > 0 ? \`自动跳过: \${skippedStoreCount} 家（未绑定该计划）\` : "",
        monitorCount > 0 ? \`监控点位: \${monitorCount} 个\` : "",
        planItemCount > 0 ? \`点检项总数: \${planItemCount} 项\` : "",
        jobCount > 0 ? \`待执行任务: \${jobCount} 条\` : "",
        estimatedLabel ? \`预计耗时: \${estimatedLabel}\` : "",
        batchNo ? \`批次号: \${batchNo}\` : "",
        "已进入后台批量任务中心，可继续查看进度和失败重试。",
    ].filter(Boolean).join("\\n");
}
function formatBatchExecutionFailureMessage(error) {
    const detail = String(error?.message || error || "").trim();
    if (!detail) {
        return "批量巡检创建失败，请稍后重试。";
    }
    if (/未命中巡检计划|未完全命中巡检计划|当前可用计划/u.test(detail)) {
        return detail;
    }
    if (/当前条件下没有可巡检门店|当前条件下没有可执行的批量巡检任务|没有可巡检门店/u.test(detail)) {
        return detail;
    }
    if (/manager|owner|负责人/u.test(detail)) {
        return \`负责人匹配失败：\${detail}\`;
    }
    return \`批量巡检创建失败：\${detail}\`;
}
async function createBatchInspectionFromWeCom(messageContext) {
    const payload = buildBatchExecutionApiPayload(messageContext);
    if (!payload?.planName) {
        throw new Error("没有识别到巡检计划，请使用“执行巡检计划 + 我名下门店 + 巡检计划名”重试。");
    }
    if (!payload.ownerWecomUserId && !payload.ownerName && !payload.managerWecomUserId && !payload.managerName) {
        throw new Error("没有识别到负责人，请重新 @负责人，或使用“我名下门店”发起。");
    }
    const apiBaseUrl = normalizeInspectionApiBaseUrl(process.env.INSPECTION_API_BASE_URL);
    const estimate = await postInspectionApiJson(apiBaseUrl + "/batch-executions/estimate", payload);
    const created = await postInspectionApiJson(apiBaseUrl + "/batch-executions", payload);
    return {
        batch: created?.batch || {},
        jobs: Array.isArray(created?.jobs) ? created.jobs : [],
        summary: created?.summary || estimate || {},
    };
}`;

const formatBlock = `function formatDirectStreamWatchFailureMessage(request, err) {
    const detail = String(err || "").trim();
    const normalizedDetail = detail
        .replace(/^Error:\s*/u, "")
        .replace(/^direct stream watch failed:\s*/u, "")
        .replace(/^\[stream-watch\]\s*/u, "")
        .trim();
    if (/请确认是否想执行|未完全命中/u.test(normalizedDetail)) {
        return normalizedDetail;
    }
    if (/当前可用计划|当前可用门店|当前可用模块|未绑定巡检计划/u.test(normalizedDetail)) {
        return normalizedDetail;
    }
    if (/没有找到可用的流地址或门店映射|scene resolve failed/u.test(detail)) {
        return "没有找到可用的门店映射或流地址，请检查门店别名，或直接附上流地址后重试。";
    }
    if (/未配置基准图|没有可兜底的基准图/u.test(detail)) {
        return request?.inspectionType === "description"
            ? "当前门店还没有配置基准图，文字点检在视觉模型不稳定时无法兜底。请先补基准图，或改用计划一。"
            : "当前门店还没有配置基准图，请先补基准图后再执行巡检。";
    }
    if (/valid JSON|invalid JSON|无稳定输出|Vision inspection|OPENAI_API_KEY|timed out/u.test(detail)) {
        return request?.inspectionType === "description"
            ? "文字点检当前没有拿到稳定的视觉结果，已尝试兜底但仍未完成。建议稍后重试；若频繁出现，请检查门店基准图和模型配置。"
            : "巡检当前没有拿到稳定结果，建议稍后重试；若频繁出现，请检查流地址和基准图配置。";
    }
    return request?.inspectionType === "description"
        ? "文字点检暂时失败，请稍后重试；若持续失败，请检查门店映射、基准图和模型配置。"
        : "巡检暂时失败，请稍后重试；若持续失败，请检查流地址和基准图配置。";
}
function classifyClauseDisplay(item, result) {
    const evidence = typeof item?.evidence === "string" ? item.evidence.trim() : "";
    if (item?.matched) {
        return {
            status: "通过",
            icon: "OK",
            evidence,
        };
    }
    if (
        result?.fallbackUsed &&
        /缺少稳定识别依据|仅命中门店基准图兜底|按未通过处理以避免误判|仅完成场景级确认|暂未自动确认|未做独立识别计算|建议人工复核/u.test(evidence)
    ) {
        return {
            status: "待复核",
            icon: "REVIEW",
            evidence: evidence || "当前只有场景兜底证据，细项识别还不稳定",
        };
    }
    return {
        status: "不通过",
        icon: "FAIL",
        evidence,
    };
}
function summarizeBusinessVerdict(result, clauseResults) {
    const displayItems = clauseResults.map((item) => classifyClauseDisplay(item, result));
    const failedCount = displayItems.filter((item) => item.status === "不通过").length;
    const reviewCount = displayItems.filter((item) => item.status === "待复核").length;
    if (failedCount > 0) {
        return "异常";
    }
    if (reviewCount > 0) {
        return "待复核";
    }
    return result?.verdict === "violation" ? "异常" : "通过";
}
function truncateText(text, maxLength = 44) {
    const value = typeof text === "string" ? text.trim().replace(/\s+/g, " ") : "";
    if (!value) {
        return "";
    }
    return value.length > maxLength ? value.slice(0, maxLength - 1) + "…" : value;
}
function buildConfigSyncLines(result, inspectionTypeLabel) {
    const storeName = typeof result?.storeName === "string" && result.storeName.trim()
        ? result.storeName.trim()
        : "";
    const monitorName = typeof result?.monitorName === "string" && result.monitorName.trim()
        ? result.monitorName.trim()
        : "";
    const planName = typeof result?.sceneName === "string" && result.sceneName.trim()
        ? result.sceneName.trim()
        : "";
    const source = typeof result?.source === "string" && result.source.trim()
        ? result.source.trim()
        : "";
    const clauseResults = Array.isArray(result?.clauseResults) ? result.clauseResults : [];
    return [
        "已同步后台最新配置",
        storeName ? \`门店: \${storeName}\` : "",
        monitorName ? \`监控模块: \${monitorName}\` : "",
        planName ? \`巡检计划: \${planName}\` : "",
        inspectionTypeLabel ? \`执行类型: \${inspectionTypeLabel}\` : "",
        clauseResults.length > 0 ? \`点检项数量: \${clauseResults.length} 项\` : "",
        source ? \`流地址: \${truncateText(source, 72)}\` : "",
    ].filter(Boolean);
}
function formatDirectStreamFrameWatchReply(result) {
    const framePickMode = result?.framePickMode === "first" ? "第一帧" : "随机帧";
    const sampledAtSeconds = Number.isFinite(result?.sampledAtSeconds)
        ? Number(result.sampledAtSeconds).toFixed(3)
        : "0.000";
    const storeName = typeof result?.storeName === "string" && result.storeName.trim()
        ? result.storeName.trim()
        : "";
    const monitorName = typeof result?.monitorName === "string" && result.monitorName.trim()
        ? result.monitorName.trim()
        : "";
    const reasons = Array.isArray(result?.reasons) && result.reasons.length > 0
        ? result.reasons.slice(0, 2).map((item) => truncateText(item, 60)).join("；")
        : result?.verdict === "violation"
            ? "当前巡检未通过"
            : "当前巡检通过";
    const reportText = result?.report?.docName
        ? \`日报文档: \${result.report.docName}\${result.report.docUrl ? \`（\${result.report.docUrl}）\` : ""}\`
        : "";
    if (result?.inspectionType === "description") {
        const planName = typeof result?.sceneName === "string" && result.sceneName.trim()
            ? result.sceneName.trim()
            : "文字点检";
        const matchPercent = Number.isFinite(result?.matchPercent)
            ? Number(result.matchPercent).toFixed(2)
            : "0.00";
        const threshold = Number.isFinite(result?.thresholdMatchPercent)
            ? Number(result.thresholdMatchPercent).toFixed(2)
            : "80.00";
        const observedSummary = typeof result?.observedSummary === "string" ? result.observedSummary.trim() : "";
        const clauseResults = Array.isArray(result?.clauseResults) ? result.clauseResults : [];
        const displayItems = clauseResults.map((item) => ({
            clause: item?.clause || "未命名点检项",
            ...classifyClauseDisplay(item, result),
        }));
        const configSyncLines = buildConfigSyncLines(result, "点检项巡检");
        const passedCount = displayItems.filter((item) => item.status === "通过").length;
        const reviewCount = displayItems.filter((item) => item.status === "待复核").length;
        const failedCount = displayItems.filter((item) => item.status === "不通过").length;
        const totalClauses = displayItems.length || 0;
        const businessVerdict = summarizeBusinessVerdict(result, clauseResults);
        const fallbackText = result?.fallbackUsed
            ? "已启用" + (result?.fallbackReason ? \`（\${String(result.fallbackReason).trim()}）\` : "")
            : "未启用";
        const checklistLines = displayItems.length > 0
            ? displayItems.map((item, index) => {
                const evidence = truncateText(item.evidence, 46);
                return evidence
                    ? \`\${index + 1}. [\${item.status}] \${item.clause}；依据: \${evidence}\`
                    : \`\${index + 1}. [\${item.status}] \${item.clause}\`;
            })
            : ["本次没有返回可用的点检项明细"];
        const nextAction = failedCount > 0
            ? "建议按异常处理，并优先查看对应帧图。"
            : reviewCount > 0
                ? "建议人工复核这些“待复核”项；当前系统没有足够稳定证据自动放行。"
                : "本次巡检项均通过，可正常记录。";
        return [
            "文字巡检已完成",
            ...configSyncLines,
            \`巡检结论: \${businessVerdict}\`,
            totalClauses > 0 ? \`巡检项统计: 共 \${totalClauses} 项，通过 \${passedCount} 项 / 待复核 \${reviewCount} 项 / 不通过 \${failedCount} 项\` : "",
            \`匹配度: \${matchPercent}%\`,
            \`通过阈值: \${threshold}%\`,
            \`抽帧: \${framePickMode} · \${sampledAtSeconds}s\`,
            observedSummary ? \`画面概况: \${observedSummary}\` : "",
            \`兜底复核: \${fallbackText}\`,
            \`巡检项明细（共 \${totalClauses} 项）:\`,
            ...checklistLines,
            \`建议动作: \${nextAction}\`,
            reportText,
            \`补充说明: \${reasons}\`,
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
    const configSyncLines = buildConfigSyncLines(result, "基准图巡检");
    return [
        "图片基准比对完成",
        ...configSyncLines,
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
    const isBatchOwnerIntent = isBatchOwnerInspectionRequest(text);
    const shouldSendThinking = account.sendThinkingMessage ?? true;
    if (directStreamWatchCommand && !isBatchOwnerIntent) {
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
    else if (isBatchOwnerIntent) {
        await sendWeComReply({
            wsClient,
            frame,
            text: "已接收，正在按负责人匹配门店并创建批量巡检，通常需要 3-10 秒。",
            runtime,
            finish: false,
            streamId,
        });
    }
    else if (shouldSendThinking) {
        await sendThinkingReply({ wsClient, frame, streamId, runtime });
    }
    if (directStreamWatchCommand && !directStreamWatchRequest && !isBatchOwnerIntent) {
        await sendWeComReply({
            wsClient,
            frame,
            text: "已接收，但没有找到可用的巡检参数。计划巡检请用“执行巡检计划：门店名 + 计划名”；计划一也可附图片，计划二可写“点检项: ...”。",
            runtime,
            finish: true,
            streamId,
        });
        cleanupState();
        return;
    }
    if (isBatchOwnerIntent) {
        try {
            const batchMessageContext = buildMessageContext(frame, account, config, text, mediaList, quoteContent);
            const batchResult = await withTimeout(createBatchInspectionFromWeCom(batchMessageContext), MESSAGE_PROCESS_TIMEOUT_MS, \`Batch inspection create timed out (msgId=\${messageId})\`);
            await sendWeComReply({
                wsClient,
                frame,
                text: formatBatchExecutionSuccessReply(batchResult),
                runtime,
                finish: true,
                streamId,
            });
        }
        catch (err) {
            runtime.error?.(\`[wecom][plugin] Batch inspection create failed: \${String(err)}\`);
            await sendWeComReply({
                wsClient,
                frame,
                text: formatBatchExecutionFailureMessage(err),
                runtime,
                finish: true,
                streamId,
            });
        }
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
                text: formatDirectStreamWatchFailureMessage(directStreamWatchRequest, err),
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
  const parseStartMarker = source.includes("function stripDescriptionControlPhrases(text) {")
    ? "function stripDescriptionControlPhrases(text) {"
    : source.includes("function extractDescriptionInspectionText(sourceText) {")
      ? "function extractDescriptionInspectionText(sourceText) {"
      : "function parseDirectStreamFrameWatchRequest(text, mediaList) {";

  const hasUpgradeAnchors =
    source.includes(parseStartMarker) &&
    source.includes("async function runDirectStreamFrameWatchCompare(request) {") &&
    source.includes("function formatDirectStreamFrameWatchReply(result) {") &&
    source.includes("    const directStreamWatchCommand = shouldSuppressInlineMediaForStreamFrameWatch(text);") &&
    source.includes("    // Step 7: 构建上下文并路由到核心处理流程（带整体超时保护）");

  if (!hasUpgradeAnchors) {
    console.warn(`wecom inspection scene2 skipped for ${relativePath}: anchors not matched`);
    continue;
  }

  source = replaceSection(
    source,
    parseStartMarker,
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

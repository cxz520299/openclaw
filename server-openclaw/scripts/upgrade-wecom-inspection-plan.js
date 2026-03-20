#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const pluginDir = process.argv[2];

if (!pluginDir) {
  console.error("Usage: node upgrade-wecom-inspection-plan.js <plugin-dir>");
  process.exit(1);
}

const DIST_FILES = ["dist/index.cjs.js", "dist/index.esm.js"];

const helperOld = `function shouldSuppressInlineMediaForStreamFrameWatch(text) {
    const normalized = String(text || "").replace(/\\s+/g, "");
    return normalized.includes("按图片基准检查这个流")
        || normalized.includes("按照图片基准检查这个流")
        || normalized.includes("按基准图检查这个流")
        || normalized.includes("按照基准图检查这个流");
}`;

const helperNew = `function shouldSuppressInlineMediaForStreamFrameWatch(text) {
    const normalized = String(text || "").replace(/\\s+/g, "");
    return normalized.includes("按图片基准检查这个流")
        || normalized.includes("按照图片基准检查这个流")
        || normalized.includes("按基准图检查这个流")
        || normalized.includes("按照基准图检查这个流")
        || normalized.includes("执行巡检计划")
        || normalized.includes("运行巡检计划")
        || normalized.includes("启动巡检计划");
}`;

const planOld = `    const compareThreshold = similarityPercent !== undefined
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

const planNew = `    const isInspectionPlanShortcut = /(?:执行|运行|启动)巡检计划/u.test(sourceText);
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

let changed = false;

for (const relativePath of DIST_FILES) {
  const filePath = path.join(pluginDir, relativePath);
  let source = await readFile(filePath, "utf8");
  const next = source
    .replace(helperOld, helperNew)
    .replace(planOld, planNew);
  if (next !== source) {
    await writeFile(filePath, next, "utf8");
    changed = true;
  }
}

console.log(changed ? "inspection plan shortcut upgraded" : "inspection plan shortcut already upgraded");

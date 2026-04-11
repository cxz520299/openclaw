#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";

const pluginDir = process.argv[2];

if (!pluginDir) {
  console.error("Usage: node verify-wecom-plugin-patch.js <plugin-dir>");
  process.exit(1);
}

const DIST_FILES = ["dist/index.cjs.js", "dist/index.esm.js"];

const REQUIRED_SNIPPETS = [
  'const hasStoreLikeText = /门店|分店|店铺|成都小智零食有鸣/u.test(sourceText);',
  'const knownPlanNames = [',
  '"门店基准图巡检"',
  '"营业画面点检"',
  'inspectionType: "db_plan"',
  'text: directStreamWatchRequest?.inspectionType === "description"',
  '已接收，正在按门店场景抓取流画面巡检，通常需要 2-6 秒。',
];

const UNIQUE_SNIPPETS = [
  "function shouldUseWecomDocFastAck(text) {",
  "function getWecomDocFastAckText(text) {",
];

let hasError = false;

for (const relativePath of DIST_FILES) {
  const filePath = path.join(pluginDir, relativePath);
  let source = "";
  try {
    source = await readFile(filePath, "utf8");
  } catch (error) {
    console.error(`[wecom-verify] missing file: ${filePath} (${String(error)})`);
    hasError = true;
    continue;
  }

  const missing = REQUIRED_SNIPPETS.filter((snippet) => !source.includes(snippet));
  if (missing.length > 0) {
    console.error(`[wecom-verify] patch markers missing in ${filePath}`);
    for (const snippet of missing) {
      console.error(`  - ${snippet}`);
    }
    hasError = true;
    continue;
  }

  for (const snippet of UNIQUE_SNIPPETS) {
    const firstIndex = source.indexOf(snippet);
    const lastIndex = source.lastIndexOf(snippet);
    if (firstIndex >= 0 && firstIndex !== lastIndex) {
      console.error(`[wecom-verify] duplicate helper found in ${filePath}`);
      console.error(`  - ${snippet}`);
      hasError = true;
    }
  }

  if (hasError) {
    continue;
  }

  console.log(`[wecom-verify] ok: ${filePath}`);
}

if (hasError) {
  process.exit(1);
}

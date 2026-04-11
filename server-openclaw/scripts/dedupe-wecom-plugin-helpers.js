#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const pluginDir = process.argv[2];

if (!pluginDir) {
  console.error("Usage: node dedupe-wecom-plugin-helpers.js <plugin-dir>");
  process.exit(1);
}

const DIST_FILES = ["dist/index.cjs.js", "dist/index.esm.js"];
const TARGET_FUNCTIONS = [
  "function shouldUseWecomDocFastAck(text) {",
  "function getWecomDocFastAckText(text) {",
];

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
      if (char === "\\") {
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

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    }
  }

  throw new Error(`function body end not found at ${startIndex}`);
}

function dedupeNamedFunction(source, signature) {
  const firstIndex = source.indexOf(signature);
  if (firstIndex < 0) {
    return source;
  }

  let nextIndex = source.indexOf(signature, firstIndex + signature.length);
  while (nextIndex >= 0) {
    const endIndex = findFunctionEnd(source, nextIndex);
    source = `${source.slice(0, nextIndex)}${source.slice(endIndex)}`.replace(/\n{3,}/g, "\n\n");
    nextIndex = source.indexOf(signature, firstIndex + signature.length);
  }

  return source;
}

let changed = false;

for (const relativePath of DIST_FILES) {
  const filePath = path.join(pluginDir, relativePath);
  const originalSource = await readFile(filePath, "utf8");
  let source = originalSource;

  for (const signature of TARGET_FUNCTIONS) {
    source = dedupeNamedFunction(source, signature);
  }

  if (source === originalSource) {
    continue;
  }

  await writeFile(filePath, source, "utf8");
  changed = true;
}

console.log(changed ? "wecom helper duplicates removed" : "wecom helper duplicates already clean");

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const PLUGIN_ID = "stream-frame-watch";
const SERVICE_SCRIPT = "/opt/openclaw/services/stream-frame-watch/index.mjs";
const DEFAULT_CONFIG_PATH =
  process.env.STREAM_FRAME_WATCH_CONFIG || "/opt/openclaw/config/stream-frame-watch.json";

function getPluginConfig(api) {
  return api?.config?.plugins?.entries?.[PLUGIN_ID]?.config ?? {};
}

function getConfigPath(api) {
  const cfg = getPluginConfig(api);
  return String(cfg.configPath || DEFAULT_CONFIG_PATH).trim();
}

async function runScript(args) {
  const { stdout, stderr } = await execFileAsync("node", [SERVICE_SCRIPT, ...args], {
    env: process.env,
    maxBuffer: 1024 * 1024 * 16,
  });
  const text = String(stdout || "").trim();
  if (!text) {
    throw new Error(String(stderr || "stream-frame-watch returned empty output").trim());
  }
  return JSON.parse(text);
}

function stringify(value) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function appendArg(args, flag, value) {
  if (value === undefined || value === null || value === "") {
    return;
  }
  args.push(flag, String(value));
}

function register(api) {
  api.registerTool({
    name: "stream_frame_watch_list_scenarios",
    label: "Stream Frame Watch List Scenarios",
    description: "List configured video stream comparison scenarios.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {}
    },
    execute: async () => {
      const result = await runScript(["list-scenes", "--config", getConfigPath(api)]);
      return stringify(result);
    }
  });

  api.registerTool({
    name: "stream_frame_watch_analyze",
    label: "Stream Frame Watch Analyze",
    description:
      "Extract the first or a random frame from a video/stream, compare it against a baseline image, and return the verdict with reasons.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        sceneId: {
          type: "string",
          description: "Optional configured scenario id from stream_frame_watch_list_scenarios."
        },
        source: {
          type: "string",
          description: "Video file path or stream URL."
        },
        baselineImage: {
          type: "string",
          description: "Baseline image path or URL."
        },
        descriptionText: {
          type: "string",
          description: "Textual inspection requirement for the sampled frame."
        },
        compareThreshold: {
          type: "number",
          description:
            "Override difference threshold in 0-1 range. Example: 0.12 means alert when average pixel difference reaches 12% or more."
        },
        matchThresholdPercent: {
          type: "number",
          description:
            "For description-based inspection, the minimum required match percent in 0-100 range."
        },
        framePickMode: {
          type: "string",
          enum: ["first", "random"],
          description: "Pick the first frame or a random frame."
        },
        frameWidth: {
          type: "number"
        },
        frameHeight: {
          type: "number"
        },
        randomWindowSeconds: {
          type: "number"
        },
        minOffsetSeconds: {
          type: "number"
        },
        maxOffsetSeconds: {
          type: "number"
        },
        ruleName: {
          type: "string",
          description: "Human-readable rule name shown in the analysis result."
        },
        expectedDescription: {
          type: "string",
          description: "Short description of the expected scene."
        },
        violationMessage: {
          type: "string",
          description: "Custom violation reason when the threshold is exceeded."
        }
      }
    },
    execute: async (_toolCallId, payload = {}) => {
      const args = ["analyze", "--config", getConfigPath(api)];
      appendArg(args, "--scene", payload.sceneId);
      appendArg(args, "--source", payload.source);
      appendArg(args, "--baseline", payload.baselineImage);
      appendArg(args, "--description-text", payload.descriptionText);
      appendArg(args, "--threshold", payload.compareThreshold);
      appendArg(args, "--match-threshold-percent", payload.matchThresholdPercent);
      appendArg(args, "--frame-pick-mode", payload.framePickMode);
      appendArg(args, "--frame-width", payload.frameWidth);
      appendArg(args, "--frame-height", payload.frameHeight);
      appendArg(args, "--random-window-seconds", payload.randomWindowSeconds);
      appendArg(args, "--min-offset-seconds", payload.minOffsetSeconds);
      appendArg(args, "--max-offset-seconds", payload.maxOffsetSeconds);
      appendArg(args, "--rule-name", payload.ruleName);
      appendArg(args, "--expected-description", payload.expectedDescription);
      appendArg(args, "--violation-message", payload.violationMessage);
      const result = await runScript(args);
      return stringify(result);
    }
  });
}

export default {
  id: PLUGIN_ID,
  name: "Stream Frame Watch",
  description: "Analyze a sampled frame from a video stream against a baseline image.",
  register
};

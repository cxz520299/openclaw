import type { BindingItem, JobItem, Plan, PlanItem, ResultClause, ResultItem, StoreItem, StreamItem } from "@/types/inspection";

const textMap: Record<string, string> = {
  enabled: "启用",
  disabled: "停用",
  description_inspection: "计划二·文字点检",
  baseline_inspection: "计划一·基准图比对",
  baseline_compare: "计划一·基准图比对",
  first: "第一帧",
  random: "随机帧",
  pending: "待执行",
  running: "执行中",
  success: "已通过",
  alerted: "异常告警",
  partial_success: "待复核",
  manual: "手动触发",
  admin_manual: "后台手动",
  schedule: "定时任务",
  wecom: "企业微信",
  inspection_admin: "巡检后台",
  scene_expectation: "场景预期",
  must_have: "必须出现",
  must_not_have: "禁止出现",
  generic: "通用描述",
  pass: "通过",
  violation: "异常",
  none: "无需额外插件",
  consider_detector_plugin: "建议补充识别插件",
};

function readMapValue(value: string, fallback = "-") {
  const key = String(value || "").trim();
  if (!key) {
    return fallback;
  }
  return textMap[key] || key;
}

export function formatStoreStatus(status: string) {
  return readMapValue(status, "未设置");
}

export function formatPlanType(planType: string) {
  return readMapValue(planType, "未设置");
}

export function formatFramePickMode(mode: string) {
  return readMapValue(mode, "未设置");
}

export function formatJobStatus(status: string) {
  return readMapValue(status, "未知状态");
}

export function formatTriggerType(triggerType: string) {
  return readMapValue(triggerType, triggerType || "未知来源");
}

export function formatClauseType(clauseType: string) {
  return readMapValue(clauseType, clauseType || "未分类");
}

export function formatBooleanStatus(value: boolean, truthy = "启用", falsy = "停用") {
  return value ? truthy : falsy;
}

export function formatInspectionType(value: string) {
  return readMapValue(value, "未设置");
}

export function formatResultVerdict(result?: Pick<ResultItem, "verdict" | "fallbackUsed"> | null) {
  if (!result) {
    return "-";
  }
  if (result.verdict !== "violation") {
    return "通过";
  }
  return result.fallbackUsed ? "未通过（待复核）" : "未通过";
}

export function formatArtifactType(type: string) {
  if (type === "frame") {
    return "巡检截图";
  }
  if (type === "diff") {
    return "差异图";
  }
  return type || "-";
}

export function formatPercent(value?: number | null, fallback = "-") {
  if (!Number.isFinite(Number(value))) {
    return fallback;
  }
  return `${Number(value).toFixed(2)}%`;
}

export function formatDateTime(value?: string, fallback = "-") {
  if (!value) {
    return fallback;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", { hour12: false });
}

export function getStreamDisplayName(stream?: Pick<StreamItem, "name" | "id"> | null) {
  if (!stream) {
    return "未绑定监控模块";
  }
  return String(stream.name || `监控模块-${stream.id || "未命名"}`).trim();
}

export function getPlanDisplayName(plan?: Pick<Plan, "name" | "id"> | null) {
  if (!plan) {
    return "未绑定计划";
  }
  return String(plan.name || `计划-${plan.id || "未命名"}`).trim();
}

export interface TopologyModule {
  id: number;
  name: string;
  storeId: number;
  aliasList: string;
  streamUrl: string;
  enabled: boolean;
  baselineImagePath: string;
  sourceAlias: string;
  bindings: BindingItem[];
}

export interface TopologyStoreCard {
  id: number;
  name: string;
  code: string;
  region: string;
  status: string;
  managerName: string;
  managerWecomUserId: string;
  remark: string;
  modules: TopologyModule[];
  bindingCount: number;
  activePlanCount: number;
}

export function buildStoreTopology(stores: StoreItem[], streams: StreamItem[], bindings: BindingItem[]): TopologyStoreCard[] {
  return stores
    .map((store) => {
      const storeBindings = bindings
        .filter((binding) => binding.storeId === store.id)
        .sort((left, right) => left.id - right.id);
      const modules = streams
        .filter((stream) => stream.storeId === store.id)
        .sort((left, right) => left.id - right.id)
        .map((stream) => ({
          id: stream.id,
          name: getStreamDisplayName(stream),
          storeId: store.id,
          aliasList: stream.aliasList,
          streamUrl: stream.streamUrl,
          enabled: Boolean(stream.enabled),
          baselineImagePath: stream.baselineImagePath,
          sourceAlias: stream.sourceAlias,
          bindings: storeBindings.filter((binding) => binding.streamId === stream.id),
        }));

      return {
        ...store,
        modules,
        bindingCount: storeBindings.length,
        activePlanCount: new Set(storeBindings.filter((binding) => binding.enabled).map((binding) => binding.planId)).size,
      };
    })
    .sort((left, right) => right.modules.length - left.modules.length || left.id - right.id);
}

export function summarizeTopology(topology: TopologyStoreCard[]) {
  return {
    stores: topology.length,
    modules: topology.reduce((sum, item) => sum + item.modules.length, 0),
    bindings: topology.reduce((sum, item) => sum + item.bindingCount, 0),
    activePlans: topology.reduce((sum, item) => sum + item.activePlanCount, 0),
  };
}

export function buildPlanItemPreview(items: PlanItem[], limit = 3) {
  return items
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .slice(0, limit)
    .map((item) => `${formatClauseType(item.itemType)}：${item.content}`);
}

export function buildResultChecklist(result?: ResultItem | null) {
  return Array.isArray(result?.items)
    ? result.items.map((item) => ({
        ...item,
        statusLabel: item.matched ? "通过" : result?.fallbackUsed ? "待复核" : "不通过",
        typeLabel: formatClauseType(item.clauseType),
      }))
    : [];
}

export function getJobMonitorName(job: JobItem) {
  return job.binding?.stream?.name || job.result?.monitorName || "默认监控位";
}

export function getSummaryTone(job: JobItem) {
  if (job.status === "alerted") {
    return "danger";
  }
  if (job.status === "partial_success") {
    return "warning";
  }
  return "normal";
}

export function formatShortReason(reason: string) {
  const text = String(reason || "").trim();
  if (!text) {
    return "暂无说明";
  }
  return text.length > 72 ? `${text.slice(0, 72)}...` : text;
}

export function getClauseStatusTag(clause: ResultClause, result?: ResultItem | null) {
  if (clause.matched) {
    return "通过";
  }
  return result?.fallbackUsed ? "待复核" : "不通过";
}

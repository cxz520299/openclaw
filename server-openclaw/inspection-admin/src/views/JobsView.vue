<template>
  <div class="inspection-page">
    <el-card shadow="never" class="panel-card">
      <template #header>
        <div class="section-heading">
          <div>
            <div class="section-title">执行记录</div>
            <div class="section-subtitle">这里重点看最终跑到了哪个监控模块，以及结果是不是业务能直接看的结论。</div>
          </div>
        </div>
      </template>

      <div class="panel-toolbar">
        <div class="panel-toolbar-main">
          <div class="panel-toolbar-title">先看页内状态汇总，再点开具体任务详情</div>
          <div class="panel-toolbar-desc">执行记录页优先服务业务排查，所以把通过、告警和失败任务先收成状态芯片，再往下看每条任务到底跑到了哪个监控模块。</div>
          <div class="panel-chip-row">
            <span class="panel-chip">当前总数 <strong>{{ pagination.total }}</strong></span>
            <span class="panel-chip">已通过 <strong>{{ summary.success }}</strong></span>
            <span class="panel-chip">异常告警 <strong>{{ summary.alerted }}</strong></span>
            <span class="panel-chip">执行失败 <strong>{{ summary.error }}</strong></span>
          </div>
        </div>
        <div class="panel-toolbar-actions">
          <el-button type="primary" plain @click="goBatchCenter">批量任务中心</el-button>
          <el-button text @click="loadData">刷新记录</el-button>
        </div>
      </div>

      <div class="panel-table-area">
        <el-table :data="jobs" v-loading="loading" border>
          <el-table-column prop="jobNo" label="任务编号" min-width="180" />
          <el-table-column label="门店" min-width="150">
            <template #default="{ row }">{{ row.store?.name || row.result?.storeName || "-" }}</template>
          </el-table-column>
          <el-table-column label="监控模块" min-width="160">
            <template #default="{ row }">{{ getJobMonitorName(row) }}</template>
          </el-table-column>
          <el-table-column label="计划" min-width="180">
            <template #default="{ row }">{{ row.plan?.name || row.result?.planName || "-" }}</template>
          </el-table-column>
          <el-table-column label="状态" width="130">
            <template #default="{ row }">
              <div>
                <span :class="['soft-tag', statusToneClass(row.status)]">{{ formatJobStatus(row.status) }}</span>
                <div v-if="row.errorMessage" class="table-helper">{{ row.errorMessage }}</div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="触发方式" width="130">
            <template #default="{ row }">{{ formatTriggerType(row.triggerType) }}</template>
          </el-table-column>
          <el-table-column label="创建时间" min-width="180">
            <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="结果" width="120">
            <template #default="{ row }">
              <el-button v-if="row.result?.id" text @click="openResult(row.result.id)">查看</el-button>
              <span v-else>-</span>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div class="table-pagination">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          background
          layout="total, sizes, prev, pager, next, jumper"
          :page-sizes="[10, 20, 50, 100]"
          :total="pagination.total"
          @change="loadData"
        />
      </div>
    </el-card>

    <el-drawer v-model="drawerVisible" title="巡检结果详情" size="760px">
      <template v-if="resultDetail">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="门店">{{ resultDetail.storeName || "-" }}</el-descriptions-item>
          <el-descriptions-item label="监控模块">{{ resultDetail.monitorName || "默认监控位" }}</el-descriptions-item>
          <el-descriptions-item label="计划">{{ resultDetail.planName || "-" }}</el-descriptions-item>
          <el-descriptions-item label="巡检类型">{{ formatInspectionType(resultDetail.inspectionType) }}</el-descriptions-item>
          <el-descriptions-item label="结论">{{ formatResultVerdict(resultDetail) }}</el-descriptions-item>
          <el-descriptions-item label="匹配度">{{ formatPercent(resultDetail.matchPercent) }}</el-descriptions-item>
          <el-descriptions-item label="差异度">{{ formatPercent(resultDetail.differencePercent) }}</el-descriptions-item>
          <el-descriptions-item label="抽帧方式">{{ formatFramePickMode(resultDetail.framePickMode) }}</el-descriptions-item>
          <el-descriptions-item label="抽帧时间">{{ Number(resultDetail.sampledAtSeconds || 0).toFixed(3) }}s</el-descriptions-item>
          <el-descriptions-item label="画面摘要">{{ resultDetail.observedSummary || "-" }}</el-descriptions-item>
          <el-descriptions-item label="兜底原因">{{ resultDetail.fallbackReason || "-" }}</el-descriptions-item>
          <el-descriptions-item label="流地址">{{ resultDetail.source || "-" }}</el-descriptions-item>
          <el-descriptions-item label="报告地址">{{ resultDetail.reportUrl || "-" }}</el-descriptions-item>
          <el-descriptions-item label="文档地址">{{ resultDetail.docUrl || "-" }}</el-descriptions-item>
        </el-descriptions>

        <el-divider>点检项明细</el-divider>
        <el-table :data="checklistRows" border>
          <el-table-column prop="typeLabel" label="类型" width="140" />
          <el-table-column prop="clause" label="点检项" min-width="220" />
          <el-table-column prop="statusLabel" label="结果" width="110" />
          <el-table-column prop="evidence" label="业务说明" min-width="260" />
        </el-table>

        <el-divider>命中说明</el-divider>
        <el-table v-if="matchLogs.length" :data="matchLogs" border>
          <el-table-column prop="queryText" label="原始命令" min-width="220" show-overflow-tooltip />
          <el-table-column label="命中方式" min-width="210">
            <template #default="{ row }">
              <div>{{ formatMatchMode(row.storeMatchMode) }}</div>
              <div class="table-helper">
                {{ formatMatchMode(row.planMatchMode) }} / {{ formatMatchMode(row.streamMatchMode) }}
              </div>
            </template>
          </el-table-column>
          <el-table-column label="命中结果" min-width="220">
            <template #default="{ row }">
              <div>{{ row.matchedStoreName || "-" }}</div>
              <div class="table-helper">{{ row.matchedPlanName || "-" }} / {{ row.matchedStreamName || "-" }}</div>
            </template>
          </el-table-column>
          <el-table-column prop="confidenceScore" label="置信度" width="100" />
          <el-table-column prop="decisionSummary" label="命中说明" min-width="260" show-overflow-tooltip />
        </el-table>
        <div v-else class="overview-empty compact">当前任务还没有命中日志，可能是旧任务或未写回。</div>

        <el-divider>巡检产物</el-divider>
        <el-table :data="resultDetail.artifacts || []" border>
          <el-table-column label="类型" width="140">
            <template #default="{ row }">{{ formatArtifactType(row.artifactType) }}</template>
          </el-table-column>
          <el-table-column prop="fileUrl" label="文件地址" min-width="260" />
          <el-table-column prop="filePath" label="文件路径" min-width="220" />
        </el-table>
      </template>
    </el-drawer>

    <el-drawer v-model="batchDrawerVisible" title="批量巡检任务" size="620px">
      <div class="batch-drawer">
        <el-form label-width="96px">
          <el-form-item label="巡检计划">
            <el-select v-model="batchForm.planId" placeholder="请选择巡检计划" filterable class="full-width">
              <el-option v-for="plan in plans" :key="plan.id" :label="plan.name" :value="plan.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="区域筛选">
            <el-select v-model="batchForm.region" clearable placeholder="按区域筛选门店" class="full-width">
              <el-option v-for="region in regionOptions" :key="region" :label="region" :value="region" />
            </el-select>
          </el-form-item>
          <el-form-item label="门店范围">
            <el-select
              v-model="batchForm.storeIds"
              multiple
              collapse-tags
              collapse-tags-tooltip
              filterable
              clearable
              placeholder="不选则使用当前区域全部启用门店"
              class="full-width"
            >
              <el-option v-for="store in filteredStores" :key="store.id" :label="store.name" :value="store.id" />
            </el-select>
            <div class="table-helper">建议先选计划，再按区域或指定门店生成批量任务。</div>
          </el-form-item>
        </el-form>

        <div class="batch-actions">
          <el-button :loading="estimating" @click="estimateBatch">预估耗时</el-button>
          <el-button type="primary" :loading="creatingBatch" @click="createBatch">创建批量任务</el-button>
        </div>

        <div v-if="batchEstimate" class="batch-estimate-card">
          <div class="batch-estimate-title">批量任务预估</div>
          <div class="batch-estimate-summary">{{ batchEstimate.summaryText }}</div>
          <div class="batch-estimate-grid">
            <div class="metric-item">
              <div class="metric-label">已选门店</div>
              <div class="metric-value">{{ batchEstimate.selectedStoreCount }}</div>
            </div>
            <div class="metric-item">
              <div class="metric-label">门店数</div>
              <div class="metric-value">{{ batchEstimate.storeCount }}</div>
            </div>
            <div class="metric-item">
              <div class="metric-label">跳过门店</div>
              <div class="metric-value">{{ batchEstimate.skippedStoreCount }}</div>
            </div>
            <div class="metric-item">
              <div class="metric-label">监控点</div>
              <div class="metric-value">{{ batchEstimate.monitorCount }}</div>
            </div>
            <div class="metric-item">
              <div class="metric-label">任务数</div>
              <div class="metric-value">{{ batchEstimate.jobCount }}</div>
            </div>
            <div class="metric-item">
              <div class="metric-label">点检项</div>
              <div class="metric-value">{{ batchEstimate.planItemCount }}</div>
            </div>
            <div class="metric-item">
              <div class="metric-label">预计耗时</div>
              <div class="metric-value">{{ batchEstimate.estimatedLabel }}</div>
            </div>
          </div>

          <el-table :data="batchEstimate.stores" border size="small">
            <el-table-column prop="name" label="门店" min-width="180" />
            <el-table-column prop="region" label="区域" width="100" />
            <el-table-column prop="status" label="状态" width="100">
              <template #default="{ row }">{{ row.status === "enabled" ? "启用" : row.status }}</template>
            </el-table-column>
          </el-table>

          <div v-if="batchEstimate.skippedStoreCount" class="batch-skip-panel">
            <div class="batch-skip-title">本次自动跳过的门店</div>
            <div class="batch-skip-subtitle">这些门店当前没有绑定所选巡检计划，批量任务不会误创建到它们上面。</div>
            <el-table :data="batchEstimate.skippedStores" border size="small">
              <el-table-column prop="name" label="门店" min-width="180" />
              <el-table-column prop="region" label="区域" width="100" />
              <el-table-column prop="remark" label="说明" min-width="220" />
            </el-table>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { useRouter } from "vue-router";
import { inspectionApi } from "@/api/inspection";
import { useAppStore } from "@/stores/app";
import type { BatchExecutionEstimate, JobItem, MatchLogItem, Plan, ResultItem, StoreItem } from "@/types/inspection";
import {
  buildResultChecklist,
  formatArtifactType,
  formatDateTime,
  formatFramePickMode,
  formatInspectionType,
  formatJobStatus,
  formatMatchMode,
  formatPercent,
  formatResultVerdict,
  formatTriggerType,
  getJobMonitorName,
} from "@/utils/inspection";

const appStore = useAppStore();
const router = useRouter();
const loading = ref(false);
const jobs = ref<JobItem[]>([]);
const drawerVisible = ref(false);
const resultDetail = ref<ResultItem | null>(null);
const matchLogs = ref<MatchLogItem[]>([]);
const batchDrawerVisible = ref(false);
const estimating = ref(false);
const creatingBatch = ref(false);
const stores = ref<StoreItem[]>([]);
const plans = ref<Plan[]>([]);
const batchEstimate = ref<BatchExecutionEstimate | null>(null);
const pagination = ref({
  page: 1,
  pageSize: 10,
  total: 0,
});
let refreshTimer: number | null = null;
const batchForm = ref({
  planId: undefined as number | undefined,
  region: "",
  storeIds: [] as number[],
});

const checklistRows = computed(() => buildResultChecklist(resultDetail.value));
const regionOptions = computed(() =>
  Array.from(new Set(stores.value.map((item) => item.region).filter(Boolean))).sort((left, right) => left.localeCompare(right, "zh-CN")),
);
const filteredStores = computed(() =>
  stores.value.filter((item) => !batchForm.value.region || item.region === batchForm.value.region),
);
const summary = computed(() => ({
  success: jobs.value.filter((item) => item.status === "success").length,
  alerted: jobs.value.filter((item) => item.status === "alerted" || item.status === "partial_success").length,
  error: jobs.value.filter((item) => item.status === "error").length,
}));

function statusToneClass(status: string) {
  if (status === "alerted") {
    return "is-danger";
  }
  if (status === "error") {
    return "is-danger";
  }
  if (status === "partial_success") {
    return "is-warning";
  }
  if (status === "success") {
    return "is-success";
  }
  return "";
}

async function loadData() {
  loading.value = true;
  try {
    const response = await inspectionApi.getJobs({
      page: pagination.value.page,
      pageSize: pagination.value.pageSize,
    });
    jobs.value = response.data.items;
    pagination.value.total = response.data.total;
  } finally {
    loading.value = false;
  }
}

async function ensureBatchMeta() {
  if (stores.value.length && plans.value.length) {
    return;
  }
  const [storeResp, planResp] = await Promise.all([inspectionApi.getStores({ all: true }), inspectionApi.getPlans({ all: true })]);
  stores.value = storeResp.data.items.filter((item) => item.status === "enabled");
  plans.value = planResp.data.items.filter((item) => item.enabled);
}

async function openBatchDrawer() {
  await ensureBatchMeta();
  batchEstimate.value = null;
  batchDrawerVisible.value = true;
}

function goBatchCenter() {
  router.push("/batch-center");
}

async function estimateBatch() {
  if (!batchForm.value.planId) {
    ElMessage.warning("请先选择巡检计划");
    return;
  }
  estimating.value = true;
  try {
    const response = await inspectionApi.estimateBatchExecution({
      planId: batchForm.value.planId,
      region: batchForm.value.region || undefined,
      storeIds: batchForm.value.storeIds.length ? batchForm.value.storeIds : undefined,
      operatorName: "巡检后台",
      triggerSource: "inspection_admin_batch",
    });
    batchEstimate.value = response.data;
  } finally {
    estimating.value = false;
  }
}

async function createBatch() {
  if (!batchForm.value.planId) {
    ElMessage.warning("请先选择巡检计划");
    return;
  }
  if (!batchEstimate.value) {
    await estimateBatch();
  }
  creatingBatch.value = true;
  try {
    const response = await inspectionApi.createBatchExecution({
      planId: batchForm.value.planId,
      region: batchForm.value.region || undefined,
      storeIds: batchForm.value.storeIds.length ? batchForm.value.storeIds : undefined,
      operatorName: "巡检后台",
      triggerSource: "inspection_admin_batch",
    });
    batchEstimate.value = response.data.summary;
    const skippedCount = response.data.summary.skippedStoreCount || 0;
    const suffix = skippedCount ? `，自动跳过 ${skippedCount} 家未绑定门店` : "";
    ElMessage.success(`已创建 ${response.data.jobs.length} 条批量巡检任务${suffix}`);
    batchDrawerVisible.value = false;
    await loadData();
  } finally {
    creatingBatch.value = false;
  }
}

async function openResult(id: number) {
  matchLogs.value = [];
  const response = await inspectionApi.getResult(id);
  resultDetail.value = response.data;
  const jobId = response.data?.jobId;
  if (jobId) {
    const matchResponse = await inspectionApi.getMatchLogs({ jobId, limit: 20 });
    matchLogs.value = matchResponse.data.items;
  } else {
    matchLogs.value = [];
  }
  drawerVisible.value = true;
}

onMounted(() => {
  appStore.setPageTitle("执行记录");
  void loadData();
  refreshTimer = window.setInterval(() => {
    void loadData();
  }, 10000);
});

onUnmounted(() => {
  if (refreshTimer !== null) {
    window.clearInterval(refreshTimer);
    refreshTimer = null;
  }
});
</script>

<style scoped>
.batch-drawer {
  display: grid;
  gap: 16px;
}

.full-width {
  width: 100%;
}

.batch-actions {
  display: flex;
  gap: 12px;
}

.batch-estimate-card {
  padding: 16px;
  border-radius: 20px;
  background: rgba(245, 248, 255, 0.95);
  border: 1px solid rgba(15, 56, 104, 0.08);
}

.batch-estimate-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--oc-text);
}

.batch-estimate-summary {
  margin-top: 8px;
  color: var(--oc-text-soft);
  line-height: 1.7;
}

.batch-estimate-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin: 16px 0;
}

.batch-skip-panel {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px dashed rgba(15, 56, 104, 0.16);
}

.batch-skip-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--oc-text);
}

.batch-skip-subtitle {
  margin: 6px 0 12px;
  color: var(--oc-text-soft);
  line-height: 1.7;
}

@media (max-width: 900px) {
  .batch-estimate-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>

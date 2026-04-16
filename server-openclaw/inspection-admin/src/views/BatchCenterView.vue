<template>
  <div class="inspection-page">
    <el-card shadow="never" class="panel-card">
      <template #header>
        <div class="section-heading">
          <div>
            <div class="section-title">进度汇总卡片</div>
            <div class="section-subtitle">集中看企业微信负责人批量巡检跑到了哪里，谁发起、谁负责、还有多少失败项待处理。</div>
          </div>
          <div class="header-actions">
            <el-button type="primary" @click="openCreateDrawer">新建批量巡检</el-button>
            <el-button text @click="loadData">刷新</el-button>
          </div>
        </div>
      </template>

      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-label">批次总数</div>
          <div class="metric-value">{{ summaryCards.totalRuns }}</div>
          <div class="metric-footnote">当前列表中的批量巡检批次</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">执行中批次</div>
          <div class="metric-value">{{ summaryCards.runningRuns }}</div>
          <div class="metric-footnote">含待执行/执行中任务</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">失败任务</div>
          <div class="metric-value">{{ summaryCards.errorJobs }}</div>
          <div class="metric-footnote">可直接点击批次进行失败重试</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">告警任务</div>
          <div class="metric-value">{{ summaryCards.alertedJobs }}</div>
          <div class="metric-footnote">已命中异常，需要业务复核</div>
        </div>
      </div>
    </el-card>

    <el-card shadow="never" class="panel-card">
      <template #header>
        <div class="section-heading">
          <div>
            <div class="section-title">批量任务中心</div>
            <div class="section-subtitle">面向企业微信按负责人批量发起场景，集中查看来源、负责人归属、门店范围、进度和失败重试。</div>
          </div>
          <div class="toolbar">
            <el-select v-model="filters.status" clearable placeholder="状态筛选" class="toolbar-select">
              <el-option label="待执行" value="pending" />
              <el-option label="执行中" value="running" />
              <el-option label="已通过" value="success" />
              <el-option label="异常告警" value="alerted" />
              <el-option label="待复核" value="partial_success" />
              <el-option label="执行失败" value="error" />
            </el-select>
            <el-select v-model="filters.managerWecomUserId" clearable filterable placeholder="负责人筛选" class="toolbar-select">
              <el-option
                v-for="manager in managerOptions"
                :key="manager.managerWecomUserId || manager.managerName"
                :label="manager.label"
                :value="manager.managerWecomUserId"
              />
            </el-select>
          </div>
        </div>
      </template>

      <div class="panel-toolbar">
        <div class="panel-toolbar-main">
          <div class="panel-toolbar-title">先看是谁从哪里发起，再判断负责人名下门店有没有跑完</div>
          <div class="panel-toolbar-desc">主表会把批次来源、负责人来源、发起人、负责人和进度收在一起，方便排查企业微信群里发起的批量巡检是否闭环。</div>
          <div class="panel-chip-row">
            <span class="panel-chip">当前批次 <strong>{{ pagination.total }}</strong></span>
            <span class="panel-chip">企微批量 <strong>{{ summaryCards.wecomOwnerRuns }}</strong></span>
            <span class="panel-chip">执行中 <strong>{{ summaryCards.runningRuns }}</strong></span>
            <span class="panel-chip">告警任务 <strong>{{ summaryCards.alertedJobs }}</strong></span>
            <span class="panel-chip">失败任务 <strong>{{ summaryCards.errorJobs }}</strong></span>
          </div>
        </div>
        <div class="panel-toolbar-actions">
          <el-select v-model="filters.status" clearable placeholder="状态筛选" class="toolbar-select">
            <el-option label="待执行" value="pending" />
            <el-option label="执行中" value="running" />
            <el-option label="已通过" value="success" />
            <el-option label="异常告警" value="alerted" />
            <el-option label="待复核" value="partial_success" />
            <el-option label="执行失败" value="error" />
          </el-select>
          <el-select v-model="filters.managerWecomUserId" clearable filterable placeholder="负责人筛选" class="toolbar-select">
            <el-option
              v-for="manager in managerOptions"
              :key="manager.managerWecomUserId || manager.managerName"
              :label="manager.label"
              :value="manager.managerWecomUserId"
            />
          </el-select>
        </div>
      </div>

      <div class="panel-table-area">
        <el-table :data="runs" v-loading="loading" border>
          <el-table-column prop="batchNo" label="批次编号" min-width="180" />
          <el-table-column label="发起来源" min-width="220">
            <template #default="{ row }">
              <div>
                <span :class="['soft-tag', sourceToneClass(resolveBatchSourceMeta(row).sourceValue)]">
                  {{ resolveBatchSourceMeta(row).sourceLabel }}
                </span>
              </div>
              <div class="table-helper">负责人来源：{{ resolveBatchSourceMeta(row).ownerSourceLabel }}</div>
            </template>
          </el-table-column>
          <el-table-column label="发起人 / 负责人" min-width="250">
            <template #default="{ row }">
              <div>{{ resolveBatchInitiator(row).display }}</div>
              <div class="table-helper">负责人：{{ resolveBatchOwner(row).display }}</div>
            </template>
          </el-table-column>
          <el-table-column label="执行范围" min-width="220">
            <template #default="{ row }">
              <div>{{ getBatchScopeSummary(row) }}</div>
              <div class="table-helper">{{ formatBatchScopeType(row.scopeType) }}</div>
            </template>
          </el-table-column>
          <el-table-column label="巡检计划" min-width="180">
            <template #default="{ row }">{{ row.plan?.name || row.planName || "-" }}</template>
          </el-table-column>
          <el-table-column label="执行方式" width="120">
            <template #default="{ row }">
              <span>{{ formatExecutionMode(row.executionMode) }}</span>
              <span v-if="row.executionMode === 'sample' && row.sampleSize" class="table-helper">({{ row.sampleSize }}家)</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="120">
            <template #default="{ row }">
              <span :class="['soft-tag', statusToneClass(row.status)]">{{ formatJobStatus(row.status) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="进度" min-width="220">
            <template #default="{ row }">
              <div class="progress-row">
                <span>总 {{ row.totalJobs }}</span>
                <span>待 {{ row.pendingJobs }}</span>
                <span>跑 {{ row.runningJobs }}</span>
                <span>过 {{ row.successJobs }}</span>
                <span>警 {{ row.alertedJobs }}</span>
                <span>失败 {{ row.errorJobs }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="门店" min-width="140">
            <template #default="{ row }">{{ row.matchedStoreCount }}/{{ row.selectedStoreCount }}</template>
          </el-table-column>
          <el-table-column label="最近更新" min-width="168">
            <template #default="{ row }">{{ formatDateTime(row.updatedAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="220" fixed="right">
            <template #default="{ row }">
              <div class="row-actions">
                <el-button text @click="openDetail(row.id)">查看详情</el-button>
                <el-button text type="danger" :disabled="!row.errorJobs" @click="retryFailed(row)">重试失败</el-button>
              </div>
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

    <el-drawer v-model="createDrawerVisible" title="新建批量巡检" size="680px">
      <div class="batch-drawer">
        <el-form label-width="104px">
          <el-form-item label="巡检计划">
            <el-select v-model="form.planId" filterable placeholder="请选择巡检计划" class="full-width">
              <el-option v-for="plan in plans" :key="plan.id" :label="plan.name" :value="plan.id" />
            </el-select>
          </el-form-item>

          <el-form-item label="执行范围">
            <el-radio-group v-model="form.scopeType">
              <el-radio-button label="manager">负责人</el-radio-button>
              <el-radio-button label="region">区域</el-radio-button>
              <el-radio-button label="store">指定门店</el-radio-button>
              <el-radio-button label="all">全部启用</el-radio-button>
            </el-radio-group>
          </el-form-item>

          <el-form-item v-if="form.scopeType === 'manager'" label="负责人">
            <el-select v-model="form.managerWecomUserId" filterable placeholder="请选择负责人" class="full-width" @change="handleManagerChange">
              <el-option
                v-for="manager in managerOptions"
                :key="manager.managerWecomUserId || manager.managerName"
                :label="manager.label"
                :value="manager.managerWecomUserId"
              />
            </el-select>
            <div class="table-helper">这里的负责人来自门店管理中的企微负责人字段，可用于模拟企业微信里“按负责人批量发起巡检”的范围。</div>
          </el-form-item>

          <el-form-item v-if="form.scopeType === 'region'" label="区域">
            <el-select v-model="form.region" clearable filterable placeholder="请选择区域" class="full-width">
              <el-option v-for="region in regionOptions" :key="region" :label="region" :value="region" />
            </el-select>
          </el-form-item>

          <el-form-item v-if="form.scopeType === 'store'" label="门店选择">
            <el-select
              v-model="form.storeIds"
              multiple
              filterable
              clearable
              collapse-tags
              collapse-tags-tooltip
              placeholder="请选择门店"
              class="full-width"
            >
              <el-option v-for="store in selectableStores" :key="store.id" :label="store.name" :value="store.id" />
            </el-select>
          </el-form-item>

          <el-form-item label="巡检方式">
            <el-radio-group v-model="form.executionMode">
              <el-radio-button label="full">全量</el-radio-button>
              <el-radio-button label="sample">抽查</el-radio-button>
            </el-radio-group>
          </el-form-item>

          <el-form-item v-if="form.executionMode === 'sample'" label="抽查数量">
            <el-input-number v-model="form.sampleSize" :min="1" :max="30" />
            <div class="table-helper">抽查会在当前范围内随机抽门店创建批次。</div>
          </el-form-item>
        </el-form>

        <div class="batch-actions">
          <el-button :loading="estimating" @click="estimateBatch">预估耗时</el-button>
          <el-button type="primary" :loading="creating" @click="createBatch">创建批量任务</el-button>
        </div>

        <div v-if="estimate" class="batch-estimate-card">
          <div class="batch-estimate-title">本次批量预估</div>
          <div class="batch-estimate-summary">{{ estimate.summaryText }}</div>

          <div class="batch-estimate-grid">
            <div class="metric-item">
              <div class="metric-label">已选门店</div>
              <div class="metric-value">{{ estimate.selectedStoreCount }}</div>
            </div>
            <div class="metric-item">
              <div class="metric-label">命中门店</div>
              <div class="metric-value">{{ estimate.storeCount }}</div>
            </div>
            <div class="metric-item">
              <div class="metric-label">监控点</div>
              <div class="metric-value">{{ estimate.monitorCount }}</div>
            </div>
            <div class="metric-item">
              <div class="metric-label">任务数</div>
              <div class="metric-value">{{ estimate.jobCount }}</div>
            </div>
            <div class="metric-item">
              <div class="metric-label">点检项</div>
              <div class="metric-value">{{ estimate.planItemCount }}</div>
            </div>
            <div class="metric-item">
              <div class="metric-label">预计耗时</div>
              <div class="metric-value">{{ estimate.estimatedLabel }}</div>
            </div>
          </div>

          <el-table :data="estimate.stores" border size="small">
            <el-table-column prop="name" label="已选门店" min-width="180" />
            <el-table-column prop="managerName" label="负责人" min-width="120" />
            <el-table-column prop="region" label="区域" width="100" />
          </el-table>

          <div v-if="estimate.skippedStoreCount" class="batch-skip-panel">
            <div class="batch-skip-title">自动跳过门店</div>
            <div class="batch-skip-subtitle">这些门店当前没有绑定所选计划，不会被误发任务。</div>
            <el-table :data="estimate.skippedStores" border size="small">
              <el-table-column prop="name" label="门店" min-width="180" />
              <el-table-column prop="region" label="区域" width="100" />
              <el-table-column prop="managerName" label="负责人" min-width="120" />
            </el-table>
          </div>
        </div>
      </div>
    </el-drawer>

    <el-drawer v-model="detailDrawerVisible" title="批次详情" size="880px">
      <template v-if="activeBatch">
        <div class="detail-hero">
          <div>
            <div class="detail-hero-title">{{ activeBatch.plan?.name || activeBatch.planName || "未命名巡检计划" }}</div>
            <div class="detail-hero-subtitle">{{ activeBatch.summaryText || "用于承接企业微信负责人批量发起的巡检批次明细。" }}</div>
          </div>
          <div class="detail-hero-tags">
            <span class="soft-tag is-primary">{{ formatBatchScopeType(activeBatch.scopeType) }}</span>
            <span class="soft-tag">{{ getBatchScopeSummary(activeBatch) }}</span>
            <span class="soft-tag" :class="statusToneClass(activeBatch.status)">{{ formatJobStatus(activeBatch.status) }}</span>
          </div>
        </div>

        <div class="detail-grid">
          <div class="detail-card">
            <div class="detail-card-label">发起来源</div>
            <div class="detail-card-value detail-card-value--compact">{{ resolveBatchSourceMeta(activeBatch).sourceLabel }}</div>
          </div>
          <div class="detail-card">
            <div class="detail-card-label">负责人来源</div>
            <div class="detail-card-value detail-card-value--compact">{{ resolveBatchSourceMeta(activeBatch).ownerSourceLabel }}</div>
          </div>
          <div class="detail-card">
            <div class="detail-card-label">发起人</div>
            <div class="detail-card-value detail-card-value--compact">{{ resolveBatchInitiator(activeBatch).display }}</div>
          </div>
          <div class="detail-card">
            <div class="detail-card-label">负责人</div>
            <div class="detail-card-value detail-card-value--compact">{{ resolveBatchOwner(activeBatch).display }}</div>
          </div>
          <div class="detail-card">
            <div class="detail-card-label">已选门店 / 命中门店</div>
            <div class="detail-card-value">{{ activeBatch.selectedStoreCount }}/{{ activeBatch.matchedStoreCount }}</div>
          </div>
          <div class="detail-card">
            <div class="detail-card-label">任务进度</div>
            <div class="detail-card-value">{{ activeBatch.successJobs + activeBatch.alertedJobs + activeBatch.partialSuccessJobs }}/{{ activeBatch.totalJobs }}</div>
          </div>
          <div class="detail-card">
            <div class="detail-card-label">失败任务</div>
            <div class="detail-card-value">{{ activeBatch.errorJobs }}</div>
          </div>
          <div class="detail-card">
            <div class="detail-card-label">完成时间</div>
            <div class="detail-card-value detail-time">{{ formatDateTime(activeBatch.finishedAt || undefined) }}</div>
          </div>
        </div>

        <div class="batch-context-note">
          <div class="batch-context-note__title">批次说明</div>
          <div class="batch-context-note__body">
            当前批次按“{{ resolveBatchOwner(activeBatch).display }}”名下门店组织执行，范围说明为“{{ getBatchScopeSummary(activeBatch) }}”。
            如果这是企业微信群里触发的任务，可以直接用这里的发起来源、发起人和负责人来源来核对链路是否命中正确。
          </div>
        </div>

        <div class="detail-actions">
          <el-button type="danger" plain :disabled="!activeBatch.errorJobs" @click="retryFailed(activeBatch)">重试失败任务</el-button>
        </div>

        <div class="table-section-title">任务明细</div>
        <div class="panel-table-area">
          <el-table :data="activeBatch.jobs || []" border>
            <el-table-column prop="jobNo" label="任务编号" min-width="180" />
            <el-table-column label="门店" min-width="160">
              <template #default="{ row }">{{ row.store?.name || "-" }}</template>
            </el-table-column>
            <el-table-column label="监控模块" min-width="160">
              <template #default="{ row }">{{ getJobMonitorName(row) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="130">
              <template #default="{ row }">
                <div>
                  <span :class="['soft-tag', statusToneClass(row.status)]">{{ formatJobStatus(row.status) }}</span>
                  <div v-if="row.errorMessage" class="table-helper">{{ row.errorMessage }}</div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="创建时间" min-width="168">
              <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
            </el-table-column>
            <el-table-column label="结果" width="110">
              <template #default="{ row }">
                <el-button v-if="row.result?.id" text @click="openJobResult(row.result.id)">查看</el-button>
                <span v-else>-</span>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { inspectionApi } from "@/api/inspection";
import { useAppStore } from "@/stores/app";
import type { BatchExecutionEstimate, BatchExecutionRun, Plan, StoreItem } from "@/types/inspection";
import {
  formatBatchScopeType,
  formatDateTime,
  formatExecutionMode,
  formatJobStatus,
  getBatchScopeSummary,
  getJobMonitorName,
  resolveBatchInitiator,
  resolveBatchOwner,
  resolveBatchSourceMeta,
} from "@/utils/inspection";

interface ManagerOption {
  managerName: string;
  managerWecomUserId: string;
  label: string;
}

const appStore = useAppStore();
const loading = ref(false);
const estimating = ref(false);
const creating = ref(false);
const runs = ref<BatchExecutionRun[]>([]);
const stores = ref<StoreItem[]>([]);
const plans = ref<Plan[]>([]);
const estimate = ref<BatchExecutionEstimate | null>(null);
const createDrawerVisible = ref(false);
const detailDrawerVisible = ref(false);
const activeBatch = ref<BatchExecutionRun | null>(null);
const pagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0,
});
let refreshTimer: number | null = null;

const filters = ref({
  status: "",
  managerWecomUserId: "",
});

const form = ref({
  planId: undefined as number | undefined,
  scopeType: "manager",
  region: "",
  managerName: "",
  managerWecomUserId: "",
  storeIds: [] as number[],
  executionMode: "full",
  sampleSize: 3,
});

const regionOptions = computed(() =>
  Array.from(new Set(stores.value.map((item) => item.region).filter(Boolean))).sort((left, right) => left.localeCompare(right, "zh-CN")),
);

const managerOptions = computed<ManagerOption[]>(() => {
  const bucket = new Map<string, ManagerOption>();
  stores.value.forEach((store) => {
    const managerName = String(store.managerName || "").trim();
    const managerWecomUserId = String(store.managerWecomUserId || "").trim();
    if (!managerName && !managerWecomUserId) {
      return;
    }
    const key = managerWecomUserId || managerName;
    if (!bucket.has(key)) {
      bucket.set(key, {
        managerName,
        managerWecomUserId,
        label: managerWecomUserId ? `${managerName || "未命名负责人"} (${managerWecomUserId})` : managerName,
      });
    }
  });
  return Array.from(bucket.values()).sort((left, right) => left.label.localeCompare(right.label, "zh-CN"));
});

const selectableStores = computed(() => {
  if (form.value.scopeType === "manager" && form.value.managerWecomUserId) {
    return stores.value.filter((item) => item.managerWecomUserId === form.value.managerWecomUserId);
  }
  if (form.value.scopeType === "region" && form.value.region) {
    return stores.value.filter((item) => item.region === form.value.region);
  }
  return stores.value;
});

const summaryCards = computed(() => ({
  totalRuns: pagination.total,
  runningRuns: runs.value.filter((item) => ["pending", "running"].includes(item.status)).length,
  wecomOwnerRuns: runs.value.filter((item) => resolveBatchSourceMeta(item).sourceValue.includes("wecom")).length,
  errorJobs: runs.value.reduce((sum, item) => sum + Number(item.errorJobs || 0), 0),
  alertedJobs: runs.value.reduce((sum, item) => sum + Number(item.alertedJobs || 0), 0),
}));

function statusToneClass(status: string) {
  if (status === "alerted" || status === "error") {
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

function sourceToneClass(source: string) {
  if (source.includes("wecom")) {
    return "is-primary";
  }
  if (source.includes("admin")) {
    return "is-warning";
  }
  return "";
}

async function loadBaseMeta() {
  if (stores.value.length && plans.value.length) {
    return;
  }
  const [storeResp, planResp] = await Promise.all([inspectionApi.getStores({ all: true }), inspectionApi.getPlans({ all: true })]);
  stores.value = storeResp.data.items.filter((item) => item.status === "enabled");
  plans.value = planResp.data.items.filter((item) => item.enabled);
}

async function loadData() {
  loading.value = true;
  try {
    await loadBaseMeta();
    const response = await inspectionApi.getBatchRuns({
      page: pagination.page,
      pageSize: pagination.pageSize,
      status: filters.value.status || undefined,
      managerWecomUserId: filters.value.managerWecomUserId || undefined,
    });
    runs.value = response.data.items;
    pagination.total = response.data.total;
    if (activeBatch.value?.id) {
      const detailResponse = await inspectionApi.getBatchRun(activeBatch.value.id);
      activeBatch.value = detailResponse.data;
    }
  } finally {
    loading.value = false;
  }
}

function resetEstimate() {
  estimate.value = null;
}

async function openCreateDrawer() {
  await loadBaseMeta();
  resetEstimate();
  createDrawerVisible.value = true;
}

function handleManagerChange(value: string) {
  const current = managerOptions.value.find((item) => item.managerWecomUserId === value);
  form.value.managerName = current?.managerName || "";
  form.value.storeIds = [];
  resetEstimate();
}

function buildBatchPayload() {
  return {
    planId: form.value.planId,
    region: form.value.scopeType === "region" ? form.value.region || undefined : undefined,
    managerName: form.value.scopeType === "manager" ? form.value.managerName || undefined : undefined,
    managerWecomUserId: form.value.scopeType === "manager" ? form.value.managerWecomUserId || undefined : undefined,
    storeIds: form.value.scopeType === "store" ? form.value.storeIds : undefined,
    executionMode: form.value.executionMode,
    sampleSize: form.value.executionMode === "sample" ? form.value.sampleSize : undefined,
    operatorName: "巡检后台",
    operatorWecomUserId: "inspection-admin",
    triggerSource: "inspection_admin_batch",
  };
}

async function estimateBatch() {
  if (!form.value.planId) {
    ElMessage.warning("请先选择巡检计划");
    return;
  }
  if (form.value.scopeType === "manager" && !form.value.managerWecomUserId) {
    ElMessage.warning("请先选择负责人");
    return;
  }
  if (form.value.scopeType === "region" && !form.value.region) {
    ElMessage.warning("请先选择区域");
    return;
  }
  if (form.value.scopeType === "store" && !form.value.storeIds.length) {
    ElMessage.warning("请至少选择一家门店");
    return;
  }
  estimating.value = true;
  try {
    const response = await inspectionApi.estimateBatchExecution(buildBatchPayload());
    estimate.value = response.data;
  } finally {
    estimating.value = false;
  }
}

async function createBatch() {
  if (!estimate.value) {
    await estimateBatch();
  }
  if (!estimate.value) {
    return;
  }
  creating.value = true;
  try {
    const response = await inspectionApi.createBatchExecution(buildBatchPayload());
    ElMessage.success(`已创建批次 ${response.data.batch.batchNo}，共 ${response.data.jobs.length} 条任务`);
    createDrawerVisible.value = false;
    await loadData();
    await openDetail(response.data.batch.id);
  } finally {
    creating.value = false;
  }
}

async function openDetail(id: number) {
  const response = await inspectionApi.getBatchRun(id);
  activeBatch.value = response.data;
  detailDrawerVisible.value = true;
}

async function retryFailed(batch: BatchExecutionRun) {
  if (!batch.errorJobs) {
    return;
  }
  const response = await inspectionApi.retryFailedBatchRun(batch.id);
  ElMessage.success(`已重新投递 ${response.data.retryCount} 条失败任务`);
  await loadData();
  if (activeBatch.value?.id === batch.id) {
    activeBatch.value = (await inspectionApi.getBatchRun(batch.id)).data;
  }
}

function openJobResult(resultId: number) {
  window.open(`/jobs?resultId=${resultId}`, "_self");
}

onMounted(() => {
  appStore.setPageTitle("批量任务中心");
  void loadData();
  refreshTimer = window.setInterval(() => {
    void loadData();
  }, 10000);
});

watch(
  () => ({ ...filters.value }),
  () => {
    pagination.page = 1;
    void loadData();
  },
  { deep: true },
);

watch(
  () => [form.value.planId, form.value.scopeType, form.value.region, form.value.managerWecomUserId, form.value.executionMode, form.value.sampleSize, form.value.storeIds.join(",")],
  () => {
    resetEstimate();
  },
);

onUnmounted(() => {
  if (refreshTimer !== null) {
    window.clearInterval(refreshTimer);
    refreshTimer = null;
  }
});
</script>

<style scoped>
.header-actions,
.toolbar,
.row-actions,
.detail-actions,
.batch-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toolbar {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.toolbar-select,
.full-width {
  width: 100%;
}

.toolbar-select {
  max-width: 220px;
}

.progress-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  color: var(--oc-text-soft);
  font-size: 13px;
}

.batch-drawer {
  display: grid;
  gap: 16px;
}

.batch-estimate-card {
  padding: 16px;
  border-radius: 20px;
  background: rgba(245, 248, 255, 0.95);
  border: 1px solid rgba(15, 56, 104, 0.08);
}

.batch-estimate-title,
.batch-skip-title,
.detail-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--oc-text);
}

.batch-estimate-summary,
.batch-skip-subtitle,
.detail-subtitle {
  margin-top: 8px;
  color: var(--oc-text-soft);
  line-height: 1.7;
}

.batch-estimate-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 16px 0;
}

.metric-item {
  padding: 14px;
  border-radius: 16px;
  border: 1px solid rgba(15, 56, 104, 0.08);
  background: rgba(255, 255, 255, 0.76);
}

.batch-skip-panel {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px dashed rgba(15, 56, 104, 0.16);
}

.detail-summary {
  margin-bottom: 18px;
}

.detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
}

.compact-card {
  min-height: 120px;
}

.detail-time {
  font-size: 18px;
  line-height: 1.5;
}

.detail-card-value--compact {
  font-size: 16px;
  line-height: 1.6;
}

.batch-context-note {
  margin: 18px 0 22px;
  padding: 16px 18px;
  border-radius: 18px;
  border: 1px solid rgba(15, 56, 104, 0.08);
  background: linear-gradient(135deg, rgba(246, 249, 255, 0.94), rgba(255, 255, 255, 0.98));
}

.batch-context-note__title {
  font-size: 14px;
  font-weight: 700;
  color: var(--oc-text);
}

.batch-context-note__body {
  margin-top: 8px;
  color: var(--oc-text-soft);
  line-height: 1.8;
}

@media (max-width: 960px) {
  .batch-estimate-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .toolbar {
    justify-content: flex-start;
  }

  .toolbar-select {
    max-width: none;
  }
}
</style>

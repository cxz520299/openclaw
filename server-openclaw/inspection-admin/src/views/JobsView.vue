<template>
  <div class="inspection-page">
    <el-card shadow="never" class="panel-card">
      <template #header>
        <div class="section-heading">
          <div>
            <div class="section-title">执行记录</div>
            <div class="section-subtitle">这里重点看最终跑到了哪个监控模块，以及结果是不是业务能直接看的结论。</div>
          </div>
          <el-button text @click="loadData">刷新</el-button>
        </div>
      </template>

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
            <span :class="['soft-tag', statusToneClass(row.status)]">{{ formatJobStatus(row.status) }}</span>
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
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { inspectionApi } from "@/api/inspection";
import { useAppStore } from "@/stores/app";
import type { JobItem, ResultItem } from "@/types/inspection";
import {
  buildResultChecklist,
  formatArtifactType,
  formatDateTime,
  formatFramePickMode,
  formatInspectionType,
  formatJobStatus,
  formatPercent,
  formatResultVerdict,
  formatTriggerType,
  getJobMonitorName,
} from "@/utils/inspection";

const appStore = useAppStore();
const loading = ref(false);
const jobs = ref<JobItem[]>([]);
const drawerVisible = ref(false);
const resultDetail = ref<ResultItem | null>(null);

const checklistRows = computed(() => buildResultChecklist(resultDetail.value));

function statusToneClass(status: string) {
  if (status === "alerted") {
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
    const response = await inspectionApi.getJobs();
    jobs.value = response.data;
  } finally {
    loading.value = false;
  }
}

async function openResult(id: number) {
  const response = await inspectionApi.getResult(id);
  resultDetail.value = response.data;
  drawerVisible.value = true;
}

onMounted(() => {
  appStore.setPageTitle("执行记录");
  void loadData();
});
</script>

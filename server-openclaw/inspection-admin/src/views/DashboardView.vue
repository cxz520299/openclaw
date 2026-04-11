<template>
  <div class="inspection-page">
    <section class="hero-banner">
      <div class="hero-kicker">Inspection Command Center</div>
      <div class="hero-title">把门店、监控模块、巡检计划和企业微信联动在一个后台里</div>
      <div class="hero-description">
        这里优先展示业务最关心的门店拓扑关系。一个门店可以挂多个监控模块，不同巡检计划可以绑定到不同监控位，后续小智执行任务时也会直接带出对应模块名称。
      </div>
    </section>

    <section class="metric-grid">
      <article v-for="card in summaryCards" :key="card.label" class="metric-card">
        <div class="metric-label">{{ card.label }}</div>
        <div class="metric-value">{{ card.value }}</div>
        <div class="metric-footnote">{{ card.footnote }}</div>
      </article>
    </section>

    <el-card shadow="never" class="panel-card">
      <template #header>
        <div class="section-heading">
          <div>
            <div class="section-title">门店巡检拓扑</div>
            <div class="section-subtitle">先按门店看全局，再看每个监控模块绑定了哪些计划。</div>
          </div>
          <el-button text @click="loadData">刷新拓扑</el-button>
        </div>
      </template>

      <div v-loading="loading">
        <transition-group v-if="topology.length" name="fade-slide" tag="div" class="store-grid">
          <article v-for="store in topology" :key="store.id" class="store-topology-card">
            <div class="store-head">
              <div>
                <div class="store-name">{{ store.name }}</div>
                <div class="store-meta">{{ store.region || "未设置区域" }} · {{ store.code || "未设置编码" }}</div>
              </div>
              <span :class="['soft-tag', store.status === 'enabled' ? 'is-success' : 'is-warning']">
                {{ formatStoreStatus(store.status) }}
              </span>
            </div>

            <div class="store-brief">
              <span class="soft-tag">{{ store.modules.length }} 个监控模块</span>
              <span class="soft-tag is-primary">{{ store.activePlanCount }} 个生效计划</span>
              <span class="soft-tag">{{ store.bindingCount }} 条绑定关系</span>
            </div>

            <div v-if="store.modules.length" class="module-grid">
              <article v-for="module in store.modules" :key="module.id" class="module-card">
                <div class="module-top">
                  <div class="module-name">{{ module.name }}</div>
                  <span :class="['soft-tag', module.enabled ? 'is-success' : 'is-warning']">
                    {{ formatBooleanStatus(module.enabled) }}
                  </span>
                </div>
                <div class="table-helper">流地址：{{ module.streamUrl || "未配置" }}</div>
                <div class="table-helper">别名：{{ module.sourceAlias || "未配置" }}</div>
                <div class="plan-stack">
                  <div class="table-helper">已绑定计划</div>
                  <div v-if="module.bindings.length" class="plan-tags">
                    <span
                      v-for="binding in module.bindings"
                      :key="binding.id"
                      :class="['soft-tag', binding.enabled ? 'is-primary' : '']"
                    >
                      {{ getPlanDisplayName(binding.plan) }}
                    </span>
                  </div>
                  <div v-else class="table-helper">当前监控模块还没有绑定巡检计划</div>
                </div>
              </article>
            </div>
            <div v-else class="overview-empty">当前门店还没有配置监控模块。</div>
          </article>
        </transition-group>
        <div v-else class="overview-empty">当前没有可展示的门店拓扑数据。</div>
      </div>
    </el-card>

    <el-card shadow="never" class="panel-card">
      <template #header>
        <div class="section-heading">
          <div>
            <div class="section-title">最近执行记录</div>
            <div class="section-subtitle">重点看结果和具体命中的监控模块，方便排查“计划跑到哪一路监控”。</div>
          </div>
          <el-button text @click="loadData">刷新记录</el-button>
        </div>
      </template>

      <el-table :data="jobs" v-loading="loading" border>
        <el-table-column prop="jobNo" label="任务编号" min-width="180" />
        <el-table-column label="门店" min-width="160">
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
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { inspectionApi } from "@/api/inspection";
import { useAppStore } from "@/stores/app";
import type { BindingItem, JobItem, StoreItem, StreamItem, Summary } from "@/types/inspection";
import {
  buildStoreTopology,
  formatBooleanStatus,
  formatDateTime,
  formatJobStatus,
  formatStoreStatus,
  formatTriggerType,
  getJobMonitorName,
  getPlanDisplayName,
  summarizeTopology,
} from "@/utils/inspection";

const appStore = useAppStore();
const loading = ref(false);
const summary = ref<Summary>({
  stores: 0,
  streams: 0,
  plans: 0,
  bindings: 0,
  jobs: 0,
  results: 0,
});
const jobs = ref<JobItem[]>([]);
const stores = ref<StoreItem[]>([]);
const streams = ref<StreamItem[]>([]);
const bindings = ref<BindingItem[]>([]);

const topology = computed(() => buildStoreTopology(stores.value, streams.value, bindings.value));
const topologySummary = computed(() => summarizeTopology(topology.value));

const summaryCards = computed(() => [
  { label: "门店总数", value: summary.value.stores, footnote: "已接入可巡检门店" },
  { label: "监控模块", value: topologySummary.value.modules || summary.value.streams, footnote: "门店下可用流媒体位" },
  { label: "巡检计划", value: summary.value.plans, footnote: "后台当前已配置计划" },
  { label: "绑定关系", value: topologySummary.value.bindings || summary.value.bindings, footnote: "计划与监控模块映射" },
  { label: "执行任务", value: summary.value.jobs, footnote: "累计任务创建次数" },
  { label: "结果回传", value: summary.value.results, footnote: "已写回巡检结果" },
]);

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
    const [summaryResp, jobsResp, storesResp, streamsResp, bindingsResp] = await Promise.all([
      inspectionApi.getSummary(),
      inspectionApi.getJobs(),
      inspectionApi.getStores(),
      inspectionApi.getStreams(),
      inspectionApi.getBindings(),
    ]);
    summary.value = summaryResp.data;
    jobs.value = jobsResp.data.slice(0, 8);
    stores.value = storesResp.data;
    streams.value = streamsResp.data;
    bindings.value = bindingsResp.data;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  appStore.setPageTitle("巡检总览");
  void loadData();
});
</script>

<style scoped>
.store-head,
.module-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.store-name,
.module-name {
  font-weight: 700;
  color: var(--oc-text);
}

.store-name {
  font-size: 20px;
}

.module-name {
  font-size: 16px;
}

.store-meta {
  margin-top: 6px;
  color: var(--oc-text-soft);
  font-size: 13px;
}

.store-brief {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 16px 0 18px;
}

.plan-stack {
  margin-top: 14px;
}

.plan-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}
</style>

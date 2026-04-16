<template>
  <div class="inspection-page">
    <el-card shadow="never" class="panel-card">
      <template #header>
        <div class="section-heading">
          <div>
            <div class="section-title">命中日志</div>
            <div class="section-subtitle">用来复盘“为什么命中这家门店、这个计划、这个监控模块”，也是企业微信联调时最直接的排障入口。</div>
          </div>
        </div>
      </template>

      <div class="panel-toolbar">
        <div class="panel-toolbar-main">
          <div class="panel-toolbar-title">先查命令，再看它命中了谁</div>
          <div class="panel-toolbar-desc">搜索门店、计划、监控模块或原始指令，先缩小范围，再往下看命中说明和复盘卡片。</div>
        </div>
        <div class="panel-toolbar-actions">
          <el-input
            v-model="query"
            clearable
            placeholder="搜索门店、计划、监控或原始指令"
            class="panel-toolbar-search"
            @keyup.enter="handleSearch"
            @clear="handleSearch"
          />
          <el-button type="primary" @click="handleSearch">刷新日志</el-button>
        </div>
      </div>

      <div class="panel-table-area">
        <el-table :data="logs" v-loading="loading" border>
          <el-table-column prop="queryText" label="原始命令" min-width="220" show-overflow-tooltip />
          <el-table-column label="命中结果" min-width="220">
            <template #default="{ row }">
              <div>{{ row.matchedStoreName || "-" }}</div>
              <div class="table-helper">{{ row.matchedPlanName || "-" }} / {{ row.matchedStreamName || "-" }}</div>
            </template>
          </el-table-column>
          <el-table-column label="命中方式" min-width="240">
            <template #default="{ row }">
              <div>{{ formatMatchMode(row.storeMatchMode) }}</div>
              <div class="table-helper">
                {{ formatMatchMode(row.planMatchMode) }} / {{ formatMatchMode(row.streamMatchMode) }}
              </div>
            </template>
          </el-table-column>
          <el-table-column label="置信度" width="100">
            <template #default="{ row }">{{ row.confidenceScore || 0 }}</template>
          </el-table-column>
          <el-table-column label="结果" width="140">
            <template #default="{ row }">
              <span :class="['soft-tag', row.errorMessage ? 'is-warning' : 'is-success']">
                {{ row.errorMessage ? "命中失败" : "命中成功" }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="时间" min-width="170">
            <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
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

      <div v-if="logs.length" class="log-detail-list panel-rail-list">
        <article v-for="item in logs.slice(0, 12)" :key="item.id" class="log-detail-card">
          <div class="log-detail-title">{{ item.queryText || "未记录原始命令" }}</div>
          <div class="log-detail-summary">{{ item.decisionSummary || item.errorMessage || "暂无命中说明" }}</div>
          <div class="log-detail-meta">
            <span>配置版本：{{ item.configVersion || "-" }}</span>
            <span>绑定方式：{{ formatMatchMode(item.bindingMatchMode) }}</span>
          </div>
        </article>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { inspectionApi } from "@/api/inspection";
import { useAppStore } from "@/stores/app";
import type { MatchLogItem } from "@/types/inspection";
import { formatDateTime, formatMatchMode } from "@/utils/inspection";

const appStore = useAppStore();
const loading = ref(false);
const logs = ref<MatchLogItem[]>([]);
const query = ref("");
const pagination = ref({
  page: 1,
  pageSize: 10,
  total: 0,
});

async function loadData() {
  loading.value = true;
  try {
    const response = await inspectionApi.getMatchLogs({
      query: query.value.trim() || undefined,
      page: pagination.value.page,
      pageSize: pagination.value.pageSize,
    });
    logs.value = response.data.items;
    pagination.value.total = response.data.total;
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  pagination.value.page = 1;
  void loadData();
}

onMounted(() => {
  appStore.setPageTitle("命中日志");
  void loadData();
});
</script>

<style scoped>
.log-detail-list {
  margin-top: 6px;
}

.log-detail-card {
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(247, 250, 255, 0.92);
  border: 1px solid rgba(15, 56, 104, 0.08);
}

.log-detail-title {
  color: var(--oc-text);
  font-weight: 700;
}

.log-detail-summary {
  margin-top: 8px;
  color: var(--oc-text);
  line-height: 1.7;
}

.log-detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 10px;
  color: var(--oc-text-soft);
  font-size: 12px;
}
</style>

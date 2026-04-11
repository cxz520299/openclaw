<template>
  <div class="inspection-page">
    <el-card shadow="never" class="panel-card">
      <template #header>
        <div class="section-heading">
          <div>
            <div class="section-title">监控模块管理</div>
            <div class="section-subtitle">一个门店可以挂多个监控模块。这里建议按业务位置命名，例如“01门头1”“03收银台1”。</div>
          </div>
          <el-button type="primary" @click="openCreate">新增监控模块</el-button>
        </div>
      </template>

      <div v-loading="loading">
        <transition-group v-if="topology.length" name="fade-slide" tag="div" class="stream-store-list">
          <article v-for="store in topology" :key="store.id" class="store-topology-card">
            <div class="stream-store-head">
              <div class="stream-store-summary">
                <div>
                <div class="store-name">{{ store.name }}</div>
                <div class="section-subtitle">{{ store.region || "未设置区域" }} · {{ store.code || "未设置编码" }}</div>
                </div>
                <div class="store-brief">
                  <span class="soft-tag">{{ store.modules.length }} 个监控模块</span>
                  <span class="soft-tag is-primary">{{ store.bindingCount }} 条绑定</span>
                </div>
              </div>
              <span :class="['soft-tag', store.status === 'enabled' ? 'is-success' : 'is-warning']">
                {{ formatStoreStatus(store.status) }}
              </span>
            </div>

            <div v-if="store.modules.length" class="module-grid">
              <article v-for="module in store.modules" :key="module.id" class="module-card">
                <div class="module-head">
                  <div class="module-heading">
                    <div class="module-name">{{ module.name }}</div>
                    <div class="table-helper">已绑定 {{ module.bindings.length }} 个巡检计划</div>
                  </div>
                  <span :class="['soft-tag', module.enabled ? 'is-success' : 'is-warning']">
                    {{ formatBooleanStatus(module.enabled) }}
                  </span>
                </div>

                <div class="module-info-grid">
                  <div class="module-info-block">
                    <div class="module-info-label">点位别名</div>
                    <div class="module-info-value" :title="module.aliasList || '未配置'">
                      {{ module.aliasList || "未配置" }}
                    </div>
                  </div>
                  <div class="module-info-block">
                    <div class="module-info-label">基准图</div>
                    <div class="module-info-value" :title="module.baselineImagePath || '未配置'">
                      {{ module.baselineImagePath || "未配置" }}
                    </div>
                  </div>
                  <div class="module-info-block">
                    <div class="module-info-label">流地址</div>
                    <div class="module-info-value" :title="module.streamUrl || '未配置'">
                      {{ module.streamUrl || "未配置" }}
                    </div>
                  </div>
                  <div class="module-info-block">
                    <div class="module-info-label">流地址别名</div>
                    <div class="module-info-value" :title="module.sourceAlias || '未配置'">
                      {{ module.sourceAlias || "未配置" }}
                    </div>
                  </div>
                </div>

                <div class="plan-tags">
                  <span
                    v-for="binding in module.bindings"
                    :key="binding.id"
                    :class="['soft-tag', binding.enabled ? 'is-primary' : '']"
                  >
                    {{ getPlanDisplayName(binding.plan) }}
                  </span>
                  <span v-if="!module.bindings.length" class="soft-tag">暂未绑定计划</span>
                </div>
                <div class="module-actions">
                  <el-button text @click="openEdit(streamMap.get(module.id)!)">编辑</el-button>
                </div>
              </article>
            </div>
            <div v-else class="overview-empty">当前门店还没有监控模块。</div>
          </article>
        </transition-group>
      </div>
    </el-card>

    <el-card shadow="never" class="panel-card">
      <template #header>
        <div class="section-heading">
          <div>
            <div class="section-title">监控模块明细</div>
            <div class="section-subtitle">便于快速核对流地址、别名、基准图和启用状态。</div>
          </div>
        </div>
      </template>

      <el-table :data="streams" v-loading="loading" border>
        <el-table-column label="门店" min-width="160">
          <template #default="{ row }">{{ row.store?.name || "-" }}</template>
        </el-table-column>
        <el-table-column prop="name" label="监控模块名称" min-width="180" />
        <el-table-column prop="aliasList" label="点位别名" min-width="220" show-overflow-tooltip />
        <el-table-column prop="streamUrl" label="流地址" min-width="320" />
        <el-table-column prop="sourceAlias" label="流地址别名" min-width="220" />
        <el-table-column prop="baselineImagePath" label="基准图路径" min-width="220" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <span :class="['soft-tag', row.enabled ? 'is-success' : 'is-warning']">
              {{ formatBooleanStatus(row.enabled) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button text @click="openEdit(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑监控模块' : '新增监控模块'" width="720px">
      <el-form :model="form" label-width="120px">
        <el-form-item label="门店">
          <el-select v-model="form.storeId" filterable class="w-full">
            <el-option v-for="store in stores" :key="store.id" :label="store.name" :value="store.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="模块名称">
          <el-input v-model="form.name" placeholder="例如：03收银台1" />
        </el-form-item>
        <el-form-item label="点位别名">
          <el-input
            v-model="form.aliasList"
            type="textarea"
            :rows="2"
            placeholder="多个别名请用逗号分隔，例如：收银台,前台,门头监控"
          />
        </el-form-item>
        <el-form-item label="流地址">
          <el-input v-model="form.streamUrl" type="textarea" :rows="2" placeholder="支持 HLS / RTSP 等流地址" />
        </el-form-item>
        <el-form-item label="流类型"><el-input v-model="form.streamType" placeholder="例如：hls" /></el-form-item>
        <el-form-item label="流地址别名">
          <el-input v-model="form.sourceAlias" type="textarea" :rows="2" placeholder="可填写备用地址或别名" />
        </el-form-item>
        <el-form-item label="基准图 URL"><el-input v-model="form.baselineImageUrl" /></el-form-item>
        <el-form-item label="基准图路径"><el-input v-model="form.baselineImagePath" /></el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="form.enabled" active-text="启用" inactive-text="停用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { inspectionApi } from "@/api/inspection";
import { useAppStore } from "@/stores/app";
import type { BindingItem, StoreItem, StreamItem } from "@/types/inspection";
import { buildStoreTopology, formatBooleanStatus, formatStoreStatus, getPlanDisplayName } from "@/utils/inspection";

const appStore = useAppStore();
const loading = ref(false);
const submitting = ref(false);
const dialogVisible = ref(false);
const editingId = ref<number | null>(null);
const streams = ref<StreamItem[]>([]);
const stores = ref<StoreItem[]>([]);
const bindings = ref<BindingItem[]>([]);

const topology = computed(() => buildStoreTopology(stores.value, streams.value, bindings.value));
const streamMap = computed(() => new Map(streams.value.map((item) => [item.id, item])));

const emptyForm = () => ({
  storeId: undefined as number | undefined,
  name: "",
  aliasList: "",
  streamUrl: "",
  streamType: "hls",
  sourceAlias: "",
  baselineImageUrl: "",
  baselineImagePath: "",
  enabled: true,
});

const form = reactive(emptyForm());

async function loadData() {
  loading.value = true;
  try {
    const [storeResp, streamResp, bindingResp] = await Promise.all([
      inspectionApi.getStores(),
      inspectionApi.getStreams(),
      inspectionApi.getBindings(),
    ]);
    stores.value = storeResp.data;
    streams.value = streamResp.data;
    bindings.value = bindingResp.data;
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editingId.value = null;
  Object.assign(form, emptyForm());
  dialogVisible.value = true;
}

function openEdit(item: StreamItem) {
  editingId.value = item.id;
  Object.assign(form, {
    storeId: item.storeId,
    name: item.name,
    aliasList: item.aliasList,
    streamUrl: item.streamUrl,
    streamType: item.streamType,
    sourceAlias: item.sourceAlias,
    baselineImageUrl: item.baselineImageUrl,
    baselineImagePath: item.baselineImagePath,
    enabled: item.enabled,
  });
  dialogVisible.value = true;
}

async function submit() {
  submitting.value = true;
  try {
    if (editingId.value) {
      await inspectionApi.updateStream(editingId.value, form);
      ElMessage.success("监控模块已更新");
    } else {
      await inspectionApi.createStream(form);
      ElMessage.success("监控模块已创建");
    }
    dialogVisible.value = false;
    await loadData();
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  appStore.setPageTitle("监控模块管理");
  void loadData();
});
</script>

<style scoped>
.stream-store-list {
  display: grid;
  gap: 18px;
}

.stream-store-head,
.store-name,
.module-name {
  color: var(--oc-text);
}

.store-name {
  font-size: 20px;
  font-weight: 700;
}

.module-name {
  font-size: 16px;
  font-weight: 700;
}

.stream-store-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.stream-store-summary {
  display: grid;
  gap: 12px;
}

.store-brief,
.plan-tags,
.module-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.store-brief {
  margin: 0;
}

.module-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.module-heading {
  min-width: 0;
}

.module-info-grid {
  display: grid;
  gap: 10px;
}

.module-info-block {
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(246, 249, 255, 0.95);
  border: 1px solid rgba(15, 56, 104, 0.08);
}

.module-info-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--oc-text-soft);
}

.module-info-value {
  margin-top: 6px;
  color: var(--oc-text);
  line-height: 1.6;
  word-break: break-all;
  overflow-wrap: anywhere;
}

.plan-tags {
  margin-top: 16px;
}

.module-actions {
  margin-top: 12px;
  justify-content: flex-end;
}

.module-card {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

@media (min-width: 1280px) {
  .module-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 960px) {
  .stream-store-head {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>

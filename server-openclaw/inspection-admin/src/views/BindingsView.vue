<template>
  <div class="inspection-page">
    <el-card shadow="never" class="panel-card">
      <template #header>
        <div class="section-heading">
          <div>
            <div class="section-title">计划绑定</div>
            <div class="section-subtitle">同一门店可以把不同巡检计划绑定到不同监控模块，小智执行时就能准确回到具体监控位。</div>
          </div>
          <el-button type="primary" @click="openCreate">新增绑定</el-button>
        </div>
      </template>

      <div v-loading="loading">
        <transition-group v-if="storeCards.length" name="fade-slide" tag="div" class="store-grid">
          <article v-for="store in storeCards" :key="store.id" class="store-topology-card">
            <div class="store-head">
              <div>
                <div class="store-name">{{ store.name }}</div>
                <div class="section-subtitle">{{ store.region || "未设置区域" }}</div>
              </div>
              <span :class="['soft-tag', store.status === 'enabled' ? 'is-success' : 'is-warning']">
                {{ formatStoreStatus(store.status) }}
              </span>
            </div>
            <div class="store-brief">
              <span class="soft-tag is-primary">{{ store.bindingCount }} 条计划绑定</span>
              <span class="soft-tag">{{ store.modules.length }} 个监控模块</span>
            </div>

            <div v-if="store.modules.length" class="module-grid">
              <article v-for="module in store.modules" :key="module.id" class="module-card">
                <div class="module-name">{{ module.name }}</div>
                <div v-if="module.bindings.length" class="binding-list">
                  <div v-for="binding in module.bindings" :key="binding.id" class="binding-item">
                    <div>
                      <div class="binding-plan">{{ getPlanDisplayName(binding.plan) }}</div>
                      <div class="table-helper">
                        优先级：{{ binding.priority || 0 }} ·
                        阈值：匹配 {{ binding.customMatchThresholdPercent || binding.plan?.matchThresholdPercent || 0 }}%
                        <template v-if="binding.customDifferenceThresholdPercent || binding.plan?.differenceThresholdPercent">
                          / 差异 {{ binding.customDifferenceThresholdPercent || binding.plan?.differenceThresholdPercent || 0 }}%
                        </template>
                      </div>
                    </div>
                    <div class="binding-actions">
                      <span :class="['soft-tag', binding.enabled ? 'is-success' : 'is-warning']">
                        {{ formatBooleanStatus(binding.enabled) }}
                      </span>
                      <el-button text @click="openEdit(binding)">编辑</el-button>
                      <el-button text type="primary" @click="triggerExecution(binding)">手动执行</el-button>
                    </div>
                  </div>
                </div>
                <div v-else class="overview-empty compact">当前监控模块还没有绑定巡检计划。</div>
              </article>
            </div>
          </article>
        </transition-group>
        <div v-else class="overview-empty">当前没有绑定关系。</div>
      </div>
    </el-card>

    <el-card shadow="never" class="panel-card">
      <template #header>
        <div class="section-heading">
          <div>
            <div class="section-title">绑定明细</div>
            <div class="section-subtitle">适合按表格快速核对门店、计划与监控模块的组合关系。</div>
          </div>
        </div>
      </template>

      <div class="panel-toolbar">
        <div class="panel-toolbar-main">
          <div class="panel-toolbar-title">先看绑定规模，再按表格核对组合关系</div>
          <div class="panel-toolbar-desc">这块更偏运营核对，所以把绑定总量、启用数和关联模块数先做摘要，再看门店、计划和监控模块的具体对应关系。</div>
          <div class="panel-chip-row">
            <span class="panel-chip">绑定总数 <strong>{{ pagination.total }}</strong></span>
            <span class="panel-chip">启用绑定 <strong>{{ enabledBindingCount }}</strong></span>
            <span class="panel-chip">涉及门店 <strong>{{ storeCards.length }}</strong></span>
            <span class="panel-chip">涉及模块 <strong>{{ streams.length }}</strong></span>
          </div>
        </div>
      </div>

      <div class="panel-table-area">
        <el-table :data="tableBindings" v-loading="loading" border>
          <el-table-column label="门店" min-width="150">
            <template #default="{ row }">{{ row.store?.name || "-" }}</template>
          </el-table-column>
          <el-table-column label="监控模块" min-width="160">
            <template #default="{ row }">{{ row.stream?.name || "-" }}</template>
          </el-table-column>
          <el-table-column label="巡检计划" min-width="180">
            <template #default="{ row }">{{ row.plan?.name || "-" }}</template>
          </el-table-column>
          <el-table-column label="计划类型" width="150">
            <template #default="{ row }">{{ formatPlanType(row.plan?.planType || "") }}</template>
          </el-table-column>
          <el-table-column prop="priority" label="优先级" width="90" />
          <el-table-column prop="customMatchThresholdPercent" label="匹配阈值" width="110" />
          <el-table-column prop="customDifferenceThresholdPercent" label="差异阈值" width="110" />
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <span :class="['soft-tag', row.enabled ? 'is-success' : 'is-warning']">
                {{ formatBooleanStatus(row.enabled) }}
              </span>
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

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑绑定' : '新增绑定'" width="640px">
      <el-form :model="form" label-width="120px">
        <el-form-item label="门店">
          <el-select v-model="form.storeId" filterable class="w-full" @change="handleStoreChange">
            <el-option v-for="store in stores" :key="store.id" :label="store.name" :value="store.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="巡检计划">
          <el-select v-model="form.planId" filterable class="w-full">
            <el-option v-for="plan in plans" :key="plan.id" :label="plan.name" :value="plan.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="监控模块">
          <el-select v-model="form.streamId" filterable class="w-full" placeholder="先选择门店，再选择监控模块">
            <el-option
              v-for="stream in filteredStreams"
              :key="stream.id"
              :label="stream.name"
              :value="stream.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="绑定优先级">
          <el-input-number v-model="form.priority" :min="0" :max="999" />
          <div class="table-helper">同一门店同一计划绑定多个监控模块时，优先级越高越先被命中。</div>
        </el-form-item>
        <el-form-item label="匹配阈值">
          <el-input-number v-model="form.customMatchThresholdPercent" :min="0" :max="100" />
        </el-form-item>
        <el-form-item label="差异阈值">
          <el-input-number v-model="form.customDifferenceThresholdPercent" :min="0" :max="100" />
        </el-form-item>
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
import { ElMessage, ElMessageBox } from "element-plus";
import { inspectionApi } from "@/api/inspection";
import { useAppStore } from "@/stores/app";
import type { BindingItem, Plan, StoreItem, StreamItem } from "@/types/inspection";
import { buildStoreTopology, formatBooleanStatus, formatPlanType, formatStoreStatus, getPlanDisplayName } from "@/utils/inspection";

const appStore = useAppStore();
const loading = ref(false);
const submitting = ref(false);
const dialogVisible = ref(false);
const editingId = ref<number | null>(null);
const bindings = ref<BindingItem[]>([]);
const tableBindings = ref<BindingItem[]>([]);
const stores = ref<StoreItem[]>([]);
const plans = ref<Plan[]>([]);
const streams = ref<StreamItem[]>([]);
const pagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0,
});

const storeCards = computed(() => buildStoreTopology(stores.value, streams.value, bindings.value));
const filteredStreams = computed(() =>
  streams.value.filter((stream) => !form.storeId || stream.storeId === form.storeId),
);
const enabledBindingCount = computed(() => tableBindings.value.filter((item) => item.enabled).length);

  const emptyForm = () => ({
  storeId: undefined as number | undefined,
  planId: undefined as number | undefined,
  streamId: undefined as number | undefined,
  priority: 100,
  customMatchThresholdPercent: 70,
  customDifferenceThresholdPercent: 8,
  enabled: true,
});
const form = reactive(emptyForm());

async function loadData() {
  loading.value = true;
  try {
    const [bindingResp, storeResp, streamResp, planResp, bindingTableResp] = await Promise.all([
      inspectionApi.getBindings({ all: true }),
      inspectionApi.getStores({ all: true }),
      inspectionApi.getStreams({ all: true }),
      inspectionApi.getPlans({ all: true }),
      inspectionApi.getBindings({
        page: pagination.page,
        pageSize: pagination.pageSize,
      }),
    ]);
    bindings.value = bindingResp.data.items;
    tableBindings.value = bindingTableResp.data.items;
    stores.value = storeResp.data.items;
    streams.value = streamResp.data.items;
    plans.value = planResp.data.items;
    pagination.total = bindingTableResp.data.total;
  } finally {
    loading.value = false;
  }
}

function handleStoreChange() {
  if (!filteredStreams.value.some((item) => item.id === form.streamId)) {
    form.streamId = undefined;
  }
}

function openCreate() {
  editingId.value = null;
  Object.assign(form, emptyForm());
  dialogVisible.value = true;
}

function openEdit(item: BindingItem) {
  editingId.value = item.id;
  Object.assign(form, {
    storeId: item.storeId,
    planId: item.planId,
    streamId: item.streamId,
    priority: item.priority ?? 100,
    customMatchThresholdPercent: item.customMatchThresholdPercent,
    customDifferenceThresholdPercent: item.customDifferenceThresholdPercent,
    enabled: item.enabled,
  });
  dialogVisible.value = true;
}

async function submit() {
  submitting.value = true;
  try {
    if (editingId.value) {
      await inspectionApi.updateBinding(editingId.value, form);
      ElMessage.success("绑定已更新");
    } else {
      await inspectionApi.createBinding(form);
      ElMessage.success("绑定已创建");
    }
    dialogVisible.value = false;
    await loadData();
  } finally {
    submitting.value = false;
  }
}

async function triggerExecution(item: BindingItem) {
  await ElMessageBox.confirm(
    `确定立即执行 ${item.store?.name || "该门店"} / ${item.stream?.name || "默认监控位"} / ${item.plan?.name || "当前计划"} 吗？`,
    "确认执行",
    { type: "warning" },
  );
  await inspectionApi.createManualExecution({
    storeId: item.storeId,
    planId: item.planId,
    triggerType: "admin_manual",
    triggerSource: "inspection-admin",
    operatorName: "后台操作",
  });
  ElMessage.success("已创建手动巡检任务");
}

onMounted(() => {
  appStore.setPageTitle("计划绑定");
  void loadData();
});
</script>

<style scoped>
.store-head,
.binding-item,
.binding-actions {
  display: flex;
  gap: 12px;
}

.store-head,
.binding-item {
  align-items: flex-start;
  justify-content: space-between;
}

.store-name,
.module-name,
.binding-plan {
  color: var(--oc-text);
  font-weight: 700;
}

.store-name {
  font-size: 20px;
}

.module-name,
.binding-plan {
  font-size: 16px;
}

.store-brief,
.binding-actions {
  flex-wrap: wrap;
}

.store-brief {
  display: flex;
  gap: 8px;
  margin: 14px 0 18px;
}

.binding-list {
  display: grid;
  gap: 12px;
  margin-top: 14px;
}

.binding-item {
  padding: 12px;
  border: 1px solid rgba(15, 56, 104, 0.08);
  border-radius: 14px;
  background: rgba(248, 251, 255, 0.92);
}

.binding-actions {
  display: flex;
  justify-content: flex-end;
  min-width: 180px;
}

.compact {
  padding: 16px;
}
</style>

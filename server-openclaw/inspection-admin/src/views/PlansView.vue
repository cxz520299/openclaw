<template>
  <div class="page-grid">
    <el-alert
      type="info"
      show-icon
      :closable="false"
      title="计划命中规则"
      description="计划名、计划别名和触发关键词都会参与命中。建议把业务常说的话术一起配进去，例如“实时检查计划、营业画面点检、计划二”，并保持一条计划只对应一种明确巡检意图。"
      class="plan-alert"
    />

    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span>巡检计划</span>
          <el-button type="primary" @click="openCreatePlan">新建计划</el-button>
        </div>
      </template>

        <el-table :data="plans" v-loading="loadingPlans" border @row-click="selectPlan">
          <el-table-column prop="name" label="计划名称" min-width="160" />
          <el-table-column prop="code" label="计划编码" width="160" />
          <el-table-column prop="aliasList" label="计划别名" min-width="220" show-overflow-tooltip />
          <el-table-column prop="triggerKeywords" label="触发关键词" min-width="220" show-overflow-tooltip />
          <el-table-column label="计划类型" width="170">
            <template #default="{ row }">{{ formatPlanType(row.planType) }}</template>
          </el-table-column>
          <el-table-column label="抽帧" width="110">
            <template #default="{ row }">{{ formatFramePickMode(row.framePickMode) }}</template>
          </el-table-column>
          <el-table-column prop="matchThresholdPercent" label="匹配阈值" width="110" />
          <el-table-column prop="enabled" label="状态" width="100">
            <template #default="{ row }">
              <span :class="['soft-tag', row.enabled ? 'is-success' : 'is-warning']">
                {{ formatBooleanStatus(row.enabled) }}
              </span>
            </template>
          </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button text @click.stop="openEditPlan(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span>点检项{{ selectedPlan ? ` · ${selectedPlan.name}` : "" }}</span>
          <el-button type="primary" :disabled="!selectedPlan" @click="openCreateItem">新增点检项</el-button>
        </div>
      </template>

        <el-table :data="planItems" v-loading="loadingItems" border empty-text="请选择左侧计划">
          <el-table-column label="类型" width="160">
            <template #default="{ row }">{{ formatClauseType(row.itemType) }}</template>
          </el-table-column>
          <el-table-column prop="content" label="内容" min-width="220" />
          <el-table-column prop="sortOrder" label="排序" width="90" />
          <el-table-column prop="required" label="必填" width="90">
            <template #default="{ row }">{{ row.required ? "是" : "否" }}</template>
          </el-table-column>
          <el-table-column prop="enabled" label="状态" width="100">
            <template #default="{ row }">
              <span :class="['soft-tag', row.enabled ? 'is-success' : 'is-warning']">
                {{ formatBooleanStatus(row.enabled) }}
              </span>
            </template>
          </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button text @click="openEditItem(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="planDialogVisible" :title="editingPlanId ? '编辑计划' : '新建计划'" width="620px">
      <el-form :model="planForm" label-width="120px">
        <el-form-item label="计划名称"><el-input v-model="planForm.name" /></el-form-item>
        <el-form-item label="计划编码"><el-input v-model="planForm.code" /></el-form-item>
        <el-form-item label="计划别名">
          <el-input
            v-model="planForm.aliasList"
            type="textarea"
            :rows="2"
            placeholder="多个别名请用逗号分隔，例如：实时检查计划,点检项巡检,计划二"
          />
        </el-form-item>
        <el-form-item label="触发关键词">
          <el-input
            v-model="planForm.triggerKeywords"
            type="textarea"
            :rows="2"
            placeholder="多个关键词请用逗号分隔，例如：巡检,营业画面,实时检查"
          />
        </el-form-item>
        <el-form-item label="计划类型">
          <el-select v-model="planForm.planType">
            <el-option label="计划二·文字点检" value="description_inspection" />
            <el-option label="计划一·基准图比对" value="baseline_compare" />
          </el-select>
        </el-form-item>
        <el-form-item label="抽帧方式">
          <el-select v-model="planForm.framePickMode">
            <el-option label="随机帧" value="random" />
            <el-option label="第一帧" value="first" />
          </el-select>
        </el-form-item>
        <el-form-item label="匹配阈值"><el-input-number v-model="planForm.matchThresholdPercent" :min="0" :max="100" /></el-form-item>
        <el-form-item label="差异阈值"><el-input-number v-model="planForm.differenceThresholdPercent" :min="0" :max="100" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="planForm.description" type="textarea" :rows="3" /></el-form-item>
        <el-form-item label="启用"><el-switch v-model="planForm.enabled" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="planDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submittingPlan" @click="submitPlan">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="itemDialogVisible" :title="editingItemId ? '编辑点检项' : '新增点检项'" width="620px">
      <el-form :model="itemForm" label-width="120px">
        <el-form-item label="类型">
          <el-select v-model="itemForm.itemType">
            <el-option label="场景预期" value="scene_expectation" />
            <el-option label="必须出现" value="must_have" />
            <el-option label="禁止出现" value="must_not_have" />
            <el-option label="通用描述" value="generic" />
          </el-select>
        </el-form-item>
        <el-form-item label="内容"><el-input v-model="itemForm.content" type="textarea" :rows="3" /></el-form-item>
        <el-form-item label="排序"><el-input-number v-model="itemForm.sortOrder" :min="1" :max="999" /></el-form-item>
        <el-form-item label="必选"><el-switch v-model="itemForm.required" /></el-form-item>
        <el-form-item label="启用"><el-switch v-model="itemForm.enabled" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="itemDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submittingItem" @click="submitItem">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { inspectionApi } from "@/api/inspection";
import { useAppStore } from "@/stores/app";
import type { Plan, PlanItem } from "@/types/inspection";
import { formatBooleanStatus, formatClauseType, formatFramePickMode, formatPlanType } from "@/utils/inspection";

const appStore = useAppStore();
const loadingPlans = ref(false);
const loadingItems = ref(false);
const submittingPlan = ref(false);
const submittingItem = ref(false);
const plans = ref<Plan[]>([]);
const planItems = ref<PlanItem[]>([]);
const selectedPlan = ref<Plan | null>(null);

const planDialogVisible = ref(false);
const itemDialogVisible = ref(false);
const editingPlanId = ref<number | null>(null);
const editingItemId = ref<number | null>(null);

const emptyPlanForm = () => ({
  name: "",
  code: "",
  aliasList: "",
  triggerKeywords: "",
  planType: "description_inspection",
  description: "",
  framePickMode: "random",
  matchThresholdPercent: 70,
  differenceThresholdPercent: 8,
  enabled: true,
});
const planForm = reactive(emptyPlanForm());

const emptyItemForm = () => ({
  itemType: "scene_expectation",
  content: "",
  sortOrder: 10,
  required: true,
  enabled: true,
});
const itemForm = reactive(emptyItemForm());

async function loadPlans() {
  loadingPlans.value = true;
  try {
    const response = await inspectionApi.getPlans();
    plans.value = response.data;
    if (!selectedPlan.value && plans.value.length > 0) {
      await selectPlan(plans.value[0]);
    }
  } finally {
    loadingPlans.value = false;
  }
}

async function selectPlan(plan: Plan) {
  selectedPlan.value = plan;
  loadingItems.value = true;
  try {
    const response = await inspectionApi.getPlanItems(plan.id);
    planItems.value = response.data;
  } finally {
    loadingItems.value = false;
  }
}

function openCreatePlan() {
  editingPlanId.value = null;
  Object.assign(planForm, emptyPlanForm());
  planDialogVisible.value = true;
}

function openEditPlan(plan: Plan) {
  editingPlanId.value = plan.id;
  Object.assign(planForm, plan);
  planDialogVisible.value = true;
}

function openCreateItem() {
  editingItemId.value = null;
  Object.assign(itemForm, emptyItemForm());
  itemDialogVisible.value = true;
}

function openEditItem(item: PlanItem) {
  editingItemId.value = item.id;
  Object.assign(itemForm, item);
  itemDialogVisible.value = true;
}

async function submitPlan() {
  submittingPlan.value = true;
  try {
    if (editingPlanId.value) {
      await inspectionApi.updatePlan(editingPlanId.value, planForm);
      ElMessage.success("计划已更新");
    } else {
      await inspectionApi.createPlan(planForm);
      ElMessage.success("计划已创建");
    }
    planDialogVisible.value = false;
    await loadPlans();
  } finally {
    submittingPlan.value = false;
  }
}

async function submitItem() {
  if (!selectedPlan.value) {
    return;
  }
  submittingItem.value = true;
  try {
    if (editingItemId.value) {
      await inspectionApi.updatePlanItem(editingItemId.value, itemForm);
      ElMessage.success("点检项已更新");
    } else {
      await inspectionApi.createPlanItem(selectedPlan.value.id, itemForm);
      ElMessage.success("点检项已创建");
    }
    itemDialogVisible.value = false;
    await selectPlan(selectedPlan.value);
  } finally {
    submittingItem.value = false;
  }
}

onMounted(() => {
  appStore.setPageTitle("巡检计划管理");
  void loadPlans();
});
</script>

<style scoped>
.page-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: 1.2fr 1fr;
}

.plan-alert {
  grid-column: 1 / -1;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

@media (max-width: 1200px) {
  .page-grid {
    grid-template-columns: 1fr;
  }
}
</style>

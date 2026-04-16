<template>
  <div class="inspection-page">
    <section class="metric-grid">
      <article class="metric-card">
        <div class="metric-label">门店总数</div>
        <div class="metric-value">{{ stores.length }}</div>
        <div class="metric-footnote">后台当前已创建门店</div>
      </article>
      <article class="metric-card">
        <div class="metric-label">启用门店</div>
        <div class="metric-value">{{ enabledCount }}</div>
        <div class="metric-footnote">可参与巡检任务匹配</div>
      </article>
      <article class="metric-card">
        <div class="metric-label">负责人已配置</div>
        <div class="metric-value">{{ assignedManagerCount }}</div>
        <div class="metric-footnote">企业微信提醒更容易闭环</div>
      </article>
    </section>

    <el-card shadow="never" class="panel-card">
      <template #header>
        <div class="section-heading">
          <div>
            <div class="section-title">门店管理</div>
            <div class="section-subtitle">门店是巡检任务的业务主体，后续会继续挂接多个监控模块和不同巡检计划。</div>
          </div>
          <div class="store-actions">
            <el-button :loading="bossLoading" @click="loadBossStores">获取 Boss 门店</el-button>
            <el-button type="primary" @click="openCreate">新建门店</el-button>
          </div>
        </div>
      </template>

      <el-table :data="stores" v-loading="loading" border>
        <el-table-column prop="name" label="门店名称" min-width="180" />
        <el-table-column prop="code" label="门店编码" width="180" />
        <el-table-column prop="aliasList" label="门店别名" min-width="220" show-overflow-tooltip />
        <el-table-column prop="region" label="区域" width="140" />
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <span :class="['soft-tag', row.status === 'enabled' ? 'is-success' : 'is-warning']">
              {{ formatStoreStatus(row.status) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="managerName" label="负责人" width="140" />
        <el-table-column prop="managerWecomUserId" label="负责人企微 ID" min-width="180" />
        <el-table-column prop="remark" label="备注" min-width="220" />
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button text @click="openEdit(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card shadow="never" class="panel-card">
      <template #header>
        <div class="section-heading">
          <div>
            <div class="section-title">Boss 门店列表</div>
            <div class="section-subtitle">通过后端代理调用 boss 接口 `getSimpleDepartmentsTree` 的结果。</div>
          </div>
          <span class="soft-tag">{{ bossStores.length }} 条</span>
        </div>
      </template>

        <el-table :data="bossStores" v-loading="bossLoading" border>
          <el-table-column prop="text" label="门店名称" min-width="240" />
          <el-table-column prop="shopId" label="shopId" width="140" />
          <el-table-column prop="id" label="节点 ID" width="140" />
        <el-table-column label="开店状态" width="120">
          <template #default="{ row }">
            <span :class="['soft-tag', row.openStatus === 1 ? 'is-success' : 'is-warning']">
              {{ row.openStatus === 1 ? "营业中" : "闭店" }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="deviceCount" label="设备数" width="100" />
          <el-table-column label="经纬度" min-width="220">
            <template #default="{ row }">
              {{ row.attributes?.longitude ?? "-" }}, {{ row.attributes?.latitude ?? "-" }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="140" fixed="right">
            <template #default="{ row }">
              <el-button text type="primary" @click="goToStreams(row)">去监控模块</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑门店' : '新建门店'" width="560px">
      <el-form :model="form" label-width="110px">
        <el-form-item label="门店名称"><el-input v-model="form.name" placeholder="例如：成都小智零食有鸣" /></el-form-item>
        <el-form-item label="门店编码"><el-input v-model="form.code" placeholder="建议使用业务编码" /></el-form-item>
        <el-form-item label="门店别名">
          <el-input
            v-model="form.aliasList"
            type="textarea"
            :rows="2"
            placeholder="多个别名请用逗号分隔，例如：成都逮虾户零食有鸣,成都零食有鸣"
          />
        </el-form-item>
        <el-form-item label="区域"><el-input v-model="form.region" placeholder="例如：成都" /></el-form-item>
        <el-form-item label="状态">
          <el-select v-model="form.status" class="w-full">
            <el-option label="启用" value="enabled" />
            <el-option label="停用" value="disabled" />
          </el-select>
        </el-form-item>
        <el-form-item label="负责人"><el-input v-model="form.managerName" placeholder="例如：巡检负责人" /></el-form-item>
        <el-form-item label="企微用户 ID">
          <el-input v-model="form.managerWecomUserId" placeholder="用于后续@负责人提醒" />
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="form.remark" type="textarea" :rows="3" /></el-form-item>
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
import { useRouter } from "vue-router";
import { inspectionApi } from "@/api/inspection";
import { useAppStore } from "@/stores/app";
import type { BossDepartmentItem, StoreItem } from "@/types/inspection";
import { formatStoreStatus } from "@/utils/inspection";

const appStore = useAppStore();
const router = useRouter();
const loading = ref(false);
const submitting = ref(false);
const bossLoading = ref(false);
const dialogVisible = ref(false);
const editingId = ref<number | null>(null);
const stores = ref<StoreItem[]>([]);
const bossStores = ref<BossDepartmentItem[]>([]);

const enabledCount = computed(() => stores.value.filter((item) => item.status === "enabled").length);
const assignedManagerCount = computed(() => stores.value.filter((item) => item.managerWecomUserId).length);

const emptyForm = () => ({
  name: "",
  code: "",
  aliasList: "",
  region: "",
  status: "enabled",
  managerName: "",
  managerWecomUserId: "",
  remark: "",
});

const form = reactive(emptyForm());

async function loadData() {
  loading.value = true;
  try {
    const response = await inspectionApi.getStores();
    stores.value = response.data;
  } finally {
    loading.value = false;
  }
}

async function loadBossStores() {
  bossLoading.value = true;
  try {
    const response = await inspectionApi.getBossDepartmentsTree();
    const filteredStores = response.data.filter((item) => item.text.includes("成都市锦江区")).slice(0, 2);
    bossStores.value = filteredStores;
    ElMessage.success(`已筛出 ${filteredStores.length} 条成都市锦江区 Boss 门店`);
  } catch (error: any) {
    bossStores.value = [];
    const message = error?.response?.data?.message || error?.message || "获取 Boss 门店失败";
    ElMessage.error(message);
  } finally {
    bossLoading.value = false;
  }
}

function goToStreams(item: BossDepartmentItem) {
  const deptId = item.id.startsWith("S_") ? item.id.slice(2) : item.id;
  void router.push({
    name: "streams",
    query: {
      bossStoreName: item.text,
      bossShopId: item.shopId,
      bossNodeId: item.id,
      bossDeptId: deptId,
    },
  });
}

function openCreate() {
  editingId.value = null;
  Object.assign(form, emptyForm());
  dialogVisible.value = true;
}

function openEdit(item: StoreItem) {
  editingId.value = item.id;
  Object.assign(form, item);
  dialogVisible.value = true;
}

async function submit() {
  submitting.value = true;
  try {
    if (editingId.value) {
      await inspectionApi.updateStore(editingId.value, form);
      ElMessage.success("门店已更新");
    } else {
      await inspectionApi.createStore(form);
      ElMessage.success("门店已创建");
    }
    dialogVisible.value = false;
    await loadData();
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  appStore.setPageTitle("门店管理");
  void loadData();
});
</script>

<style scoped>
.store-actions {
  display: flex;
  gap: 12px;
}
</style>

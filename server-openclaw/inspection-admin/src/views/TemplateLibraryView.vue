<template>
  <div class="page-grid">
    <el-card shadow="never" class="full-span">
      <el-alert
        title="已将实时检查模板沉淀为后台模板库，并为默认门店生成“成都小智零食有鸣-实时检查计划”"
        type="success"
        show-icon
        :closable="false"
      />
    </el-card>

    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span>点检分类</span>
          <el-tag type="info">{{ categories.length }} 个分类</el-tag>
        </div>
      </template>

        <el-table :data="categories" v-loading="loadingCategories" border @row-click="selectCategory">
          <el-table-column prop="name" label="分类" min-width="180" />
          <el-table-column prop="itemCount" label="点检项数" width="100" />
          <el-table-column prop="enabled" label="状态" width="100">
            <template #default="{ row }">
              <span :class="['soft-tag', row.enabled ? 'is-success' : 'is-warning']">
                {{ formatBooleanStatus(row.enabled) }}
              </span>
            </template>
          </el-table-column>
        </el-table>
    </el-card>

    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <div>
            <div class="section-title">模板明细</div>
            <div class="section-subtitle">
              {{ selectedCategory ? `${selectedCategory.name} · ${selectedCategory.description}` : "请选择左侧分类" }}
            </div>
          </div>
          <el-tag v-if="selectedCategory" type="primary">{{ items.length }} 条</el-tag>
        </div>
      </template>

      <div v-loading="loadingItems" class="item-stack">
        <el-empty v-if="!selectedCategory" description="请选择左侧分类查看点检项" />
        <template v-else>
          <article v-for="item in items" :key="item.id" class="item-card">
            <div class="item-top">
              <div>
                <div class="item-name">{{ item.name }}</div>
                <div class="item-code">{{ item.code }}</div>
              </div>
              <div class="item-tags">
                <el-tag type="primary">建议类型 {{ formatClauseType(item.recommendedItemType) }}</el-tag>
                <el-tag type="success">标准分 {{ item.standardScore }}</el-tag>
                <el-tag type="warning">时效 {{ item.validHours }} 小时</el-tag>
              </div>
            </div>

            <div class="item-block">
              <div class="block-label">AI 巡检提示词</div>
              <div class="block-value">{{ item.promptText }}</div>
            </div>

            <div class="item-block">
              <div class="block-label">执行标准</div>
              <ul class="detail-list">
                <li v-for="line in splitStandardText(item.standardText)" :key="line">{{ line }}</li>
              </ul>
            </div>
          </article>
        </template>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { inspectionApi } from "@/api/inspection";
import { useAppStore } from "@/stores/app";
import type { TemplateCategory, TemplateItem } from "@/types/inspection";
import { formatBooleanStatus, formatClauseType } from "@/utils/inspection";

const appStore = useAppStore();
const loadingCategories = ref(false);
const loadingItems = ref(false);
const categories = ref<TemplateCategory[]>([]);
const items = ref<TemplateItem[]>([]);
const selectedCategory = ref<TemplateCategory | null>(null);

function splitStandardText(standardText: string) {
  return standardText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

async function loadCategories() {
  loadingCategories.value = true;
  try {
    const response = await inspectionApi.getTemplateCategories();
    categories.value = response.data;
    if (!selectedCategory.value && categories.value.length > 0) {
      await selectCategory(categories.value[0]);
    }
  } catch (error) {
    ElMessage.error(`模板分类加载失败：${String(error)}`);
  } finally {
    loadingCategories.value = false;
  }
}

async function selectCategory(category: TemplateCategory) {
  selectedCategory.value = category;
  loadingItems.value = true;
  try {
    const response = await inspectionApi.getTemplateItems(category.id);
    items.value = response.data;
  } catch (error) {
    ElMessage.error(`模板明细加载失败：${String(error)}`);
  } finally {
    loadingItems.value = false;
  }
}

onMounted(() => {
  appStore.setPageTitle("点检模板库");
  void loadCategories();
});
</script>

<style scoped>
.page-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: 320px minmax(0, 1fr);
}

.full-span {
  grid-column: 1 / -1;
}

.card-header,
.item-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.section-title {
  font-size: 16px;
  font-weight: 700;
}

.section-subtitle,
.item-code,
.block-label {
  color: #6b7280;
  font-size: 13px;
}

.item-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 320px;
}

.item-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
  background: #fff;
}

.item-name {
  font-size: 16px;
  font-weight: 700;
  color: #111827;
}

.item-tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.item-block + .item-block {
  margin-top: 12px;
}

.block-label {
  margin-bottom: 6px;
}

.block-value {
  line-height: 1.7;
  color: #1f2937;
}

.detail-list {
  margin: 0;
  padding-left: 18px;
  color: #1f2937;
  line-height: 1.7;
}

@media (max-width: 1200px) {
  .page-grid {
    grid-template-columns: 1fr;
  }
}
</style>

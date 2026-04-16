<template>
  <div class="page-grid">
    <el-card shadow="never" class="panel-card full-span">
      <el-alert
        title="已将实时检查模板沉淀为后台模板库，并为默认门店生成“成都小智零食有鸣-实时检查计划”"
        type="success"
        show-icon
        :closable="false"
      />
    </el-card>

    <el-card shadow="never" class="panel-card">
      <template #header>
        <div class="card-header">
          <span>点检分类</span>
          <el-tag type="info">{{ categoryPagination.total }} 个分类</el-tag>
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

        <div class="table-pagination">
          <el-pagination
            v-model:current-page="categoryPagination.page"
            v-model:page-size="categoryPagination.pageSize"
            background
            layout="total, sizes, prev, pager, next"
            :page-sizes="[10, 20, 50]"
            :total="categoryPagination.total"
            @change="loadCategories"
          />
        </div>
    </el-card>

    <el-card shadow="never" class="panel-card">
      <template #header>
        <div class="card-header">
          <div>
            <div class="section-title">模板明细</div>
            <div class="section-subtitle">
              {{ selectedCategory ? `${selectedCategory.name} · ${selectedCategory.description}` : "请选择左侧分类" }}
            </div>
          </div>
          <el-tag v-if="selectedCategory" type="primary">{{ itemPagination.total }} 条</el-tag>
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

      <div v-if="selectedCategory" class="table-pagination">
        <el-pagination
          v-model:current-page="itemPagination.page"
          v-model:page-size="itemPagination.pageSize"
          background
          layout="total, sizes, prev, pager, next"
          :page-sizes="[10, 20, 50]"
          :total="itemPagination.total"
          @change="reloadCategoryItems"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
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
const categoryPagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0,
});
const itemPagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0,
});

function splitStandardText(standardText: string) {
  return standardText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

async function loadCategories() {
  loadingCategories.value = true;
  try {
    const response = await inspectionApi.getTemplateCategories({
      page: categoryPagination.page,
      pageSize: categoryPagination.pageSize,
    });
    categories.value = response.data.items;
    categoryPagination.total = response.data.total;
    if (!selectedCategory.value && categories.value.length > 0) {
      await selectCategory(categories.value[0]);
    }
    if (selectedCategory.value && !categories.value.some((item) => item.id === selectedCategory.value?.id) && categories.value.length > 0) {
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
  itemPagination.page = 1;
  await reloadCategoryItems();
}

async function reloadCategoryItems() {
  if (!selectedCategory.value) {
    items.value = [];
    itemPagination.total = 0;
    return;
  }
  loadingItems.value = true;
  try {
    const response = await inspectionApi.getTemplateItems({
      categoryId: selectedCategory.value.id,
      page: itemPagination.page,
      pageSize: itemPagination.pageSize,
    });
    items.value = response.data.items;
    itemPagination.total = response.data.total;
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
  gap: 18px;
  grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
}

.full-span {
  grid-column: 1 / -1;
}

.card-header,
.item-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.card-header > *,
.item-top > * {
  min-width: 0;
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
  word-break: break-word;
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

@media (max-width: 768px) {
  .card-header,
  .item-top {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>

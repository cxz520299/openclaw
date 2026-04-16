<template>
  <el-container class="app-shell">
    <el-aside width="288px" class="app-aside app-aside--desktop">
      <div class="aside-stack">
        <div class="brand-card">
          <div class="brand-kicker">OpenClaw Ops</div>
          <div class="brand-title">门店智能巡检后台</div>
          <div class="brand-description">把门店、监控模块、巡检计划和执行结果放到同一套可运营视图里。</div>
        </div>

        <el-menu :default-active="activeMenu" class="menu" router>
          <section v-for="section in menuSections" :key="section.label" class="nav-section">
            <div class="nav-section-title">{{ section.label }}</div>
            <el-menu-item v-for="item in section.items" :key="item.path" :index="item.path">
              <div class="menu-item-shell">
                <span class="menu-item-code">{{ item.code }}</span>
                <div class="menu-item-copy">
                  <span class="menu-item-label">{{ item.label }}</span>
                  <span class="menu-item-hint">{{ item.hint }}</span>
                </div>
              </div>
            </el-menu-item>
          </section>
        </el-menu>

        <div class="aside-footer">
          <div class="aside-footer-label">当前视图</div>
          <div class="aside-footer-value">{{ appStore.pageTitle }}</div>
          <div class="aside-footer-description">巡检任务、命中规则和企业微信联动都从这里统一运营。</div>
        </div>
      </div>
    </el-aside>

    <el-container class="app-shell-main">
      <div class="mobile-bar panel-card">
        <button type="button" class="mobile-nav-trigger" @click="mobileNavVisible = true">导航</button>
        <div class="mobile-bar-copy">
          <div class="mobile-bar-kicker">OpenClaw Inspection</div>
          <div class="mobile-bar-title">{{ appStore.pageTitle }}</div>
        </div>
        <div class="mobile-bar-tags">
          <span class="soft-tag is-primary">企微联动</span>
          <span class="soft-tag is-success">服务在线</span>
        </div>
      </div>

      <el-main class="app-main">
        <section :class="['app-header', 'panel-card', { 'app-header--compact': !isDashboard }]">
          <div class="app-header-orb app-header-orb--primary" />
          <div class="app-header-orb app-header-orb--secondary" />

          <div class="app-header-main">
            <div class="header-topline">
              <div class="header-kicker">{{ headerMeta.kicker }}</div>
              <span class="header-inline-tag">{{ headerMeta.tag }}</span>
            </div>

            <div class="header-content-row">
              <div class="header-copy">
                <div class="header-title">{{ appStore.pageTitle }}</div>
                <div class="header-description">{{ headerMeta.description }}</div>
              </div>
              <div class="header-status">
                <span class="soft-tag is-primary">企业微信已接入</span>
                <span class="soft-tag is-success">巡检后台在线</span>
              </div>
            </div>
          </div>
        </section>

        <router-view v-slot="{ Component }">
          <transition name="fade-slide" mode="out-in" appear>
            <component :is="Component" />
          </transition>
        </router-view>
      </el-main>
    </el-container>
  </el-container>

  <el-drawer v-model="mobileNavVisible" direction="ltr" size="min(88vw, 360px)" class="mobile-nav-drawer">
    <template #header>
      <div class="drawer-brand">
        <div class="brand-kicker">OpenClaw Ops</div>
        <div class="drawer-title">门店智能巡检后台</div>
      </div>
    </template>

    <div class="drawer-body">
      <el-menu :default-active="activeMenu" class="menu menu--drawer" router @select="mobileNavVisible = false">
        <section v-for="section in menuSections" :key="section.label" class="nav-section nav-section--drawer">
          <div class="nav-section-title nav-section-title--drawer">{{ section.label }}</div>
          <el-menu-item v-for="item in section.items" :key="item.path" :index="item.path">
            <div class="menu-item-shell">
              <span class="menu-item-code">{{ item.code }}</span>
              <div class="menu-item-copy">
                <span class="menu-item-label">{{ item.label }}</span>
                <span class="menu-item-hint">{{ item.hint }}</span>
              </div>
            </div>
          </el-menu-item>
        </section>
      </el-menu>

      <div class="drawer-footer">
        <span class="soft-tag is-primary">当前视图</span>
        <div class="drawer-footer-title">{{ appStore.pageTitle }}</div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useAppStore } from "@/stores/app";

const route = useRoute();
const appStore = useAppStore();
const mobileNavVisible = ref(false);

const menuSections = [
  {
    label: "总览入口",
    items: [{ path: "/", label: "巡检总览", hint: "看全局状态和门店拓扑", code: "01" }],
  },
  {
    label: "配置中心",
    items: [
      { path: "/stores", label: "门店管理", hint: "维护门店和负责人", code: "02" },
      { path: "/streams", label: "监控模块", hint: "配置流地址和点位", code: "03" },
      { path: "/template-library", label: "点检模板库", hint: "沉淀模板与标准", code: "04" },
      { path: "/plans", label: "巡检计划", hint: "编排计划和点检项", code: "05" },
      { path: "/bindings", label: "计划绑定", hint: "绑定门店与监控", code: "06" },
    ],
  },
  {
    label: "执行与分析",
    items: [
      { path: "/jobs", label: "执行记录", hint: "查看结果和异常", code: "07" },
      { path: "/batch-center", label: "批量任务中心", hint: "管理批次和重试", code: "08" },
      { path: "/match-logs", label: "命中日志", hint: "排查命中链路", code: "09" },
    ],
  },
];

const activeMenu = computed(() => route.path);
const pageMetaMap: Record<string, { kicker: string; tag: string; description: string }> = {
  "/": {
    kicker: "巡检运营中心",
    tag: "总览视图",
    description: "自动适配大屏、办公本和平板视图，让业务在任何分辨率下都能稳定看清巡检状态和执行结果。",
  },
  "/stores": {
    kicker: "巡检配置台",
    tag: "门店主数据",
    description: "集中维护门店名称、别名、负责人和命中入口，让对话触发和后台配置保持一致。",
  },
  "/streams": {
    kicker: "巡检配置台",
    tag: "监控模块",
    description: "把门店下的多个监控点位统一收口，减少流地址、基准图和场景绑定时的视觉负担。",
  },
  "/template-library": {
    kicker: "巡检知识库",
    tag: "模板沉淀",
    description: "把常用点检分类和执行标准沉淀成模板库，方便业务快速复用和组合巡检计划。",
  },
  "/plans": {
    kicker: "巡检配置台",
    tag: "计划编排",
    description: "围绕计划、关键词和点检项做统一编排，让聊天入口命中更稳，业务也更容易理解。",
  },
  "/bindings": {
    kicker: "巡检配置台",
    tag: "绑定关系",
    description: "把门店、监控模块和巡检计划之间的映射关系清晰展示，避免执行链路跑偏。",
  },
  "/jobs": {
    kicker: "巡检执行台",
    tag: "结果追踪",
    description: "按任务查看巡检执行状态、回传结果和异常原因，帮助业务快速追踪每次执行闭环。",
  },
  "/batch-center": {
    kicker: "巡检执行台",
    tag: "批量任务",
    description: "统一查看批量巡检进度、失败重试和范围执行状态，让多人多店的巡检更可控。",
  },
  "/match-logs": {
    kicker: "巡检运营中心",
    tag: "命中分析",
    description: "聚焦机器人对话里的门店与计划命中过程，帮助排查为什么命中成功、为什么会跑偏。",
  },
};

const isDashboard = computed(() => route.path === "/");
const headerMeta = computed(
  () =>
    pageMetaMap[route.path] ?? {
      kicker: "巡检运营中心",
      tag: "当前页面",
      description: "围绕门店巡检的配置、执行和回传结果做统一运营，让业务操作更顺手。",
    },
);

watch(
  () => route.fullPath,
  () => {
    mobileNavVisible.value = false;
  },
);
</script>

<style scoped>
.app-shell {
  min-height: 100vh;
  background: transparent;
}

.app-shell-main {
  min-width: 0;
}

.app-aside {
  position: sticky;
  top: 0;
  height: 100vh;
  padding: 18px 14px;
  overflow: hidden;
  background:
    radial-gradient(circle at top right, rgba(79, 172, 254, 0.24), transparent 24%),
    linear-gradient(180deg, #0b1e37 0%, #102b4c 100%);
  color: #fff;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
}

.aside-stack {
  display: flex;
  flex-direction: column;
  gap: 18px;
  height: 100%;
}

.brand-card {
  margin: 10px 8px 0;
  padding: 20px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(18px);
}

.brand-kicker,
.header-kicker,
.aside-footer-label,
.mobile-bar-kicker {
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.brand-kicker,
.aside-footer-label,
.mobile-bar-kicker {
  color: rgba(255, 255, 255, 0.62);
}

.header-kicker {
  color: #6a7f9d;
}

.brand-title,
.header-title,
.aside-footer-value,
.mobile-bar-title,
.drawer-title {
  margin-top: 10px;
  font-weight: 700;
  line-height: 1.25;
  word-break: break-word;
}

.brand-title,
.header-title {
  font-size: clamp(28px, 2.6vw, 34px);
}

.mobile-bar-title,
.drawer-title {
  font-size: 20px;
}

.brand-description,
.header-description,
.aside-footer-description {
  margin-top: 12px;
  line-height: 1.7;
  font-size: 13px;
}

.brand-description,
.aside-footer-description {
  color: rgba(255, 255, 255, 0.72);
}

.header-description {
  color: var(--oc-text-soft);
}

.menu {
  flex: 1;
  border-right: none;
  background: transparent;
  padding: 0 0 6px;
}

.nav-section {
  display: grid;
  gap: 6px;
  padding: 0 6px;
}

.nav-section + .nav-section {
  margin-top: 10px;
}

.nav-section-title {
  margin: 0 10px;
  padding-top: 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: rgba(255, 255, 255, 0.42);
}

.nav-section-title--drawer {
  color: rgba(16, 35, 63, 0.45);
}

.menu-item-shell {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
  min-width: 0;
}

.menu-item-code {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.menu-item-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.menu-item-label {
  font-size: 14px;
  font-weight: 700;
}

.menu-item-hint {
  font-size: 12px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.56);
  white-space: normal;
}

:deep(.el-menu-item) {
  height: auto;
  min-height: 62px;
  margin: 0;
  padding-top: 12px;
  padding-bottom: 12px;
  border-radius: 18px;
  color: rgba(255, 255, 255, 0.74);
  line-height: 1.45;
  white-space: normal;
}

:deep(.el-menu-item:hover) {
  color: #fff;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(79, 172, 254, 0.08));
}

:deep(.el-menu-item.is-active) {
  color: #fff;
  background: linear-gradient(135deg, rgba(79, 172, 254, 0.22), rgba(22, 84, 154, 0.18));
  box-shadow:
    inset 0 0 0 1px rgba(79, 172, 254, 0.24),
    0 10px 24px rgba(12, 33, 59, 0.12);
}

:deep(.el-menu-item.is-active .menu-item-code) {
  color: #fff;
  background: rgba(255, 255, 255, 0.14);
}

:deep(.el-menu-item.is-active .menu-item-hint),
:deep(.el-menu-item:hover .menu-item-hint) {
  color: rgba(255, 255, 255, 0.82);
}

.aside-footer {
  margin: auto 8px 6px;
  padding: 16px 18px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.aside-footer-value {
  font-size: 18px;
}

.app-main {
  display: grid;
  gap: 16px;
  width: min(100%, var(--oc-shell-max-width));
  margin: 0 auto;
  padding: clamp(18px, 2vw, 32px);
}

.app-header {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: stretch;
  justify-content: flex-start;
  gap: 18px;
  padding: 24px 28px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(248, 251, 255, 0.92)),
    radial-gradient(circle at top right, rgba(31, 111, 235, 0.12), transparent 32%);
  isolation: isolate;
}

.app-header--compact {
  padding: 18px 22px;
}

.app-header-orb {
  position: absolute;
  border-radius: 999px;
  pointer-events: none;
  filter: blur(2px);
  opacity: 0.7;
  z-index: 0;
}

.app-header-orb--primary {
  top: -56px;
  right: -24px;
  width: 180px;
  height: 180px;
  background: radial-gradient(circle, rgba(31, 111, 235, 0.14), transparent 70%);
}

.app-header-orb--secondary {
  bottom: -72px;
  left: 18%;
  width: 220px;
  height: 220px;
  background: radial-gradient(circle, rgba(15, 159, 110, 0.08), transparent 72%);
}

.app-header-main {
  position: relative;
  z-index: 1;
  min-width: 0;
  display: grid;
  gap: 14px;
  width: 100%;
}

.header-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.header-title {
  color: #10233f;
}

.header-content-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.header-copy {
  min-width: 0;
  display: grid;
  gap: 10px;
}

.app-header--compact .header-title {
  font-size: clamp(28px, 2.8vw, 40px);
  line-height: 1.08;
}

.app-header--compact .header-description {
  max-width: 72ch;
}

.header-status {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
  align-self: flex-start;
}

.header-inline-tag {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  color: #2f5f9e;
  background: rgba(31, 111, 235, 0.1);
  border: 1px solid rgba(31, 111, 235, 0.12);
}

.mobile-bar {
  display: none;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  width: min(calc(100% - 32px), var(--oc-shell-max-width));
  margin: 16px auto 0;
  padding: 14px 16px;
}

.mobile-bar-copy {
  min-width: 0;
  flex: 1;
}

.mobile-bar-tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.mobile-nav-trigger {
  border: none;
  border-radius: 12px;
  padding: 10px 14px;
  font-weight: 700;
  color: #fff;
  cursor: pointer;
  background: linear-gradient(135deg, #1358b5, #1f6feb);
  box-shadow: 0 10px 24px rgba(31, 111, 235, 0.22);
  transition:
    transform 200ms var(--oc-ease-out),
    box-shadow 200ms var(--oc-ease-out);
}

.mobile-nav-trigger:hover {
  transform: translateY(-1px);
  box-shadow: 0 14px 28px rgba(31, 111, 235, 0.28);
}

.drawer-brand {
  min-width: 0;
}

.drawer-body {
  display: grid;
  gap: 18px;
  min-height: 100%;
}

.menu--drawer {
  flex: none;
}

.menu--drawer .menu-item-code {
  color: #2f5f9e;
  background: rgba(31, 111, 235, 0.1);
  border-color: rgba(31, 111, 235, 0.12);
}

.menu--drawer .menu-item-hint {
  color: rgba(16, 35, 63, 0.55);
}

.drawer-footer {
  padding: 14px 16px;
  border-radius: 18px;
  background: rgba(31, 111, 235, 0.08);
}

.drawer-footer-title {
  margin-top: 10px;
  font-size: 18px;
  font-weight: 700;
  color: var(--oc-text);
}

@media (max-width: 1320px) {
  .app-aside--desktop {
    display: none;
  }

  .mobile-bar {
    display: flex;
  }

  .app-main {
    padding-top: 16px;
  }
}

@media (max-width: 960px) {
  .app-header,
  .mobile-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .header-topline,
  .header-content-row {
    flex-direction: column;
    align-items: stretch;
  }

  .header-status,
  .mobile-bar-tags {
    justify-content: flex-start;
  }
}

@media (max-width: 768px) {
  .mobile-bar {
    width: calc(100% - 20px);
    margin-top: 10px;
    padding: 14px;
  }

  .mobile-nav-trigger {
    width: 100%;
  }

  .app-main {
    padding: 14px 10px 18px;
  }

  .app-header,
  .app-header--compact {
    padding: 16px 16px 18px;
  }

  .brand-title,
  .header-title {
    font-size: 24px;
  }
}
</style>

<template>
  <router-view v-if="isBlankLayout" />

  <el-container v-else class="app-shell">
    <el-aside width="260px" class="app-aside">
      <div class="brand-card">
        <div class="brand-kicker">OpenClaw Ops</div>
        <div class="brand-title">门店智能巡检后台</div>
        <div class="brand-description">把门店、监控模块、巡检计划和执行结果放到同一套可运营视图里。</div>
      </div>

      <el-menu :default-active="activeMenu" class="menu" router>
        <el-menu-item index="/">
          <span>巡检总览</span>
        </el-menu-item>
        <el-menu-item index="/stores">
          <span>门店管理</span>
        </el-menu-item>
        <el-menu-item index="/streams">
          <span>监控模块</span>
        </el-menu-item>
        <el-menu-item index="/template-library">
          <span>点检模板库</span>
        </el-menu-item>
        <el-menu-item index="/plans">
          <span>巡检计划</span>
        </el-menu-item>
        <el-menu-item index="/bindings">
          <span>计划绑定</span>
        </el-menu-item>
        <el-menu-item index="/jobs">
          <span>执行记录</span>
        </el-menu-item>
      </el-menu>

      <div class="aside-footer">
        <div class="aside-footer-label">当前视图</div>
        <div class="aside-footer-value">{{ appStore.pageTitle }}</div>
        <div v-if="authStore.session" class="aside-footer-session">
          <div class="aside-footer-session-label">已连接账号</div>
          <div>{{ authStore.session.identifier }}</div>
        </div>
      </div>
    </el-aside>

    <el-container>
      <el-main class="app-main">
        <section class="app-header">
          <div>
            <div class="header-kicker">巡检运营中心</div>
            <div class="header-title">{{ appStore.pageTitle }}</div>
          </div>
          <div class="header-status">
            <span class="soft-tag is-primary">企业微信已接入</span>
            <span class="soft-tag is-success">巡检后台在线</span>
            <el-button v-if="!authStore.session" text @click="goLogin">Boss 登录</el-button>
            <span v-if="authStore.session" class="soft-tag">
              Token 已获取 · {{ authStore.session.identifierType }}
            </span>
            <el-button v-if="authStore.session" text @click="copyToken">复制 Token</el-button>
            <el-button v-if="authStore.session" text @click="logout">退出登录</el-button>
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
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ElMessage } from "element-plus";
import { useRoute, useRouter } from "vue-router";
import { useAppStore } from "@/stores/app";
import { useAuthStore } from "@/stores/auth";

const route = useRoute();
const router = useRouter();
const appStore = useAppStore();
const authStore = useAuthStore();

const activeMenu = computed(() => route.path);
const isBlankLayout = computed(() => route.meta.layout === "blank");

async function copyToken() {
  if (!authStore.session?.token) {
    return;
  }

  await navigator.clipboard.writeText(authStore.session.token);
  ElMessage.success("Token 已复制");
}

function logout() {
  authStore.logout();
  void router.push("/login");
}

function goLogin() {
  void router.push({
    path: "/login",
    query: {
      redirect: route.fullPath,
    },
  });
}
</script>

<style scoped>
.app-shell {
  min-height: 100vh;
}

.app-aside {
  position: sticky;
  top: 0;
  height: 100vh;
  overflow: hidden;
  overflow-y: auto;
  padding: 18px 14px;
  background:
    radial-gradient(circle at top right, rgba(79, 172, 254, 0.24), transparent 24%),
    linear-gradient(180deg, #0b1e37 0%, #102b4c 100%);
  color: #fff;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
}

.brand-card {
  margin: 10px 8px 18px;
  padding: 18px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(18px);
}

.brand-kicker,
.header-kicker,
.aside-footer-label,
.aside-footer-session-label {
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.brand-kicker,
.aside-footer-label,
.aside-footer-session-label {
  color: rgba(255, 255, 255, 0.62);
}

.brand-title,
.header-title,
.aside-footer-value {
  margin-top: 10px;
  font-weight: 700;
  line-height: 1.25;
}

.brand-title,
.header-title {
  font-size: 28px;
}

.brand-description {
  margin-top: 12px;
  color: rgba(255, 255, 255, 0.72);
  line-height: 1.7;
  font-size: 13px;
}

.menu {
  border-right: none;
  background: transparent;
}

:deep(.el-menu-item) {
  margin: 8px 8px 0;
  border-radius: 14px;
  color: rgba(255, 255, 255, 0.74);
}

:deep(.el-menu-item:hover) {
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
}

:deep(.el-menu-item.is-active) {
  color: #fff;
  background: rgba(79, 172, 254, 0.18);
  box-shadow: inset 0 0 0 1px rgba(79, 172, 254, 0.22);
}

.aside-footer {
  position: absolute;
  right: 22px;
  bottom: 24px;
  left: 22px;
  padding: 16px 18px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.aside-footer-value {
  font-size: 18px;
}

.aside-footer-session {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.82);
  word-break: break-all;
}

.app-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  min-height: 0;
  width: 100%;
  margin: 0;
  padding: 0 0 18px;
  background: transparent;
  overflow: visible;
}

.header-kicker {
  color: #6a7f9d;
}

.header-title {
  color: #10233f;
}

.header-status {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}

.app-main {
  display: grid;
  gap: 14px;
  max-width: 1520px;
  width: 100%;
  margin: 0 auto;
  padding: 28px 34px 34px;
}

@media (max-width: 1080px) {
  .app-shell {
    flex-direction: column;
  }

  .app-aside {
    position: relative;
    top: auto;
    height: auto;
    width: 100% !important;
  }

  .aside-footer {
    position: relative;
    right: auto;
    bottom: auto;
    left: auto;
    margin: 16px 8px 0;
  }

  .app-main {
    padding: 20px 18px 28px;
  }
}
</style>

<template>
  <div class="login-page">
    <section class="login-hero">
      <div class="login-kicker">Boss Session Login</div>
      <h1 class="login-title">先连上 Boss 账号，再继续取门店和摄像头数据</h1>
      <p class="login-description">
        登录动作会交给 `inspection-api` 在服务端完成。前端只提交账号密码，不再依赖浏览器里碰巧还活着的 Boss 登录态。
      </p>

      <div class="login-highlights">
        <div class="login-highlight">
          <span class="soft-tag is-primary">后端接口</span>
          <strong>/inspection-api/api/boss/session/login</strong>
        </div>
        <div class="login-highlight">
          <span class="soft-tag is-success">后续能力</span>
          <strong>门店树 / 摄像头列表 / 自动续期</strong>
        </div>
      </div>
    </section>

    <el-card shadow="never" class="panel-card login-card">
      <template #header>
        <div class="section-heading">
          <div>
            <div class="section-title">Boss 账号登录</div>
            <div class="section-subtitle">登录成功后，当前浏览器会记住这次会话标记，主界面也会显示已连接账号。</div>
          </div>
          <span class="soft-tag">服务端托管</span>
        </div>
      </template>

      <el-form label-position="top" :model="form" class="login-form" @submit.prevent="submit">
        <el-form-item label="账号">
          <el-input v-model="form.username" placeholder="请输入 Boss 登录账号" clearable size="large" />
        </el-form-item>

        <el-form-item label="密码">
          <el-input
            v-model="form.password"
            placeholder="请输入 Boss 登录密码"
            show-password
            clearable
            size="large"
            @keyup.enter="submit"
          />
        </el-form-item>

        <div class="login-actions">
          <el-button type="primary" size="large" :loading="submitting" @click="submit">登录 Boss</el-button>
          <el-button size="large" @click="fillDefaultAccount">填入当前账号</el-button>
        </div>

        <div class="table-helper">
          默认已预填你刚才提供的账号。如果后面换账号，直接在这里改掉重新登录就行。
        </div>
      </el-form>

      <div v-if="authStore.session" class="token-result">
        <div class="token-result-head">
          <div>
            <div class="section-title">最近一次登录结果</div>
            <div class="section-subtitle">
              已连接账号：{{ authStore.session.identifier }}
            </div>
          </div>
          <span class="soft-tag is-success">Boss 已连接</span>
        </div>

        <div class="token-meta">
          <span class="soft-tag">groupId: {{ authStore.session.enterpriseId ?? "未返回" }}</span>
          <span class="soft-tag">登录时间: {{ formatLoginTime(authStore.session.loginAt) }}</span>
        </div>

        <div class="token-actions">
          <el-button text @click="copyToken">复制当前 token</el-button>
          <el-button type="primary" plain @click="enterDashboard">进入巡检后台</el-button>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { useRoute, useRouter } from "vue-router";
import { openPlatformApi } from "@/api/openPlatform";
import { useAppStore } from "@/stores/app";
import { useAuthStore } from "@/stores/auth";

const DEFAULT_USERNAME = "LSYMAPI";
const DEFAULT_PASSWORD = "LSym@121";

const router = useRouter();
const route = useRoute();
const appStore = useAppStore();
const authStore = useAuthStore();

appStore.setPageTitle("Boss 登录");

const form = reactive({
  username: DEFAULT_USERNAME,
  password: DEFAULT_PASSWORD,
});

const submitting = ref(false);

async function submit() {
  if (submitting.value) {
    return;
  }

  if (!form.username.trim() || !form.password.trim()) {
    ElMessage.warning("请先填写 Boss 账号和密码");
    return;
  }

  submitting.value = true;
  try {
    const response = await openPlatformApi.loginBossSession({
      username: form.username.trim(),
      password: form.password.trim(),
    });
    authStore.setSession(response.data);
    ElMessage.success("Boss 登录成功");
    enterDashboard();
  } catch (error: any) {
    const message = error?.response?.data?.message || error?.message || "Boss 登录失败";
    ElMessage.error(message);
  } finally {
    submitting.value = false;
  }
}

function fillDefaultAccount() {
  form.username = DEFAULT_USERNAME;
  form.password = DEFAULT_PASSWORD;
  ElMessage.success("已填入当前账号");
}

async function copyToken() {
  if (!authStore.session?.token) {
    return;
  }

  await navigator.clipboard.writeText(authStore.session.token);
  ElMessage.success("Token 已复制");
}

function enterDashboard() {
  const redirect = typeof route.query.redirect === "string" ? route.query.redirect : "/";
  void router.push(redirect);
}

function formatLoginTime(value: string) {
  return new Date(value).toLocaleString("zh-CN");
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(320px, 0.9fr) minmax(420px, 0.8fr);
  gap: 28px;
  align-items: stretch;
  padding: 32px;
}

.login-hero,
.login-card {
  min-height: calc(100vh - 64px);
}

.login-hero {
  position: relative;
  overflow: hidden;
  padding: 42px;
  border-radius: 32px;
  background:
    radial-gradient(circle at top left, rgba(31, 111, 235, 0.26), transparent 28%),
    radial-gradient(circle at 75% 20%, rgba(15, 159, 110, 0.22), transparent 22%),
    linear-gradient(160deg, rgba(6, 25, 49, 0.98), rgba(16, 43, 76, 0.96));
  color: #fff;
  box-shadow: 0 28px 80px rgba(12, 30, 54, 0.28);
}

.login-kicker {
  display: inline-flex;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  font-size: 12px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

.login-title {
  max-width: 560px;
  margin: 24px 0 16px;
  font-size: clamp(34px, 4vw, 56px);
  line-height: 1.05;
}

.login-description {
  max-width: 540px;
  margin: 0;
  color: rgba(255, 255, 255, 0.76);
  font-size: 16px;
  line-height: 1.8;
}

.login-highlights {
  display: grid;
  gap: 14px;
  margin-top: 40px;
}

.login-highlight {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 16px 18px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.login-highlight strong {
  font-size: 15px;
}

.login-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.login-form {
  display: grid;
  gap: 8px;
}

.login-actions,
.token-actions,
.token-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.token-result {
  margin-top: 28px;
  padding-top: 28px;
  border-top: 1px solid var(--el-border-color-light);
  display: grid;
  gap: 16px;
}

.token-result-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

@media (max-width: 1024px) {
  .login-page {
    grid-template-columns: 1fr;
    padding: 18px;
  }

  .login-hero,
  .login-card {
    min-height: auto;
  }

  .login-hero {
    padding: 28px;
  }
}
</style>

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

      <div v-if="bossSelection.storeName" class="boss-selection-banner">
        <span class="soft-tag is-primary">Boss 门店</span>
        <span class="boss-selection-text">{{ bossSelection.storeName }}</span>
        <span class="table-helper">shopId: {{ bossSelection.shopId || "-" }} · nodeId: {{ bossSelection.nodeId || "-" }}</span>
      </div>

      <el-card v-if="bossSelection.storeName" shadow="never" class="boss-device-card">
        <template #header>
          <div class="section-heading">
            <div>
              <div class="section-title">Boss 监控模块</div>
              <div class="section-subtitle">通过后端代理调用 `deptDeviceList` 获取当前 Boss 门店下的监控模块。</div>
            </div>
            <span class="soft-tag">{{ bossDevices.length }} 条</span>
          </div>
        </template>

        <el-table :data="bossDevices" v-loading="bossDevicesLoading" border>
          <el-table-column label="模块名称" min-width="180">
            <template #default="{ row }">
              <button type="button" class="boss-link-button" @click="openBossCamera(row)">
                {{ row.name }}
              </button>
            </template>
          </el-table-column>
          <el-table-column prop="deviceId" label="deviceId" width="120" />
          <el-table-column prop="id" label="节点 ID" width="120" />
          <el-table-column label="在线状态" width="100">
            <template #default="{ row }">
              <span :class="['soft-tag', row.online === 1 ? 'is-success' : 'is-warning']">
                {{ row.online === 1 ? "在线" : "离线" }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="设备状态" width="100">
            <template #default="{ row }">
              <span :class="['soft-tag', row.status === 1 ? 'is-success' : 'is-warning']">
                {{ row.status === 1 ? "启用" : "异常" }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="缩略图" width="180">
            <template #default="{ row }">
              <button v-if="row.thumbUrl" type="button" class="boss-thumb-button" @click="openBossCamera(row)">
                <div class="boss-thumb-card">
                  <img :src="row.thumbUrl" :alt="row.name" class="boss-thumb-image" />
                </div>
              </button>
              <span v-else class="table-helper">暂无缩略图</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right">
            <template #default="{ row }">
              <el-button text @click="openBossCamera(row)">打开摄像头</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <el-dialog
        v-model="bossPlayerVisible"
        class="boss-player-dialog"
        width="960px"
        destroy-on-close
        @closed="handleBossPlayerClosed"
      >
        <template #header>
          <div class="section-heading">
            <div>
              <div class="section-title">摄像头预览</div>
              <div class="section-subtitle">
                {{ bossPlayerTitle || "准备拉取实时视频流" }}
              </div>
            </div>
            <span v-if="currentBossDevice" class="soft-tag is-primary">
              deviceId: {{ currentBossDevice.deviceId || currentBossDevice.id }}
            </span>
          </div>
        </template>

        <div class="boss-player-shell">
          <div v-if="bossPlayerError" class="boss-player-error">
            <div class="section-title">当前预览打开失败</div>
            <div class="section-subtitle">{{ bossPlayerError }}</div>
          </div>

          <div v-else-if="bossPlayerLoading" class="boss-player-loading">
            <el-skeleton animated :rows="6" />
          </div>

          <video
            v-else
            ref="bossVideoRef"
            class="boss-video-element"
            controls
            autoplay
            muted
            playsinline
          />
        </div>

        <template #footer>
          <el-button @click="bossPlayerVisible = false">关闭</el-button>
          <el-button
            v-if="currentBossDevice"
            type="primary"
            plain
            @click="openBossCameraInNewWindow(currentBossDevice)"
          >
            在 Boss 原页打开
          </el-button>
        </template>
      </el-dialog>

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
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { useRoute } from "vue-router";
import { inspectionApi } from "@/api/inspection";
import { useAppStore } from "@/stores/app";
import type { BindingItem, BossDeviceItem, BossVideoSession, StoreItem, StreamItem } from "@/types/inspection";
import { buildStoreTopology, formatBooleanStatus, formatStoreStatus, getPlanDisplayName } from "@/utils/inspection";

type MpegtsPlayer = {
  attachMediaElement: (element: HTMLMediaElement) => void;
  load: () => void;
  play: () => Promise<void> | void;
  pause: () => void;
  unload: () => void;
  destroy: () => void;
};

type MpegtsModule = {
  isSupported: () => boolean;
  createPlayer: (config: Record<string, unknown>) => MpegtsPlayer;
};

declare global {
  interface Window {
    mpegts?: MpegtsModule;
    __inspectionMpegtsPromise?: Promise<MpegtsModule>;
  }
}

const MPEGTS_CDN_URL = "https://cdn.jsdelivr.net/npm/mpegts.js@1.8.0/dist/mpegts.min.js";

const appStore = useAppStore();
const route = useRoute();
const loading = ref(false);
const bossDevicesLoading = ref(false);
const submitting = ref(false);
const dialogVisible = ref(false);
const editingId = ref<number | null>(null);
const streams = ref<StreamItem[]>([]);
const stores = ref<StoreItem[]>([]);
const bindings = ref<BindingItem[]>([]);
const bossDevices = ref<BossDeviceItem[]>([]);
const bossPlayerVisible = ref(false);
const bossPlayerLoading = ref(false);
const bossPlayerError = ref("");
const bossVideoRef = ref<HTMLVideoElement | null>(null);
const currentBossDevice = ref<BossDeviceItem | null>(null);
const currentBossSession = ref<BossVideoSession | null>(null);
let bossPlayerInstance: MpegtsPlayer | null = null;

const topology = computed(() => buildStoreTopology(stores.value, streams.value, bindings.value));
const streamMap = computed(() => new Map(streams.value.map((item) => [item.id, item])));
const bossPlayerTitle = computed(() => {
  if (!currentBossDevice.value) {
    return "";
  }
  return `${currentBossDevice.value.name} · ${bossSelection.value.storeName || "Boss 摄像头"}`;
});
const bossSelection = computed(() => ({
  storeName: typeof route.query.bossStoreName === "string" ? route.query.bossStoreName : "",
  shopId: typeof route.query.bossShopId === "string" ? route.query.bossShopId : "",
  nodeId: typeof route.query.bossNodeId === "string" ? route.query.bossNodeId : "",
  deptId:
    typeof route.query.bossDeptId === "string"
      ? route.query.bossDeptId
      : typeof route.query.bossNodeId === "string"
        ? route.query.bossNodeId.replace(/^S_/, "")
        : "",
}));

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

async function loadBossDevices() {
  if (!bossSelection.value.nodeId && !bossSelection.value.deptId) {
    bossDevices.value = [];
    return;
  }

  bossDevicesLoading.value = true;
  try {
    const response = await inspectionApi.getBossDeptDevices({
      id: bossSelection.value.nodeId,
      deptId: bossSelection.value.deptId,
    });
    bossDevices.value = response.data;
  } catch (error: any) {
    bossDevices.value = [];
    const message = error?.response?.data?.message || error?.message || "获取 Boss 监控模块失败";
    ElMessage.error(message);
  } finally {
    bossDevicesLoading.value = false;
  }
}

async function openBossCamera(item: BossDeviceItem) {
  const cameraId = item.deviceId || item.id;
  if (!cameraId) {
    ElMessage.warning("当前设备缺少摄像头 ID，暂时无法打开");
    return;
  }

  currentBossDevice.value = item;
  bossPlayerVisible.value = true;
  bossPlayerLoading.value = true;
  bossPlayerError.value = "";
  currentBossSession.value = null;
  destroyBossPlayer();

  try {
    const response = await inspectionApi.startBossVideoPlay({
      deviceId: cameraId,
      isSlave: item.slaveFlag || 0,
      realPlayType: 1,
      playCloudMediaFlag: 0,
    });
    currentBossSession.value = response.data;
    bossPlayerLoading.value = false;
    await nextTick();
    await mountBossPlayer(response.data.streamUrl);
  } catch (error: any) {
    bossPlayerError.value = error?.message || "实时视频流拉取失败";
  } finally {
    bossPlayerLoading.value = false;
  }
}

function openBossCameraInNewWindow(item: BossDeviceItem) {
  const cameraId = item.deviceId || item.id;
  if (!cameraId) {
    ElMessage.warning("当前设备缺少摄像头 ID，暂时无法打开");
    return;
  }
  window.open(`https://www.ovopark.com/video-flv-v3/index.html?id=${cameraId}`, "_blank", "noopener,noreferrer");
}

async function ensureMpegts(): Promise<MpegtsModule> {
  if (window.mpegts) {
    return window.mpegts;
  }
  if (window.__inspectionMpegtsPromise) {
    return window.__inspectionMpegtsPromise;
  }

  window.__inspectionMpegtsPromise = new Promise<MpegtsModule>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = MPEGTS_CDN_URL;
    script.async = true;
    script.onload = () => {
      if (window.mpegts) {
        resolve(window.mpegts);
        return;
      }
      reject(new Error("播放器脚本加载失败"));
    };
    script.onerror = () => reject(new Error("播放器脚本加载失败"));
    document.head.appendChild(script);
  });

  return window.__inspectionMpegtsPromise;
}

async function mountBossPlayer(streamUrl: string) {
  const videoElement = bossVideoRef.value;
  if (!videoElement) {
    throw new Error("播放器节点初始化失败");
  }

  const mpegts = await ensureMpegts();
  if (!mpegts.isSupported()) {
    throw new Error("当前浏览器不支持 FLV 实时播放");
  }

  const player = mpegts.createPlayer({
    type: "flv",
    isLive: true,
    url: streamUrl,
    hasAudio: true,
    enableWorker: false,
    enableStashBuffer: false,
    stashInitialSize: 128,
  });

  bossPlayerInstance = player;
  player.attachMediaElement(videoElement);
  player.load();
  await Promise.resolve(player.play());
}

function destroyBossPlayer() {
  if (bossPlayerInstance) {
    bossPlayerInstance.pause();
    bossPlayerInstance.unload();
    bossPlayerInstance.destroy();
    bossPlayerInstance = null;
  }

  if (bossVideoRef.value) {
    bossVideoRef.value.removeAttribute("src");
    bossVideoRef.value.load();
  }
}

function handleBossPlayerClosed() {
  destroyBossPlayer();
  currentBossDevice.value = null;
  currentBossSession.value = null;
  bossPlayerLoading.value = false;
  bossPlayerError.value = "";
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
  void loadBossDevices();
});

onUnmounted(() => {
  destroyBossPlayer();
});
</script>

<style scoped>
.boss-device-card {
  margin-bottom: 20px;
}

.boss-player-shell {
  min-height: 520px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 20px;
  background:
    radial-gradient(circle at top left, rgba(18, 111, 255, 0.12), transparent 28%),
    linear-gradient(180deg, rgba(8, 15, 28, 0.96), rgba(12, 24, 44, 0.98));
  overflow: hidden;
}

.boss-video-element {
  width: 100%;
  height: 520px;
  display: block;
  background: #000;
}

.boss-player-loading,
.boss-player-error {
  width: min(520px, 100%);
  padding: 24px;
}

.boss-player-error {
  color: #fff;
}

.boss-thumb-card {
  width: 140px;
  height: 84px;
  overflow: hidden;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.04);
  border: 1px solid rgba(15, 23, 42, 0.08);
}

.boss-thumb-button,
.boss-link-button {
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}

.boss-thumb-button {
  display: block;
}

.boss-link-button {
  color: #126fff;
  font: inherit;
  text-align: left;
}

.boss-link-button:hover {
  color: #0b57d0;
  text-decoration: underline;
}

.boss-thumb-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.boss-selection-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(18, 111, 255, 0.08);
}

.boss-selection-text {
  color: var(--oc-text);
  font-weight: 700;
}

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

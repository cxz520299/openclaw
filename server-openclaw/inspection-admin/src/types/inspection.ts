export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

export interface StoreItem {
  id: number;
  name: string;
  code: string;
  aliasList: string;
  region: string;
  status: string;
  managerName: string;
  managerWecomUserId: string;
  remark: string;
  createdAt: string;
  updatedAt: string;
}

export interface StreamItem {
  id: number;
  storeId: number;
  store?: StoreItem;
  name: string;
  aliasList: string;
  streamUrl: string;
  streamType: string;
  sourceAlias: string;
  baselineImageUrl: string;
  baselineImagePath: string;
  enabled: boolean;
}

export interface PlanItem {
  id: number;
  planId: number;
  itemType: string;
  content: string;
  sortOrder: number;
  required: boolean;
  enabled: boolean;
}

export interface TemplateCategory {
  id: number;
  name: string;
  code: string;
  description: string;
  sortOrder: number;
  enabled: boolean;
  itemCount: number;
}

export interface TemplateItem {
  id: number;
  categoryId: number;
  category?: TemplateCategory;
  name: string;
  code: string;
  promptText: string;
  standardText: string;
  standardScore: number;
  validHours: number;
  priority: number;
  recommendedItemType: string;
  sortOrder: number;
  enabled: boolean;
}

export interface Plan {
  id: number;
  name: string;
  code: string;
  aliasList: string;
  triggerKeywords: string;
  planType: string;
  description: string;
  framePickMode: string;
  matchThresholdPercent: number;
  differenceThresholdPercent: number;
  enabled: boolean;
}

export interface BindingItem {
  id: number;
  storeId: number;
  planId: number;
  streamId: number;
  customMatchThresholdPercent: number;
  customDifferenceThresholdPercent: number;
  enabled: boolean;
  store?: StoreItem;
  plan?: Plan;
  stream?: StreamItem;
}

export interface JobItem {
  id: number;
  jobNo: string;
  status: string;
  triggerType: string;
  triggerSource: string;
  operatorName: string;
  createdAt: string;
  store?: StoreItem;
  plan?: Plan;
  binding?: BindingItem;
  result?: ResultItem | null;
}

export interface ResultItem {
  id: number;
  jobId: number;
  storeName: string;
  planName: string;
  monitorName: string;
  source: string;
  inspectionType: string;
  framePickMode: string;
  sampledAtSeconds: number;
  verdict: string;
  matchPercent: number;
  differencePercent: number;
  observedSummary: string;
  fallbackUsed: boolean;
  fallbackReason: string;
  pluginRecommendation: string;
  pluginRecommendationReason: string;
  reportUrl: string;
  docUrl: string;
  items?: ResultClause[];
  artifacts?: ResultArtifact[];
}

export interface ResultClause {
  id: number;
  resultId: number;
  clause: string;
  clauseType: string;
  matched: boolean;
  evidence: string;
}

export interface ResultArtifact {
  id: number;
  resultId: number;
  artifactType: string;
  fileUrl: string;
  filePath: string;
}

export interface ScheduleItem {
  id: number;
  storeId: number;
  planId: number;
  cronExpr: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

export interface Summary {
  stores: number;
  streams: number;
  plans: number;
  bindings: number;
  jobs: number;
  results: number;
}

export interface BossDepartmentItem {
  id: string;
  pid: string;
  text: string;
  shopId: string;
  openStatus: number;
  validateStatus: number;
  deviceCount: number;
  departmentType: number | null;
  isConfig: number;
  attributes?: {
    level: number;
    latitude: number | null;
    longitude: number | null;
    timeZone: number;
  };
}

export interface BossDeviceItem {
  groupId: number;
  deptId: number;
  deviceId: number;
  deviceStatusId: number;
  online: number;
  thirdPartType: number;
  slaveFlag: number;
  deviceName: string;
  supportMultiPlay: number;
  canPtzFlag: number;
  accessType: number;
  settingEnable: number;
  devIcon: string;
  thumbUrl: string;
  mainIpc: number;
  yzsDepOutIpcFlag: number;
  supportVideoPlayback: number;
  sceneBySnap: number;
  status: number;
  ptzEnable: number;
  id: number;
  name: string;
  thirdpartType: number;
  dtype: number;
  offlineTimeStamp: number | null;
}

export interface BossVideoSession {
  deviceId: number;
  name: string;
  streamUrl: string;
  hlsUrl?: string;
  sessionId?: string;
  networkQualityUrl?: string;
  raw?: Record<string, unknown>;
}

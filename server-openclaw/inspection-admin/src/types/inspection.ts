export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
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
  priority: number;
  customMatchThresholdPercent: number;
  customDifferenceThresholdPercent: number;
  enabled: boolean;
  store?: StoreItem;
  plan?: Plan;
  stream?: StreamItem;
}

export interface MatchLogItem {
  id: number;
  jobId?: number | null;
  queryText: string;
  normalizedQuery: string;
  requestedStoreName: string;
  requestedPlanName: string;
  requestedStreamName: string;
  requestedSource: string;
  matchedStoreId: number;
  matchedStoreName: string;
  matchedPlanId: number;
  matchedPlanName: string;
  matchedStreamId: number;
  matchedStreamName: string;
  matchedBindingId: number;
  storeMatchMode: string;
  planMatchMode: string;
  streamMatchMode: string;
  bindingMatchMode: string;
  confidenceScore: number;
  configVersion: string;
  decisionSummary: string;
  errorMessage: string;
  createdAt: string;
}

export interface JobItem {
  id: number;
  jobNo: string;
  batchId?: number | null;
  status: string;
  triggerType: string;
  triggerSource: string;
  operatorName: string;
  errorMessage?: string;
  startedAt?: string | null;
  finishedAt?: string | null;
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

export interface BatchExecutionEstimate {
  planId: number;
  planName: string;
  executionMode: string;
  sampleSize: number;
  storeCount: number;
  selectedStoreCount: number;
  skippedStoreCount: number;
  jobCount: number;
  monitorCount: number;
  planItemCount: number;
  estimatedSeconds: number;
  estimatedLabel: string;
  summaryText: string;
  stores: StoreItem[];
  skippedStores: StoreItem[];
}

export interface BatchExecutionCreateResult {
  batch: BatchExecutionRun;
  summary: BatchExecutionEstimate;
  jobs: JobItem[];
}

export interface BatchExecutionRun {
  id: number;
  batchNo: string;
  scopeType: string;
  scopeValue?: string;
  operatorName?: string;
  operatorWecomUserId?: string;
  triggerSource?: string;
  sourceLabel?: string;
  initiatorName?: string;
  initiatorWecomUserId?: string;
  ownerName?: string;
  ownerWecomUserId?: string;
  ownerSource?: string;
  managerName?: string;
  managerWecomUserId?: string;
  managerSource?: string;
  conversationId?: string;
  planId: number;
  plan?: Plan;
  planName?: string;
  executionMode: string;
  sampleSize?: number;
  selectedStoreCount: number;
  matchedStoreCount: number;
  totalJobs: number;
  pendingJobs: number;
  runningJobs: number;
  successJobs: number;
  alertedJobs: number;
  partialSuccessJobs: number;
  errorJobs: number;
  status: string;
  summaryText?: string;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  jobs?: JobItem[];
}

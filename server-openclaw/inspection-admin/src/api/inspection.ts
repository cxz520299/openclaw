import http from "./http";
import type {
  BatchExecutionCreateResult,
  BatchExecutionEstimate,
  BatchExecutionRun,
  BindingItem,
  JobItem,
  MatchLogItem,
  PaginatedData,
  Plan,
  PlanItem,
  ResultItem,
  ScheduleItem,
  StoreItem,
  StreamItem,
  Summary,
  TemplateCategory,
  TemplateItem,
} from "@/types/inspection";

type PaginationParams = {
  page?: number;
  pageSize?: number;
  all?: boolean;
};

export const inspectionApi = {
  getSummary: () => http.get<never, { code: number; message: string; data: Summary }>("/meta/summary"),

  getStores: (params?: PaginationParams & { query?: string }) =>
    http.get<never, { code: number; message: string; data: PaginatedData<StoreItem> }>("/stores", { params }),
  createStore: (payload: Partial<StoreItem>) => http.post("/stores", payload),
  updateStore: (id: number, payload: Partial<StoreItem>) => http.put(`/stores/${id}`, payload),

  getStreams: (params?: PaginationParams & { storeId?: number; query?: string }) =>
    http.get<never, { code: number; message: string; data: PaginatedData<StreamItem> }>("/store-streams", { params }),
  createStream: (payload: Partial<StreamItem>) => http.post("/store-streams", payload),
  updateStream: (id: number, payload: Partial<StreamItem>) => http.put(`/store-streams/${id}`, payload),

  getPlans: (params?: PaginationParams & { query?: string }) =>
    http.get<never, { code: number; message: string; data: PaginatedData<Plan> }>("/inspection-plans", { params }),
  getTemplateCategories: (params?: PaginationParams & { query?: string }) =>
    http.get<never, { code: number; message: string; data: PaginatedData<TemplateCategory> }>("/inspection-template-categories", {
      params,
    }),
  getTemplateItems: (params?: PaginationParams & { categoryId?: number; query?: string }) =>
    http.get<never, { code: number; message: string; data: PaginatedData<TemplateItem> }>("/inspection-template-items", {
      params,
    }),
  createPlan: (payload: Partial<Plan>) => http.post("/inspection-plans", payload),
  updatePlan: (id: number, payload: Partial<Plan>) => http.put(`/inspection-plans/${id}`, payload),
  getPlanItems: (id: number, params?: PaginationParams) =>
    http.get<never, { code: number; message: string; data: PaginatedData<PlanItem> }>(`/inspection-plans/${id}/items`, {
      params,
    }),
  createPlanItem: (planId: number, payload: Partial<PlanItem>) => http.post(`/inspection-plans/${planId}/items`, payload),
  updatePlanItem: (id: number, payload: Partial<PlanItem>) => http.put(`/inspection-plan-items/${id}`, payload),

  getBindings: (params?: PaginationParams & { storeId?: number; planId?: number }) =>
    http.get<never, { code: number; message: string; data: PaginatedData<BindingItem> }>("/store-plan-bindings", { params }),
  createBinding: (payload: Partial<BindingItem>) => http.post("/store-plan-bindings", payload),
  updateBinding: (id: number, payload: Partial<BindingItem>) => http.put(`/store-plan-bindings/${id}`, payload),

  getJobs: (params?: PaginationParams & { status?: string; triggerSource?: string; limit?: number; batchId?: number }) =>
    http.get<never, { code: number; message: string; data: PaginatedData<JobItem> }>("/inspection-jobs", {
      params,
    }),
  getBatchRuns: (params?: PaginationParams & { status?: string; managerWecomUserId?: string; triggerSource?: string; ownerSource?: string; limit?: number }) =>
    http.get<never, { code: number; message: string; data: PaginatedData<BatchExecutionRun> }>("/batch-execution-runs", {
      params,
    }),
  getBatchRun: (id: number) =>
    http.get<never, { code: number; message: string; data: BatchExecutionRun }>(`/batch-execution-runs/${id}`),
  retryFailedBatchRun: (id: number) =>
    http.post<never, { code: number; message: string; data: { retryCount: number; batch: BatchExecutionRun } }>(
      `/batch-execution-runs/${id}/retry-failed`,
      {},
    ),
  getResult: (id: number) => http.get<never, { code: number; message: string; data: ResultItem }>(`/inspection-results/${id}`),
  getMatchLogs: (params?: PaginationParams & { query?: string; jobId?: number; limit?: number }) =>
    http.get<never, { code: number; message: string; data: PaginatedData<MatchLogItem> }>("/inspection-match-logs", {
      params,
    }),

  getSchedules: (params?: PaginationParams) =>
    http.get<never, { code: number; message: string; data: PaginatedData<ScheduleItem> }>("/schedules", { params }),
  createSchedule: (payload: Partial<ScheduleItem>) => http.post("/schedules", payload),
  updateSchedule: (id: number, payload: Partial<ScheduleItem>) => http.put(`/schedules/${id}`, payload),

  createManualExecution: (payload: Record<string, unknown>) => http.post("/manual-executions", payload),
  estimateBatchExecution: (payload: Record<string, unknown>) =>
    http.post<never, { code: number; message: string; data: BatchExecutionEstimate }>("/batch-executions/estimate", payload),
  createBatchExecution: (payload: Record<string, unknown>) =>
    http.post<never, { code: number; message: string; data: BatchExecutionCreateResult }>("/batch-executions", payload),
};

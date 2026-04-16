import http from "./http";
import type {
  BindingItem,
  BossDeviceItem,
  BossVideoSession,
  JobItem,
  Plan,
  PlanItem,
  ResultItem,
  ScheduleItem,
  StoreItem,
  StreamItem,
  Summary,
  BossDepartmentItem,
  TemplateCategory,
  TemplateItem,
} from "@/types/inspection";

export const inspectionApi = {
  getSummary: () => http.get<never, { code: number; message: string; data: Summary }>("/meta/summary"),

  getStores: () => http.get<never, { code: number; message: string; data: StoreItem[] }>("/stores"),
  createStore: (payload: Partial<StoreItem>) => http.post("/stores", payload),
  updateStore: (id: number, payload: Partial<StoreItem>) => http.put(`/stores/${id}`, payload),
  getBossDepartmentsTree: () =>
    http.post<never, { code: number; message: string; data: BossDepartmentItem[] }>("/boss/departments/tree"),
  getBossDeptDevices: (params: { id?: string; deptId?: string; groupId?: string }) =>
    http.get<never, { code: number; message: string; data: BossDeviceItem[] }>("/boss/devices/dept", { params }),
  startBossVideoPlay: (payload: { deviceId: number; isSlave?: number; realPlayType?: number; playCloudMediaFlag?: number }) =>
    http.post<typeof payload, { code: number; message: string; data: BossVideoSession }>("/boss/video/play", payload),

  getStreams: () => http.get<never, { code: number; message: string; data: StreamItem[] }>("/store-streams"),
  createStream: (payload: Partial<StreamItem>) => http.post("/store-streams", payload),
  updateStream: (id: number, payload: Partial<StreamItem>) => http.put(`/store-streams/${id}`, payload),

  getPlans: () => http.get<never, { code: number; message: string; data: Plan[] }>("/inspection-plans"),
  getTemplateCategories: () =>
    http.get<never, { code: number; message: string; data: TemplateCategory[] }>("/inspection-template-categories"),
  getTemplateItems: (categoryId?: number) =>
    http.get<never, { code: number; message: string; data: TemplateItem[] }>("/inspection-template-items", {
      params: categoryId ? { categoryId } : undefined,
    }),
  createPlan: (payload: Partial<Plan>) => http.post("/inspection-plans", payload),
  updatePlan: (id: number, payload: Partial<Plan>) => http.put(`/inspection-plans/${id}`, payload),
  getPlanItems: (id: number) =>
    http.get<never, { code: number; message: string; data: PlanItem[] }>(`/inspection-plans/${id}/items`),
  createPlanItem: (planId: number, payload: Partial<PlanItem>) => http.post(`/inspection-plans/${planId}/items`, payload),
  updatePlanItem: (id: number, payload: Partial<PlanItem>) => http.put(`/inspection-plan-items/${id}`, payload),

  getBindings: () => http.get<never, { code: number; message: string; data: BindingItem[] }>("/store-plan-bindings"),
  createBinding: (payload: Partial<BindingItem>) => http.post("/store-plan-bindings", payload),
  updateBinding: (id: number, payload: Partial<BindingItem>) => http.put(`/store-plan-bindings/${id}`, payload),

  getJobs: () => http.get<never, { code: number; message: string; data: JobItem[] }>("/inspection-jobs"),
  getResult: (id: number) => http.get<never, { code: number; message: string; data: ResultItem }>(`/inspection-results/${id}`),

  getSchedules: () => http.get<never, { code: number; message: string; data: ScheduleItem[] }>("/schedules"),
  createSchedule: (payload: Partial<ScheduleItem>) => http.post("/schedules", payload),
  updateSchedule: (id: number, payload: Partial<ScheduleItem>) => http.put(`/schedules/${id}`, payload),

  createManualExecution: (payload: Record<string, unknown>) => http.post("/manual-executions", payload),
};

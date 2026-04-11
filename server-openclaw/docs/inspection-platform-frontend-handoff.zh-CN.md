# 门店智能巡检平台前端开工文档

## 1. 目标

前端目标是做一个可运营、可配置、可查看结果的巡检后台，不负责截图和分析执行。

一句话职责：

- 配置门店
- 配置流媒体
- 配置计划和点检项
- 绑定门店与计划
- 查看巡检任务和结果
- 手动发起巡检

## 2. 技术栈

建议：

- `Vue3`
- `Vite`
- `Pinia`
- `Vue Router`
- `Element Plus`
- `Axios`

建议新建目录：

`/Users/chengxinzhi/Documents/code/openclaw/inspection-admin`

推荐结构：

```text
inspection-admin/
  src/
    api/
    views/
    components/
    stores/
    router/
    types/
    utils/
  package.json
  vite.config.ts
```

## 3. 页面范围

第一期页面：

- 登录页
- 首页看板
- 门店管理
- 流媒体管理
- 巡检计划管理
- 点检项管理
- 门店计划绑定
- 巡检任务列表
- 巡检结果详情
- 定时任务管理

第一期不做：

- 多组织切换
- 复杂权限中心
- 高级 BI 图表

## 4. 页面说明

### 门店管理

字段：

- 门店名称
- 门店编码
- 区域
- 状态
- 负责人
- 企业微信用户 ID
- 备注

操作：

- 列表
- 搜索
- 新建
- 编辑
- 启停

### 流媒体管理

字段：

- 门店
- 流名称
- 流地址
- 流类型
- source alias
- 基准图
- 启用状态

操作：

- 新建流
- 绑定门店
- 上传基准图
- 预览流信息

### 巡检计划管理

字段：

- 计划名称
- 计划编码
- 计划类型
- 抽帧方式
- 匹配阈值
- 差异阈值
- 启用状态

### 点检项管理

字段：

- 点检项类型
- 点检内容
- 排序
- 是否必选
- 是否启用

### 门店计划绑定

字段：

- 门店
- 计划
- 绑定流
- 自定义阈值
- 启用状态

### 巡检任务列表

字段：

- 任务编号
- 门店
- 计划
- 触发方式
- 状态
- 开始时间
- 结束时间

操作：

- 查看详情
- 重试

### 巡检结果详情

字段：

- 结果结论
- 匹配度
- 差异度
- 画面摘要
- 兜底原因
- 条款明细
- 巡检截图
- diff 图
- 文档链接

## 5. 组件树

### 门店管理页

- `StoreSearchBar`
- `StoreTable`
- `StoreFormDrawer`

### 流媒体管理页

- `StreamSearchBar`
- `StreamTable`
- `StreamFormDrawer`
- `BaselineUpload`

### 计划管理页

- `PlanTable`
- `PlanFormDrawer`
- `PlanItemEditor`

### 巡检结果详情页

- `ResultSummaryCard`
- `ResultClauseTable`
- `ResultArtifactsPanel`
- `ResultReportCard`

## 6. 前端状态设计

建议拆这些 Pinia Store：

- `useStoreStore`
- `useStreamStore`
- `usePlanStore`
- `useBindingStore`
- `useInspectionJobStore`
- `useInspectionResultStore`
- `useScheduleStore`

公共状态：

- 列表筛选
- 分页
- 当前详情 ID
- 表单弹窗开关
- 手动执行 loading
- 图片预览状态

## 7. API 对接清单

前端第一期对接：

- `GET /api/stores`
- `POST /api/stores`
- `PUT /api/stores/:id`
- `GET /api/store-streams`
- `POST /api/store-streams`
- `PUT /api/store-streams/:id`
- `GET /api/inspection-plans`
- `POST /api/inspection-plans`
- `PUT /api/inspection-plans/:id`
- `GET /api/inspection-plans/:id/items`
- `POST /api/inspection-plans/:id/items`
- `PUT /api/inspection-plan-items/:id`
- `GET /api/store-plan-bindings`
- `POST /api/store-plan-bindings`
- `PUT /api/store-plan-bindings/:id`
- `GET /api/inspection-jobs`
- `GET /api/inspection-results/:id`
- `GET /api/schedules`
- `POST /api/schedules`

## 8. 页面优先级

优先级建议：

1. 门店管理
2. 流媒体管理
3. 巡检计划管理
4. 点检项管理
5. 门店计划绑定
6. 巡检任务列表
7. 巡检结果详情
8. 定时任务管理

## 9. UI 约束

界面建议偏后台运营风格：

- 列表页优先
- 弹窗表单为主
- 结果详情页允许图文混排
- 巡检截图和 diff 图支持放大预览

重点体验：

- 手动执行按钮必须有明显 loading
- 结果详情必须快速看到截图和未通过项
- 支持从门店页直接跳到绑定计划页

## 10. 前端任务拆分

### 阶段 1

- 初始化 Vue 项目
- 搭路由、布局、权限壳子
- 完成门店、流媒体、计划、点检项页面骨架

### 阶段 2

- 接入 CRUD API
- 完成绑定关系页
- 完成任务列表页

### 阶段 3

- 完成结果详情页
- 图片预览
- 文档链接跳转
- 手动执行入口

## 11. 验收标准

- 能配置门店
- 能配置流媒体和基准图
- 能配置巡检计划和点检项
- 能把门店和计划绑定起来
- 能查看任务和结果
- 能在结果详情页看截图和条款明细

## 12. 前端线程职责边界

前端线程只负责这些目录：

- `inspection-admin/**`
- 如需补充页面说明，可写 `server-openclaw/docs/**`

前端线程不要直接改：

- `inspection-api/**`
- `server-openclaw/services/**`
- `server-openclaw/plugins/**`

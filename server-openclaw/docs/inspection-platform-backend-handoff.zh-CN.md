# 门店智能巡检平台后端开工文档

## 1. 目标

后端目标不是直接重写 OpenClaw，而是补一层稳定的业务后台，负责：

- 门店、流媒体、巡检计划、点检项、告警规则、定时任务的结构化管理
- 为 OpenClaw 提供统一的执行上下文 API
- 落库存储巡检任务、巡检结果、截图地址、文档地址
- 支撑企业微信一句话触发巡检

一句话职责：

- Go 后端负责业务配置和数据闭环
- OpenClaw 继续负责执行、截图、分析和企业微信对话

## 2. 当前可复用基础

现有可复用执行能力：

- 巡检执行服务：[index.mjs](/Users/chengxinzhi/Documents/code/openclaw/server-openclaw/services/stream-frame-watch/index.mjs)
- 企业微信接入与部署：[compose.yml](/Users/chengxinzhi/Documents/code/openclaw/server-openclaw/compose.yml)
- 当前巡检配置样例：[stream-frame-watch.json](/Users/chengxinzhi/Documents/code/openclaw/server-openclaw/config/stream-frame-watch.json)

后端第一期不要动这些执行细节，只要把 JSON 配置迁移到数据库，再通过 API 把配置喂给 OpenClaw。

## 3. 技术栈

建议：

- Go `1.23+`
- `Gin`
- `GORM`
- `MySQL 8`
- `zap`
- `viper`
- `robfig/cron`

建议新建目录：

`/Users/chengxinzhi/Documents/code/openclaw/inspection-api`

推荐结构：

```text
inspection-api/
  cmd/server/main.go
  internal/
    config/
    controller/
    service/
    repository/
    model/
    dto/
    middleware/
    scheduler/
    integration/
      openclaw/
      wecom/
  migrations/
  docs/
  scripts/
  go.mod
```

## 4. 后端范围

第一期必须完成：

- 门店管理 API
- 流媒体管理 API
- 巡检计划管理 API
- 点检项管理 API
- 门店绑定计划 API
- OpenClaw 执行上下文 API
- 巡检结果回写 API
- 巡检任务列表 API
- 定时任务 API

第一期不做：

- 多租户
- 复杂 RBAC
- Redis 任务队列
- 分布式调度

## 5. 数据库表

建议先建以下表：

### `stores`

- `id`
- `name`
- `code`
- `region`
- `status`
- `manager_name`
- `manager_wecom_userid`
- `remark`
- `created_at`
- `updated_at`

### `store_streams`

- `id`
- `store_id`
- `name`
- `stream_url`
- `stream_type`
- `source_alias`
- `baseline_image_url`
- `baseline_image_path`
- `enabled`
- `created_at`
- `updated_at`

### `inspection_plans`

- `id`
- `name`
- `code`
- `plan_type`
- `description`
- `frame_pick_mode`
- `match_threshold_percent`
- `difference_threshold_percent`
- `enabled`
- `created_at`
- `updated_at`

### `inspection_plan_items`

- `id`
- `plan_id`
- `item_type`
- `content`
- `sort_order`
- `required`
- `enabled`
- `created_at`
- `updated_at`

### `store_plan_bindings`

- `id`
- `store_id`
- `plan_id`
- `stream_id`
- `custom_match_threshold_percent`
- `custom_difference_threshold_percent`
- `enabled`
- `created_at`
- `updated_at`

### `inspection_jobs`

- `id`
- `job_no`
- `store_id`
- `plan_id`
- `binding_id`
- `trigger_type`
- `trigger_source`
- `operator_name`
- `operator_wecom_userid`
- `status`
- `started_at`
- `finished_at`
- `error_message`
- `created_at`
- `updated_at`

### `inspection_results`

- `id`
- `job_id`
- `verdict`
- `match_percent`
- `difference_percent`
- `observed_summary`
- `fallback_used`
- `fallback_reason`
- `plugin_recommendation`
- `plugin_recommendation_reason`
- `report_url`
- `doc_url`
- `created_at`

### `inspection_result_items`

- `id`
- `result_id`
- `clause`
- `clause_type`
- `matched`
- `evidence`
- `created_at`

### `inspection_artifacts`

- `id`
- `result_id`
- `artifact_type`
- `file_url`
- `file_path`
- `created_at`

### `schedules`

- `id`
- `store_id`
- `plan_id`
- `cron_expr`
- `enabled`
- `last_run_at`
- `next_run_at`
- `created_at`
- `updated_at`

### `alert_rules`

- `id`
- `store_id`
- `plan_id`
- `channel_type`
- `target_id`
- `mention_userid`
- `enabled`
- `created_at`
- `updated_at`

## 6. 计划模型

计划类型：

- `baseline_compare`
- `description_inspection`
- `hybrid_inspection`

点检项类型：

- `scene_expectation`
- `must_have`
- `must_not_have`
- `generic`

## 7. 核心 API

### 配置类 API

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

### 执行类 API

- `POST /api/execute/context`
- `POST /api/inspection-results`
- `GET /api/inspection-jobs`
- `GET /api/inspection-jobs/:id`
- `GET /api/inspection-results/:id`

### 定时类 API

- `GET /api/schedules`
- `POST /api/schedules`
- `PUT /api/schedules/:id`

## 8. OpenClaw 对接契约

### `POST /api/execute/context`

请求：

```json
{
  "storeName": "成都武侯店",
  "planName": "营业厅巡检",
  "source": ""
}
```

响应：

```json
{
  "store": {
    "id": 1,
    "name": "成都武侯店"
  },
  "stream": {
    "id": 10,
    "streamUrl": "https://xxx.m3u8",
    "baselineImagePath": "/data/baseline/store-1.png"
  },
  "plan": {
    "id": 100,
    "name": "营业厅巡检",
    "planType": "description_inspection",
    "framePickMode": "random",
    "matchThresholdPercent": 70
  },
  "items": [
    {
      "type": "scene_expectation",
      "content": "画面应为营业厅服务场景"
    }
  ],
  "alertRule": {
    "mentionUserId": "zhangsan"
  }
}
```

### `POST /api/inspection-results`

请求：

```json
{
  "jobId": 123,
  "verdict": "violation",
  "matchPercent": 33.33,
  "observedSummary": "画面主场景基本符合，但部分条款无法确认",
  "fallbackUsed": true,
  "fallbackReason": "视觉模型当前无稳定输出，已启用门店基准图兜底",
  "items": [
    {
      "clause": "画面应为营业厅服务场景",
      "clauseType": "scene_expectation",
      "matched": true,
      "evidence": "..."
    }
  ],
  "artifacts": [
    {
      "artifactType": "frame",
      "fileUrl": "https://ai.euzhi.com/reports/xxx-frame.png"
    }
  ]
}
```

## 9. 后端任务拆分

### 阶段 1

- 初始化 Go 项目
- 建立配置加载、日志、数据库连接
- 完成 migrations
- 完成 `stores`、`store_streams`、`inspection_plans`、`inspection_plan_items`、`store_plan_bindings` CRUD

### 阶段 2

- 完成 `execute/context`
- 完成 `inspection-results`
- 完成 `inspection-jobs`
- 完成 DTO 和统一响应结构

### 阶段 3

- 完成 `schedules`
- 完成 cron 调度
- 完成企业微信归档状态字段

## 10. 验收标准

- 能在数据库中配置门店、流、计划、点检项
- 能通过 `store + plan` 返回完整执行上下文
- 能接收 OpenClaw 回写的执行结果
- 能查询任务和结果详情
- 能为定时任务预留好执行入口

## 11. 后端线程职责边界

后端线程只负责这些目录：

- `inspection-api/**`
- 如需补充接口契约文档，可写 `server-openclaw/docs/**`

后端线程不要直接改：

- `inspection-admin/**`
- `server-openclaw/control-ui-dist/**`

如需改 OpenClaw 侧接口调用，只先更新契约文档，不直接并发改前端线程文件。

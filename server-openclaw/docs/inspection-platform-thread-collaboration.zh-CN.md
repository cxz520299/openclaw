# 门店智能巡检平台双线程协作说明

## 1. 结论

可以，推荐直接在当前 OpenClaw 里开两个线程并行推进：

- 线程 A：前端线程
- 线程 B：后端线程

这是适合当前需求的做法，因为前后端写入目录天然可以分离，互相阻塞很小。

## 2. 推荐分工

### 前端线程

负责：

- `inspection-admin/**`
- 页面结构
- Pinia store
- API 封装
- 页面联调

参考文档：

- [inspection-platform-frontend-handoff.zh-CN.md](/Users/chengxinzhi/Documents/code/openclaw/server-openclaw/docs/inspection-platform-frontend-handoff.zh-CN.md)

### 后端线程

负责：

- `inspection-api/**`
- 数据库建模
- API 实现
- 定时任务
- OpenClaw 的后端契约

参考文档：

- [inspection-platform-backend-handoff.zh-CN.md](/Users/chengxinzhi/Documents/code/openclaw/server-openclaw/docs/inspection-platform-backend-handoff.zh-CN.md)

## 3. 推荐线程标题

建议你直接这样开：

- 线程 1：`inspection-admin 前端开发`
- 线程 2：`inspection-api 后端开发`

## 4. 推荐分支

建议也分开：

- 前端分支：`codex/inspection-admin`
- 后端分支：`codex/inspection-api`

如果你只想先在一个主分支做，也可以，但不如双分支清晰。

## 5. 协作规则

- 前端线程不要直接改后端实现
- 后端线程不要直接改前端页面
- 公共契约变更先改文档，再改代码
- 每天同步一次接口字段变化

## 6. 公共契约文件建议

建议把这些作为共享基线：

- 本文档
- [inspection-platform-backend-handoff.zh-CN.md](/Users/chengxinzhi/Documents/code/openclaw/server-openclaw/docs/inspection-platform-backend-handoff.zh-CN.md)
- [inspection-platform-frontend-handoff.zh-CN.md](/Users/chengxinzhi/Documents/code/openclaw/server-openclaw/docs/inspection-platform-frontend-handoff.zh-CN.md)

后续如果接口稳定，建议再补一份：

- `inspection-platform-api-contract.zh-CN.md`

## 7. 今日开工顺序

建议今天这样开始：

1. 先开后端线程，搭 `inspection-api` 脚手架和数据表
2. 再开前端线程，搭 `inspection-admin` 页面骨架
3. 先以假数据联调页面
4. 后端出第一版 CRUD 后，再切真实接口

## 8. 我建议你给两个线程的第一句话

给后端线程：

`按 inspection-platform-backend-handoff.zh-CN.md 开工，先初始化 Go 项目、MySQL 连接、migrations 和门店/流媒体/计划/点检项 CRUD。`

给前端线程：

`按 inspection-platform-frontend-handoff.zh-CN.md 开工，先初始化 Vue3 管理后台，完成门店/流媒体/计划/点检项/绑定关系页面骨架。`

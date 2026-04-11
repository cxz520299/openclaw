# 企业微信多人可 @ 机器人且可写文档的调试说明

这份文档解决的是一个很容易踩坑的组合问题：

- 希望企业微信群里任何成员都可以 `@` OpenClaw 机器人并拿到回复
- 同时又希望 OpenClaw 能把结果写入企业微信文档或智能表格

如果直接把“聊天机器人长连接”和“企业微信文档权限”都堆在同一个机器人授权链路上，现场很容易出现下面这个现象：

- 机器人创建者自己 `@` 机器人时能回复
- 其他同事 `@` 机器人时不回复，或者表现不稳定

## 1. 结论先说

推荐的稳定方案不是把所有权限都压在聊天机器人上，而是拆成两条链路：

- 链路 A：企业微信长连接机器人
  作用：负责接收群里 `@机器人` 的消息，并正常回复所有群成员
- 链路 B：服务端直连企业微信文档/智能表格
  作用：负责创建文档、写表格、上传图片、写巡检记录

也就是说：

- 聊天机器人只保留轻量聊天能力
- 文档写入改走服务端企业应用身份
- 不要依赖聊天机器人那条链路去拿“文档用户授权”

这是当前 OpenClaw 线上已经验证过的稳定做法。

## 2. 根因说明

当企业微信机器人开启了较重的用户授权能力，比如：

- 文档
- 消息
- 日程
- 待办

实际运行中容易出现“只有机器人创建者或少数授权上下文内用户能正常触发”的现象。表面看起来像是：

- 可见范围已经是全部成员
- 群里也成功 `@` 到机器人
- 但其他人发起的消息没有正常返回

本质上，这不是 OpenClaw 主逻辑的问题，而是“聊天消息接入”和“文档能力授权”被耦合后，触发条件变复杂、行为变不稳定。

所以这里的核心思路是：

- 让 `@机器人回复` 只依赖企业微信 Bot 长连接
- 让 `写文档/写表格` 只依赖服务端企业应用凭证

这样两条链路互不拖累。

## 3. 推荐架构

### 3.1 聊天链路

OpenClaw 使用腾讯企业微信官方插件：

- `@wecom/wecom-openclaw-plugin`

它负责：

- 与企业微信建立长连接
- 接收群消息
- 处理 `@机器人`
- 把回复回传到群里

这条链路只需要下面两项：

```env
WECOM_BOT_ID=你的企业微信BotID
WECOM_BOT_SECRET=你的企业微信BotSecret
```

### 3.2 文档链路

OpenClaw 通过服务端插件直接调用企业微信文档接口：

- [`plugins/wecom-doc-mcp/index.js`](/Users/chengxinzhi/Documents/code/openclaw/server-openclaw/plugins/wecom-doc-mcp/index.js)

这条链路负责：

- 创建企业微信文档
- 创建智能表格
- 追加结构化记录
- 上传图片并生成表格图片列

推荐使用企业应用级凭证：

```env
WECOM_UPLOAD_CORPID=企业ID
WECOM_UPLOAD_SECRET=文档应用Secret
WECOM_UPLOAD_IMAGE_API_URL=https://qyapi.weixin.qq.com/cgi-bin/media/uploadimg
```

如果是文档 MCP 方式，也可以保留：

```env
WECOM_DOC_MCP_URL=你的企业微信文档 MCP 地址
```

但对“多人都能 @ 机器人”这个问题来说，关键不是 MCP 还是直连，而是：

- 不要让聊天机器人依赖文档用户授权
- 文档落库走服务端企业应用身份

## 4. 企业微信侧的推荐配置

### 4.1 机器人应用

机器人应用建议这样配：

- 可见范围：全部需要使用机器人的成员
- 群里允许 `@机器人`
- 只保留聊天必须的轻权限

不建议把下面这些重权限继续挂在聊天机器人这条链路上：

- 文档用户授权
- 消息用户授权
- 日程用户授权
- 待办用户授权

如果之前开过，出现“只有你自己能 @ 通”的现象，优先先关掉这些重授权，再验收聊天回复。

### 4.2 文档应用

再单独准备一个企业微信自建应用，专门给 OpenClaw 写文档：

- 应用已加入文档 API 可调用应用
- 已开通需要的文档/智能表格权限
- 把该应用的 `CorpID + Secret` 配到服务器环境变量

这个应用不负责群聊接消息，只负责后台写文档。

## 5. OpenClaw 当前实现方式

当前仓库里的关键实现点如下：

- 企业微信聊天入口：
  [`scripts/patch-wecom-plugin.js`](/Users/chengxinzhi/Documents/code/openclaw/server-openclaw/scripts/patch-wecom-plugin.js)
- 企业微信文档插件：
  [`plugins/wecom-doc-mcp/index.js`](/Users/chengxinzhi/Documents/code/openclaw/server-openclaw/plugins/wecom-doc-mcp/index.js)
- 文档技能说明：
  [`plugins/wecom-doc-mcp/skills/wecom-doc-mcp/SKILL.md`](/Users/chengxinzhi/Documents/code/openclaw/server-openclaw/plugins/wecom-doc-mcp/skills/wecom-doc-mcp/SKILL.md)
- 网关工具白名单：
  [`openclaw.json`](/Users/chengxinzhi/Documents/code/openclaw/server-openclaw/openclaw.json)

当前策略是：

- 企业微信消息先由官方长连接插件接入
- 文档类任务优先走 `wecom_doc_quick_report`
- 更底层的文档操作再走 `wecom_doc_mcp_call`
- 巡检报告、图片缩略图、智能表记录优先走服务端企业应用直连

## 6. 推荐环境变量清单

至少准备这几项：

```env
WECOM_BOT_ID=企业微信机器人BotID
WECOM_BOT_SECRET=企业微信机器人Secret

WECOM_UPLOAD_CORPID=企业ID
WECOM_UPLOAD_SECRET=文档应用Secret
WECOM_UPLOAD_IMAGE_API_URL=https://qyapi.weixin.qq.com/cgi-bin/media/uploadimg
```

可选项：

```env
WECOM_DOC_MCP_URL=企业微信文档MCP地址
WECOM_PLUGIN_NPM_SPEC=@wecom/wecom-openclaw-plugin@1.0.11
```

## 7. 推荐验收步骤

建议按下面顺序验收，不要一上来就混在一起测。

### 步骤 1：先验收“其他人也能 @ 机器人”

确认聊天机器人没有挂重授权后，让非机器人创建者的同事在群里发：

```text
@小智 你好
```

预期结果：

- 机器人可以回复
- 不依赖发送人是谁
- 群里多个成员都能稳定触发

### 步骤 2：再验收“机器人能写文档”

群里发：

```text
@小智 把今天的巡检结果整理成企业微信文档
```

预期结果：

- 先收到一条“已接收，正在整理并写入企业微信文档/表格”的秒回提示
- 稍后收到最终结果
- 文档或智能表格创建成功

### 步骤 3：再验收“其他人也能触发写文档”

换一个普通成员再发同样命令：

```text
@小智 把今天成都天气整理成企业微信文档，我能直接打开查看
```

预期结果：

- 普通成员也能触发
- 机器人正常回复
- 后台仍然能创建文档

如果这一步不通，基本就是权限链路又耦合回去了。

## 8. 常见排查命令

看企业微信相关日志：

```bash
cd /opt/openclaw
docker compose logs -f openclaw-gateway | grep -i wecom
```

重点看这些关键词：

- `WebSocket connected`
- `Authentication successful`
- `Inbound frame received`
- `fast ack for document request`
- `MCP config fetched`

如果只是验收聊天链路，重点看：

- 是否有 `Inbound frame received`
- 是否有正常回包

如果只是验收文档链路，重点看：

- 是否拿到了应用级 token
- 是否成功调用 `wedoc/create_doc`
- 是否成功写入 `smartsheet`

## 9. 常见错误与对应处理

### 9.1 只有我自己 @ 机器人会回复

优先检查：

- 聊天机器人是否开启了文档/消息/待办/日程等重用户授权
- 是否把文档能力错误地绑定到了聊天机器人授权链路

处理方式：

- 先关掉聊天机器人上的重授权
- 文档写入改走服务端企业应用

### 9.2 机器人能回复，但写不了文档

优先检查：

- `WECOM_UPLOAD_CORPID`
- `WECOM_UPLOAD_SECRET`
- 文档应用是否已加入文档 API 可调用应用
- 文档应用是否已开通对应接口权限

### 9.3 能写文档，但其他人又 @ 不通了

这通常说明又回到了错误配置：

- 把文档用户授权重新开在了聊天机器人上
- 或者把调试入口改成依赖单用户授权的链路

处理方式：

- 回到“双链路拆分”方案

## 10. 最佳实践

长期建议固定成下面这套：

- 一个企业微信机器人负责群聊接入
- 一个企业微信自建应用负责文档写入
- OpenClaw 服务端持有文档应用凭证
- 文档类能力优先走服务端直连
- 聊天链路保持轻权限，避免影响多人 `@`

这样后续无论是：

- 巡检日报
- 智能表记录
- 缩略图落表
- 企业微信群里多人协作调试

都会更稳定。

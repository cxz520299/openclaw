# OpenClaw 阿里云部署运维说明

本文档对应当前这套可运行的线上部署，适用于：

- 服务器：阿里云 ECS Ubuntu
- 域名：`ai.euzhi.com`
- 反向代理：Caddy
- 主服务：OpenClaw Gateway
- 控制台：OpenClaw Control UI
- 上游模型网关：`https://api.okinto.com/v1`
- 当前模型：`gpt-5.4`

## 一、当前架构

当前线上不是 OpenClaw 直接请求 `api.okinto.com/v1`，而是走下面这条链路：

```text
浏览器
  -> https://ai.euzhi.com
  -> Caddy(openclaw-web)
  -> OpenClaw Gateway(openclaw-gateway)
  -> okinto-openai-proxy.mjs
  -> https://api.okinto.com/v1
```

这样做的原因是：当前 OpenClaw 与 okinto 网关的原生兼容性不够稳定，所以在容器内增加了一层轻量兼容代理，把 OpenClaw 发出的请求整理成 okinto 可接受的 OpenAI Responses / Chat Completions 请求。

## 二、服务器上的实际目录

线上目录固定为：

```bash
/opt/openclaw
```

常见文件说明：

- `compose.yml`：Docker Compose 编排
- `.env`：线上环境变量和密钥
- `openclaw.json`：OpenClaw 主配置
- `Caddyfile`：域名 `ai.euzhi.com` 的 HTTPS 和反向代理配置
- `openclaw-ui-bootstrap.template.html`：控制台首页模板
- `openclaw-ui-bootstrap.html`：由模板渲染出的实际首页
- `scripts/render-bootstrap.sh`：根据 `.env` 中的 token 渲染首页
- `scripts/bootstrap-ubuntu.sh`：Ubuntu 一键安装 Docker 并启动服务
- `okinto-openai-proxy.mjs`：okinto 兼容代理
- `forward-browser-ui.mjs`：把浏览器 UI 转发到本机 `18801`
- `data/`：OpenClaw 持久化目录

## 三、当前容器职责

### 1. `openclaw-gateway`

主容器，负责：

- 运行 `openclaw gateway`
- 对外提供 WebSocket 网关
- 调用上游模型
- 转发 Browser UI

默认端口：

- `18789`：Gateway
- `18790`：Bridge
- `18791`：Browser UI
- `18801`：本地转发后的 Browser UI

说明：

- 这些端口当前只绑定到服务器本机 `127.0.0.1`
- 不直接暴露公网
- 公网访问统一走 `Caddy + https://ai.euzhi.com`

### 2. `openclaw-ui`

本地隧道调试用的 Nginx 控制台，监听：

```bash
127.0.0.1:18800
```

适合通过 SSH 隧道访问：

```bash
ssh -L 18800:127.0.0.1:18800 root@服务器IP
```

### 3. `openclaw-web`

公网入口，负责：

- `80/443` 端口监听
- Let’s Encrypt 证书申请和续期
- 反向代理 `/ws`
- 提供 `/app/` 控制台静态文件
- 提供 `/` 首页跳转到控制台

## 四、关键配置文件说明

### 1. `.env`

当前线上至少依赖以下变量：

```bash
OPENCLAW_GATEWAY_TOKEN=控制台连接 Gateway 使用的令牌
OPENAI_API_KEY=okinto 的上游 API Key
OPENAI_BASE_URL=https://api.okinto.com/v1
OPENCLAW_BIND_IP=127.0.0.1
OPENCLAW_GATEWAY_PORT=18789
OPENCLAW_BRIDGE_PORT=18790
OPENCLAW_BROWSER_PORT=18791
OPENCLAW_DATA_DIR=/opt/openclaw/data
```

说明：

- `OPENCLAW_GATEWAY_TOKEN` 同时会被注入到控制台首页，用于自动登录
- `OPENAI_API_KEY` 由 `okinto-openai-proxy.mjs` 转发到 okinto
- 修改 `.env` 后，通常需要重新渲染首页并重启服务

### 2. `openclaw.json`

当前配置重点：

- `gateway.mode = local`
- `gateway.controlUi.allowInsecureAuth = true`
- `gateway.controlUi.dangerouslyDisableDeviceAuth = true`
- `allowedOrigins` 允许：
  - `https://ai.euzhi.com`
  - `http://127.0.0.1:18800`
  - `http://localhost:18800`
- 模型主路由：
  - `primary = okinto/gpt-5.4`
  - `fallback = okinto/gpt-5.2`

说明：

- 上面两个 `dangerous` 开关是为了尽快让控制台能用
- 这是便捷优先的方案，不是最严格的生产安全方案

### 3. `Caddyfile`

当前职责：

- `https://ai.euzhi.com/` 提供首页
- `https://ai.euzhi.com/app/` 提供控制台
- `https://ai.euzhi.com/ws` 反代到 OpenClaw Gateway
- 自动处理 HTTPS 证书

## 五、当前已启用的助手能力

当前这套 OpenClaw 已按“执行优先”的方式做过配置，重点可验收能力如下。

### 1. 抓取社媒数据

已接入并放行：

- 小红书 MCP
- 微博 MCP
- B 站 MCP
- 企业微信文档 MCP

推荐优先使用的工具：

- `social_mcp_collect_and_report`
- `social_report_build`
- `xiaohongshu_mcp_call`
- `social_mcp_call`
- `wecom_doc_mcp_status`
- `wecom_doc_mcp_list_tools`
- `wecom_doc_mcp_call`

其中：

- `social_mcp_collect_and_report` 会直接完成“抓取 -> 保存原始 JSON -> 生成 CSV -> 生成图表 -> 输出摘要路径”
- 企业微信文档 MCP 建议先调用 `wecom_doc_mcp_list_tools` 查看企业当前开放了哪些文档能力，再调用 `wecom_doc_mcp_call`
- `social_report_build` 适合对已有 JSON 文件二次生成报告

### 1.1 企业微信机器人长连接

当前部署已经切到腾讯企业微信官方插件 `@wecom/wecom-openclaw-plugin`。

首次启动时，网关会自动：

- 从 npm 拉取官方企微插件
- 安装到 OpenClaw 数据目录
- 使用 `WECOM_BOT_ID` / `WECOM_BOT_SECRET` 建立长连接
- 自动向企业微信拉取文档 MCP 配置

需要在 `.env` 中准备：

```env
WECOM_BOT_ID=你的企业微信BotID
WECOM_BOT_SECRET=你的企业微信Secret
WECOM_PLUGIN_NPM_SPEC=@wecom/wecom-openclaw-plugin@1.0.11
```

常用验收日志：

```bash
docker compose logs -f openclaw-gateway | grep -i wecom
```

看到以下关键词通常表示接入成功：

- `WebSocket connected`
- `Authentication successful`
- `MCP config fetched`

当前企业微信对话体验建议：

- `channels.wecom.sendThinkingMessage = true`
- `agents.defaults.thinkingDefault = medium`

这样可以做到：

- 用户发消息后，企业微信先看到一条“正在处理/思考中”的占位反馈
- 长回答或需要调工具时，不会出现“长时间完全没动静”的体感
- 相比 `thinkingDefault = high`，普通问答首条正式回复会更快

多人协作调试时，如果你遇到“只有机器人创建者能 `@` 通，其他人不回复，但又想保留企业微信文档写入能力”，请直接看这篇排障文档：

- [企业微信多人可 @ 机器人且可写文档的调试说明](/Users/chengxinzhi/Documents/code/openclaw/server-openclaw/docs/wecom-shared-mention-doc-guide.zh-CN.md)

### 2. 图表与报表

网关镜像内已补齐：

- `pandas`
- `matplotlib`
- `openpyxl`

默认报表脚本：

```bash
/home/node/.openclaw/workspace/reports/scripts/social_report.py
```

默认会生成：

- `report.csv`
- `summary.md`
- `platforms.png`
- `keywords.png`
- `authors.png`
- `publish_time_trend.png`

### 3. 定时任务

OpenClaw 已放行 cron / automation 能力，适合做：

- 定时抓取关键词
- 定时生成日报或巡检
- 定时回传聊天通知

建议使用：

- 独立会话
- 清晰任务名
- 需要回聊时使用 announce 类投递方式

### 4. 视频流随机抽帧告警

这套部署额外提供了 `stream-frame-watch` 服务，适合做：

- 对视频文件或流地址随机抽一帧
- 和基准图做差异比对
- 差异超过阈值时，把异常帧发到企业微信群
- 文本里可带 `@某人` 提醒

配置文件：

```bash
server-openclaw/config/stream-frame-watch.json
```

关键字段：

- `source`: 视频文件路径、HTTP 地址，或可被 `ffmpeg` 读取的流地址
- `baselineImage`: 基准图路径
- `compareThreshold`: 差异阈值，建议先从 `0.12 ~ 0.20` 试
- `intervalSeconds`: 检查周期
- `cooldownSeconds`: 告警冷却时间，避免刷屏
- `notifier.target`: 企业微信群 `chatid`
- `notifier.mentionText`: 想在文本里带上的提醒内容，例如 `@张三`
- `notifier.dryRun`: `true` 时只打印日志，不真正发群

如果你希望企业微信巡检日报里的图片显示为“表内真缩略图”，而不是普通链接，需要额外满足这几个条件：

- `reporting.reportFormat` 使用智能表格模式
- `reporting.reportTransport` 建议使用 `direct`
- 服务端能够直连企业微信 `wedoc/smartsheet/*` 接口
- 图片列写入完整的 `CellImageValue`
- 容器里要能拿到企业微信应用级 token

推荐在服务器 `.env` 中额外配置：

```bash
WECOM_UPLOAD_IMAGE_API_URL=https://qyapi.weixin.qq.com/cgi-bin/media/uploadimg
WECOM_UPLOAD_CORPID=你的企业ID
WECOM_UPLOAD_SECRET=你的应用Secret
```

说明：

- 现在巡检写企业微信表格支持“服务端直连企业应用”模式
- 只要配置了 `WECOM_UPLOAD_CORPID` 和 `WECOM_UPLOAD_SECRET`，服务端会自动换取 access token
- `WECOM_UPLOAD_IMAGE_ACCESS_TOKEN_COMMAND` 仍可保留，但不再是必填
- 这条链路不依赖企业微信聊天机器人的“文档用户授权”
- 如果你希望群里所有人都能 `@` 机器人，同时后台还能写巡检表格，建议把聊天机器人上的“文档/消息/日程/待办”等用户授权关掉，只保留轻权限聊天；文档写入交给服务端直连企业应用
- 更完整的多人调试与排障步骤见：
  [企业微信多人可 @ 机器人且可写文档的调试说明](/Users/chengxinzhi/Documents/code/openclaw/server-openclaw/docs/wecom-shared-mention-doc-guide.zh-CN.md)

验证成功后的智能表记录里，图片列应类似这样：

```json
[
  {
    "id": "scene-id-frame",
    "title": "某门店巡检图",
    "image_url": "https://wework.qpic.cn/...",
    "width": 640,
    "height": 360
  }
]
```

启动：

```bash
docker compose --profile watch up -d stream-frame-watch
```

如果你要先给某条流生成一张基准图，可以直接执行：

```bash
bash scripts/prepare-stream-watch-baseline.sh "https://你的流地址.m3u8" "/home/node/.openclaw/workspace/stream-watch/custom/baseline.png" 0
```

查看日志：

```bash
docker compose logs -f stream-frame-watch
```

如果你更希望直接复用网关容器里已打通的企微环境，也可以改用：

```bash
bash scripts/run-stream-watch-once-via-gateway.sh
```

异常帧默认保存到：

```bash
/home/node/.openclaw/workspace/reports/stream-watch/
```

## 六、验收建议

可以直接在控制台里用下面这三类中文指令验收。

### 1. 抓取并出图

```text
帮我抓取小红书关键词 AI，保存原始数据，并生成 CSV、摘要和图表。
```

### 2. 对现有文件出图

```text
把 reports/raw 里最新的 JSON 生成报表和图表，并告诉我输出路径。
```

### 3. 建一个定时任务

```text
每 1 小时抓一次小红书关键词 AI，生成摘要并回到聊天里通知我。
```

## 七、首次部署或重建步骤

### 1. 上传部署目录

把本地 `deployment/` 上传到服务器：

```bash
scp -r deployment root@服务器IP:/opt/openclaw
```

### 2. 准备环境变量

在服务器创建 `.env`：

```bash
cd /opt/openclaw
cp .env.example .env
vim .env
```

### 3. 渲染首页

把 `.env` 中的 `OPENCLAW_GATEWAY_TOKEN` 写入首页：

```bash
cd /opt/openclaw
bash scripts/render-bootstrap.sh
```

### 4. 启动

```bash
cd /opt/openclaw
bash scripts/bootstrap-ubuntu.sh
docker compose up -d openclaw-web openclaw-ui
```

如果服务器配置较小，建议优先只启动核心服务：

```bash
cd /opt/openclaw
docker compose up -d openclaw-gateway openclaw-web
```

按需启用扩展能力：

```bash
# 社媒抓取能力
docker compose --profile social up -d weibo-mcp xhs-mcp

# QQ 机器人桥接
docker compose --profile qq up -d qq-bot-bridge

# 本地隧道调试控制台
docker compose --profile ui up -d openclaw-ui
```

### 5. 验证

```bash
docker compose ps
curl -I https://ai.euzhi.com
curl -I https://ai.euzhi.com/app/
curl -I https://ai.euzhi.com/app/assets/index-CenotFkT.js
```

预期：

- 首页返回 `200`
- `/app/` 返回 `text/html`
- `/app/assets/*.js` 返回 `application/javascript`

## 八、日常运维命令

### 一键对齐本地代码到服务器

推荐直接在本地项目目录执行：

```bash
cd server-openclaw
bash scripts/sync-server-code.sh
```

如果想先看差异，不真正覆盖服务器：

```bash
cd server-openclaw
bash scripts/sync-server-code.sh dry-run
```

这个脚本会自动做这些事：

- 用 `rsync --checksum` 把本地代码同步到 `/opt/openclaw`
- 保留服务器运行态内容，不覆盖 `.env`、`.env.*`、`data/`、`config/stream-frame-watch.json`
- 不同步本地 `node_modules/`
- 自动修正 `plugins/` 目录属主为 `root:root`
- 自动为 `social-mcp`、`wecom-doc-mcp` 补装生产依赖
- 自动重建 `openclaw-gateway`
- 自动等待网关恢复到 `healthy`

默认目标服务器：

- `root@8.147.63.36:/opt/openclaw`

如需换服务器，可临时覆盖：

```bash
REMOTE_HOST=你的服务器IP REMOTE_DIR=/opt/openclaw bash scripts/sync-server-code.sh
```

### 查看容器状态

```bash
cd /opt/openclaw
docker compose ps
```

### 查看网关日志

```bash
cd /opt/openclaw
docker compose logs -f openclaw-gateway
```

### 查看 Caddy 日志

```bash
cd /opt/openclaw
docker compose logs -f openclaw-web
```

### 查看控制台 Nginx 日志

```bash
cd /opt/openclaw
docker compose logs -f openclaw-ui
```

### 重启服务

```bash
cd /opt/openclaw
docker compose restart openclaw-gateway openclaw-web openclaw-ui
```

### 重新构建和升级

```bash
cd /opt/openclaw
docker compose build --pull
docker compose up -d
```

如果服务器资源紧张，建议改为分步重建，避免一次性拉起所有扩展服务：

```bash
cd /opt/openclaw
docker compose build --pull openclaw-gateway openclaw-web
docker compose up -d openclaw-gateway openclaw-web
```

### 执行 OpenClaw CLI 检查

```bash
cd /opt/openclaw
docker compose run --rm openclaw-cli models status
docker compose run --rm openclaw-cli doctor
```

## 九、密钥轮换流程

### 1. 轮换 Gateway Token

生成新 token，修改 `.env` 中的：

```bash
OPENCLAW_GATEWAY_TOKEN=新的随机字符串
```

然后执行：

```bash
cd /opt/openclaw
bash scripts/render-bootstrap.sh
docker compose up -d openclaw-gateway openclaw-web openclaw-ui
```

说明：

- `render-bootstrap.sh` 会把新 token 写进首页
- 这样访问 `https://ai.euzhi.com/` 时会自动带上新 token
- 旧 token 会立刻失效

### 2. 轮换上游 `OPENAI_API_KEY`

先到 okinto 控制台生成新 key，然后在服务器执行：

```bash
cd /opt/openclaw
vim .env
docker compose up -d openclaw-gateway
```

说明：

- 这个步骤通常不会影响域名和控制台静态页面
- 只会更新模型调用凭据
- 建议确认新 key 可用后，再删除旧 key

## 十、常见故障排查

### 1. 控制台白屏

优先检查：

```bash
curl -I https://ai.euzhi.com/app/assets/index-CenotFkT.js
```

如果返回的是 `text/html`，说明静态资源被错误回退到了 `index.html`，应检查 `Caddyfile` 里的 `/app/assets/*` 路由。

### 2. 控制台显示 `disconnected (1006)`

优先检查：

```bash
docker compose logs --tail=100 openclaw-gateway
docker compose logs --tail=100 openclaw-web
```

并确认：

- `https://ai.euzhi.com/ws` 已由 Caddy 反代到 `openclaw-gateway:18789`
- `allowedOrigins` 已包含 `https://ai.euzhi.com`

### 3. 模型能打开控制台，但无法回答

检查：

```bash
docker compose logs --tail=100 openclaw-gateway
docker compose exec -T openclaw-gateway sh -lc 'node -e "fetch(\"http://127.0.0.1:18789/healthz\").then(r=>r.text()).then(console.log)"'
```

再确认：

- `.env` 里的 `OPENAI_API_KEY` 是否有效
- `okinto-openai-proxy.mjs` 是否正常运行
- `openclaw.json` 的 provider 是否指向 `http://okinto-openai-proxy:19080/v1`

### 4. HTTPS 证书失败

检查：

```bash
docker compose logs --tail=100 openclaw-web
```

确认：

- `ai.euzhi.com` 的 DNS A 记录确实指向 ECS 公网 IP
- 阿里云安全组放行 `80` 和 `443`
- 服务器系统防火墙没有拦截

## 十一、安全提醒

当前这套部署为了“快速可用”，做了以下便捷设置：

- 控制台首页自动带 token
- `allowInsecureAuth = true`
- `dangerouslyDisableDeviceAuth = true`

这意味着：

- 知道域名且能访问首页的人，理论上可以直接进入控制台
- 因此建议至少配合以下措施之一：
  - Caddy Basic Auth
  - Cloudflare Access
  - 阿里云 WAF / 零信任访问
  - 只开放给固定 IP

如果后面要收紧安全，可以在下一轮运维中继续处理。

## 十二、容量优化建议

为了降低小规格 ECS 的 CPU、内存和磁盘压力，当前编排建议按下面的策略运行：

- 默认只保留 `openclaw-gateway` 和 `openclaw-web`。
- `weibo-mcp`、`xhs-mcp` 改为 `social` profile，只有在需要社媒抓取时才启动。
- `qq-bot-bridge` 改为 `qq` profile，只有在需要 QQ 机器人时才启动。
- `openclaw-ui` 保持 `ui` profile，只在 SSH 隧道调试时启动。
- 所有容器日志限制为单文件 `10m`、保留 `3` 份，减少磁盘膨胀。

建议定期执行：

```bash
docker system df
docker image prune -f
docker builder prune -f
```

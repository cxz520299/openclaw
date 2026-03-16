# OpenClaw Cloud Toolkit

[中文](#中文说明) | [English](#english)

This repository contains a deployable OpenClaw stack for cloud debugging and operations.
It is designed so you can clone it on a new computer, restore your local `.env`, and quickly reconnect to the same cloud service without leaking secrets into Git.

## 中文说明

### 项目简介

这是一个面向云端部署和日常联调的 OpenClaw 项目模板，包含：

- OpenClaw Gateway 云端部署
- Caddy HTTPS 反代
- 控制台自动跳转页
- 上游模型代理适配
- 社媒抓取插件
  - 小红书
  - 微博
  - B站
  - 抖音
- 新电脑初始化脚本
- Windows / macOS / Linux 部署脚本

### 目录结构

- [`server-openclaw`](./server-openclaw)
  云端部署主目录，包含 Docker、Caddy、OpenClaw 配置和插件
- [`deploy-openclaw.ps1`](./deploy-openclaw.ps1)
  Windows 部署脚本
- [`deploy-openclaw.sh`](./deploy-openclaw.sh)
  macOS / Linux 部署脚本
- [`setup-openclaw.ps1`](./setup-openclaw.ps1)
  Windows 新电脑初始化脚本
- [`setup-openclaw.sh`](./setup-openclaw.sh)
  macOS / Linux 新电脑初始化脚本

### 快速开始

1. 克隆仓库

```bash
git clone https://github.com/cxz520299/openclaw.git
cd openclaw
```

2. 初始化本地环境

Windows:

```powershell
.\setup-openclaw.ps1
```

macOS / Linux:

```bash
chmod +x setup-openclaw.sh deploy-openclaw.sh
./setup-openclaw.sh
```

3. 编辑本地环境变量

复制或生成后的文件：

- `server-openclaw/.env`

至少填写这些值：

- `OPENAI_API_KEY`
- `OPENCLAW_GATEWAY_TOKEN`
- 你自己的部署服务器地址

注意：

- `.env` 不会提交到 Git
- `server-openclaw/data/` 也不会提交到 Git
- 真实 token、密码、私钥不要写进代码和 README

### 一键部署

Windows:

```powershell
.\deploy-openclaw.ps1 -Server root@your-server
```

macOS / Linux:

```bash
./deploy-openclaw.sh root@your-server
```

### 新电脑迁移建议

换电脑时只需要：

1. `git clone`
2. 重新准备本地 `server-openclaw/.env`
3. 运行 `setup-openclaw.ps1` 或 `setup-openclaw.sh`
4. 再执行部署脚本

这样就能继续联调同一套云服务。

### 当前项目能力

- OpenClaw 控制台和 Gateway 云端部署
- HTTPS 域名反代
- 控制台自动带 token 跳转模板
- 微博热榜抓取
- 小红书状态检查和搜索
- B站关键词搜索
- 抖音热榜 fallback
- 抖音搜索 fallback 返回阻断状态和搜索地址

### 安全说明

本仓库已经做了基础脱敏：

- 不提交 `.env`
- 不提交运行时 `data/`
- 不提交本地运维说明
- 不提交真实网关 token
- 不把部署服务器地址写死在公共脚本默认值里

如果你还要进一步增强安全，可以继续加：

- GitHub Actions Secret
- Caddy Basic Auth
- Cloudflare Access
- 独立只读调试账号

## English

### Project Overview

This repository is a cloud-ready OpenClaw deployment toolkit for daily debugging and operations.
It includes:

- OpenClaw Gateway deployment
- Caddy HTTPS reverse proxy
- Control UI bootstrap pages
- Upstream model proxy compatibility layer
- Social crawling plugin support
  - Xiaohongshu
  - Weibo
  - Bilibili
  - Douyin
- New-machine bootstrap scripts
- Windows and Unix deployment scripts

### Repository Layout

- [`server-openclaw`](./server-openclaw)
  Main cloud deployment directory
- [`deploy-openclaw.ps1`](./deploy-openclaw.ps1)
  Windows deployment script
- [`deploy-openclaw.sh`](./deploy-openclaw.sh)
  macOS / Linux deployment script
- [`setup-openclaw.ps1`](./setup-openclaw.ps1)
  Windows bootstrap script for a fresh machine
- [`setup-openclaw.sh`](./setup-openclaw.sh)
  macOS / Linux bootstrap script for a fresh machine

### Quick Start

1. Clone the repository

```bash
git clone https://github.com/cxz520299/openclaw.git
cd openclaw
```

2. Bootstrap local configuration

Windows:

```powershell
.\setup-openclaw.ps1
```

macOS / Linux:

```bash
chmod +x setup-openclaw.sh deploy-openclaw.sh
./setup-openclaw.sh
```

3. Edit your local environment file

Local secrets live in:

- `server-openclaw/.env`

At minimum, fill:

- `OPENAI_API_KEY`
- `OPENCLAW_GATEWAY_TOKEN`
- your deployment server address

### Deploy

Windows:

```powershell
.\deploy-openclaw.ps1 -Server root@your-server
```

macOS / Linux:

```bash
./deploy-openclaw.sh root@your-server
```

### New Machine Workflow

To continue debugging the same cloud service from another computer:

1. clone the repo
2. recreate `server-openclaw/.env`
3. run the setup script
4. run the deploy script

This keeps secrets local while preserving the full deployable source in Git.

### Security Notes

This repository is sanitized by default:

- `.env` is ignored
- runtime `data/` is ignored
- machine-local ops notes are ignored
- real gateway tokens are not committed
- public scripts do not hardcode the deployment server

For stronger production security, consider adding:

- GitHub Actions secrets
- reverse proxy auth
- zero-trust access
- separate low-privilege debugging credentials

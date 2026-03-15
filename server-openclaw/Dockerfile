FROM node:22-bookworm-slim

RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g; s|security.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources

RUN apt-get update \
    && apt-get install -y --no-install-recommends tini ca-certificates curl git python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g openclaw@latest clawhub @openai/codex

RUN pip3 install --break-system-packages --no-cache-dir \
    -i https://pypi.tuna.tsinghua.edu.cn/simple \
    "bilibili-api-python>=17.1.4" \
    "matplotlib>=3.8.0" \
    "mcp[cli]>=1.4.1" \
    "openpyxl>=3.1.2" \
    "pandas>=2.2.2" \
    "requests>=2.32.3"

WORKDIR /opt/openclaw/plugins/social-mcp
COPY plugins/social-mcp/package.json ./
RUN npm config set registry https://registry.npmmirror.com \
    && npm install --omit=dev

WORKDIR /opt/openclaw
COPY plugins/social-mcp /opt/openclaw/plugins/social-mcp
COPY social-sources /opt/openclaw/social-sources

ENV HOME=/home/node \
    TERM=xterm-256color \
    NODE_ENV=production

WORKDIR /home/node
USER node

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["openclaw", "gateway", "--bind", "loopback", "--port", "18789"]

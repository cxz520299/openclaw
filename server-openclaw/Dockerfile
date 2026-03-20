ARG OPENCLAW_GIT_REF=61d171a

FROM node:24-bookworm AS build

ARG OPENCLAW_GIT_REF

RUN set -eux; \
    for attempt in 1 2 3 4 5; do \
      if curl --retry 5 --retry-all-errors --retry-delay 2 -fsSL https://bun.sh/install | bash; then \
        break; \
      fi; \
      if [ "$attempt" -eq 5 ]; then \
        exit 1; \
      fi; \
      sleep $((attempt * 2)); \
    done
ENV PATH="/root/.bun/bin:${PATH}"

RUN corepack enable

WORKDIR /tmp
RUN curl --retry 5 --retry-all-errors --retry-delay 2 -fsSL \
      "https://codeload.github.com/openclaw/openclaw/tar.gz/${OPENCLAW_GIT_REF}" \
      -o openclaw.tar.gz && \
    mkdir -p /src/openclaw && \
    tar -xzf openclaw.tar.gz -C /src/openclaw --strip-components=1 && \
    rm -f openclaw.tar.gz

WORKDIR /src/openclaw

RUN --mount=type=cache,id=openclaw-pnpm-store,target=/root/.local/share/pnpm/store,sharing=locked \
    NODE_OPTIONS=--max-old-space-size=2048 pnpm install --frozen-lockfile

RUN pnpm canvas:a2ui:bundle || \
    (echo "A2UI bundle: creating stub (non-fatal)" && \
     mkdir -p src/canvas-host/a2ui && \
     echo "/* A2UI bundle unavailable in this build */" > src/canvas-host/a2ui/a2ui.bundle.js && \
     echo "stub" > src/canvas-host/a2ui/.bundle.hash && \
     rm -rf vendor/a2ui apps/shared/OpenClawKit/Tools/CanvasA2UI)

RUN pnpm build:docker

ENV OPENCLAW_PREFER_PNPM=1
RUN pnpm ui:build

RUN CI=true pnpm prune --prod && \
    find dist -type f \( -name '*.d.ts' -o -name '*.d.mts' -o -name '*.d.cts' -o -name '*.map' \) -delete

FROM node:24-bookworm-slim

ARG OPENCLAW_GIT_REF

LABEL org.opencontainers.image.source="https://github.com/openclaw/openclaw" \
  org.opencontainers.image.revision="${OPENCLAW_GIT_REF}" \
  org.opencontainers.image.title="OpenClaw VPS custom build"

RUN if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
      sed -i 's|deb.debian.org|mirrors.aliyun.com|g; s|security.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources; \
    fi

RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      tini \
      ca-certificates \
      curl \
      ffmpeg \
      git \
      hostname \
      imagemagick \
      lsof \
      openssl \
      procps \
      python3 \
      python3-pip \
      chromium \
      xauth \
      xvfb && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build /src/openclaw/dist ./dist
COPY --from=build /src/openclaw/node_modules ./node_modules
COPY --from=build /src/openclaw/package.json ./package.json
COPY --from=build /src/openclaw/openclaw.mjs ./openclaw.mjs
COPY --from=build /src/openclaw/extensions ./extensions
COPY --from=build /src/openclaw/skills ./skills
COPY --from=build /src/openclaw/docs ./docs

RUN npm config set registry https://registry.npmmirror.com && \
    npm install -g clawhub @openai/codex xhs-mcp@latest

RUN mkdir -p /opt/openclaw/plugins/social-mcp && \
    mkdir -p /opt/openclaw/plugins/wecom-doc-mcp && \
    mkdir -p /app/extensions && \
    mkdir -p /usr/local/lib/node_modules/openclaw/extensions/acpx/node_modules && \
    chown -R node:node /app /opt/openclaw /usr/local/lib/node_modules/openclaw/extensions

RUN pip3 install --break-system-packages --no-cache-dir \
    -i https://pypi.tuna.tsinghua.edu.cn/simple \
    "bilibili-api-python>=17.1.4" \
    "matplotlib>=3.8.0" \
    "mcp[cli]>=1.4.1" \
    "openpyxl>=3.1.2" \
    "pandas>=2.2.2" \
    "requests>=2.32.3"

WORKDIR /opt/openclaw/plugins/social-mcp
COPY plugins/social-mcp/package.json ./package.json
RUN npm config set registry https://registry.npmmirror.com && \
    npm install --omit=dev

WORKDIR /opt/openclaw/plugins/wecom-doc-mcp
COPY plugins/wecom-doc-mcp/package.json ./package.json
RUN npm config set registry https://registry.npmmirror.com && \
    npm install --omit=dev

WORKDIR /opt/openclaw
COPY plugins/social-mcp /opt/openclaw/plugins/social-mcp
COPY plugins/wecom-doc-mcp /opt/openclaw/plugins/wecom-doc-mcp
COPY social-sources /opt/openclaw/social-sources
RUN ln -sfn /opt/openclaw/plugins/social-mcp /app/extensions/social-mcp
RUN ln -sfn /opt/openclaw/plugins/wecom-doc-mcp /app/extensions/wecom-doc-mcp

ENV HOME=/home/node \
    TERM=xterm-256color \
    NODE_ENV=production \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_SKIP_DOWNLOAD=true

WORKDIR /home/node
USER node

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "/app/dist/index.js", "gateway", "--bind", "loopback", "--port", "18789"]

FROM node:22-bookworm-slim

RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g; s|security.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        chromium \
        fonts-liberation \
        fonts-noto-cjk \
        libasound2 \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        libcups2 \
        libdbus-1-3 \
        libdrm2 \
        libgbm1 \
        libgtk-3-0 \
        libnspr4 \
        libnss3 \
        libu2f-udev \
        libx11-6 \
        libx11-xcb1 \
        libxcb1 \
        libxcomposite1 \
        libxdamage1 \
        libxext6 \
        libxfixes3 \
        libxkbcommon0 \
        libxrandr2 \
        wget \
        xauth \
        xvfb \
        xdg-utils \
    && rm -rf /var/lib/apt/lists/*

ENV HOME=/home/node \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_CACHE_DIR=/opt/puppeteer \
    PUPPETEER_SKIP_DOWNLOAD=true \
    XHS_HEADLESS=true \
    DISPLAY=:99

RUN npm config set registry https://registry.npmmirror.com \
    && npm install -g xhs-mcp@latest

RUN mkdir -p /home/node/.xhs-mcp /opt/puppeteer \
    && chown -R node:node /home/node /opt/puppeteer

USER node
WORKDIR /home/node

EXPOSE 3100

CMD ["sh", "-lc", "xvfb-run -a xhs-mcp mcp --mode http --port 3100"]

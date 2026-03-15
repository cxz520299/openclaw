FROM node:22-bookworm-slim

RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g; s|security.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
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
        xdg-utils \
    && rm -rf /var/lib/apt/lists/*

ENV HOME=/home/node \
    PUPPETEER_CACHE_DIR=/opt/puppeteer \
    XHS_HEADLESS=true

RUN npm config set registry https://registry.npmmirror.com \
    && npm install -g xhs-mcp@latest \
    && npx puppeteer browsers install chrome --path /opt/puppeteer

RUN mkdir -p /home/node/.xhs-mcp /opt/puppeteer \
    && chown -R node:node /home/node /opt/puppeteer

USER node
WORKDIR /home/node

EXPOSE 3100

CMD ["xhs-mcp", "mcp", "--mode", "http", "--port", "3100"]

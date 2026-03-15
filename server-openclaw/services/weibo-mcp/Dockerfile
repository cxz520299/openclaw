FROM python:3.10-slim

RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g; s|security.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list

RUN pip install --no-cache-dir --upgrade pip \
    -i https://pypi.tuna.tsinghua.edu.cn/simple \
    && pip install --no-cache-dir \
    -i https://pypi.tuna.tsinghua.edu.cn/simple \
    https://github.com/qinyuanpei/mcp-server-weibo/archive/refs/heads/main.zip

ENV PORT=4200
EXPOSE 4200

CMD ["mcp-server-weibo", "--http"]

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";

const port = 18800;
const root = "/usr/local/lib/node_modules/openclaw/dist/control-ui";
const gatewayWsPath = "/ws";
const gatewayUrl = process.env.OPENCLAW_GATEWAY_WS_URL || `ws://127.0.0.1:${port}${gatewayWsPath}`;
const gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN || "";
const upstreamGatewayHost = "127.0.0.1";
const upstreamGatewayPort = 18789;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

function bootstrapHtml() {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>OpenClaw</title>
  </head>
  <body>
    <script>
      (function() {
        var current = new URLSearchParams((location.hash || "").replace(/^#/, ""));
        if (!current.get("gatewayUrl")) current.set("gatewayUrl", ${JSON.stringify(gatewayUrl)});
        if (!current.get("token")) current.set("token", ${JSON.stringify(gatewayToken)});
        if (!current.get("session") || current.get("session") === "main") current.set("session", "desk");
        location.replace("/app/#" + current.toString());
      })();
    </script>
  </body>
</html>`;
}

function safePath(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]);
  const normalized = path.normalize(clean).replace(/^(\.\.[/\\])+/, "");
  const relative = normalized.replace(/^\/app/, "");
  if (relative === "/" || relative === "" || relative === ".") {
    return path.join(root, "index.html");
  }
  return path.join(root, relative);
}

const server = http.createServer((req, res) => {
  const reqPath = (req.url || "/").split("?")[0];

  if (reqPath === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(bootstrapHtml());
    return;
  }

  if (!reqPath.startsWith("/app")) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  let filePath = safePath(req.url || "/app/");

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  if (!fs.existsSync(filePath)) {
    filePath = path.join(root, "index.html");
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": contentType });
  fs.createReadStream(filePath).pipe(res);
});

server.on("upgrade", (req, socket, head) => {
  if ((req.url || "").split("?")[0] !== gatewayWsPath) {
    socket.destroy();
    return;
  }
  const upstreamSocket = net.connect(upstreamGatewayPort, upstreamGatewayHost, () => {
    const headerLines = [];
    for (const [key, value] of Object.entries(req.headers)) {
      if (value == null) continue;
      const lower = key.toLowerCase();
      if (lower === "host") continue;
      if (Array.isArray(value)) {
        for (const entry of value) headerLines.push(`${key}: ${entry}`);
      } else {
        headerLines.push(`${key}: ${value}`);
      }
    }
    const request =
      `GET / HTTP/1.1\r\n` +
      `Host: ${upstreamGatewayHost}:${upstreamGatewayPort}\r\n` +
      headerLines.join("\r\n") +
      `\r\n\r\n`;
    upstreamSocket.write(request);
    if (head?.length) upstreamSocket.write(head);
  });

  upstreamSocket.once("data", (chunk) => {
    socket.write(chunk);
    upstreamSocket.pipe(socket);
    socket.pipe(upstreamSocket);
  });

  upstreamSocket.on("error", () => {
    socket.destroy();
  });

  socket.on("error", () => {
    upstreamSocket.destroy();
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Control UI bootstrap server listening on http://0.0.0.0:${port}`);
});

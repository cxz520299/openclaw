import http from "node:http";

const listenPort = 18801;
const targetHost = "127.0.0.1";
const targetPort = 18791;
const gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN || "";

function withAuth(headers = {}) {
  const next = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value == null) continue;
    const lower = key.toLowerCase();
    if (
      lower === "host" ||
      lower === "connection" ||
      lower === "content-length" ||
      lower === "transfer-encoding"
    ) {
      continue;
    }
    next[lower] = value;
  }
  if (gatewayToken) {
    next.authorization = `Bearer ${gatewayToken}`;
  }
  return next;
}

const server = http.createServer((req, res) => {
  const upstream = http.request(
    {
      host: targetHost,
      port: targetPort,
      path: req.url,
      method: req.method,
      headers: withAuth(req.headers)
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    }
  );

  upstream.on("error", (error) => {
    res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`Browser UI upstream error: ${error}`);
  });

  req.pipe(upstream);
});

server.on("upgrade", (req, socket, head) => {
  const upstreamReq = http.request({
    host: targetHost,
    port: targetPort,
    path: req.url,
    method: req.method,
    headers: withAuth(req.headers)
  });

  upstreamReq.on("upgrade", (upstreamRes, upstreamSocket, upstreamHead) => {
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n${Object.entries(upstreamRes.headers)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\r\n")}\r\n\r\n`
    );
    if (upstreamHead?.length) socket.write(upstreamHead);
    if (head?.length) upstreamSocket.write(head);
    upstreamSocket.pipe(socket).pipe(upstreamSocket);
  });

  upstreamReq.on("error", () => {
    socket.destroy();
  });

  upstreamReq.end();
});

server.listen(listenPort, "0.0.0.0", () => {
  console.log(`Browser UI forwarder listening on http://0.0.0.0:${listenPort}`);
});

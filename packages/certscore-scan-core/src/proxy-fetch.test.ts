import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import type { Socket } from "node:net";
import test from "node:test";
import { proxyFetch } from "./proxy-fetch.js";

test("proxyFetch sends HTTP requests through the configured proxy", async () => {
  const target = createServer((request, response) => {
    if (request.url === "/no-content") {
      response.writeHead(204);
      response.end();
      return;
    }
    response.writeHead(200, { "content-type": "text/plain" });
    response.end(`${request.method}:${request.url}`);
  });
  const proxy = createServer((request, response) => {
    const targetUrl = new URL(request.url);
    const upstream = fetch(targetUrl, {
      method: request.method,
      headers: request.headers as HeadersInit,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request,
      // Node's proxy fixture only needs to prove absolute-form routing.
      duplex: "half",
    });
    void upstream.then(async (upstreamResponse) => {
      response.writeHead(upstreamResponse.status, Object.fromEntries(upstreamResponse.headers));
      response.end(await upstreamResponse.text());
    }, (error: unknown) => {
      response.writeHead(502);
      response.end(String(error));
    });
  });

  target.listen(0, "127.0.0.1");
  proxy.listen(0, "127.0.0.1");
  await Promise.all([once(target, "listening"), once(proxy, "listening")]);
  const targetPort = (target.address() as { port: number }).port;
  const proxyPort = (proxy.address() as { port: number }).port;

  try {
    const response = await proxyFetch(`http://127.0.0.1:${targetPort}/health?via=proxy`, {
      headers: { "x-test": "proxy" },
    }, {
      SCAN_PROXY_ENABLED: "true",
      SCAN_PROXY_SERVER: `http://127.0.0.1:${proxyPort}`,
    });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "GET:/health?via=proxy");

    const noContentResponse = await proxyFetch(`http://127.0.0.1:${targetPort}/no-content`, undefined, {
      SCAN_PROXY_ENABLED: "true",
      SCAN_PROXY_SERVER: `http://127.0.0.1:${proxyPort}`,
    });
    assert.equal(noContentResponse.status, 204);
    assert.equal(await noContentResponse.text(), "");
  } finally {
    proxy.close();
    target.close();
    await Promise.all([once(proxy, "close"), once(target, "close")]);
  }
});

test("proxyFetch preserves direct local behavior when no proxy is configured", async () => {
  const response = await proxyFetch("http://example.test", undefined, {}, async () => new Response("direct"));
  assert.equal(await response.text(), "direct");
});

test("proxyFetch contains HTTPS tunnel socket errors when a request is aborted", async () => {
  const proxy = createServer();
  const tunnelSockets = new Set<Socket>();
  proxy.on("connect", (_request, socket) => {
    tunnelSockets.add(socket);
    socket.once("close", () => tunnelSockets.delete(socket));
    socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
  });
  proxy.listen(0, "127.0.0.1");
  await once(proxy, "listening");
  const proxyPort = (proxy.address() as { port: number }).port;
  const controller = new AbortController();
  const timeoutError = new Error("HTTP redirect probe timed out");

  try {
    const pending = proxyFetch("https://example.test/", {
      signal: controller.signal,
    }, {
      SCAN_PROXY_ENABLED: "true",
      SCAN_PROXY_SERVER: `http://127.0.0.1:${proxyPort}`,
    });
    setTimeout(() => controller.abort(timeoutError), 25);
    await assert.rejects(pending, timeoutError);
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    for (const socket of tunnelSockets) socket.destroy();
    await new Promise<void>((resolve, reject) => {
      proxy.close((error) => error ? reject(error) : resolve());
    });
  }
});

import { once } from "node:events";
import { createServer } from "node:http";

const placeholderPath = "/cgi-sys/defaultwebpage.cgi";
const templateAssets = new Set(["/img-sys/powered_by_cpanel.svg", "/img-sys/server_misconfigured.png"]);
const marker = '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="32"><rect width="96" height="32" fill="#b45309"/></svg>';
const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");

/** A local, deterministic cPanel-shaped fallback with original fixture graphics. */
export async function startCpanelHostingPlaceholderFixture() {
  const server = createServer((request, response) => {
    if (request.method !== "GET") {
      response.writeHead(405).end();
    } else if (request.url === "/") {
      response.writeHead(302, { location: placeholderPath }).end();
    } else if (request.url === placeholderPath) {
      response.writeHead(200, { "content-type": "text/html" }).end(
        '<!doctype html><html lang="en"><title>Hosting fixture</title><main><img src="/img-sys/powered_by_cpanel.svg" alt="Hosting provider"><img src="/img-sys/server_misconfigured.png" alt="Server status"></main></html>',
      );
    } else if (request.url && templateAssets.has(request.url)) {
      if (request.url.endsWith(".svg")) response.writeHead(200, { "content-type": "image/svg+xml" }).end(marker);
      else response.writeHead(200, { "content-type": "image/png" }).end(pixel);
    } else {
      response.writeHead(404).end();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Loopback fixture did not bind to a TCP port.");
  }
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    url: `${origin}/`,
    placeholderUrl: origin + placeholderPath,
    async close() {
      const closed = once(server, "close");
      server.close();
      server.closeAllConnections();
      await closed;
    },
  };
}

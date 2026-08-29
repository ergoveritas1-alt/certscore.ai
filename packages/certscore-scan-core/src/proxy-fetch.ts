import * as http from "node:http";
import * as https from "node:https";
import * as tls from "node:tls";
import { Readable } from "node:stream";
import type { ClientRequest, IncomingMessage } from "node:http";
import type { TLSSocket } from "node:tls";
import { assertPublicNetworkUrl, publicNetworkGuardEnabled } from "./public-network-guard.js";

const PROXY_SERVER_KEYS = [
  "CERTSCORE_V2_DAG_LAMBDA_PROXY_SERVER",
  "SCAN_PROXY_SERVER",
  "CERTSCORE_CHROMIUM_PROXY_SERVER",
] as const;
const PROXY_USERNAME_KEYS = [
  "CERTSCORE_V2_DAG_LAMBDA_PROXY_USERNAME",
  "CERTSCORE_CHROMIUM_PROXY_USERNAME",
] as const;
const PROXY_PASSWORD_KEYS = [
  "CERTSCORE_V2_DAG_LAMBDA_PROXY_PASSWORD",
  "CERTSCORE_CHROMIUM_PROXY_PASSWORD",
] as const;

export function configuredProxyServer(env: Record<string, string | undefined> = process.env): string | undefined {
  const enabled = env.SCAN_PROXY_ENABLED?.trim().toLowerCase();
  if (enabled === "false" || enabled === "0" || enabled === "off") return undefined;
  return firstTrimmed(env, PROXY_SERVER_KEYS);
}

export async function proxyFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined = undefined,
  env: Record<string, string | undefined> = process.env,
  fallback: typeof fetch = fetch,
): Promise<Response> {
  const target = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
  if (publicNetworkGuardEnabled(env)) await assertPublicNetworkUrl(target);
  const proxyServer = configuredProxyServer(env);
  if (!proxyServer) return fallback(input, init);
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return fallback(input, init);
  }

  return requestThroughProxy(target, init, env);
}

export async function connectTlsThroughConfiguredProxy(
  target: { hostname: string; port: number; servername?: string },
  signal?: AbortSignal,
  env: Record<string, string | undefined> = process.env,
): Promise<TLSSocket | null> {
  if (publicNetworkGuardEnabled(env)) {
    await assertPublicNetworkUrl(`https://${target.hostname}:${target.port}`);
  }
  const proxyServer = configuredProxyServer(env);
  if (!proxyServer) return null;
  const proxy = new URL(proxyServer.includes("://") ? proxyServer : `http://${proxyServer}`);
  if (proxy.protocol !== "http:" && proxy.protocol !== "https:") {
    throw new Error(`Unsupported egress proxy protocol: ${proxy.protocol}`);
  }

  return new Promise<TLSSocket>((resolve, reject) => {
    let settled = false;
    let request: ClientRequest | undefined;
    let tunnelSocket: import("node:net").Socket | undefined;
    let tlsSocket: TLSSocket | undefined;
    const cleanup = () => signal?.removeEventListener("abort", abort);
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      request?.destroy();
      tlsSocket?.destroy();
      tunnelSocket?.destroy();
      reject(error);
    };
    const abort = () => fail(abortError(signal, "Proxy TLS connection aborted."));
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });

    const username = firstTrimmed(env, PROXY_USERNAME_KEYS) ?? decodeURIComponent(proxy.username);
    const password = firstTrimmed(env, PROXY_PASSWORD_KEYS) ?? decodeURIComponent(proxy.password);
    const authority = `${target.hostname}:${target.port}`;
    const headers: Record<string, string> = { host: authority };
    if (username) {
      headers["proxy-authorization"] = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
    }
    request = (proxy.protocol === "https:" ? https.request : http.request)({
      hostname: proxy.hostname,
      port: Number(proxy.port || (proxy.protocol === "https:" ? 443 : 80)),
      method: "CONNECT",
      path: authority,
      headers,
      ...(proxy.protocol === "https:" ? { servername: proxy.hostname } : {}),
    });
    request.once("connect", (response, socket, head) => {
      if ((response.statusCode ?? 0) !== 200) {
        response.resume();
        socket.destroy();
        fail(new Error(`Egress proxy CONNECT failed with HTTP ${response.statusCode ?? 0}`));
        return;
      }
      tunnelSocket = socket;
      if (head.length > 0) socket.unshift(head);
      tlsSocket = tls.connect({
        socket,
        rejectUnauthorized: false,
        ...(target.servername ? { servername: target.servername } : {}),
      });
      tlsSocket.once("secureConnect", () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(tlsSocket as TLSSocket);
      });
      tlsSocket.once("error", fail);
    });
    request.once("error", fail);
    request.end();
  });
}

async function requestThroughProxy(
  target: URL,
  init: RequestInit | undefined,
  env: Record<string, string | undefined>,
): Promise<Response> {
  const proxyServer = configuredProxyServer(env);
  if (!proxyServer) throw new Error("Proxy transport was requested without a configured proxy.");
  const proxy = new URL(proxyServer.includes("://") ? proxyServer : `http://${proxyServer}`);
  if (proxy.protocol !== "http:" && proxy.protocol !== "https:") {
    throw new Error(`Unsupported egress proxy protocol: ${proxy.protocol}`);
  }

  const method = (init?.method || "GET").toUpperCase();
  const body = await requestBody(init?.body);
  const headers = new Headers(init?.headers);
  headers.set("host", target.host);
  if (body && !headers.has("content-length")) headers.set("content-length", String(body.byteLength));
  const username = firstTrimmed(env, PROXY_USERNAME_KEYS) ?? decodeURIComponent(proxy.username);
  const password = firstTrimmed(env, PROXY_PASSWORD_KEYS) ?? decodeURIComponent(proxy.password);
  if (username && !headers.has("proxy-authorization")) {
    headers.set("proxy-authorization", `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`);
  }
  const requestHeaders = Object.fromEntries(headers.entries());
  const signal = init?.signal;

  return new Promise<Response>((resolve, reject) => {
    let request: ClientRequest | undefined;
    let tunnelSocket: import("node:net").Socket | undefined;
    let settled = false;

    const cleanup = () => signal?.removeEventListener("abort", abort);
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const succeed = (response: IncomingMessage) => {
      if (settled) return;
      settled = true;
      cleanup();
      const status = response.statusCode ?? 502;
      const responseHeaders = new Headers();
      for (const [name, value] of Object.entries(response.headers)) {
        if (Array.isArray(value)) value.forEach((item) => responseHeaders.append(name, item));
        else if (value !== undefined) responseHeaders.set(name, value);
      }
      const responseBody = method === "HEAD" || status === 204 || status === 205 || status === 304
        ? null
        : Readable.toWeb(response) as ReadableStream;
      if (responseBody === null) response.resume();
      resolve(new Response(responseBody, {
        status,
        statusText: response.statusMessage,
        headers: responseHeaders,
      }));
    };
    const abort = () => {
      const reason = signal?.reason;
      const error = reason instanceof Error ? reason : new Error("Proxy HTTP request aborted.");
      request?.destroy(error);
      tunnelSocket?.destroy(error);
      fail(error);
    };

    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });

    const proxyPort = Number(proxy.port || (proxy.protocol === "https:" ? 443 : 80));
    const proxyRequestOptions = {
      hostname: proxy.hostname,
      port: proxyPort,
      method,
      headers: requestHeaders,
      ...(proxy.protocol === "https:" ? { servername: proxy.hostname } : {}),
    };

    if (target.protocol === "http:") {
      request = (proxy.protocol === "https:" ? https.request : http.request)({
        ...proxyRequestOptions,
        path: target.toString(),
      }, succeed);
      request.once("error", fail);
      request.end(body);
      return;
    }

    const connectHeaders = {
      host: target.host,
      ...(requestHeaders["proxy-authorization"] ? { "proxy-authorization": requestHeaders["proxy-authorization"] } : {}),
    };
    const connectRequest = (proxy.protocol === "https:" ? https.request : http.request)({
      ...proxyRequestOptions,
      method: "CONNECT",
      path: target.host,
      headers: connectHeaders,
    });
    request = connectRequest;
    connectRequest.once("connect", (response, socket, head) => {
      if ((response.statusCode ?? 0) !== 200) {
        response.resume();
        fail(new Error(`Egress proxy CONNECT failed with HTTP ${response.statusCode ?? 0}`));
        socket.destroy();
        return;
      }
      tunnelSocket = socket;
      socket.once("error", fail);
      if (head.length > 0) socket.unshift(head);
      const tunnelAgent = new https.Agent({ keepAlive: false });
      tunnelAgent.createConnection = () => tls.connect({
        servername: target.hostname,
        socket,
      });
      const secureRequest = https.request({
        hostname: target.hostname,
        port: target.port || "443",
        path: `${target.pathname}${target.search}`,
        method,
        headers: requestHeaders,
        agent: tunnelAgent,
        servername: target.hostname,
      }, succeed);
      request = secureRequest;
      secureRequest.once("error", fail);
      secureRequest.end(body);
    });
    connectRequest.once("error", fail);
    connectRequest.end();
  });
}

async function requestBody(body: BodyInit | null | undefined): Promise<Buffer | undefined> {
  if (body === null || body === undefined) return undefined;
  if (typeof body === "string") return Buffer.from(body);
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (body instanceof URLSearchParams) return Buffer.from(body.toString());
  if (body instanceof Blob) return Buffer.from(await body.arrayBuffer());
  throw new Error("Proxy transport only supports bounded replayable request bodies.");
}

function firstTrimmed<T extends readonly string[]>(env: Record<string, string | undefined>, keys: T): string | undefined {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function abortError(signal: AbortSignal | undefined, fallback: string): Error {
  return signal?.reason instanceof Error ? signal.reason : new Error(fallback);
}

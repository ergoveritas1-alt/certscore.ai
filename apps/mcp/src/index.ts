import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { verifyCertScoreAccessToken } from "@certscore/mcp-auth";
import { createCertScoreMcpServer } from "@certscore/mcp/server";
import { CERTSCORE_MCP_VERSION } from "@certscore/mcp/version";
import { getAllowedOrigins, getEnv } from "./env.js";
import { McpHttpSessionStore } from "./session-store.js";
import { McpReadThrottle, mcpReadCallsFromJsonRpc } from "./read-throttle.js";
import sharedPolicy from "@website-signal-risk-scanner/shared";

const { apiReadRateLimitGuidance } = sharedPolicy;

const env = getEnv();
const allowedOrigins = getAllowedOrigins(env);
const sessions = new McpHttpSessionStore({
  maxCount: env.SESSION_MAX_COUNT,
  ttlSeconds: env.SESSION_TTL_SECONDS
});
const readThrottle = new McpReadThrottle();

function installSseKeepalive(res: ServerResponse) {
  const keepalive = setInterval(() => {
    if (res.writableEnded || res.destroyed) {
      clearInterval(keepalive);
      return;
    }
    const contentType = String(res.getHeader("Content-Type") ?? "").toLowerCase();
    if (res.headersSent && contentType.includes("text/event-stream")) {
      res.write(":ka\n\n");
    }
  }, 25_000);

  res.on("close", () => clearInterval(keepalive));
  res.on("finish", () => clearInterval(keepalive));
}

function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(payload),
    "Content-Type": "application/json; charset=utf-8",
    ...headers
  });
  res.end(payload);
}

function publicMetadata() {
  const issuer = env.OAUTH_ISSUER;
  return {
    resource: `${env.MCP_PUBLIC_URL}/mcp`,
    authorization_servers: [issuer],
    bearer_methods_supported: ["header"],
    scopes_supported: ["scan:read", "mcp"],
    grant_gated_scopes: ["scan:create"],
    resource_documentation: `${issuer}/developers/mcp`
  };
}

function requestUrl(req: IncomingMessage) {
  return new URL(req.url ?? "/", env.MCP_PUBLIC_URL);
}

function requestOriginAllowed(req: IncomingMessage) {
  const origin = req.headers.origin;
  if (!origin) {
    return true;
  }
  return allowedOrigins.has(origin);
}

function hostAllowed(req: IncomingMessage) {
  const expected = new URL(env.MCP_PUBLIC_URL).host;
  const host = req.headers["x-forwarded-host"]?.toString().split(",")[0]?.trim() || req.headers.host || "";
  return host === expected || host.startsWith("localhost:") || host.startsWith("127.0.0.1:");
}

function corsHeaders(req: IncomingMessage) {
  const origin = req.headers.origin;
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id, MCP-Protocol-Version",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Expose-Headers": "Mcp-Session-Id, Retry-After, WWW-Authenticate",
    "Vary": "Origin"
  };
  if (origin && allowedOrigins.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function unauthorized(
  res: ServerResponse,
  req: IncomingMessage,
  reason: "missing_token" | "invalid_token" | "session_token_mismatch",
  message = "Valid OAuth bearer token required."
) {
  console.warn(JSON.stringify({ event: "mcp_http.auth_failed", reason, source: "mcp-http" }));
  json(res, 401, { error: "unauthorized", error_description: message }, {
    ...corsHeaders(req),
    "WWW-Authenticate": `Bearer resource_metadata="${env.MCP_PUBLIC_URL}/.well-known/oauth-protected-resource/mcp"`
  });
}

async function readJsonBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return undefined;
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function bearerToken(req: IncomingMessage) {
  const authorization = req.headers.authorization?.trim();
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function firstHeaderValue(value: string | string[] | undefined) {
  return value?.toString().split(",")[0]?.trim() || null;
}

function requesterIp(req: IncomingMessage) {
  return firstHeaderValue(req.headers["cf-connecting-ip"])
    ?? firstHeaderValue(req.headers["x-forwarded-for"])
    ?? firstHeaderValue(req.headers["x-real-ip"]);
}

function authenticate(req: IncomingMessage) {
  const token = bearerToken(req);
  if (!token) {
    return { ok: false as const, reason: "missing" as const };
  }
  const verified = verifyCertScoreAccessToken({
    audience: env.MCP_PUBLIC_URL,
    issuer: env.OAUTH_ISSUER,
    jwtSecret: env.jwtSecret,
    token
  });
  if (!verified.ok) {
    return { ok: false as const, reason: verified.reason };
  }
  return { ok: true as const, claims: verified.claims, token, tokenHash: sessions.hashToken(token) };
}

function isInitialize(body: unknown) {
  return Boolean(body && typeof body === "object" && !Array.isArray(body) && (body as Record<string, unknown>).method === "initialize");
}

async function handleMcp(req: IncomingMessage, res: ServerResponse, anonymous: boolean, light = false) {
  if (!hostAllowed(req) || !requestOriginAllowed(req)) {
    return json(res, 403, { error: "forbidden", error_description: "Host or Origin is not allowed." }, corsHeaders(req));
  }
  const clientIp = anonymous ? requesterIp(req) : null;
  let token: string | undefined;
  let tokenHash: string;
  if (anonymous) {
    tokenHash = sessions.hashToken(`anonymous:${clientIp ?? "unknown-requester"}`);
  } else {
    const auth = authenticate(req);
    if (!auth.ok) {
      return unauthorized(res, req, auth.reason === "missing" ? "missing_token" : "invalid_token");
    }
    token = auth.token;
    tokenHash = auth.tokenHash;
  }
  const sessionId = req.headers["mcp-session-id"]?.toString();
  let parsedBody: unknown;
  if (req.method === "POST") {
    try {
      parsedBody = await readJsonBody(req);
    } catch {
      return json(res, 400, { error: "invalid_request", error_description: "MCP request body must be valid JSON." }, corsHeaders(req));
    }
  }

  let session = sessionId ? sessions.get(sessionId) : null;
  if (!session && req.method === "POST" && isInitialize(parsedBody)) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID()
    });
    const server = createCertScoreMcpServer({
      apiKey: token,
      anonymousRequesterSecret: anonymous ? env.jwtSecret : undefined,
      baseUrl: env.CERTSCORE_BASE_URL,
      forwardedClientIp: clientIp,
      timeout: env.CERTSCORE_REQUEST_TIMEOUT_MS,
      toolProfile: light ? "light" : "full"
    });
    transport.onclose = () => {
      if (transport.sessionId) {
        sessions.delete(transport.sessionId);
      }
    };
    await server.connect(transport);
    res.setHeader("Cache-Control", "no-store");
    for (const [key, value] of Object.entries(corsHeaders(req))) {
      res.setHeader(key, value);
    }
    installSseKeepalive(res);
    await transport.handleRequest(req, res, parsedBody);
    if (transport.sessionId) {
      const sessionResult = sessions.set(transport.sessionId, {
        server,
        tokenHash,
        transport
      });
      if (sessionResult.evicted > 0) {
        console.warn(JSON.stringify({
          event: "mcp_http.session_capacity_eviction",
          evicted: sessionResult.evicted,
          sessionCount: sessionResult.size,
          source: "mcp-http"
        }));
      }
    } else {
      await server.close().catch((error) => console.error("[mcp-http] failed initialize server close failed", { error }));
      await transport.close().catch((error) => console.error("[mcp-http] failed initialize transport close failed", { error }));
    }
    console.log(JSON.stringify({ event: "mcp_http.initialize", anonymous, source: "mcp-http", sessionId: transport.sessionId ?? null }));
    return;
  }

  if (!session) {
    console.warn(JSON.stringify({ event: "mcp_http.invalid_session", source: "mcp-http", sessionProvided: Boolean(sessionId) }));
    return json(res, sessionId ? 404 : 400, { error: "invalid_session", error_description: "MCP session is missing or expired." }, corsHeaders(req));
  }
  if (session.tokenHash !== tokenHash) {
    if (anonymous) {
      return json(res, 401, { error: "session_requester_mismatch", error_description: "The MCP session belongs to a different anonymous requester." }, corsHeaders(req));
    }
    return unauthorized(res, req, "session_token_mismatch", "Bearer token does not match this MCP session.");
  }
  const readCalls = mcpReadCallsFromJsonRpc(parsedBody);
  for (const readCall of readCalls) {
    const decision = readThrottle.claim(tokenHash, readCall);
    if (!decision.allowed) {
      const guidance = apiReadRateLimitGuidance(readCall.profile, decision.retryAfterSeconds);
      console.warn(JSON.stringify({
        event: "mcp_http.scan_read_rate_limited",
        level: "warn",
        limitUnits: decision.limitUnits,
        policyVersion: decision.policyVersion,
        profile: readCall.profile,
        reason: decision.reason,
        requestedUnits: decision.requestedUnits,
        retryAfterSeconds: decision.retryAfterSeconds,
        scope: decision.scope,
        source: "mcp-http",
        targetType: readCall.target.startsWith("domain:") ? "domain" : "scan",
        tool: readCall.tool,
        usedUnits: decision.usedUnits,
        windowId: decision.windowId,
        windowSeconds: decision.windowSeconds
      }));
      const rpcRequest = parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody)
        ? parsedBody as Record<string, unknown>
        : null;
      return json(res, 429, {
        jsonrpc: "2.0",
        id: rpcRequest?.id ?? null,
        error: {
          code: -32029,
          message: guidance.message,
          data: {
            code: "rate_limited",
            limitUnits: decision.limitUnits,
            policyVersion: decision.policyVersion,
            profile: readCall.profile,
            recommendedNextAction: guidance.recommendedNextAction,
            requestedUnits: decision.requestedUnits,
            retryAfterSeconds: decision.retryAfterSeconds,
            scope: decision.scope,
            usedUnits: decision.usedUnits,
            windowId: decision.windowId,
            windowSeconds: decision.windowSeconds
          }
        }
      }, { ...corsHeaders(req), "Retry-After": String(decision.retryAfterSeconds) });
    }
  }
  res.setHeader("Cache-Control", "no-store");
  for (const [key, value] of Object.entries(corsHeaders(req))) {
    res.setHeader(key, value);
  }
  installSseKeepalive(res);
  await session.transport.handleRequest(req, res, parsedBody);
  if (req.method === "DELETE" && sessionId) {
    sessions.delete(sessionId);
  }
  console.log(JSON.stringify({ anonymous, event: "mcp_http.request", method: req.method, source: "mcp-http", sessionId }));
}

const server = createServer(async (req, res) => {
  const url = requestUrl(req);
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders(req));
    res.end();
    return;
  }
  if (url.pathname === "/healthz" && req.method === "GET") {
    return json(res, 200, {
      anonymousEndpoint: `${env.MCP_PUBLIC_URL}/mcp/anonymous`,
      lightEndpoint: `${env.MCP_PUBLIC_URL}/mcp/light`,
      type: "certscore_mcp_http_health",
      status: "ok",
      version: CERTSCORE_MCP_VERSION,
      sessionTtlSeconds: env.SESSION_TTL_SECONDS,
      sessionMaxCount: env.SESSION_MAX_COUNT
    }, corsHeaders(req));
  }
  if (url.pathname === "/.well-known/oauth-protected-resource/mcp" && req.method === "GET") {
    return json(res, 200, publicMetadata(), corsHeaders(req));
  }
  if ((url.pathname === "/mcp" || url.pathname === "/mcp/anonymous" || url.pathname === "/mcp/light") && (req.method === "GET" || req.method === "POST" || req.method === "DELETE")) {
    const anonymous = url.pathname !== "/mcp";
    return handleMcp(req, res, anonymous, url.pathname === "/mcp/light").catch((error) => {
      console.error("[mcp-http] request failed", { error });
      if (!res.headersSent) {
        json(res, 500, { error: "internal_error", error_description: "MCP endpoint is temporarily unavailable." }, corsHeaders(req));
      } else {
        res.end();
      }
    });
  }
  return json(res, 404, { error: "not_found" }, corsHeaders(req));
});

server.listen(env.PORT, "0.0.0.0", () => {
  console.log(JSON.stringify({
    event: "mcp_http.started",
    port: env.PORT,
    publicUrl: env.MCP_PUBLIC_URL,
    sessionTtlSeconds: env.SESSION_TTL_SECONDS,
    source: "mcp-http",
    version: CERTSCORE_MCP_VERSION
  }));
});

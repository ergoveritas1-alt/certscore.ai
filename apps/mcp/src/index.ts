import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHmac, randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { LATEST_PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js";
import { verifyCertScoreAccessToken } from "@certscore/mcp-auth";
import { createCertScoreMcpServer } from "@certscore/mcp/server";
import { CERTSCORE_MCP_VERSION } from "@certscore/mcp/version";
import { getAllowedOrigins, getEnv } from "./env.js";
import { McpHttpSessionStore } from "./session-store.js";
import { McpReadThrottle, mcpReadCallsFromJsonRpc, mcpReadRateLimitGuidance } from "./read-throttle.js";
import { anonymousMcpRequester, anonymousSessionBinding, authenticatedMcpCallerBinding } from "./requester-identity.js";

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

type AnonymousMcpSurface = "mcp_anonymous" | "mcp_light";
type McpJsonRpcMethod = "initialize" | "notifications/initialized" | "tools/list" | "tools/call" | "other";
type McpObservationReason =
  | "invalid_session_missing"
  | "invalid_session_unknown"
  | "session_requester_mismatch"
  | "origin_rejected"
  | "host_rejected"
  | "accept_not_supported"
  | "malformed_json"
  | "rate_limited"
  | "other";

function anonymousMcpSurface(light: boolean): { route: "/mcp/anonymous" | "/mcp/light"; surface: AnonymousMcpSurface } {
  return light
    ? { route: "/mcp/light", surface: "mcp_light" }
    : { route: "/mcp/anonymous", surface: "mcp_anonymous" };
}

function jsonRpcMethod(body: unknown): McpJsonRpcMethod | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  const method = (body as Record<string, unknown>).method;
  if (typeof method !== "string") {
    return null;
  }
  if (method === "initialize" || method === "notifications/initialized" || method === "tools/list" || method === "tools/call") {
    return method;
  }
  return "other";
}

function sanitizedProtocolVersion(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function initializeProtocolVersion(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  const params = (body as Record<string, unknown>).params;
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    return null;
  }
  return sanitizedProtocolVersion((params as Record<string, unknown>).protocolVersion);
}

function requestProtocolVersion(req: IncomingMessage) {
  const value = req.headers["mcp-protocol-version"];
  return sanitizedProtocolVersion(Array.isArray(value) ? value[0] : value);
}

function shortIdentityHash(tokenHash: string | null) {
  if (!tokenHash) {
    return null;
  }
  return createHmac("sha256", env.jwtSecret)
    .update(`mcp-requester-observation:v1:${tokenHash}`, "utf8")
    .digest("hex")
    .slice(0, 12);
}

function responseContentType(res: ServerResponse) {
  const value = res.getHeader("Content-Type");
  const normalized = Array.isArray(value) ? value[0] : value;
  return typeof normalized === "string" ? normalized.toLowerCase().slice(0, 100) : null;
}

function logAnonymousMcpObservation(input: {
  light: boolean;
  parsedBody?: unknown;
  reasonCode?: McpObservationReason | null;
  req: IncomingMessage;
  requesterTokenHash?: string | null;
  res: ServerResponse;
  sessionFound: boolean | null;
  sessionTokenHash?: string | null;
}) {
  const { route, surface } = anonymousMcpSurface(input.light);
  const requesterIdentityHash = shortIdentityHash(input.requesterTokenHash ?? null);
  const sessionIdentityHash = shortIdentityHash(input.sessionTokenHash ?? null);
  const requestedMcpProtocolVersion = initializeProtocolVersion(input.parsedBody);
  const event = {
    event: "mcp_http.request_observed",
    timestamp: new Date().toISOString(),
    source: "mcp-http",
    surface,
    route,
    httpMethod: input.req.method ?? null,
    finalHttpStatus: input.res.statusCode,
    jsonRpcMethod: jsonRpcMethod(input.parsedBody),
    requestedMcpProtocolVersion,
    negotiatedMcpProtocolVersion: jsonRpcMethod(input.parsedBody) === "initialize" && input.res.statusCode < 400 && requestedMcpProtocolVersion
      ? SUPPORTED_PROTOCOL_VERSIONS.includes(requestedMcpProtocolVersion) ? requestedMcpProtocolVersion : LATEST_PROTOCOL_VERSION
      : null,
    mcpProtocolVersionHeader: requestProtocolVersion(input.req),
    sessionHeaderSupplied: Boolean(input.req.headers["mcp-session-id"]),
    sessionFound: input.sessionFound,
    requesterSessionIdentityMatched: requesterIdentityHash && sessionIdentityHash
      ? requesterIdentityHash === sessionIdentityHash
      : null,
    requesterIdentityHash,
    sessionIdentityHash,
    responseContentType: responseContentType(input.res),
    reasonCode: input.reasonCode ?? null
  };
  const write = input.res.statusCode >= 400 ? console.warn : console.log;
  write(JSON.stringify(event));
}

function transportReason(res: ServerResponse): McpObservationReason | null {
  if (res.statusCode < 400) {
    return null;
  }
  return res.statusCode === 406 ? "accept_not_supported" : "other";
}

async function handleMcp(req: IncomingMessage, res: ServerResponse, anonymous: boolean, light = false) {
  if (!hostAllowed(req)) {
    json(res, 403, { error: "forbidden", error_description: "Host or Origin is not allowed." }, corsHeaders(req));
    if (anonymous) {
      logAnonymousMcpObservation({ light, reasonCode: "host_rejected", req, res, sessionFound: null });
    }
    return;
  }
  if (!requestOriginAllowed(req)) {
    json(res, 403, { error: "forbidden", error_description: "Host or Origin is not allowed." }, corsHeaders(req));
    if (anonymous) {
      logAnonymousMcpObservation({ light, reasonCode: "origin_rejected", req, res, sessionFound: null });
    }
    return;
  }
  const anonymousRequester = anonymous ? anonymousMcpRequester(req) : null;
  const clientIp = anonymousRequester?.ip ?? null;
  let token: string | undefined;
  let tokenHash: string;
  let authenticatedCallerHash: string | null = null;
  if (anonymous) {
    tokenHash = sessions.hashToken(light
      ? anonymousSessionBinding(anonymousRequester!)
      : `anonymous:${clientIp ?? "unknown-requester"}`);
  } else {
    const auth = authenticate(req);
    if (!auth.ok) {
      return unauthorized(res, req, auth.reason === "missing" ? "missing_token" : "invalid_token");
    }
    token = auth.token;
    tokenHash = auth.tokenHash;
    authenticatedCallerHash = sessions.hashToken(authenticatedMcpCallerBinding(auth.claims));
  }
  const sessionId = req.headers["mcp-session-id"]?.toString();
  let parsedBody: unknown;
  if (req.method === "POST") {
    try {
      parsedBody = await readJsonBody(req);
    } catch {
      json(res, 400, { error: "invalid_request", error_description: "MCP request body must be valid JSON." }, corsHeaders(req));
      if (anonymous) {
        logAnonymousMcpObservation({
          light,
          reasonCode: "malformed_json",
          req,
          requesterTokenHash: tokenHash,
          res,
          sessionFound: null
        });
      }
      return;
    }
  }

  let session = sessionId ? sessions.get(sessionId) : null;
  if (!session && req.method === "POST" && isInitialize(parsedBody)) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID()
    });
    const server = createCertScoreMcpServer({
      apiKey: token,
      anonymousRequesterSecret: env.jwtSecret,
      baseUrl: env.CERTSCORE_BASE_URL,
      forwardedClientIp: clientIp,
      anonymousSurface: anonymous ? (light ? "mcp_light" : "mcp_anonymous") : null,
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
    if (anonymous) {
      logAnonymousMcpObservation({
        light,
        parsedBody,
        reasonCode: transportReason(res),
        req,
        requesterTokenHash: tokenHash,
        res,
        sessionFound: false,
        sessionTokenHash: transport.sessionId ? tokenHash : null
      });
    } else {
      console.log(JSON.stringify({ event: "mcp_http.initialize", anonymous, source: "mcp-http" }));
    }
    return;
  }

  if (!session) {
    json(res, sessionId ? 404 : 400, { error: "invalid_session", error_description: "MCP session is missing or expired." }, corsHeaders(req));
    if (anonymous) {
      logAnonymousMcpObservation({
        light,
        parsedBody,
        reasonCode: sessionId ? "invalid_session_unknown" : "invalid_session_missing",
        req,
        requesterTokenHash: tokenHash,
        res,
        sessionFound: false
      });
    }
    return;
  }
  // Hosted MCP clients may distribute one anonymous Light session across egress addresses.
  // The opaque session ID remains authoritative; other surfaces retain requester binding.
  if (session.tokenHash !== tokenHash && !light) {
    if (anonymous) {
      json(res, 401, { error: "session_requester_mismatch", error_description: "The MCP session belongs to a different anonymous requester." }, corsHeaders(req));
      logAnonymousMcpObservation({
        light,
        parsedBody,
        reasonCode: "session_requester_mismatch",
        req,
        requesterTokenHash: tokenHash,
        res,
        sessionFound: true,
        sessionTokenHash: session.tokenHash
      });
      return;
    }
    return unauthorized(res, req, "session_token_mismatch", "Bearer token does not match this MCP session.");
  }
  const readCalls = mcpReadCallsFromJsonRpc(parsedBody);
  for (const readCall of readCalls) {
    const caller = light && anonymousRequester?.network === "anthropic" && sessionId
      ? sessions.hashToken(`anonymous-session:${sessionId}`)
      : light && anonymous
        // Preserve initialize-time caller accounting when a Light session changes egress.
        ? session.tokenHash
        : authenticatedCallerHash ?? tokenHash;
    const provider = light && anonymousRequester?.network === "anthropic" ? "anthropic" : undefined;
    const decision = readThrottle.claim(caller, readCall, Date.now(), provider);
    if (!decision.allowed) {
      const guidance = mcpReadRateLimitGuidance(readCall, decision, {
        anonymousLight: light && anonymous,
        authenticated: !anonymous
      });
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
      json(res, 429, {
        jsonrpc: "2.0",
        id: rpcRequest?.id ?? null,
        error: {
          code: -32029,
          message: guidance.message,
          data: {
            code: "rate_limited",
            accountUrl: guidance.accountUrl,
            anonymousLightLimitChangedByAccount: guidance.anonymousLightLimitChangedByAccount,
            equivalentRequestLimit: guidance.equivalentRequestLimit,
            limitDescription: guidance.limitDescription,
            limitUnits: decision.limitUnits,
            operationCostUnits: guidance.operationCostUnits,
            policyVersion: decision.policyVersion,
            profile: readCall.profile,
            recommendedNextAction: guidance.recommendedNextAction,
            requestedUnits: decision.requestedUnits,
            retryAfterSeconds: decision.retryAfterSeconds,
            scope: decision.scope,
            scopeDescription: guidance.scopeDescription,
            supportEmail: guidance.supportEmail,
            tool: readCall.tool,
            upgradeAvailable: guidance.upgradeAvailable,
            upgradeMessage: guidance.upgradeMessage,
            usedUnits: decision.usedUnits,
            windowId: decision.windowId,
            windowSeconds: decision.windowSeconds,
            windowDescription: guidance.windowDescription
          }
        }
      }, { ...corsHeaders(req), "Retry-After": String(decision.retryAfterSeconds) });
      if (anonymous) {
        logAnonymousMcpObservation({
          light,
          parsedBody,
          reasonCode: "rate_limited",
          req,
          requesterTokenHash: tokenHash,
          res,
          sessionFound: true,
          sessionTokenHash: session.tokenHash
        });
      }
      return;
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
  if (anonymous) {
    logAnonymousMcpObservation({
      light,
      parsedBody,
      reasonCode: transportReason(res),
      req,
      requesterTokenHash: tokenHash,
      res,
      sessionFound: true,
      sessionTokenHash: session.tokenHash
    });
  } else {
    console.log(JSON.stringify({ anonymous, event: "mcp_http.request", method: req.method, source: "mcp-http" }));
  }
}

const server = createServer(async (req, res) => {
  const url = requestUrl(req);
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders(req));
    res.end();
    if (url.pathname === "/mcp/anonymous" || url.pathname === "/mcp/light") {
      logAnonymousMcpObservation({ light: url.pathname === "/mcp/light", req, res, sessionFound: null });
    }
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
      console.error(JSON.stringify({
        event: "mcp_http.request_failed",
        timestamp: new Date().toISOString(),
        source: "mcp-http",
        errorName: error instanceof Error ? error.name : "UnknownError"
      }));
      if (!res.headersSent) {
        json(res, 500, { error: "internal_error", error_description: "MCP endpoint is temporarily unavailable." }, corsHeaders(req));
      } else {
        res.end();
      }
      if (anonymous) {
        logAnonymousMcpObservation({ light: url.pathname === "/mcp/light", reasonCode: "other", req, res, sessionFound: null });
      }
    });
  }
  if ((url.pathname === "/mcp/anonymous" || url.pathname === "/mcp/light")) {
    json(res, 404, { error: "not_found" }, corsHeaders(req));
    logAnonymousMcpObservation({ light: url.pathname === "/mcp/light", reasonCode: "other", req, res, sessionFound: null });
    return;
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

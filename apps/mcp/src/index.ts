import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHmac, randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { LATEST_PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js";
import { mcpTelemetryActorId, verifyCertScoreAccessToken } from "@certscore/mcp-auth";
import { createCertScoreMcpServer } from "@certscore/mcp/server";
import { CERTSCORE_MCP_VERSION } from "@certscore/mcp/version";
import { getAllowedOrigins, getEnv } from "./env.js";
import { McpHttpSessionStore } from "./session-store.js";
import { McpReadThrottle, mcpReadCallsFromJsonRpc, mcpReadRateLimitGuidance } from "./read-throttle.js";
import { anonymousMcpRequester, anonymousMcpRequesterFromHeaders, anonymousSessionBinding, authenticatedMcpCallerBinding } from "./requester-identity.js";
import { createHostedMcpTelemetry } from "./telemetry.js";
import { createMicrosoftEntraTokenValidator } from "./microsoft-entra-auth.js";
import type { McpTelemetrySurface } from "@website-signal-risk-scanner/shared";

const OPENAI_APPS_CHALLENGE_TOKEN = "RVujVoFeQNvwzz4Upt8IPh_f2Xm3qf2Uqa_-tr3VTeQ";

const env = getEnv();
const allowedOrigins = getAllowedOrigins(env);
const microsoftTokenValidator = env.microsoftMcpEnabled
  ? createMicrosoftEntraTokenValidator({
      allowedClientId: env.CERTSCORE_MICROSOFT_ALLOWED_CLIENT_ID!,
      audience: env.CERTSCORE_MICROSOFT_RESOURCE_AUDIENCE!,
      jwksUrl: env.CERTSCORE_MICROSOFT_JWKS_URL,
      requiredRole: env.CERTSCORE_MICROSOFT_REQUIRED_ROLE,
      tenantId: env.CERTSCORE_MICROSOFT_TENANT_ID!
    })
  : null;
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

function microsoftUnauthorized(
  res: ServerResponse,
  req: IncomingMessage,
  reason: "missing_token" | "invalid_scheme" | "invalid_token" | "wrong_client" | "session_token_mismatch"
) {
  console.warn(JSON.stringify({ event: "mcp_http.microsoft_auth", outcome: "rejected", reason, source: "mcp-http" }));
  json(res, 401, { error: "unauthorized", error_description: "Valid Microsoft Entra application bearer token required." }, {
    ...corsHeaders(req),
    "WWW-Authenticate": "Bearer"
  });
}

function microsoftForbidden(res: ServerResponse, req: IncomingMessage) {
  console.warn(JSON.stringify({ event: "mcp_http.microsoft_auth", outcome: "rejected", reason: "missing_role", source: "mcp-http" }));
  json(res, 403, { error: "forbidden", error_description: "The Microsoft Entra application token lacks the required application role." }, corsHeaders(req));
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

async function authenticateMicrosoft(req: IncomingMessage) {
  const authorization = req.headers.authorization?.trim();
  if (!authorization) {
    return { ok: false as const, reason: "missing_token" as const };
  }
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  if (!match?.[1]) {
    return { ok: false as const, reason: "invalid_scheme" as const };
  }
  if (!microsoftTokenValidator) {
    return { ok: false as const, reason: "invalid_token" as const };
  }
  return microsoftTokenValidator.verify(match[1]);
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
  | "session_requester_changed_allowed"
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

async function handleMcp(req: IncomingMessage, res: ServerResponse, anonymous: boolean, light = false, microsoft = false) {
  const requestStartedAt = Date.now();
  if (!hostAllowed(req)) {
    json(res, 403, { error: "forbidden", error_description: "Host or Origin is not allowed." }, corsHeaders(req));
    if (anonymous && !microsoft) {
      logAnonymousMcpObservation({ light, reasonCode: "host_rejected", req, res, sessionFound: null });
    }
    return;
  }
  if (!requestOriginAllowed(req)) {
    json(res, 403, { error: "forbidden", error_description: "Host or Origin is not allowed." }, corsHeaders(req));
    if (anonymous && !microsoft) {
      logAnonymousMcpObservation({ light, reasonCode: "origin_rejected", req, res, sessionFound: null });
    }
    return;
  }
  const requestSource = anonymousMcpRequester(req);
  const anonymousRequester = anonymous ? requestSource : null;
  const clientIp = requestSource.ip;
  let token: string | undefined;
  let tokenHash: string;
  let authenticatedCallerHash: string | null = null;
  let authenticatedActorId: string | null = null;
  let authenticatedOrganizationId: string | null = null;
  let authenticatedUserId: string | null = null;
  let microsoftIdentity: { clientId: string; tenantId: string } | null = null;
  if (microsoft) {
    const auth = await authenticateMicrosoft(req);
    if (!auth.ok) {
      if (auth.reason === "missing_role") {
        return microsoftForbidden(res, req);
      }
      return microsoftUnauthorized(res, req, auth.reason);
    }
    microsoftIdentity = { clientId: auth.clientId, tenantId: auth.tenantId };
    tokenHash = sessions.hashToken(`microsoft-entra:${auth.tenantId}:${auth.clientId}`);
    authenticatedCallerHash = tokenHash;
  } else if (anonymous) {
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
    authenticatedActorId = mcpTelemetryActorId({
      issuer: auth.claims.iss,
      jwtSecret: env.jwtSecret,
      subject: auth.claims.sub
    });
    authenticatedOrganizationId = auth.claims.certscore.organizationId;
    authenticatedUserId = auth.claims.certscore.userId ?? auth.claims.sub;
  }
  const sessionId = req.headers["mcp-session-id"]?.toString();
  let parsedBody: unknown;
  if (req.method === "POST") {
    try {
      parsedBody = await readJsonBody(req);
    } catch {
      json(res, 400, { error: "invalid_request", error_description: "MCP request body must be valid JSON." }, corsHeaders(req));
      if (anonymous && !microsoft) {
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
    const surface: McpTelemetrySurface = light
      ? "mcp_light"
      : anonymous
        ? "mcp_anonymous"
        : "mcp_authenticated";
    const telemetry = createHostedMcpTelemetry({
      authenticatedActorId,
      authenticatedActorBinding: authenticatedCallerHash,
      authenticatedOrganizationId,
      authenticatedUserId,
      baseUrl: env.CERTSCORE_BASE_URL,
      clientInfoBody: parsedBody,
      headers: req.headers,
      requesterBinding: tokenHash,
      requesterIp: clientIp,
      requesterNetwork: requestSource.network,
      secret: env.jwtSecret,
      sessionId: () => transport.sessionId ?? null,
      surface
    });
    const server = createCertScoreMcpServer({
      apiKey: token,
      anonymousRequesterSecret: env.jwtSecret,
      baseUrl: env.CERTSCORE_BASE_URL,
      forwardedClientIp: clientIp,
      resolveForwardedClientIp: anonymous && light
        ? (headers) => anonymousMcpRequesterFromHeaders(headers).ip
        : undefined,
      resolveAnonymousRequesterSession: anonymous && light
        ? () => transport.sessionId
          ? sessions.hashToken(`anonymous-light-session:${transport.sessionId}`)
          : null
        : undefined,
      anonymousSurface: anonymous ? (light ? "mcp_light" : "mcp_anonymous") : null,
      timeout: env.CERTSCORE_REQUEST_TIMEOUT_MS,
      toolProfile: light ? "light" : "full",
      exampleDomainDemoUrl: anonymous
        ? "https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html"
        : null,
      onToolInvocation: (observation, context) => {
        const invocationSource = context.headers
          ? anonymousMcpRequesterFromHeaders(context.headers)
          : requestSource;
        telemetry.observeToolInvocation(observation, {
          requesterIp: invocationSource.ip,
          requesterNetwork: invocationSource.network,
        });
      }
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
    if (!anonymous && !microsoft && res.statusCode < 400 && transport.sessionId) {
      telemetry.observeActivation("mcp_initialized");
    }
    if (transport.sessionId) {
      const sessionResult = sessions.set(transport.sessionId, {
        server,
        telemetry,
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
    if (anonymous && !microsoft) {
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
      console.log(JSON.stringify({
        event: microsoft ? "mcp_http.microsoft_auth" : "mcp_http.initialize",
        ...(microsoftIdentity ?? {}),
        outcome: microsoft ? "validated" : undefined,
        source: "mcp-http"
      }));
    }
    return;
  }

  if (!session) {
    json(res, sessionId ? 404 : 400, { error: "invalid_session", error_description: "MCP session is missing or expired." }, corsHeaders(req));
    if (anonymous && !microsoft) {
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
  if (session.tokenHash !== tokenHash && (!light || microsoft)) {
    if (microsoft) {
      return microsoftUnauthorized(res, req, "session_token_mismatch");
    }
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
    const publicLight = light && !microsoft;
    const caller = publicLight && anonymousRequester?.network === "anthropic" && sessionId
      ? sessions.hashToken(`anonymous-session:${sessionId}`)
      : microsoft
        ? sessions.hashToken(`microsoft-anonymous:${clientIp ?? "unknown-requester"}`)
      : authenticatedCallerHash ?? tokenHash;
    const provider = publicLight && anonymousRequester?.network === "anthropic" ? "anthropic" : undefined;
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
      session.telemetry?.observeTransportRateLimit({
        body: parsedBody,
        durationMs: Date.now() - requestStartedAt,
        requesterIp: clientIp,
        requesterNetwork: requestSource.network,
        scanId: readCall.target.startsWith("scan:") ? readCall.target.slice("scan:".length) : null,
        toolName: readCall.tool
      });
      if (anonymous && !microsoft) {
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
  if (!anonymous && !microsoft && res.statusCode < 400 && jsonRpcMethod(parsedBody) === "tools/list") {
    session.telemetry?.observeActivation("mcp_tools_listed");
  }
  if (req.method === "DELETE" && sessionId) {
    sessions.delete(sessionId);
  }
  if (anonymous && !microsoft) {
    const transportFailure = transportReason(res);
    logAnonymousMcpObservation({
      light,
      parsedBody,
      reasonCode: transportFailure ?? (light && session.tokenHash !== tokenHash
        ? "session_requester_changed_allowed"
        : null),
      req,
      requesterTokenHash: tokenHash,
      res,
      sessionFound: true,
      sessionTokenHash: session.tokenHash
    });
  } else {
    console.log(JSON.stringify({
      event: microsoft ? "mcp_http.microsoft_auth" : "mcp_http.request",
      ...(microsoftIdentity ?? {}),
      method: req.method,
      outcome: microsoft ? "validated" : undefined,
      source: "mcp-http"
    }));
  }
}

const server = createServer(async (req, res) => {
  const url = requestUrl(req);
  if (url.pathname === "/.well-known/openai-apps-challenge" && req.method === "GET") {
    const body = OPENAI_APPS_CHALLENGE_TOKEN;
    res.writeHead(200, {
      "Cache-Control": "public, max-age=300",
      "Content-Length": Buffer.byteLength(body),
      "Content-Type": "text/plain; charset=utf-8"
    });
    res.end(body);
    return;
  }
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
      microsoftEndpoint: env.microsoftMcpEnabled ? `${env.MCP_PUBLIC_URL}/mcp/microsoft` : null,
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
  if ((url.pathname === "/mcp" || url.pathname === "/mcp/anonymous" || url.pathname === "/mcp/light" || (env.microsoftMcpEnabled && url.pathname === "/mcp/microsoft")) && (req.method === "GET" || req.method === "POST" || req.method === "DELETE")) {
    const anonymous = url.pathname !== "/mcp";
    const microsoft = url.pathname === "/mcp/microsoft";
    return handleMcp(req, res, anonymous, url.pathname === "/mcp/light" || microsoft, microsoft).catch((error) => {
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
      if (anonymous && !microsoft) {
        logAnonymousMcpObservation({ light: url.pathname === "/mcp/light", reasonCode: "other", req, res, sessionFound: null });
      }
    });
  }
  if ((url.pathname === "/mcp/anonymous" || url.pathname === "/mcp/light" || url.pathname === "/mcp/microsoft")) {
    json(res, 404, { error: "not_found" }, corsHeaders(req));
    if (url.pathname !== "/mcp/microsoft") {
      logAnonymousMcpObservation({ light: url.pathname === "/mcp/light", reasonCode: "other", req, res, sessionFound: null });
    }
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

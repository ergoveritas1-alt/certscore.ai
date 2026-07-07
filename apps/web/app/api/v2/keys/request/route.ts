import { z } from "zod";
import { apiV2Disclaimer } from "@certscore/api-contracts";
import { apiV2JsonResponse, buildApiV2Error } from "../../../../../lib/api-v2/scan-resource";
import { getCurrentUser } from "../../../../../server/auth";
import { getBetterAuthVerificationStatus } from "../../../../../server/better-auth/user";
import { bootstrapAppUserSession } from "../../../../../server/bootstrap-user";
import {
  SELF_SERVE_READ_ONLY_KEY_EXPIRES_IN_DAYS,
  SELF_SERVE_SCAN_CREATE_DAILY_LIMIT,
  SELF_SERVE_SCAN_CREATE_KEY_EXPIRES_IN_DAYS,
  createIntegrationApiKey,
  decideSelfServeReadOnlyApiKeyIssuance,
  getEmailDomain,
  getSelfServeReadOnlyIssuanceCounts,
  hashSelfServeApiKeyRequester,
  isDisposableEmailDomain,
  recordSelfServeReadOnlyIssuanceEvent
} from "../../../../../server/integrations/api-keys";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const requestBodySchema = z
  .object({
    access: z.enum(["read_only", "scan_create"]).optional(),
    name: z.string().trim().min(2).max(80).optional(),
    scopes: z.array(z.enum(["scan:read", "scan:create", "mcp"])).optional()
  })
  .optional();

function requestId(request: Request) {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

function getRequesterIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",").at(0)?.trim();
  return forwardedFor || request.headers.get("x-real-ip")?.trim() || null;
}

function expiryFromNow(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function requestedAccess(body: z.infer<typeof requestBodySchema>) {
  if (body?.access === "scan_create" || body?.scopes?.includes("scan:create")) {
    return "scan_create" as const;
  }
  return "read_only" as const;
}

function denialEventType(reason: "unverified_email" | "disposable_email" | "email_cap" | "ip_cap", access: "read_only" | "scan_create") {
  const prefix = access === "scan_create" ? "self_serve_scan_create" : "self_serve_read_only";
  switch (reason) {
    case "unverified_email":
      return `${prefix}_denied_unverified_email` as const;
    case "disposable_email":
      return `${prefix}_denied_disposable_email` as const;
    case "email_cap":
      return `${prefix}_denied_email_cap` as const;
    case "ip_cap":
      return `${prefix}_denied_ip_cap` as const;
  }
}

function denialMessage(reason: "unverified_email" | "disposable_email" | "email_cap" | "ip_cap") {
  switch (reason) {
    case "unverified_email":
      return "Verify your email before requesting a self-serve API key.";
    case "disposable_email":
      return "Use a non-disposable email address to request a self-serve API key.";
    case "email_cap":
      return "This email has reached the self-serve key issuance limit.";
    case "ip_cap":
      return "This network has reached the self-serve key issuance limit.";
  }
}

export async function POST(request: Request) {
  const id = requestId(request);
  let body: z.infer<typeof requestBodySchema>;

  try {
    const raw = await request.text();
    body = raw.trim() ? requestBodySchema.parse(JSON.parse(raw)) : undefined;
  } catch {
    return apiV2JsonResponse({
      body: buildApiV2Error({ code: "invalid_request", message: "Request body must be valid JSON." }),
      requestId: id,
      route: "api-v2-keys-request",
      status: 400
    });
  }

  try {
    const access = requestedAccess(body);
    const sessionUser = await getCurrentUser();
    if (!sessionUser) {
      return apiV2JsonResponse({
        body: buildApiV2Error({ code: "unauthorized", message: "Sign in before requesting a self-serve API key." }),
        requestId: id,
        route: "api-v2-keys-request",
        status: 401
      });
    }
    const { organization, user } = await bootstrapAppUserSession(sessionUser);
    const verificationStatus = user.betterAuthUserId
      ? await getBetterAuthVerificationStatus(user.betterAuthUserId)
      : { isVerified: false, email: user.email, verifiedAt: null };
    const email = verificationStatus?.email ?? user.email;
    const emailHash = hashSelfServeApiKeyRequester(email);
    const emailDomain = getEmailDomain(email);
    const requesterIp = getRequesterIp(request);
    const requesterIpHash = requesterIp ? hashSelfServeApiKeyRequester(requesterIp) : null;
    const counts = await getSelfServeReadOnlyIssuanceCounts({ emailHash, requesterIpHash });
    const decision = decideSelfServeReadOnlyApiKeyIssuance({
      ...counts,
      disposableEmailDomain: isDisposableEmailDomain(email),
      emailVerified: Boolean(verificationStatus?.isVerified)
    });

    if (!decision.allowed) {
      await recordSelfServeReadOnlyIssuanceEvent({
        eventType: denialEventType(decision.reason, access),
        emailHash,
        emailDomain,
        requesterIpHash,
        organizationId: organization.id,
        ownerUserId: user.id,
        reason: decision.reason,
        metadata: counts
      });
      return apiV2JsonResponse({
        body: buildApiV2Error({
          code: decision.reason === "email_cap" || decision.reason === "ip_cap" ? "rate_limited" : "forbidden",
          message: denialMessage(decision.reason),
          retryAfterSeconds: decision.retryAfterSeconds
        }),
        requestId: id,
        route: "api-v2-keys-request",
        status: decision.reason === "email_cap" || decision.reason === "ip_cap" ? 429 : 403,
        headers: decision.retryAfterSeconds ? { "Retry-After": String(decision.retryAfterSeconds) } : undefined
      });
    }

    const keyScopes = access === "scan_create" ? (["pulse:read", "pulse:scan", "mcp"] as const) : (["pulse:read", "mcp"] as const);
    const responseScopes = access === "scan_create" ? (["scan:read", "scan:create", "mcp"] as const) : (["scan:read", "mcp"] as const);
    const expiresInDays = access === "scan_create" ? SELF_SERVE_SCAN_CREATE_KEY_EXPIRES_IN_DAYS : SELF_SERVE_READ_ONLY_KEY_EXPIRES_IN_DAYS;
    const expiresAt = expiryFromNow(expiresInDays);
    const key = await createIntegrationApiKey({
      name: body?.name ?? (access === "scan_create" ? "Self-serve scan creation API key" : "Self-serve read-only MCP key"),
      scopes: [...keyScopes],
      organizationId: organization.id,
      ownerUserId: user.id,
      createdBy: user.email,
      expiresAt,
      prefix: access === "scan_create" ? "read_write" : "read_only"
    });
    await recordSelfServeReadOnlyIssuanceEvent({
      eventType: access === "scan_create" ? "self_serve_scan_create_issued" : "self_serve_read_only_issued",
      emailHash,
      emailDomain,
      requesterIpHash,
      organizationId: organization.id,
      ownerUserId: user.id,
      apiKeyPublicId: key.publicId,
      metadata: {
        access,
        scopes: responseScopes,
        expiresInDays,
        ...(access === "scan_create" ? { scanCreatesPerDay: SELF_SERVE_SCAN_CREATE_DAILY_LIMIT } : {})
      }
    });

    return apiV2JsonResponse({
      body: {
        type: "certscore_api_key",
        key: key.token,
        tokenPrefix: key.tokenPrefix,
        scopes: responseScopes,
        expiresAt,
        rateLimits: {
          requestsPerMinute: 60,
          scanReadsPerDay: 500,
          ...(access === "scan_create" ? { scanCreatesPerDay: SELF_SERVE_SCAN_CREATE_DAILY_LIMIT } : {})
        },
        usageGuidance: {
          scanCreateRequiresSupport: access !== "scan_create",
          scanCreateRequestEndpoint: "https://certscore.ai/api/v2/keys/request",
          scanCreateRequestEmail: "support@certscore.ai",
          higherVolumeRequestEmail: "support@certscore.ai"
        },
        disclaimer: apiV2Disclaimer
      },
      requestId: id,
      route: "api-v2-keys-request",
      status: 201
    });
  } catch (error) {
    console.error("[api-v2-keys-request] request failed", { requestId: id, error });
    return apiV2JsonResponse({
      body: buildApiV2Error({ code: "internal_error", message: "Self-serve key issuance is temporarily unavailable. Try again later." }),
      requestId: id,
      route: "api-v2-keys-request",
      status: 500
    });
  }
}

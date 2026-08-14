import { createHash } from "node:crypto";
import { apiReadRateLimitGuidance } from "@website-signal-risk-scanner/shared";
import { apiV2JsonResponse, buildApiV2Error } from "../../lib/api-v2/scan-resource";
import { getPulseRequesterContext, trustedMcpInternalRead } from "../../lib/pulse/request";
import type { PulseDetail } from "../../lib/pulse/types";
import { claimPulseReadQuota } from "./repository";
import type { PulseRetrievalProfile } from "./retrieval-quota";
import { logApiReadRateLimited } from "./read-rate-log";

function bearerHash(request: Request) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  const token = match?.[1]?.trim();
  return token ? createHash("sha256").update(token).digest("hex") : null;
}

export function apiV2ReadPrincipal(request: Request) {
  const tokenHash = bearerHash(request);
  if (tokenHash) return `bearer:${tokenHash}`;
  const requester = getPulseRequesterContext(request);
  if (requester.ipHash) return `ip:${requester.ipHash}`;
  return "anonymous:unattributed";
}

export async function enforceApiV2ScanReadThrottle(input: {
  detail?: PulseDetail;
  profile?: PulseRetrievalProfile;
  request: Request;
  requestId: string;
  route: string;
  scanId?: string;
  target?: string;
}) {
  const target = input.target ?? (input.scanId ? `scan:${input.scanId}` : null);
  if (!target) throw new Error("API v2 read throttling requires a scanId or target");
  if (input.scanId) {
    const allowedOperations = (input.profile ?? "terminal") === "status"
      ? (["scan_site_wait", "scan_status"] as const)
      : (["scan_site_wait", "scan_status", "scan_bundle"] as const);
    if (trustedMcpInternalRead(input.request, { operations: allowedOperations, scanId: input.scanId })) {
      return null;
    }
  }
  let decision: Awaited<ReturnType<typeof claimPulseReadQuota>>;
  try {
    decision = await claimPulseReadQuota({
      detail: input.detail ?? "summary",
      principal: apiV2ReadPrincipal(input.request),
      profile: input.profile ?? "terminal",
      route: input.route,
      target
    });
  } catch (error) {
    console.error("[api-v2] scan read throttle unavailable", { error, requestId: input.requestId, route: input.route, target });
    return apiV2JsonResponse({
      body: buildApiV2Error({
        code: "internal_error",
        message: "CertScore.ai API read protection is temporarily unavailable. Try again later.",
        retryable: true,
        retryAfterSeconds: 60
      }),
      headers: { "Retry-After": "60" },
      requestId: input.requestId,
      route: input.route,
      status: 503
    });
  }
  if (decision.allowed) return null;
  const profile = input.profile ?? "terminal";
  const guidance = apiReadRateLimitGuidance(profile, decision.retryAfterSeconds);
  logApiReadRateLimited({
    limitUnits: decision.limitUnits,
    policyVersion: decision.policyVersion,
    profile,
    reason: decision.reason,
    requestId: input.requestId,
    requestedUnits: decision.requestedUnits,
    retryAfterSeconds: decision.retryAfterSeconds,
    route: input.route,
    scope: decision.scope,
    surface: "api-v2",
    targetType: target.startsWith("domain:") ? "domain" : "scan",
    usedUnits: decision.usedUnits,
    windowId: decision.windowId,
    windowSeconds: decision.windowSeconds
  });
  return apiV2JsonResponse({
    body: buildApiV2Error({
      code: "rate_limited",
      message: guidance.message,
      rateLimit: {
        limitUnits: decision.limitUnits,
        policyVersion: decision.policyVersion,
        profile,
        requestedUnits: decision.requestedUnits,
        scope: decision.scope,
        usedUnits: decision.usedUnits,
        windowId: decision.windowId,
        windowSeconds: decision.windowSeconds
      },
      retryable: true,
      retryAfterSeconds: decision.retryAfterSeconds,
      recommendedNextAction: guidance.recommendedNextAction
    }),
    headers: { "Retry-After": String(decision.retryAfterSeconds) },
    requestId: input.requestId,
    route: input.route,
    status: 429
  });
}

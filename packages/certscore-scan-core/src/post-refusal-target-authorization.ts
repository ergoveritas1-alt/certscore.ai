import { createHash } from "node:crypto";
import {
  assertPublicNetworkUrl,
  PublicNetworkGuardError,
} from "./public-network-guard.js";

export const ERGOVERITAS_POST_REFUSAL_CANARY_AUTHORIZATION_ID =
  "ergoveritas_owned_post_refusal_canary.v1" as const;

export const RESOLVED_SCAN_TARGET_AUTHORIZATION_ID =
  "sharded_scan_resolved_exact_target.v2" as const;

export const DEFAULT_POST_REFUSAL_REDIRECT_LIMIT = 8;
export const DEFAULT_POST_REFUSAL_REDIRECT_RESOLUTION_TIMEOUT_MS = 5_000;

export type PostRefusalInteractionAuthorization =
  | {
      authorizationId: "loopback_local_lab";
      kind: "loopback";
    }
  | {
      authorizationId: typeof ERGOVERITAS_POST_REFUSAL_CANARY_AUTHORIZATION_ID;
      kind: "owned_canary";
    }
  | {
      authorizationId: string;
      kind: "explicit_allowlist";
      targets: Array<{
        hostname: string;
        pathPrefix: string;
      }>;
    }
  | {
      authorizationId: "sharded_scan_exact_target.v1";
      kind: "scan_target";
      normalizedUrl: string;
      scanId: string;
    }
  | {
      authorizationId: typeof RESOLVED_SCAN_TARGET_AUTHORIZATION_ID;
      kind: "scan_target_resolution";
      maxRedirects: number;
      requestedUrl: string;
      resolutionTimeoutMs: number;
      scanId: string;
    };

export type ResolvedPostRefusalScanTargetAuthorization = {
  authorizationId: typeof RESOLVED_SCAN_TARGET_AUTHORIZATION_ID;
  kind: "resolved_scan_target";
  normalizedUrl: string;
  requestedTargetSha256: string;
  scanId: string;
};

export type PostRefusalRedirectResolutionFailureReason =
  | "abort_requested"
  | "invalid_requested_target"
  | "redirect_limit_exceeded"
  | "redirect_location_invalid"
  | "request_failed"
  | "resolution_timeout"
  | "scan_identity_mismatch"
  | "unsafe_redirect_target";

export type PostRefusalRedirectResolutionResult =
  | {
      authorization: ResolvedPostRefusalScanTargetAuthorization;
      durationMs: number;
      finalExactTargetSha256: string;
      redirectCount: number;
      requestedTargetSha256: string;
      status: "resolved";
      targetUrl: string;
    }
  | {
      durationMs: number;
      failureReason: PostRefusalRedirectResolutionFailureReason;
      redirectCount: number;
      requestedTargetSha256: string;
      status: "failed";
    };

export type PostRefusalTargetAuthorizationDecision = {
  authorizationId: string;
  authorized: boolean;
  mode: PostRefusalInteractionAuthorization["kind"] | ResolvedPostRefusalScanTargetAuthorization["kind"];
  reason:
    | "authorized_loopback"
    | "authorized_owned_canary"
    | "authorized_explicit_allowlist"
    | "authorized_scan_target"
    | "authorized_resolved_scan_target"
    | "invalid_target_url"
    | "loopback_authorization_requires_loopback_target"
    | "owned_canary_target_mismatch"
    | "explicit_allowlist_target_mismatch"
    | "scan_target_mismatch"
    | "scan_target_resolution_required"
    | "scan_target_scan_identity_mismatch";
};

type RedirectResolutionFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

type RedirectResolutionUrlGuard = (input: string | URL) => Promise<URL>;

type RedirectResolutionCookie = {
  domain: string;
  hostOnly: boolean;
  name: string;
  path: string;
  secure: boolean;
  value: string;
};

const OWNED_POST_REFUSAL_CANARY_TARGETS = [
  {
    hostname: "ergoveritas.com",
    pathname: "/.well-known/certscore-canary/post-refusal/reject-honored.html",
    recipeCase: "tcf",
  },
  {
    hostname: "ergoveritas.com",
    pathname: "/.well-known/certscore-canary/post-refusal/reject-ignored.html",
    recipeCase: "tcf",
  },
  {
    hostname: "ergoveritas.com",
    pathname: "/test1.html",
    recipeCase: "tcf",
  },
  {
    hostname: "ergoveritas.com",
    pathname: "/test2.html",
    recipeCase: "tcf",
  },
  {
    hostname: "ergoveritas.com",
    pathname: "/test3.html",
    recipeCase: "tcf",
  },
  {
    hostname: "ergoveritas.com",
    pathname: "/test4.html",
    recipeCase: "tcf",
  },
] as const;

export function getOwnedPostRefusalCanaryRecipeCase(targetUrl: string): "tcf" | undefined {
  let target: URL;
  try {
    target = new URL(targetUrl);
  } catch {
    return undefined;
  }
  return OWNED_POST_REFUSAL_CANARY_TARGETS.find((candidate) =>
    target.protocol === "https:" &&
    !target.username &&
    !target.password &&
    !target.port &&
    !target.search &&
    !target.hash &&
    target.hostname.toLowerCase() === candidate.hostname &&
    target.pathname === candidate.pathname
  )?.recipeCase;
}

export function isLoopbackPostRefusalTarget(targetUrl: string): boolean {
  try {
    const parsed = new URL(targetUrl);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost" || parsed.hostname === "[::1]");
  } catch {
    return false;
  }
}

export function authorizePostRefusalTarget(
  targetUrl: string,
  authorization: PostRefusalInteractionAuthorization | ResolvedPostRefusalScanTargetAuthorization,
  scanId?: string,
): PostRefusalTargetAuthorizationDecision {
  let target: URL;
  try {
    target = new URL(targetUrl);
  } catch {
    return decision(authorization, false, "invalid_target_url");
  }

  if (authorization.kind === "loopback") {
    return isLoopbackPostRefusalTarget(targetUrl)
      ? decision(authorization, true, "authorized_loopback")
      : decision(authorization, false, "loopback_authorization_requires_loopback_target");
  }

  if (target.protocol !== "https:" || target.username || target.password || target.port) {
    return decision(
      authorization,
      false,
      authorization.kind === "owned_canary"
        ? "owned_canary_target_mismatch"
        : authorization.kind === "scan_target" ||
            authorization.kind === "scan_target_resolution" ||
            authorization.kind === "resolved_scan_target"
          ? "scan_target_mismatch"
          : "explicit_allowlist_target_mismatch",
    );
  }

  if (authorization.kind === "owned_canary") {
    const authorized = getOwnedPostRefusalCanaryRecipeCase(targetUrl) !== undefined;
    return decision(
      authorization,
      authorized,
      authorized ? "authorized_owned_canary" : "owned_canary_target_mismatch",
    );
  }

  if (authorization.kind === "scan_target") {
    if (!scanId || scanId !== authorization.scanId) {
      return decision(authorization, false, "scan_target_scan_identity_mismatch");
    }
    const authorizedTarget = normalizeExactTargetUrl(authorization.normalizedUrl);
    const requestedTarget = normalizeExactTargetUrl(targetUrl);
    const authorized = authorizedTarget !== undefined && requestedTarget === authorizedTarget;
    return decision(
      authorization,
      authorized,
      authorized ? "authorized_scan_target" : "scan_target_mismatch",
    );
  }

  if (authorization.kind === "scan_target_resolution") {
    return !scanId || scanId !== authorization.scanId
      ? decision(authorization, false, "scan_target_scan_identity_mismatch")
      : decision(authorization, false, "scan_target_resolution_required");
  }

  if (authorization.kind === "resolved_scan_target") {
    if (!scanId || scanId !== authorization.scanId) {
      return decision(authorization, false, "scan_target_scan_identity_mismatch");
    }
    const authorizedTarget = normalizeExactTargetUrl(authorization.normalizedUrl);
    const requestedTarget = normalizeExactTargetUrl(targetUrl);
    const authorized = authorizedTarget !== undefined && requestedTarget === authorizedTarget;
    return decision(
      authorization,
      authorized,
      authorized ? "authorized_resolved_scan_target" : "scan_target_mismatch",
    );
  }

  const targets = authorization.targets.slice(0, 24).flatMap((candidate) => {
    const hostname = candidate.hostname.trim().toLowerCase();
    const pathPrefix = normalizePathPrefix(candidate.pathPrefix);
    return hostname && pathPrefix ? [{ hostname, pathPrefix }] : [];
  });
  const authorized = targetMatches(target, targets);
  return decision(
    authorization,
    authorized,
    authorized ? "authorized_explicit_allowlist" : "explicit_allowlist_target_mismatch",
  );
}

export async function resolvePostRefusalExactTarget(
  targetUrl: string,
  authorization: Extract<PostRefusalInteractionAuthorization, { kind: "scan_target_resolution" }>,
  scanId: string | undefined,
  options: {
    fetchImpl?: RedirectResolutionFetch;
    requestHeaders?: Record<string, string>;
    signal?: AbortSignal;
    urlGuard?: RedirectResolutionUrlGuard;
  } = {},
): Promise<PostRefusalRedirectResolutionResult> {
  const startedAtMs = Date.now();
  const requestedTargetSha256 = hashExactTarget(targetUrl);
  let redirectCount = 0;
  const fail = (
    failureReason: PostRefusalRedirectResolutionFailureReason,
  ): PostRefusalRedirectResolutionResult => ({
    durationMs: Math.max(0, Date.now() - startedAtMs),
    failureReason,
    redirectCount,
    requestedTargetSha256,
    status: "failed",
  });

  if (!scanId || scanId !== authorization.scanId) return fail("scan_identity_mismatch");
  const requestedTarget = normalizeExactTargetUrl(targetUrl);
  const authorizedRequest = normalizeExactTargetUrl(authorization.requestedUrl);
  if (!requestedTarget || requestedTarget !== authorizedRequest) {
    return fail("invalid_requested_target");
  }

  const maxRedirects = Math.max(
    0,
    Math.min(authorization.maxRedirects, 8),
  );
  const resolutionTimeoutMs = Math.max(
    250,
    Math.min(authorization.resolutionTimeoutMs, 5_000),
  );
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error("Post-refusal redirect resolution timed out.")),
    resolutionTimeoutMs,
  );
  const onAbort = () => controller.abort(options.signal?.reason ?? new Error("Aborted"));
  options.signal?.addEventListener("abort", onAbort, { once: true });
  let currentTarget = new URL(requestedTarget);
  const fetchImpl = options.fetchImpl ?? fetch;
  const urlGuard = options.urlGuard ?? ((value) => assertPublicNetworkUrl(value));
  let redirectCookies: RedirectResolutionCookie[] = [];

  try {
    while (true) {
      if (options.signal?.aborted) return fail("abort_requested");
      try {
        await assertExactPublicHttpsTarget(currentTarget, urlGuard);
      } catch {
        return fail("unsafe_redirect_target");
      }

      let response: Response;
      try {
        const cookieHeader = redirectCookieHeader(redirectCookies, currentTarget);
        response = await fetchImpl(currentTarget, {
          headers: {
            accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
            "accept-language": "en-US,en;q=0.8",
            "cache-control": "no-cache",
            ...options.requestHeaders,
            ...(cookieHeader ? { cookie: cookieHeader } : {}),
          },
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
        });
      } catch (error) {
        if (options.signal?.aborted) return fail("abort_requested");
        if (controller.signal.aborted) return fail("resolution_timeout");
        return fail(error instanceof PublicNetworkGuardError
          ? "unsafe_redirect_target"
          : "request_failed");
      }

      const isRedirect = [301, 302, 303, 307, 308].includes(response.status);
      if (!isRedirect) {
        await response.body?.cancel().catch(() => undefined);
        const normalizedTarget = normalizeExactTargetUrl(currentTarget.toString());
        if (!normalizedTarget) return fail("unsafe_redirect_target");
        const finalExactTargetSha256 = hashExactTarget(normalizedTarget);
        return {
          authorization: {
            authorizationId: RESOLVED_SCAN_TARGET_AUTHORIZATION_ID,
            kind: "resolved_scan_target",
            normalizedUrl: normalizedTarget,
            requestedTargetSha256,
            scanId: authorization.scanId,
          },
          durationMs: Math.max(0, Date.now() - startedAtMs),
          finalExactTargetSha256,
          redirectCount,
          requestedTargetSha256,
          status: "resolved",
          targetUrl: normalizedTarget,
        };
      }

      const location = response.headers.get("location");
      redirectCookies = updateRedirectCookies(
        redirectCookies,
        response,
        currentTarget,
      );
      await response.body?.cancel().catch(() => undefined);
      if (!location) return fail("redirect_location_invalid");
      if (redirectCount >= maxRedirects) return fail("redirect_limit_exceeded");
      let nextTarget: URL;
      try {
        nextTarget = new URL(location, currentTarget);
      } catch {
        return fail("redirect_location_invalid");
      }
      try {
        await assertExactPublicHttpsTarget(nextTarget, urlGuard);
      } catch {
        return fail("unsafe_redirect_target");
      }
      redirectCount += 1;
      currentTarget = nextTarget;
    }
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Binds a scan-scoped authorization to the exact terminal URL observed by a
 * bounded passive browser navigation. The browser may retain redirect cookies
 * and execute ordinary redirect mechanisms, but no interaction is authorized
 * until this function verifies the final public HTTPS URL and scan identity.
 */
export async function bindPostRefusalBrowserResolvedExactTarget(
  input: {
    durationMs: number;
    finalUrl: string;
    redirectCount: number;
    requestedUrl: string;
  },
  authorization: Extract<PostRefusalInteractionAuthorization, { kind: "scan_target_resolution" }>,
  scanId: string | undefined,
  options: { urlGuard?: RedirectResolutionUrlGuard } = {},
): Promise<PostRefusalRedirectResolutionResult> {
  const requestedTargetSha256 = hashExactTarget(input.requestedUrl);
  const fail = (
    failureReason: PostRefusalRedirectResolutionFailureReason,
  ): PostRefusalRedirectResolutionResult => ({
    durationMs: Math.max(0, input.durationMs),
    failureReason,
    redirectCount: Math.max(0, input.redirectCount),
    requestedTargetSha256,
    status: "failed",
  });
  if (!scanId || scanId !== authorization.scanId) return fail("scan_identity_mismatch");
  const requestedTarget = normalizeExactTargetUrl(input.requestedUrl);
  const authorizedRequest = normalizeExactTargetUrl(authorization.requestedUrl);
  if (!requestedTarget || requestedTarget !== authorizedRequest) return fail("invalid_requested_target");
  const redirectCount = Math.max(0, input.redirectCount);
  const maxRedirects = Math.max(0, Math.min(authorization.maxRedirects, 8));
  if (redirectCount > maxRedirects) return fail("redirect_limit_exceeded");
  const finalTarget = normalizeExactTargetUrl(input.finalUrl);
  if (!finalTarget) return fail("unsafe_redirect_target");
  try {
    await assertExactPublicHttpsTarget(
      new URL(finalTarget),
      options.urlGuard ?? ((value) => assertPublicNetworkUrl(value)),
    );
  } catch {
    return fail("unsafe_redirect_target");
  }
  const finalExactTargetSha256 = hashExactTarget(finalTarget);
  return {
    authorization: {
      authorizationId: RESOLVED_SCAN_TARGET_AUTHORIZATION_ID,
      kind: "resolved_scan_target",
      normalizedUrl: finalTarget,
      requestedTargetSha256,
      scanId: authorization.scanId,
    },
    durationMs: Math.max(0, input.durationMs),
    finalExactTargetSha256,
    redirectCount,
    requestedTargetSha256,
    status: "resolved",
    targetUrl: finalTarget,
  };
}

function updateRedirectCookies(
  current: RedirectResolutionCookie[],
  response: Response,
  responseUrl: URL,
) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = headers.getSetCookie?.() ?? (headers.get("set-cookie") ? [headers.get("set-cookie")!] : []);
  let cookies = current.slice(0, 24);
  for (const value of values.slice(0, 12)) {
    const parts = value.split(";").map((part) => part.trim());
    const [nameValue, ...attributes] = parts;
    const separator = nameValue?.indexOf("=") ?? -1;
    if (separator <= 0) continue;
    const name = nameValue!.slice(0, separator).trim();
    const cookieValue = nameValue!.slice(separator + 1).trim();
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/.test(name) || cookieValue.length > 4_096) continue;
    const attributeMap = new Map(attributes.flatMap((attribute) => {
      const attributeSeparator = attribute.indexOf("=");
      const key = (attributeSeparator < 0 ? attribute : attribute.slice(0, attributeSeparator)).trim().toLowerCase();
      const attributeValue = attributeSeparator < 0 ? "" : attribute.slice(attributeSeparator + 1).trim();
      return key ? [[key, attributeValue] as const] : [];
    }));
    const declaredDomain = attributeMap.get("domain")?.replace(/^\./, "").toLowerCase();
    const responseHostname = responseUrl.hostname.toLowerCase();
    if (
      declaredDomain &&
      responseHostname !== declaredDomain &&
      !responseHostname.endsWith(`.${declaredDomain}`)
    ) continue;
    const domain = declaredDomain ?? responseHostname;
    const hostOnly = !declaredDomain;
    const declaredPath = attributeMap.get("path");
    const cookiePath = declaredPath?.startsWith("/")
      ? declaredPath
      : responseUrl.pathname.slice(0, responseUrl.pathname.lastIndexOf("/") + 1) || "/";
    const identity = (cookie: RedirectResolutionCookie) =>
      cookie.name === name && cookie.domain === domain && cookie.path === cookiePath;
    cookies = cookies.filter((cookie) => !identity(cookie));
    const maxAge = Number(attributeMap.get("max-age"));
    if (attributeMap.has("max-age") && Number.isFinite(maxAge) && maxAge <= 0) continue;
    cookies.push({
      domain,
      hostOnly,
      name,
      path: cookiePath,
      secure: attributeMap.has("secure"),
      value: cookieValue,
    });
    cookies = cookies.slice(-24);
  }
  return cookies;
}

function redirectCookieHeader(cookies: RedirectResolutionCookie[], target: URL) {
  const hostname = target.hostname.toLowerCase();
  const matching = cookies.filter((cookie) =>
    (!cookie.secure || target.protocol === "https:") &&
    (cookie.hostOnly ? hostname === cookie.domain : hostname === cookie.domain || hostname.endsWith(`.${cookie.domain}`)) &&
    target.pathname.startsWith(cookie.path)
  );
  const header = matching.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  return header.length <= 8_192 ? header : "";
}

async function assertExactPublicHttpsTarget(
  target: URL,
  urlGuard: RedirectResolutionUrlGuard,
) {
  if (
    target.protocol !== "https:" ||
    target.username ||
    target.password ||
    target.port ||
    target.hash
  ) {
    throw new PublicNetworkGuardError();
  }
  await urlGuard(target);
}

function hashExactTarget(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeExactTargetUrl(value: string): string | undefined {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || parsed.hash) {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function targetMatches(
  target: URL,
  authorizedTargets: readonly { hostname: string; pathPrefix: string }[],
): boolean {
  const hostname = target.hostname.toLowerCase();
  return authorizedTargets.some((candidate) =>
    hostname === candidate.hostname &&
    (
      candidate.pathPrefix === "/" ||
      target.pathname === candidate.pathPrefix ||
      target.pathname.startsWith(`${candidate.pathPrefix}/`)
    )
  );
}

function normalizePathPrefix(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.includes("?") || trimmed.includes("#")) return undefined;
  return trimmed === "/" ? trimmed : trimmed.replace(/\/+$/, "");
}

function decision(
  authorization: PostRefusalInteractionAuthorization | ResolvedPostRefusalScanTargetAuthorization,
  authorized: boolean,
  reason: PostRefusalTargetAuthorizationDecision["reason"],
): PostRefusalTargetAuthorizationDecision {
  return {
    authorizationId: authorization.authorizationId.slice(0, 160),
    authorized,
    mode: authorization.kind,
    reason,
  };
}

export const ERGOVERITAS_POST_REFUSAL_CANARY_AUTHORIZATION_ID =
  "ergoveritas_owned_post_refusal_canary.v1" as const;

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
    };

export type PostRefusalTargetAuthorizationDecision = {
  authorizationId: string;
  authorized: boolean;
  mode: PostRefusalInteractionAuthorization["kind"];
  reason:
    | "authorized_loopback"
    | "authorized_owned_canary"
    | "authorized_explicit_allowlist"
    | "invalid_target_url"
    | "loopback_authorization_requires_loopback_target"
    | "owned_canary_target_mismatch"
    | "explicit_allowlist_target_mismatch";
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
  authorization: PostRefusalInteractionAuthorization,
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

function targetMatches(
  target: URL,
  authorizedTargets: readonly { hostname: string; pathPrefix: string }[],
): boolean {
  const hostname = target.hostname.toLowerCase();
  return authorizedTargets.some((candidate) =>
    hostname === candidate.hostname &&
    target.pathname.startsWith(candidate.pathPrefix)
  );
}

function normalizePathPrefix(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.includes("?") || trimmed.includes("#")) return undefined;
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

function decision(
  authorization: PostRefusalInteractionAuthorization,
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

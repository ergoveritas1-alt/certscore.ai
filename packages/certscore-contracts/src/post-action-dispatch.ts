import {
  POST_ACCEPT_DEFAULT_OBSERVATION_WINDOW_MS,
  type PostAcceptLambdaDispatchConfig,
} from "./post-accept-observation";
import type { PostRefusalLambdaDispatchConfig } from "./post-refusal-observation";

export type PostActionObservationDispatchConfigs = {
  postAcceptObservation?: PostAcceptLambdaDispatchConfig;
  postRefusalObservation?: PostRefusalLambdaDispatchConfig;
};

const OWNED_ERGOVERITAS_CANARY_HOSTNAMES = new Set([
  "ergoveritas.com",
  "www.ergoveritas.com",
]);

/**
 * Canonical dispatch-boundary construction for the two interaction lanes.
 * Callers provide already-normalized intent flags; this helper owns the exact
 * URL eligibility, authorization, timing, and recipe-version constants so web
 * and validation dispatch cannot drift.
 */
export function buildPostActionObservationDispatchConfigs(input: {
  intent: Record<string, unknown>;
  scanId: string;
  targetUrl: string;
}): PostActionObservationDispatchConfigs {
  let target: URL;
  try {
    target = new URL(input.targetUrl);
  } catch {
    return {};
  }
  const sharded = input.intent.orchestrationMode === "sharded";
  if (!sharded) return {};
  const loopback = (target.protocol === "http:" || target.protocol === "https:") &&
    ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname);
  const ownedErgoVeritasHostname = OWNED_ERGOVERITAS_CANARY_HOSTNAMES.has(target.hostname);
  const ownedRejectCanary = target.protocol === "https:" &&
    ownedErgoVeritasHostname &&
    !target.search &&
    !target.hash &&
    (target.pathname.startsWith("/.well-known/certscore-canary/post-refusal/") ||
      /^\/test[1-4]\.html$/.test(target.pathname) ||
      ["/testar1.html", "/testar2.html", "/sample_09_03_26_01.html"].includes(target.pathname));
  const ownedAcceptCanary = target.protocol === "https:" &&
    ownedErgoVeritasHostname &&
    !target.search &&
    !target.hash &&
    [
      "/.well-known/certscore-canary/post-accept/accept-honored.html",
      "/.well-known/certscore-canary/post-accept/accept-inconsistent.html",
      "/testar1.html",
      "/testar2.html",
      "/sample_09_03_26_01.html",
    ].includes(target.pathname);
  const exactProductionTarget = target.protocol === "https:" &&
    !target.username &&
    !target.password &&
    !target.port &&
    !target.hash;
  const interactionAuthorization = (ownedCanary: boolean) => loopback
    ? { authorizationId: "loopback_local_lab" as const, kind: "loopback" as const }
    : ownedCanary
      ? {
          authorizationId: "ergoveritas_owned_post_refusal_canary.v1" as const,
          kind: "owned_canary" as const,
        }
      : {
          authorizationId: "sharded_scan_resolved_exact_target.v2" as const,
          kind: "scan_target_resolution" as const,
          maxRedirects: 8,
          requestedUrl: target.toString(),
          resolutionTimeoutMs: 5_000,
          scanId: input.scanId,
        };

  let postRefusalObservation: PostRefusalLambdaDispatchConfig | undefined;
  if (input.intent.postRefusalRejectWorkerEnabled === true) {
    const rolloutMode = input.intent.postRefusalRejectWorkerRolloutMode === "all_eligible"
      ? "all_eligible" as const
      : "owned_canary" as const;
    if (loopback || ownedRejectCanary || (rolloutMode === "all_eligible" && exactProductionTarget)) {
      postRefusalObservation = {
        enabled: true,
        rolloutMode,
        dispatchDelayMs: 500,
        observationWindowMs: 8_000,
        confirmationTimeoutMs: 2_000,
        actionSearchTimeoutMs: 14_000,
        resolver: {
          kind: "canonical_cmp_registry",
          recipeSetId: "canonical-consent-control-reject-v20",
        },
        interactionAuthorization: interactionAuthorization(ownedRejectCanary),
      };
    }
  }

  let postAcceptObservation: PostAcceptLambdaDispatchConfig | undefined;
  if (input.intent.postAcceptWorkerEnabled === true) {
    const rolloutMode = input.intent.postAcceptWorkerRolloutMode === "all_eligible"
      ? "all_eligible" as const
      : "owned_canary" as const;
    if (loopback || ownedAcceptCanary || (rolloutMode === "all_eligible" && exactProductionTarget)) {
      postAcceptObservation = {
        enabled: true,
        rolloutMode,
        dispatchDelayMs: 1_000,
        observationWindowMs: POST_ACCEPT_DEFAULT_OBSERVATION_WINDOW_MS,
        confirmationTimeoutMs: 2_000,
        actionSearchTimeoutMs: 14_000,
        resolver: {
          kind: "canonical_cmp_registry",
          recipeSetId: "canonical-consent-control-accept-v3",
        },
        interactionAuthorization: interactionAuthorization(ownedAcceptCanary),
      };
    }
  }

  return {
    ...(postAcceptObservation ? { postAcceptObservation } : {}),
    ...(postRefusalObservation ? { postRefusalObservation } : {}),
  };
}

import assert from "node:assert/strict";
import test from "node:test";
import { buildPostActionObservationDispatchConfigs } from "./post-action-dispatch.js";

test("post-action dispatch remains default off", () => {
  assert.deepEqual(buildPostActionObservationDispatchConfigs({
    intent: { orchestrationMode: "sharded" },
    scanId: "scan-1",
    targetUrl: "https://example.com/",
  }), {});
});

test("owned Accept and Reject canaries use independent recipes and staggered starts", () => {
  const reject = buildPostActionObservationDispatchConfigs({
    intent: {
      orchestrationMode: "sharded",
      postRefusalRejectWorkerEnabled: true,
      postRefusalRejectWorkerRolloutMode: "owned_canary",
    },
    scanId: "scan-reject",
    targetUrl: "https://ergoveritas.com/.well-known/certscore-canary/post-refusal/reject-honored.html",
  });
  const accept = buildPostActionObservationDispatchConfigs({
    intent: {
      orchestrationMode: "sharded",
      postAcceptWorkerEnabled: true,
      postAcceptWorkerRolloutMode: "owned_canary",
    },
    scanId: "scan-accept",
    targetUrl: "https://ergoveritas.com/.well-known/certscore-canary/post-accept/accept-honored.html",
  });

  assert.equal(reject.postRefusalObservation?.dispatchDelayMs, 500);
  assert.equal(reject.postRefusalObservation?.actionSearchTimeoutMs, 14_000);
  assert.equal(reject.postRefusalObservation?.resolver.kind, "canonical_cmp_registry");
  assert.equal(accept.postAcceptObservation?.dispatchDelayMs, 1_000);
  assert.equal(accept.postAcceptObservation?.observationWindowMs, 3_000);
  assert.equal(accept.postAcceptObservation?.resolver.kind, "canonical_cmp_registry");
  assert.equal(accept.postRefusalObservation, undefined);
  assert.equal(buildPostActionObservationDispatchConfigs({
    intent: {
      orchestrationMode: "sharded",
      postAcceptWorkerEnabled: true,
      postAcceptWorkerRolloutMode: "owned_canary",
    },
    scanId: "scan-accept-query",
    targetUrl: "https://ergoveritas.com/.well-known/certscore-canary/post-accept/accept-honored.html?variant=other",
  }).postAcceptObservation, undefined);
});

test("ordinary public Accept dispatch requires all-eligible exact HTTPS authorization", () => {
  const ownedOnly = buildPostActionObservationDispatchConfigs({
    intent: {
      orchestrationMode: "sharded",
      postAcceptWorkerEnabled: true,
      postAcceptWorkerRolloutMode: "owned_canary",
    },
    scanId: "scan-public",
    targetUrl: "https://example.com/",
  });
  const allEligible = buildPostActionObservationDispatchConfigs({
    intent: {
      orchestrationMode: "sharded",
      postAcceptWorkerEnabled: true,
      postAcceptWorkerRolloutMode: "all_eligible",
    },
    scanId: "scan-public",
    targetUrl: "https://example.com/",
  });

  assert.equal(ownedOnly.postAcceptObservation, undefined);
  assert.equal(allEligible.postAcceptObservation?.interactionAuthorization.kind, "scan_target_resolution");
  assert.equal(allEligible.postAcceptObservation?.actionSearchTimeoutMs, 14_000);
  assert.deepEqual(allEligible.postAcceptObservation?.resolver, {
    kind: "canonical_cmp_registry",
    recipeSetId: "canonical-consent-control-accept-v3",
  });
  assert.equal(
    allEligible.postAcceptObservation?.interactionAuthorization.kind === "scan_target_resolution"
      ? allEligible.postAcceptObservation.interactionAuthorization.scanId
      : null,
    "scan-public",
  );
});

test("joint ErgoVeritas canaries dispatch both lanes only for exact root URLs", () => {
  for (const hostname of ["ergoveritas.com", "www.ergoveritas.com"]) {
    for (const pathname of ["/testar1.html", "/testar2.html"]) {
      const result = buildPostActionObservationDispatchConfigs({
        intent: {
          orchestrationMode: "sharded",
          postAcceptWorkerEnabled: true,
          postAcceptWorkerRolloutMode: "owned_canary",
          postRefusalRejectWorkerEnabled: true,
          postRefusalRejectWorkerRolloutMode: "owned_canary",
        },
        scanId: `scan-${hostname}-${pathname}`,
        targetUrl: `https://${hostname}${pathname}`,
      });

      assert.equal(result.postRefusalObservation?.dispatchDelayMs, 500);
      assert.equal(result.postAcceptObservation?.dispatchDelayMs, 1_000);
      assert.equal(result.postRefusalObservation?.interactionAuthorization.kind, "owned_canary");
      assert.equal(result.postAcceptObservation?.interactionAuthorization.kind, "owned_canary");
    }
  }

  for (const suffix of ["?variant=other", "#other"]) {
    const result = buildPostActionObservationDispatchConfigs({
      intent: {
        orchestrationMode: "sharded",
        postAcceptWorkerEnabled: true,
        postRefusalRejectWorkerEnabled: true,
      },
      scanId: `scan-inexact-${suffix}`,
      targetUrl: `https://ergoveritas.com/testar1.html${suffix}`,
    });
    assert.equal(result.postAcceptObservation, undefined);
    assert.equal(result.postRefusalObservation, undefined);
  }

  const lookalikeHost = buildPostActionObservationDispatchConfigs({
    intent: {
      orchestrationMode: "sharded",
      postAcceptWorkerEnabled: true,
      postRefusalRejectWorkerEnabled: true,
    },
    scanId: "scan-lookalike-host",
    targetUrl: "https://www.ergoveritas.com.example.net/testar1.html",
  });
  assert.equal(lookalikeHost.postAcceptObservation, undefined);
  assert.equal(lookalikeHost.postRefusalObservation, undefined);
});

import assert from "node:assert/strict";
import test from "node:test";
import { automatedAccessObservationSchema, type AutomatedAccessObservation } from "@certscore/contracts";
import {
  buildAutomatedAccessObservation,
  retainTargetInfrastructureSignals,
  shouldRetainTargetInfrastructureSignals,
} from "./scanners/pre-consent-runtime-scanner";

type Provider = AutomatedAccessObservation["targetInfrastructure"]["providerCandidates"][number];

test("retains canonical cross-domain redirect responses but excludes subresources and child frames", () => {
  assert.equal(shouldRetainTargetInfrastructureSignals({ isMainFrame: true }), true);
  assert.equal(shouldRetainTargetInfrastructureSignals({ isMainFrame: false }), false);
});

test("retains bounded Cloudflare edge attribution without raw header values", () => {
  const providers = new Set<Provider>();
  const signalCodes = new Set<string>();
  retainTargetInfrastructureSignals({
    headers: {
      "cf-cache-status": "DYNAMIC",
      "cf-ray": "example-ray-value",
      server: "cloudflare",
    },
    providers,
    signalCodes,
  });

  const observation = automatedAccessObservationSchema.parse(buildAutomatedAccessObservation({
    providers,
    signalCodes,
    webBotAuth: {
      enabled: true,
      signedHttpsRequestCount: 12,
      signedNavigationRequestCount: 2,
    },
  }));
  assert.equal(observation.productionProjectable, false);
  assert.equal(observation.webBotAuth.signingOutcome, "applied");
  assert.equal(observation.targetInfrastructure.cloudflareObserved, true);
  assert.deepEqual(observation.targetInfrastructure.providerCandidates, ["cloudflare"]);
  assert.deepEqual(observation.targetInfrastructure.signalCodes, [
    "cloudflare_cf_cache_status_header",
    "cloudflare_cf_ray_header",
    "cloudflare_server_header",
    "main_document_provider:cloudflare",
  ]);
  assert.equal(JSON.stringify(observation).includes("example-ray-value"), false);
});

test("keeps disabled signing and unknown infrastructure explicit", () => {
  const observation = automatedAccessObservationSchema.parse(buildAutomatedAccessObservation({
    providers: new Set<Provider>(),
    signalCodes: new Set<string>(),
    webBotAuth: {
      enabled: false,
      signedHttpsRequestCount: 0,
      signedNavigationRequestCount: 0,
    },
  }));
  assert.equal(observation.webBotAuth.signingOutcome, "disabled");
  assert.equal(observation.targetInfrastructure.cloudflareObserved, false);
  assert.deepEqual(observation.targetInfrastructure.providerCandidates, []);
});

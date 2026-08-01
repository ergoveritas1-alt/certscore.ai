import assert from "node:assert/strict";
import test from "node:test";
import type { PolicySurfaceObservation } from "@certscore/contracts";
import { normalizePolicySurfaceResultForEarlyHandoff } from "./index.js";

function observation(index: number, status: PolicySurfaceObservation["status"]): PolicySurfaceObservation {
  return {
    artifactRefs: [],
    confidence: status === "fetched" ? 0.99 : 0.8,
    normalizedUrl: "https://example.com/privacy",
    observationId: `privacy-${index}`,
    policyCookieDisclosures: [],
    status,
    surfaceType: "privacy_policy",
    url: `https://example.com/privacy#duplicate-${index}`,
  };
}

test("early policy handoff canonically collapses raw duplicate observations", () => {
  const result = normalizePolicySurfaceResultForEarlyHandoff({
    artifactRefs: [],
    moduleRun: {
      completedAt: "2026-07-31T20:00:03.000Z",
      durationMs: 3_000,
      moduleName: "policySurfaceScanner",
      startedAt: "2026-07-31T20:00:00.000Z",
      status: "completed",
    },
    policySurfaceObservations: [
      ...Array.from({ length: 40 }, (_, index) => observation(index, "observed")),
      observation(40, "fetched"),
    ],
  });

  assert.equal(result.policySurfaceObservations.length, 1);
  assert.equal(result.policySurfaceObservations[0]?.status, "fetched");
  assert.equal(result.policySurfaceObservations[0]?.observationId, "privacy-40");
});

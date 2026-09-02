import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { CanonicalEvidenceBundle } from "@certscore/contracts";
import { createArtifactWriter } from "./artifact-writer.js";
import { buildGpcResponseAssessment } from "./gpc-response-assessment.js";
import { preConsentRuntimeScanner } from "./scanners/pre-consent-runtime-scanner.js";

const sha = "a".repeat(64);

function bundle(input: {
  gpc?: boolean;
  lane: "runtime_evidence" | "gpc_observation";
  tracker?: string;
}): CanonicalEvidenceBundle {
  return {
    normalizedUrl: "https://example.test/",
    networkEvents: [{
      eventId: `${input.lane}_document`,
      requestHeaders: {
        ...(input.gpc ? { secGpc: "1" } : {}),
      },
    }],
    cookieEvents: [],
    cookieSnapshots: [],
    normalizedVendorObservations: [],
    observedJourneys: input.tracker ? [{
      journeyType: "tracker",
      key: input.tracker,
      displayName: input.tracker,
      vendor: input.tracker,
    }] : [],
    cmpRuntimeObservations: [],
    consentUiObservations: [],
    runtimeCoverage: { coverageStatus: "usable" },
    scanLaneRuns: [{
      laneId: input.lane,
      accessOutcome: "representative_page",
      firstEffectiveUrl: "https://example.test/",
    }],
  } as unknown as CanonicalEvidenceBundle;
}

function assess(baseline: CanonicalEvidenceBundle, gpc: CanonicalEvidenceBundle) {
  return buildGpcResponseAssessment({
    baseline,
    baselineArtifact: { sha256: sha, sizeBytes: 100, uri: "s3://evidence/baseline.json" },
    generatedAt: "2026-08-20T12:00:00.000Z",
    gpc,
    gpcArtifact: { sha256: sha, sizeBytes: 100, uri: "s3://evidence/gpc.json" },
  });
}

test("GPC assessment is responsive when the paired passive condition changes a relevant tracker", () => {
  const result = assess(
    bundle({ lane: "runtime_evidence", tracker: "Example Ads" }),
    bundle({ gpc: true, lane: "gpc_observation" }),
  );
  assert.equal(result.status, "responsive");
  assert.equal(result.findingTitle, "GPC response");
  assert.deepEqual(result.comparison.deltas.trackers.baselineOnly, ["Example Ads|Example Ads|Example Ads"]);
  assert.equal(result.scoreEffect, "none");
  assert.equal(result.legalInterpretation, "not_assessed");
});

test("GPC assessment reports no observable response only for comparable identical evidence", () => {
  const result = assess(
    bundle({ lane: "runtime_evidence", tracker: "Example Analytics" }),
    bundle({ gpc: true, lane: "gpc_observation", tracker: "Example Analytics" }),
  );
  assert.equal(result.status, "no_observable_response");
  assert.equal(result.findingTitle, "No observable GPC response");
  assert.equal(result.comparison.comparable, true);
});

test("GPC assessment fails closed when direct Sec-GPC evidence is missing", () => {
  const result = assess(
    bundle({ lane: "runtime_evidence" }),
    bundle({ lane: "gpc_observation" }),
  );
  assert.equal(result.status, "indeterminate");
  assert.equal(result.findingTitle, "GPC response");
  assert.ok(result.comparison.limitationKeys.includes("sec_gpc_header_not_retained"));
});

test("dedicated passive browser condition sends Sec-GPC and exposes navigator.globalPrivacyControl", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-gpc-observation-"));
  const pageUrl = "https://gpc-observation.test/";
  try {
    const result = await preConsentRuntimeScanner({
      artifactWriter: await createArtifactWriter(tempRoot),
      captureScope: "runtime_evidence",
      globalPrivacyControlEnabled: true,
      internalBudgetMs: 5_000,
      normalizedUrl: pageUrl,
      routeFulfillers: [{
        urlPattern: /^https:\/\/gpc-observation\.test\/$/,
        contentType: "text/html",
        body: `<!doctype html><script>fetch('/navigator-gpc-' + String(navigator.globalPrivacyControl))</script>`,
      }, {
        urlPattern: /^https:\/\/gpc-observation\.test\/navigator-gpc-/,
        contentType: "text/plain",
        body: "ok",
      }],
      scanStartedAtMs: Date.now(),
      screenshotMode: "never",
      url: pageUrl,
      waitMode: "fast",
    });
    const requests = result.networkEvents.filter((event) => event.requestHostname === "gpc-observation.test");
    assert.ok(requests.length >= 2);
    assert.ok(requests.every((event) => event.requestHeaders?.secGpc === "1"));
    assert.ok(requests.some((event) => event.path === "/navigator-gpc-true"));
    assert.equal(requests.some((event) => event.requestHeaders?.dnt !== undefined), false);
    assert.ok(result.transportSecurityObservations.length > 0);
    const quietWait = result.moduleRun.timingBreakdown?.find((entry) =>
      entry.label === "passive evidence quiet wait"
    );
    assert.ok(quietWait);
    assert.ok((quietWait?.durationMs ?? 0) >= 250);
    assert.notEqual(quietWait?.outcome, "timed_out");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("250ms quiet gate restarts for late GPC-condition activity and retains the request", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-gpc-quiet-window-"));
  const pageUrl = "https://gpc-quiet-window.test/";
  try {
    const result = await preConsentRuntimeScanner({
      artifactWriter: await createArtifactWriter(tempRoot),
      captureScope: "runtime_evidence",
      globalPrivacyControlEnabled: true,
      internalBudgetMs: 5_000,
      normalizedUrl: pageUrl,
      routeFulfillers: [{
        urlPattern: /^https:\/\/gpc-quiet-window\.test\/$/,
        contentType: "text/html",
        body: `<!doctype html><body>Passive evidence fixture<script>setTimeout(() => fetch('/late-gpc-request'), 175)</script></body>`,
      }, {
        urlPattern: /^https:\/\/gpc-quiet-window\.test\/late-gpc-request$/,
        contentType: "text/plain",
        body: "ok",
      }],
      scanStartedAtMs: Date.now(),
      screenshotMode: "never",
      url: pageUrl,
      waitMode: "fast",
    });

    const lateRequest = result.networkEvents.find((event) => event.path === "/late-gpc-request");
    assert.ok(lateRequest);
    assert.equal(lateRequest?.requestHeaders?.secGpc, "1");
    const quietWait = result.moduleRun.timingBreakdown?.find((entry) =>
      entry.label === "passive evidence quiet wait"
    );
    assert.ok((quietWait?.durationMs ?? 0) >= 400);
    assert.notEqual(quietWait?.outcome, "timed_out");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

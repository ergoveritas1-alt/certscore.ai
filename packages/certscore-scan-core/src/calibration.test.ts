import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { CanonicalEvidenceBundle } from "@certscore/contracts";
import { minimalBundle } from "../../certscore-review-engine/src/fixtures.js";
import { readCalibrationUrls, runCalibration } from "./calibration.js";

test("runCalibration fails fast when OPENAI_API_KEY is missing", async () => {
  await assert.rejects(
    () => runCalibration({
      profile: "tiny",
      urls: ["https://example.com"],
      outDir: "/tmp/certscore-v2-calibration-missing-key",
      env: {},
      scanner: async () => minimalBundle(),
    }),
    /OPENAI_API_KEY is required for v2 calibration/,
  );
});

test("runCalibration records one failed URL without stopping the batch", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-calibration-"));
  try {
    const summary = await runCalibration({
      profile: "full",
      urls: ["https://ok.example", "https://fail.example"],
      outDir: tempRoot,
      env: { OPENAI_API_KEY: "test-key" },
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      scanner: async ({ url }) => {
        if (url.includes("fail")) {
          throw new Error("fixture scan failure");
        }
        return calibrationBundle(url);
      },
    });

    assert.equal(summary.successCount, 1);
    assert.equal(summary.failureCount, 1);
    assert.equal(summary.results[1]?.status, "failed");
    assert.equal(summary.results[1]?.failureReason, "fixture scan failure");
    assert.equal(summary.results[0]?.modulesRun[0]?.moduleName, "preConsentRuntimeScanner");
    assert.equal(summary.results[0]?.modulesRun.some((moduleRun) => moduleRun.moduleName === "policySurfaceScanner"), true);
    assert.equal(summary.results[0]?.consent.controlsObservedByType.reject_all, 1);
    assert.equal(summary.results[0]?.policy.policySurfacesObserved, 1);
    assert.equal(summary.results[0]?.policy.vendorMentions.includes("Google Analytics"), true);

    const json = JSON.parse(await readFile(path.join(tempRoot, "calibration-summary.json"), "utf8")) as typeof summary;
    assert.deepEqual(json, summary);
    assert.equal(json.generatedAt, "2026-01-01T00:00:00.000Z");

    const markdown = await readFile(path.join(tempRoot, "calibration-summary.md"), "utf8");
    assert.equal(markdown.includes("This is internal diagnostic output only"), true);
    assert.equal(markdown.includes("fixture scan failure"), true);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("readCalibrationUrls ignores blanks and comments", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "certscore-v2-calibration-urls-"));
  const filePath = path.join(tempRoot, "urls.txt");
  try {
    await import("node:fs/promises").then(({ writeFile }) =>
      writeFile(filePath, "# comment\n\nhttps://example.com\n https://certscore.ai \n"),
    );
    assert.deepEqual(await readCalibrationUrls(filePath), [
      "https://example.com",
      "https://certscore.ai",
    ]);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

function calibrationBundle(url: string): CanonicalEvidenceBundle {
  const base = minimalBundle({
    scanId: "calibration_fixture_scan",
    url,
    normalizedUrl: `${url}/`,
    scanProfile: {
      profileId: "full",
      label: "Full scan placeholder",
      targetDurationMs: 90_000,
      internalBudgetMs: 100_000,
      enabledModules: [
        "preConsentRuntimeScanner",
        "consentFlowRuntimeScanner",
        "policySurfaceScanner",
      ],
    },
    modulesRun: [
      moduleRun("preConsentRuntimeScanner", 100),
      moduleRun("consentFlowRuntimeScanner", 200),
      moduleRun("policySurfaceScanner", 300),
    ],
    consentActionCandidates: [
      {
        actionId: "candidate_reject",
        actionType: "reject_all",
        labelText: "Reject All",
        normalizedLabel: "reject all",
        visible: true,
        enabled: true,
        confidence: 0.91,
        detectionMethod: "deterministic_text",
        shouldClick: true,
        evidenceRefs: [{ refId: "ref_candidate_reject", artifactId: "dom_reject", eventType: "dom_snapshot" }],
        screenshotArtifactRefs: [],
        assistMetadata: [{
          assistId: "nano_consent_ui_reject",
          modelAssistProvider: "nano",
          assistType: "consent_ui_classification",
          confidence: 0.9,
          uncertaintyNotes: [],
          usedForFinalFinding: false,
        }],
      },
    ],
    consentActionAttempts: [
      {
        attemptId: "attempt_reject",
        actionType: "reject_all",
        attempted: true,
        succeeded: true,
        bannerPresentBefore: true,
        bannerPresentAfter: false,
        timestampMs: 1_000,
        scenario: "reject_all_flow",
        evidenceRefs: [{ refId: "ref_attempt_reject", artifactId: "dom_reject_after", eventType: "dom_snapshot" }],
      },
    ],
    consentFlowObservations: [
      {
        observationId: "consent_flow_reject",
        sourceScanner: "consent_flow_runtime",
        scenario: "reject_all_flow",
        consentStateAtTime: "post_reject",
        bannerLikelyPresent: true,
        actionCandidates: [],
        actionAttempts: [],
        evidenceRefs: [{ refId: "ref_dom_reject", artifactId: "dom_reject", eventType: "dom_snapshot" }],
        artifactRefs: [],
        confidence: 0.76,
        directVsInferred: "direct",
      },
    ],
    consentFlowComparisons: [
      {
        comparisonId: "comparison_reject",
        comparedScenarios: "fresh_pre_consent_vs_after_reject",
        vendorsPersistingAfterReject: [],
        vendorsSuppressedAfterReject: [],
        vendorsAppearingOnlyAfterAccept: [],
        cookiesPersistingAfterReject: ["_ga"],
        cookiesSetAfterAccept: [],
        collectionEndpointsPersistingAfterReject: ["www.google-analytics.com"],
        collectionEndpointsSuppressedAfterReject: [],
        collectionEndpointsAppearingOnlyAfterAccept: [],
        requestCountDeltaByVendor: {},
        cookieCountDeltaByVendor: { "_ga": 0 },
        journeyPhaseDeltas: [{
          journeyKey: "endpoint:www.google-analytics.com",
          displayName: "www.google-analytics.com",
          observedPreConsent: true,
          observedAfterReject: true,
          persistedAfterReject: true,
          evidenceRefs: [{ refId: "ref_net_reject", eventId: "net_reject", eventType: "network_request" }],
        }],
        confidence: 0.78,
        coverageLimitations: [],
        evidenceRefs: [{ refId: "ref_net_reject", eventId: "net_reject", eventType: "network_request" }],
      },
    ],
    policySurfaceObservations: [
      {
        observationId: "policy_privacy",
        sourceScanner: "policy_surface",
        scenario: "policy_surface_review",
        consentStateAtTime: "not_applicable",
        surfaceType: "privacy_policy",
        url: `${url}/privacy`,
        normalizedUrl: `${url}/privacy`,
        linkText: "Privacy Policy",
        discoveryMethod: "nano_assisted_link_classification",
        status: "fetched",
        textExcerpt: "Privacy Policy. We mention Google Analytics.",
        boundedTextExcerptIds: ["policy_excerpt"],
        observedTopics: ["analytics"],
        mentionedVendors: ["Google Analytics"],
        mentionedPurposes: [],
        mentionedRights: [],
        mentionedControls: [],
        evidenceRefs: [{ refId: "ref_policy", artifactId: "policy_excerpt", eventType: "policy_surface", url: `${url}/privacy` }],
        artifactRefs: [],
        assistMetadata: [{
          assistId: "nano_policy_links",
          modelAssistProvider: "nano",
          assistType: "link_classification",
          inputEvidenceRefs: [],
          inputExcerptIds: [],
          outputSchemaVersion: "policy-assist.v1",
          confidence: 0.9,
          uncertaintyNotes: [],
          evidenceRefs: [],
          usedForFinalFinding: false,
        }],
        confidence: 0.82,
        directVsInferred: "direct",
      },
    ],
    cmpRuntimeObservations: [],
  });
  return {
    ...base,
    derivedRuntimeSignals: {
      ...base.derivedRuntimeSignals,
      consentBannerLikelyPresent: true,
    },
  };
}

function moduleRun(moduleName: string, durationMs: number): CanonicalEvidenceBundle["modulesRun"][number] {
  return {
    moduleName,
    status: "completed",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
    durationMs,
    evidenceRefs: [],
    errors: [],
  };
}

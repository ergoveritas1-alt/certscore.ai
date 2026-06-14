import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  generateWc01V2PostRejectCalibrationReport,
  WC01_V2_POST_REJECT_CALIBRATION_VERSION,
  type Wc01V2PostRejectCalibrationManifest,
  type Wc01V2PostRejectCalibrationSiteExpectation,
} from "./wc01-v2-post-reject-calibration";
import type { Wc01V2ShadowRow } from "./wc01-shadow-contract";

test("post-reject calibration keeps Gatech-like delta-only persistence detected but not testable", async () => {
  await withFixtureArtifacts(async (artifactRoot) => {
    await writeSiteArtifacts(artifactRoot, {
      siteKey: "gatech.edu",
      profile: "full",
      bundle: bundleFixture({
        consentActionAttempts: [rejectAttempt({ attempted: true, succeeded: false, failureReason: "banner_not_dismissed" })],
        consentFlowComparisons: [persistedComparisonFixture()],
      }),
      shadowRows: [
        postRejectRowFixture({
          missingCorroborators: ["confident_successful_consent_action_comparison"],
          demotionReasons: ["comparison_not_confidently_testable"],
        }),
      ],
    });

    const report = await generateWc01V2PostRejectCalibrationReport({
      artifactRoot,
      manifest: manifestFixture({
        siteKey: "gatech.edu",
        url: "https://www.gatech.edu/",
        preferredProfile: "full",
        expectedOutcome: "positive",
        expectedRejectAction: "not_testable",
        expectedDetected: true,
        expectedTestable: false,
        expectedPromotable: false,
        expectedVendors: ["Google"],
        tags: ["delta_only"],
      }),
    });

    const result = requiredSite(report, "gatech.edu");
    assert.equal(result.evaluation.status, "pass");
    assert.equal(result.actual.postReject.detected, true);
    assert.equal(result.actual.postReject.testable, false);
    assert.equal(result.actual.postReject.promotable, false);
    assert.equal(result.actual.postReject.counts.persistedDeltaCount, 3);
  });
});

test("post-reject calibration passes clean negative controls without post-reject rows", async () => {
  await withFixtureArtifacts(async (artifactRoot) => {
    await writeSiteArtifacts(artifactRoot, {
      siteKey: "mozilla.org",
      profile: "full",
      bundle: bundleFixture({
        consentActionAttempts: [],
        consentFlowComparisons: [],
      }),
      shadowRows: [],
    });

    const report = await generateWc01V2PostRejectCalibrationReport({
      artifactRoot,
      manifest: manifestFixture({
        siteKey: "mozilla.org",
        url: "https://www.mozilla.org/",
        preferredProfile: "full",
        expectedOutcome: "negative",
        expectedRejectAction: "no_reject_path",
        expectedDetected: false,
        expectedTestable: false,
        expectedPromotable: false,
        tags: ["negative_control"],
      }),
    });

    const result = requiredSite(report, "mozilla.org");
    assert.equal(result.evaluation.status, "pass");
    assert.equal(result.actual.postReject.detected, false);
    assert.equal(result.actual.postReject.status, "not_detected");
  });
});

test("post-reject calibration blocks CMP-only persistence from becoming promotable", async () => {
  await withFixtureArtifacts(async (artifactRoot) => {
    await writeSiteArtifacts(artifactRoot, {
      siteKey: "cmp.example",
      profile: "full",
      bundle: bundleFixture({
        consentActionAttempts: [rejectAttempt({ attempted: true, succeeded: true })],
        consentFlowComparisons: [persistedComparisonFixture({ vendor: "OneTrust", cookieName: "OptanonConsent", endpointHostname: undefined })],
      }),
      shadowRows: [
        postRejectRowFixture({
          matchedCriteria: [
            "confident_successful_consent_action_comparison",
            "consent_flow_runtime_delta_detected",
            "post_reject_persisted_delta_count:1",
            "post_reject_persisted_endpoint_count:0",
            "post_reject_persisted_cookie_count:1",
            "post_reject_persisted_vendor_count:1",
          ],
          reviewOnlyReasons: ["shadow_projection_only", "non_tracker_purpose_diagnostic_only"],
          vendors: [{ vendor: "OneTrust", product: "OneTrust CMP", purpose: "consent_management" }],
        }),
      ],
    });

    const report = await generateWc01V2PostRejectCalibrationReport({
      artifactRoot,
      manifest: manifestFixture({
        siteKey: "cmp.example",
        url: "https://cmp.example/",
        preferredProfile: "full",
        expectedOutcome: "false_positive_trap",
        expectedRejectAction: "succeeded",
        expectedTestable: true,
        expectedPromotable: false,
        expectedVendors: ["OneTrust"],
        tags: ["false_positive_trap", "cmp_only"],
      }),
    });

    const result = requiredSite(report, "cmp.example");
    assert.equal(result.evaluation.status, "pass");
    assert.equal(result.actual.postReject.detected, true);
    assert.equal(result.actual.postReject.testable, true);
    assert.equal(result.actual.postReject.promotable, false);
    assert.ok(result.actual.postReject.reasons.includes("non_tracker_purpose_diagnostic_only"));
  });
});

test("post-reject calibration distinguishes testable review signals from promotable findings", async () => {
  await withFixtureArtifacts(async (artifactRoot) => {
    await writeSiteArtifacts(artifactRoot, {
      siteKey: "netlify.com",
      profile: "full",
      bundle: bundleFixture({
        consentActionAttempts: [rejectAttempt({ attempted: true, succeeded: true })],
        consentFlowComparisons: [persistedComparisonFixture()],
      }),
      shadowRows: [
        postRejectRowFixture({
          matchedCriteria: [
            "consent_flow_runtime_delta_detected",
            "post_reject_persisted_delta_count:3",
            "post_reject_persisted_endpoint_count:1",
            "post_reject_persisted_cookie_count:1",
            "post_reject_persisted_vendor_count:1",
            "comparable_pre_post_measurement_window",
            "confident_successful_consent_action_comparison",
          ],
          demotionReasons: ["review_signal_only_no_gap_conclusion"],
        }),
      ],
    });

    const report = await generateWc01V2PostRejectCalibrationReport({
      artifactRoot,
      manifest: manifestFixture({
        siteKey: "netlify.com",
        url: "https://www.netlify.com/",
        preferredProfile: "full",
        expectedOutcome: "positive",
        expectedRejectAction: "succeeded",
        expectedDetected: true,
        expectedTestable: true,
        expectedPromotable: false,
        expectedVendors: ["Google"],
        tags: ["internal_testable_review_signal"],
      }),
    });

    const result = requiredSite(report, "netlify.com");
    assert.equal(result.evaluation.status, "pass");
    assert.equal(result.actual.rejectAction.proofAvailable, true);
    assert.equal(result.actual.rejectAction.proof[0]?.cmpFamily, "OneTrust");
    assert.equal(result.actual.rejectAction.proof[0]?.actionPath, "direct_action");
    assert.equal(result.actual.postReject.testable, true);
    assert.equal(result.actual.postReject.promotable, false);
    assert.equal(result.actual.postReject.diagnostics.testabilityStatus, "testable");
    assert.equal(result.actual.postReject.diagnostics.comparableMeasurement.comparableCount, 1);
    assert.ok(result.actual.postReject.diagnostics.promotionBlockers.includes("review_signal_only_no_gap_conclusion"));
    assert.equal(report.summary.cmpSupportedFlowCount, 1);
    assert.equal(report.summary.cmpAttemptedFlowCount, 1);
    assert.equal(report.summary.cmpSucceededFlowCount, 1);
    assert.equal(report.summary.cmpAttemptSuccessRate, 1);
    assert.equal(report.summary.cmpComparableWindowSuccessCount, 1);
    assert.equal(report.summary.cmpComparableWindowSuccessRate, 1);
    assert.deepEqual(report.summary.cmpFamilyReliability.map((family) => family.cmpFamily), ["OneTrust"]);
  });
});

test("post-reject calibration keeps reject-not-testable rows audit-only", async () => {
  await withFixtureArtifacts(async (artifactRoot) => {
    await writeSiteArtifacts(artifactRoot, {
      siteKey: "ford.com",
      profile: "full",
      bundle: bundleFixture({
        consentActionAttempts: [rejectAttempt({ attempted: true, succeeded: false, failureReason: "candidate_not_stable" })],
        consentFlowComparisons: [persistedComparisonFixture()],
      }),
      shadowRows: [
        postRejectRowFixture({
          missingCorroborators: ["confident_successful_consent_action_comparison"],
          demotionReasons: ["comparison_not_confidently_testable"],
        }),
      ],
    });

    const report = await generateWc01V2PostRejectCalibrationReport({
      artifactRoot,
      manifest: manifestFixture({
        siteKey: "ford.com",
        url: "https://www.ford.com/",
        preferredProfile: "full",
        expectedOutcome: "not_testable",
        expectedRejectAction: "not_testable",
        expectedTestable: false,
        expectedPromotable: false,
        tags: ["reject_not_testable"],
      }),
    });

    const result = requiredSite(report, "ford.com");
    assert.equal(result.evaluation.status, "pass");
    assert.equal(result.actual.postReject.status, "detected_not_testable");
    assert.equal(result.actual.postReject.promotable, false);
  });
});

test("post-reject calibration excludes no-go pages even when noisy rows exist", async () => {
  await withFixtureArtifacts(async (artifactRoot) => {
    await writeSiteArtifacts(artifactRoot, {
      siteKey: "etsy.com",
      profile: "tiny",
      domText: "Etsy Access is temporarily restricted. We detected unusual activity from your device or network.",
      bundle: bundleFixture({
        consentActionAttempts: [],
        consentFlowComparisons: [persistedComparisonFixture()],
      }),
      shadowRows: [postRejectRowFixture()],
    });

    const report = await generateWc01V2PostRejectCalibrationReport({
      artifactRoot,
      manifest: manifestFixture({
        siteKey: "etsy.com",
        url: "https://www.etsy.com/",
        preferredProfile: "tiny",
        expectedOutcome: "no_go",
        expectedRejectAction: "no_go",
        expectedDetected: false,
        expectedTestable: false,
        expectedPromotable: false,
        tags: ["no_go"],
      }),
    });

    const result = requiredSite(report, "etsy.com");
    assert.equal(result.evaluation.status, "pass");
    assert.equal(result.actual.noGo.detected, true);
    assert.equal(result.actual.postReject.status, "excluded_no_go");
    assert.equal(result.actual.postReject.detected, false);
  });
});

async function withFixtureArtifacts(run: (artifactRoot: string) => Promise<void>) {
  const artifactRoot = await mkdtemp(join(tmpdir(), "wc01-v2-post-reject-calibration-"));
  try {
    await run(artifactRoot);
  } finally {
    await rm(artifactRoot, { recursive: true, force: true });
  }
}

async function writeSiteArtifacts(inputRoot: string, input: {
  siteKey: string;
  profile: "tiny" | "standard" | "policy" | "full";
  bundle: Record<string, unknown>;
  shadowRows: Wc01V2ShadowRow[];
  domText?: string;
}) {
  const cohort = `lab-${input.siteKey.replace(/\W+/g, "-")}-${input.profile}-fixture`;
  const calibrationDir = join(inputRoot, `v2-calibration-${cohort}`, input.siteKey);
  const shadowDir = join(inputRoot, `v2-wc01-shadow-${cohort}`, input.siteKey);
  await writeJson(join(calibrationDir, "CanonicalEvidenceBundle.json"), {
    ...input.bundle,
    url: `https://${input.siteKey}/`,
    normalizedUrl: `https://${input.siteKey}/`,
    scanProfile: {
      profileId: input.profile,
      label: `${input.profile} fixture`,
      targetDurationMs: 1,
      internalBudgetMs: 1,
      enabledModules: ["preConsentRuntimeScanner", "consentFlowRuntimeScanner"],
    },
  });
  await writeJson(join(shadowDir, "Wc01V2ShadowProjection.json"), {
    contractVersion: "wc01.v2_shadow_projection.1",
    source: {
      scanId: "scan_fixture",
      url: `https://${input.siteKey}/`,
      projectionVersion: "certscore.v2.report_projection_draft.1",
    },
    rows: input.shadowRows,
    limitations: [],
    sanitizerWarnings: [],
    productionEligible: false,
  });
  if (input.domText) {
    await writeFile(join(calibrationDir, "dom-text-pre-consent.txt"), input.domText, "utf8");
  }
}

async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function manifestFixture(firstSite: Wc01V2PostRejectCalibrationSiteExpectation): Wc01V2PostRejectCalibrationManifest {
  const sites = [firstSite];
  for (let index = 1; index < 25; index += 1) {
    sites.push({
      siteKey: `missing-${index}.example`,
      url: `https://missing-${index}.example/`,
      expectedOutcome: "unknown",
      expectedRejectAction: "unknown",
      tags: ["missing_fixture_padding"],
    });
  }
  return {
    manifestVersion: WC01_V2_POST_REJECT_CALIBRATION_VERSION,
    internalOnlyBanner: "Internal post-reject calibration diagnostic only. Not customer-facing report output.",
    cohortName: "fixture",
    notes: [],
    sites,
  };
}

function bundleFixture(overrides: {
  consentActionAttempts: Array<Record<string, unknown>>;
  consentFlowComparisons: Array<Record<string, unknown>>;
}) {
  return {
    scanId: "scan_fixture",
    url: "https://example.com/",
    normalizedUrl: "https://example.com/",
    modulesRun: [
      {
        moduleName: "preConsentRuntimeScanner",
        status: "completed",
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:01.000Z",
        durationMs: 1,
        evidenceRefs: [],
        errors: [],
      },
      {
        moduleName: "consentFlowRuntimeScanner",
        status: "completed",
        startedAt: "2026-01-01T00:00:01.000Z",
        completedAt: "2026-01-01T00:00:02.000Z",
        durationMs: 1,
        evidenceRefs: [],
        errors: [],
      },
    ],
    consentActionAttempts: overrides.consentActionAttempts,
    consentFlowComparisons: overrides.consentFlowComparisons,
  };
}

function rejectAttempt(input: { attempted: boolean; succeeded: boolean; failureReason?: string }) {
  return {
    attemptId: "reject_attempt",
    actionType: "reject_all",
    attempted: input.attempted,
    succeeded: input.succeeded,
    failureReason: input.failureReason,
    actionProof: {
      proofVersion: "consent_action_proof.v1",
      candidateObserved: input.attempted,
      candidateLabelText: input.attempted ? "Reject All" : undefined,
      candidateNormalizedActionType: input.attempted ? "reject_all" : undefined,
      candidateSelectorSummary: input.attempted ? "controlIndex:1" : undefined,
      candidateConfidence: input.attempted ? 0.9 : undefined,
      candidateDetectionMethod: input.attempted ? "deterministic_text" : undefined,
      actionPath: input.attempted ? "direct_action" : "not_attempted",
      cmpFamily: input.attempted ? "OneTrust" : undefined,
      cmpProvider: input.attempted ? "OneTrust" : undefined,
      frameContext: input.attempted ? { frameKind: "main_frame" } : undefined,
      attemptedStatus: input.attempted
        ? input.succeeded ? "attempted_succeeded" : "attempted_failed"
        : "not_attempted",
      failureReason: input.failureReason,
      actionTimestampMs: 1,
      postClickSettleMs: input.attempted ? 1200 : undefined,
      beforeScreenshotRef: {
        artifactId: "before_screenshot",
        artifactType: "screenshot",
        path: "before.png",
      },
      afterScreenshotRef: input.attempted
        ? {
          artifactId: "after_screenshot",
          artifactType: "screenshot",
          path: "after.png",
        }
        : undefined,
      beforeDomExcerpt: "OneTrust Cookie Preferences",
      afterDomExcerpt: input.attempted ? "Cookie choices saved" : undefined,
      preActionConsentStateMarkers: input.attempted ? ["localStorage:OptanonConsentState"] : [],
      postActionConsentStateMarkers: input.succeeded ? ["localStorage:OptanonConsentState"] : [],
      evidenceRefs: [],
    },
    timestampMs: 1,
    scenario: "after_reject",
    evidenceRefs: [],
  };
}

function persistedComparisonFixture(input: {
  vendor?: string;
  cookieName?: string;
  endpointHostname?: string;
} = {}) {
  const vendor = input.vendor ?? "Google";
  const cookieName = input.cookieName ?? "_ga";
  const endpointHostname = input.endpointHostname ?? "www.google-analytics.com";
  return {
    comparisonId: "comparison_fixture",
    comparedScenarios: "fresh_pre_consent_vs_after_reject",
    vendorsPersistingAfterReject: [vendor],
    cookiesPersistingAfterReject: [cookieName],
    collectionEndpointsPersistingAfterReject: endpointHostname ? [endpointHostname] : [],
    confidence: 0.82,
    coverageLimitations: [],
    comparableMeasurement: {
      comparable: true,
      preActionWindow: {
        scenario: "baseline_pre_consent",
        consentStateAtEnd: "pre_consent",
        startedAtMs: 0,
        completedAtMs: 1000,
        networkEventCount: 1,
        cookieEventCount: 1,
      },
      postActionWindow: {
        scenario: "reject_all_flow",
        consentStateAtEnd: "post_reject",
        startedAtMs: 1200,
        completedAtMs: 2400,
        networkEventCount: 1,
        cookieEventCount: 1,
      },
      rejectActionEvent: {
        attemptId: "reject_attempt",
        attempted: true,
        succeeded: true,
        actionTimestampMs: 1,
        postClickSettleMs: 1200,
        proofAvailable: true,
      },
    },
    evidenceRefs: [],
    journeyPhaseDeltas: [
      {
        journeyKey: "endpoint:1",
        vendor,
        endpointHostname,
        observedPreConsent: true,
        observedAfterReject: true,
        persistedAfterReject: Boolean(endpointHostname),
        evidenceRefs: [],
      },
      {
        journeyKey: "cookie:1",
        vendor,
        cookieName,
        observedPreConsent: true,
        observedAfterReject: true,
        persistedAfterReject: true,
        evidenceRefs: [],
      },
      {
        journeyKey: "vendor:1",
        displayName: vendor,
        vendor,
        observedPreConsent: true,
        observedAfterReject: true,
        persistedAfterReject: true,
        evidenceRefs: [],
      },
    ],
  };
}

function postRejectRowFixture(input: {
  matchedCriteria?: string[];
  missingCorroborators?: string[];
  demotionReasons?: string[];
  reviewOnlyReasons?: string[];
  vendors?: Array<{ vendor: string; product?: string; purpose: string }>;
} = {}): Wc01V2ShadowRow {
  const vendors = input.vendors ?? [{ vendor: "Google", product: "Google Analytics", purpose: "analytics" }];
  return {
    rowId: "tracking_after_refusal_review",
    sourceFindingKey: "tracking_after_refusal_review_signal",
    category: "consent_flow",
    status: "review_signal",
    wc01AssessmentStatus: "review_signal",
    topFindingEligible: false,
    gapEligible: false,
    evidence: {
      excerptIds: ["excerpt_1", "excerpt_2"],
      sourceRefIds: ["ref_1"],
      displaySafeExcerpts: [],
      capped: false,
      omittedCount: 0,
    },
    vendors: vendors.map((vendor, index) => ({
      observationId: `vendor_${index}`,
      entity: vendor.vendor,
      vendor: vendor.vendor,
      product: vendor.product,
      purpose: vendor.purpose,
      confidence: 0.9,
      basis: ["fixture"],
      regulatoryRelevance: [],
    })),
    confidence: {
      score: 0.82,
      band: "high",
      directVsInferred: "direct",
    },
    policy: {
      reviewOnlyReasons: input.reviewOnlyReasons ?? ["shadow_projection_only", "review_only_finding_key"],
      matchedCriteria: input.matchedCriteria ?? [
        "consent_flow_runtime_delta_detected",
        "post_reject_persisted_delta_count:3",
        "post_reject_persisted_endpoint_count:1",
        "post_reject_persisted_cookie_count:1",
        "post_reject_persisted_vendor_count:1",
      ],
      missingCorroborators: input.missingCorroborators ?? [],
      demotionReasons: input.demotionReasons ?? ["review_signal_only_no_gap_conclusion"],
    },
  };
}

function requiredSite(
  report: Awaited<ReturnType<typeof generateWc01V2PostRejectCalibrationReport>>,
  siteKey: string,
) {
  const result = report.siteResults.find((site) => site.siteKey === siteKey);
  assert.ok(result, `Expected site result for ${siteKey}`);
  return result;
}

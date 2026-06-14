import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import type { CanonicalEvidenceBundle } from "@certscore/contracts";
import type {
  Wc01V2ShadowProjection,
  Wc01V2ShadowRow,
} from "./wc01-shadow-contract";

export const WC01_V2_POST_REJECT_CALIBRATION_VERSION =
  "wc01.v2_post_reject_calibration.1";

export type Wc01V2PostRejectExpectedOutcome =
  | "positive"
  | "negative"
  | "no_go"
  | "not_testable"
  | "false_positive_trap"
  | "unknown";

export type Wc01V2PostRejectExpectedRejectAction =
  | "succeeded"
  | "not_testable"
  | "no_reject_path"
  | "no_go"
  | "unknown";

export type Wc01V2PostRejectCalibrationManifest = {
  manifestVersion: typeof WC01_V2_POST_REJECT_CALIBRATION_VERSION;
  generatedAt?: string;
  internalOnlyBanner: string;
  cohortName: string;
  notes: string[];
  sites: Wc01V2PostRejectCalibrationSiteExpectation[];
};

export type Wc01V2PostRejectCalibrationSiteExpectation = {
  siteKey: string;
  url: string;
  preferredProfile?: "tiny" | "standard" | "policy" | "full";
  expectedOutcome: Wc01V2PostRejectExpectedOutcome;
  expectedRejectAction: Wc01V2PostRejectExpectedRejectAction;
  expectedDetected?: boolean;
  expectedTestable?: boolean;
  expectedPromotable?: boolean;
  expectedVendors?: string[];
  tags: string[];
  notes?: string;
};

export type Wc01V2PostRejectCalibrationReport = {
  reportVersion: typeof WC01_V2_POST_REJECT_CALIBRATION_VERSION;
  generatedAt: string;
  internalOnlyBanner: string;
  manifestPath?: string;
  artifactRoot: string;
  cohortName: string;
  summary: Wc01V2PostRejectCalibrationSummary;
  siteResults: Wc01V2PostRejectCalibrationSiteResult[];
  notes: string[];
};

export type Wc01V2PostRejectCalibrationSummary = {
  siteCount: number;
  evaluatedCount: number;
  missingArtifactCount: number;
  passCount: number;
  failCount: number;
  unknownCount: number;
  detectedCount: number;
  testableCount: number;
  promotableCount: number;
  rejectAttemptedSiteCount: number;
  rejectSucceededSiteCount: number;
  rejectSuccessRate: number;
  cmpSupportedFlowCount: number;
  cmpAttemptedFlowCount: number;
  cmpSucceededFlowCount: number;
  cmpAttemptSuccessRate: number;
  cmpComparableWindowSuccessCount: number;
  cmpComparableWindowSuccessRate: number;
  cmpFamilyReliability: Array<{
    cmpFamily: string;
    supportedCount: number;
    attemptedCount: number;
    succeededCount: number;
    successRate: number;
    comparableWindowSuccessCount: number;
    comparableWindowSuccessRate: number;
  }>;
  topRejectFailureReasons: Array<{
    reason: string;
    count: number;
  }>;
  noGoCount: number;
  falsePositiveTrapPassCount: number;
  missingArtifacts: string[];
  failedSites: string[];
};

export type Wc01V2PostRejectCalibrationSiteResult = {
  siteKey: string;
  url: string;
  expected: {
    outcome: Wc01V2PostRejectExpectedOutcome;
    rejectAction: Wc01V2PostRejectExpectedRejectAction;
    detected?: boolean;
    testable?: boolean;
    promotable?: boolean;
    vendors: string[];
    tags: string[];
    notes?: string;
  };
  artifacts: {
    bundlePath?: string;
    shadowPath?: string;
    profile?: string;
    scanId?: string;
  };
  actual: Wc01V2PostRejectActual;
  evaluation: {
    status: "pass" | "fail" | "unknown";
    failures: string[];
    warnings: string[];
  };
};

export type Wc01V2PostRejectActual = {
  artifactStatus: "complete" | "missing_bundle" | "missing_shadow" | "missing_both";
  noGo: {
    detected: boolean;
    reasons: string[];
  };
  rejectAction: {
    status: "succeeded" | "attempted_failed" | "not_attempted" | "no_attempt" | "unknown";
    attemptedCount: number;
    succeededCount: number;
    failureReasons: string[];
    proofAvailable: boolean;
    proof: Array<{
      candidateObserved: boolean;
      candidateLabelText?: string;
      candidateNormalizedActionType?: string;
      candidateSelectorSummary?: string;
      candidateConfidence?: number;
      candidateDetectionMethod?: string;
      actionPath?: string;
      cmpFamily?: string;
      cmpProvider?: string;
      frameContext?: {
        frameKind: "main_frame" | "sub_frame";
        frameUrl?: string;
        frameName?: string;
      };
      attemptedStatus: "not_attempted" | "attempted_succeeded" | "attempted_failed";
      failureReason?: string;
      actionTimestampMs?: number;
      postClickSettleMs?: number;
      beforeScreenshotPath?: string;
      afterScreenshotPath?: string;
      beforeDomExcerptPresent: boolean;
      afterDomExcerptPresent: boolean;
      preActionConsentStateMarkerCount: number;
      postActionConsentStateMarkerCount: number;
    }>;
  };
  postReject: {
    detected: boolean;
    testable: boolean;
    promotable: boolean;
    status: "detected_promotable" | "detected_not_testable" | "not_detected" | "excluded_no_go" | "missing_artifacts";
    reasons: string[];
    counts: {
      persistedDeltaCount: number;
      endpointCount: number;
      cookieCount: number;
      vendorCount: number;
      evidenceExcerptCount: number;
      sourceRefCount: number;
    };
    vendors: Array<{
      vendor: string;
      product?: string;
      purpose?: string;
    }>;
    diagnostics: {
      testabilityStatus: "missing_artifacts" | "excluded_no_go" | "testable" | "not_testable" | "not_detected";
      promotionBlockers: string[];
      comparableMeasurement: {
        comparableCount: number;
        nonComparableCount: number;
        reasons: string[];
      };
      consentActionConfidence: {
        succeeded: boolean;
        proofAvailable: boolean;
        failureReasons: string[];
      };
    };
    rows: Array<{
      sourceFindingKey: string;
      status: Wc01V2ShadowRow["status"];
      matchedCriteria: string[];
      missingCorroborators: string[];
      demotionReasons: string[];
      evidenceExcerptCount: number;
      sourceRefCount: number;
    }>;
  };
};

type GenerateReportInput = {
  artifactRoot: string;
  manifest: Wc01V2PostRejectCalibrationManifest;
  manifestPath?: string;
  outPath?: string;
  markdownPath?: string;
};

const POST_REJECT_FINDING_KEYS = new Set([
  "tracking_after_refusal_review_signal",
  "reject_did_not_reduce_tracking_review_signal",
  "vendors_persist_after_reject_review_signal",
  "cookies_persist_after_reject_review_signal",
]);

const NO_GO_DOM_TEXT_PATTERNS = [
  /\baccess is temporarily restricted\b/i,
  /\bunusual activity from your device or network\b/i,
  /\bautomated \(?bot\)? activity\b/i,
  /\bcaptcha\b/i,
  /\bdatadome\b/i,
  /\bcloudflare\b/i,
  /\b403\b|\bforbidden\b/i,
  /\bpublic site access was limited\b/i,
  /\bnot representative of the public site\b/i,
];

const NO_GO_MODULE_ERROR_PATTERNS = [
  /\b403\b|\bforbidden\b/i,
  /\bcaptcha\b/i,
  /\bblocked\b/i,
  /\baccess.*restricted\b/i,
  /\bdatadome\b/i,
  /\bcloudflare\b/i,
];

export function parseWc01V2PostRejectCalibrationManifestJson(raw: string) {
  const parsed = JSON.parse(raw) as Wc01V2PostRejectCalibrationManifest;
  validateManifest(parsed);
  return parsed;
}

export async function generateWc01V2PostRejectCalibrationReportFromFile(input: {
  artifactRoot: string;
  manifestPath: string;
  outPath: string;
  markdownPath?: string;
}) {
  const manifest = parseWc01V2PostRejectCalibrationManifestJson(
    await readFile(input.manifestPath, "utf8"),
  );
  return generateWc01V2PostRejectCalibrationReport({
    artifactRoot: input.artifactRoot,
    manifest,
    manifestPath: input.manifestPath,
    outPath: input.outPath,
    markdownPath: input.markdownPath,
  });
}

export async function generateWc01V2PostRejectCalibrationReport(
  input: GenerateReportInput,
): Promise<Wc01V2PostRejectCalibrationReport> {
  validateManifest(input.manifest);
  const artifactIndex = await buildArtifactIndex(input.artifactRoot);
  const siteResults: Wc01V2PostRejectCalibrationSiteResult[] = [];

  for (const site of input.manifest.sites) {
    siteResults.push(await evaluateSite(site, input.artifactRoot, artifactIndex));
  }

  const report: Wc01V2PostRejectCalibrationReport = {
    reportVersion: WC01_V2_POST_REJECT_CALIBRATION_VERSION,
    generatedAt: new Date().toISOString(),
    internalOnlyBanner: "Internal post-reject calibration diagnostic only. Not customer-facing report output.",
    manifestPath: input.manifestPath,
    artifactRoot: input.artifactRoot,
    cohortName: input.manifest.cohortName,
    summary: summarizeResults(siteResults),
    siteResults,
    notes: [
      "Detected/testable/promotable are calibration states only; they do not create production findings or scores.",
      "Promotable means the internal shadow evidence has post-reject persistence plus a confidently testable reject action and no no-go exclusion.",
      "No-go and false-positive-trap sites must not become promotable from post-reject rows.",
      ...input.manifest.notes,
    ],
  };

  if (input.outPath) {
    await mkdir(dirname(input.outPath), { recursive: true });
    await writeFile(input.outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  if (input.markdownPath) {
    await mkdir(dirname(input.markdownPath), { recursive: true });
    await writeFile(input.markdownPath, renderWc01V2PostRejectCalibrationMarkdown(report), "utf8");
  }

  return report;
}

export function renderWc01V2PostRejectCalibrationMarkdown(
  report: Wc01V2PostRejectCalibrationReport,
) {
  const lines = [
    "# WC01 v2 post-reject calibration",
    "",
    report.internalOnlyBanner,
    "",
    `- Cohort: ${report.cohortName}`,
    `- Generated: ${report.generatedAt}`,
    `- Artifact root: ${report.artifactRoot}`,
    `- Sites: ${report.summary.siteCount}`,
    `- Evaluated: ${report.summary.evaluatedCount}`,
    `- Missing artifacts: ${report.summary.missingArtifactCount}`,
    `- Passed: ${report.summary.passCount}`,
    `- Failed: ${report.summary.failCount}`,
    `- Unknown: ${report.summary.unknownCount}`,
    `- Detected: ${report.summary.detectedCount}`,
    `- Testable: ${report.summary.testableCount}`,
    `- Promotable: ${report.summary.promotableCount}`,
    `- Reject success: ${report.summary.rejectSucceededSiteCount}/${report.summary.rejectAttemptedSiteCount} attempted sites (${Math.round(report.summary.rejectSuccessRate * 100)}%)`,
    `- CMP-supported flows: ${report.summary.cmpSupportedFlowCount}`,
    `- CMP attempted success: ${report.summary.cmpSucceededFlowCount}/${report.summary.cmpAttemptedFlowCount} attempted CMP-supported flows (${Math.round(report.summary.cmpAttemptSuccessRate * 100)}%)`,
    `- CMP comparable-window success: ${report.summary.cmpComparableWindowSuccessCount}/${report.summary.cmpSucceededFlowCount} successful reject actions (${Math.round(report.summary.cmpComparableWindowSuccessRate * 100)}%)`,
    `- No-go: ${report.summary.noGoCount}`,
    "",
    "## Site results",
    "",
    "| Site | Expected | Reject | Actual | Counts | Vendors | Blockers | Evaluation |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...report.siteResults.map((result) => {
      const counts = result.actual.postReject.counts;
      const vendors = result.actual.postReject.vendors
        .map((vendor) => vendor.product ? `${vendor.vendor}/${vendor.product}` : vendor.vendor)
        .slice(0, 5)
        .join(", ") || "none";
      const failures = result.evaluation.failures.length
        ? `; ${result.evaluation.failures.join("; ")}`
        : "";
      const blockers = summarizeMarkdownBlockers(result);
      return [
        result.siteKey,
        result.expected.outcome,
        result.actual.rejectAction.status,
        result.actual.postReject.status,
        `d:${counts.persistedDeltaCount} e:${counts.endpointCount} c:${counts.cookieCount} v:${counts.vendorCount}`,
        vendors,
        blockers,
        `${result.evaluation.status}${failures}`,
      ].map(escapeMarkdownTableCell).join(" | ").replace(/^/, "| ").replace(/$/, " |");
    }),
    "",
    "## Notes",
    "",
    ...report.notes.map((note) => `- ${note}`),
  ];

  if (report.summary.missingArtifacts.length > 0) {
    lines.push("", "## Missing artifacts", "");
    lines.push(...report.summary.missingArtifacts.map((site) => `- ${site}`));
  }

  if (report.summary.failedSites.length > 0) {
    lines.push("", "## Failed sites", "");
    lines.push(...report.summary.failedSites.map((site) => `- ${site}`));
  }

  if (report.summary.cmpFamilyReliability.length > 0) {
    lines.push(
      "",
      "## CMP Family Reliability",
      "",
      "| CMP family | Supported | Attempted | Succeeded | Success | Comparable windows | Comparable success |",
      "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
      ...report.summary.cmpFamilyReliability.map((family) =>
        [
          family.cmpFamily,
          String(family.supportedCount),
          String(family.attemptedCount),
          String(family.succeededCount),
          `${Math.round(family.successRate * 100)}%`,
          String(family.comparableWindowSuccessCount),
          `${Math.round(family.comparableWindowSuccessRate * 100)}%`,
        ].map(escapeMarkdownTableCell).join(" | ").replace(/^/, "| ").replace(/$/, " |")
      ),
    );
  }

  if (report.summary.topRejectFailureReasons.length > 0) {
    lines.push("", "## Top Reject Failure Reasons", "");
    lines.push(...report.summary.topRejectFailureReasons.map((item) => `- ${item.reason}: ${item.count}`));
  }

  return `${lines.join("\n")}\n`;
}

async function evaluateSite(
  expectation: Wc01V2PostRejectCalibrationSiteExpectation,
  artifactRoot: string,
  artifactIndex: ArtifactIndex,
): Promise<Wc01V2PostRejectCalibrationSiteResult> {
  const bundlePath = selectArtifactPath(artifactIndex.bundlesBySite.get(expectation.siteKey), expectation);
  const shadowPath = selectArtifactPath(artifactIndex.shadowsBySite.get(expectation.siteKey), expectation);
  const bundle = bundlePath ? await readJsonIfPresent<CanonicalEvidenceBundle>(bundlePath) : undefined;
  const shadow = shadowPath ? await readJsonIfPresent<Wc01V2ShadowProjection>(shadowPath) : undefined;
  const actual = buildActual({
    artifactRoot,
    bundle,
    bundlePath,
    expectation,
    shadow,
  });
  const evaluation = evaluateExpectation(expectation, actual);

  return {
    siteKey: expectation.siteKey,
    url: expectation.url,
    expected: {
      outcome: expectation.expectedOutcome,
      rejectAction: expectation.expectedRejectAction,
      detected: expectation.expectedDetected,
      testable: expectation.expectedTestable,
      promotable: expectation.expectedPromotable,
      vendors: expectation.expectedVendors ?? [],
      tags: expectation.tags,
      notes: expectation.notes,
    },
    artifacts: {
      bundlePath,
      shadowPath,
      profile: bundle?.scanProfile?.profileId,
      scanId: bundle?.scanId ?? shadow?.source?.scanId,
    },
    actual,
    evaluation,
  };
}

function buildActual(input: {
  artifactRoot: string;
  bundle?: CanonicalEvidenceBundle;
  bundlePath?: string;
  expectation: Wc01V2PostRejectCalibrationSiteExpectation;
  shadow?: Wc01V2ShadowProjection;
}): Wc01V2PostRejectActual {
  const artifactStatus = artifactStatusFor(input.bundle, input.shadow);
  const noGo = detectNoGo(input.artifactRoot, input.bundlePath, input.bundle);
  const rejectAction = summarizeRejectAction(input.bundle);
  const rows = input.shadow?.rows.filter((row) => POST_REJECT_FINDING_KEYS.has(row.sourceFindingKey)) ?? [];
  const countStats = summarizePostRejectCounts(input.bundle, rows);
  const vendors = summarizeVendors(rows);
  const comparableMeasurement = summarizeComparableMeasurement(input.bundle);
  const detected = artifactStatus === "complete" &&
    !noGo.detected &&
    rows.some((row) => row.status === "observed" || row.status === "review_signal" || row.status === "checked") &&
    (
      countStats.persistedDeltaCount > 0 ||
      countStats.endpointCount > 0 ||
      countStats.cookieCount > 0 ||
      countStats.vendorCount > 0 ||
      countStats.evidenceExcerptCount > 0
    );
  const confidentComparison = rows.some((row) =>
    row.policy.matchedCriteria.includes("confident_successful_consent_action_comparison"),
  ) && !rows.some((row) =>
    row.policy.missingCorroborators.includes("confident_successful_consent_action_comparison") ||
    row.policy.demotionReasons.includes("comparison_not_confidently_testable"),
  );
  const testable = detected && rejectAction.status === "succeeded" && confidentComparison;
  const nonTrackerDiagnosticOnly = rows.some((row) =>
    row.policy.reviewOnlyReasons.includes("non_tracker_purpose_diagnostic_only"),
  );
  const reviewSignalOnly = rows.some((row) =>
    row.policy.demotionReasons.includes("review_signal_only_no_gap_conclusion"),
  );
  const promotable = testable && !noGo.detected && !nonTrackerDiagnosticOnly && !reviewSignalOnly;
  const promotionBlockers = postRejectPromotionBlockers({
    artifactStatus,
    confidentComparison,
    detected,
    noGoDetected: noGo.detected,
    nonTrackerDiagnosticOnly,
    rejectActionStatus: rejectAction.status,
    rows,
    testable,
  });

  return {
    artifactStatus,
    noGo,
    rejectAction,
    postReject: {
      detected,
      testable,
      promotable,
      status: postRejectStatus({ artifactStatus, detected, noGoDetected: noGo.detected, promotable, testable }),
      reasons: postRejectReasons({ artifactStatus, confidentComparison, detected, noGoDetected: noGo.detected, nonTrackerDiagnosticOnly, rejectActionStatus: rejectAction.status }),
      counts: countStats,
      vendors,
      diagnostics: {
        testabilityStatus: testabilityStatus({ artifactStatus, detected, noGoDetected: noGo.detected, testable }),
        promotionBlockers,
        comparableMeasurement,
        consentActionConfidence: {
          succeeded: rejectAction.status === "succeeded",
          proofAvailable: rejectAction.proofAvailable,
          failureReasons: rejectAction.failureReasons,
        },
      },
      rows: rows.map((row) => ({
        sourceFindingKey: row.sourceFindingKey,
        status: row.status,
        matchedCriteria: row.policy.matchedCriteria,
        missingCorroborators: row.policy.missingCorroborators,
        demotionReasons: row.policy.demotionReasons,
        evidenceExcerptCount: row.evidence.excerptIds.length,
        sourceRefCount: row.evidence.sourceRefIds.length,
      })),
    },
  };
}

function evaluateExpectation(
  expectation: Wc01V2PostRejectCalibrationSiteExpectation,
  actual: Wc01V2PostRejectActual,
) {
  const failures: string[] = [];
  const warnings: string[] = [];

  if (actual.artifactStatus !== "complete") {
    return {
      status: "unknown" as const,
      failures: [],
      warnings: [`artifact_status:${actual.artifactStatus}`],
    };
  }

  if (expectation.expectedOutcome === "no_go") {
    if (!actual.noGo.detected) {
      failures.push("expected_no_go_not_detected");
    }
    if (actual.postReject.promotable) {
      failures.push("no_go_became_promotable");
    }
  }

  if (expectation.expectedOutcome === "negative" && actual.postReject.detected) {
    failures.push("expected_negative_but_post_reject_detected");
  }

  if (expectation.expectedOutcome === "positive" && !actual.postReject.detected) {
    failures.push("expected_positive_but_post_reject_not_detected");
  }

  if (expectation.expectedOutcome === "false_positive_trap" && actual.postReject.promotable) {
    failures.push("false_positive_trap_became_promotable");
  }

  if (expectation.expectedOutcome === "not_testable" && actual.postReject.testable) {
    failures.push("expected_not_testable_but_marked_testable");
  }

  if (typeof expectation.expectedDetected === "boolean" && actual.postReject.detected !== expectation.expectedDetected) {
    failures.push(`expected_detected:${expectation.expectedDetected}`);
  }

  if (typeof expectation.expectedTestable === "boolean" && actual.postReject.testable !== expectation.expectedTestable) {
    failures.push(`expected_testable:${expectation.expectedTestable}`);
  }

  if (typeof expectation.expectedPromotable === "boolean" && actual.postReject.promotable !== expectation.expectedPromotable) {
    failures.push(`expected_promotable:${expectation.expectedPromotable}`);
  }

  if (expectation.expectedRejectAction !== "unknown") {
    const actualReject = expectedRejectEquivalent(actual);
    if (actualReject !== expectation.expectedRejectAction) {
      failures.push(`expected_reject_action:${expectation.expectedRejectAction}:actual:${actualReject}`);
    }
  }

  const actualVendorNames = new Set(actual.postReject.vendors.map((vendor) => vendor.vendor.toLowerCase()));
  for (const expectedVendor of expectation.expectedVendors ?? []) {
    if (!actualVendorNames.has(expectedVendor.toLowerCase())) {
      warnings.push(`expected_vendor_not_observed:${expectedVendor}`);
    }
  }

  return {
    status: failures.length > 0 ? "fail" as const : "pass" as const,
    failures,
    warnings,
  };
}

function summarizeResults(siteResults: Wc01V2PostRejectCalibrationSiteResult[]): Wc01V2PostRejectCalibrationSummary {
  const rejectAttemptedSiteCount = siteResults.filter((result) => result.actual.rejectAction.attemptedCount > 0).length;
  const rejectSucceededSiteCount = siteResults.filter((result) => result.actual.rejectAction.succeededCount > 0).length;
  const cmpSupportedResults = siteResults.filter(cmpSupportedResult);
  const cmpAttemptedResults = cmpSupportedResults.filter((result) => result.actual.rejectAction.attemptedCount > 0);
  const cmpSucceededResults = cmpSupportedResults.filter((result) => result.actual.rejectAction.succeededCount > 0);
  const cmpComparableWindowResults = cmpSucceededResults.filter((result) =>
    result.actual.postReject.diagnostics.comparableMeasurement.comparableCount > 0,
  );
  return {
    siteCount: siteResults.length,
    evaluatedCount: siteResults.filter((result) => result.actual.artifactStatus === "complete").length,
    missingArtifactCount: siteResults.filter((result) => result.actual.artifactStatus !== "complete").length,
    passCount: siteResults.filter((result) => result.evaluation.status === "pass").length,
    failCount: siteResults.filter((result) => result.evaluation.status === "fail").length,
    unknownCount: siteResults.filter((result) => result.evaluation.status === "unknown").length,
    detectedCount: siteResults.filter((result) => result.actual.postReject.detected).length,
    testableCount: siteResults.filter((result) => result.actual.postReject.testable).length,
    promotableCount: siteResults.filter((result) => result.actual.postReject.promotable).length,
    rejectAttemptedSiteCount,
    rejectSucceededSiteCount,
    rejectSuccessRate: rejectAttemptedSiteCount > 0 ? rejectSucceededSiteCount / rejectAttemptedSiteCount : 0,
    cmpSupportedFlowCount: cmpSupportedResults.length,
    cmpAttemptedFlowCount: cmpAttemptedResults.length,
    cmpSucceededFlowCount: cmpSucceededResults.length,
    cmpAttemptSuccessRate: cmpAttemptedResults.length > 0 ? cmpSucceededResults.length / cmpAttemptedResults.length : 0,
    cmpComparableWindowSuccessCount: cmpComparableWindowResults.length,
    cmpComparableWindowSuccessRate: cmpSucceededResults.length > 0 ? cmpComparableWindowResults.length / cmpSucceededResults.length : 0,
    cmpFamilyReliability: cmpFamilyReliability(cmpSupportedResults),
    topRejectFailureReasons: topRejectFailureReasons(cmpSupportedResults),
    noGoCount: siteResults.filter((result) => result.actual.noGo.detected).length,
    falsePositiveTrapPassCount: siteResults.filter((result) =>
      result.expected.outcome === "false_positive_trap" &&
      result.evaluation.status === "pass"
    ).length,
    missingArtifacts: siteResults
      .filter((result) => result.actual.artifactStatus !== "complete")
      .map((result) => `${result.siteKey}:${result.actual.artifactStatus}`),
    failedSites: siteResults
      .filter((result) => result.evaluation.status === "fail")
      .map((result) => result.siteKey),
  };
}

function cmpSupportedResult(result: Wc01V2PostRejectCalibrationSiteResult): boolean {
  if (result.actual.noGo.detected || result.actual.artifactStatus !== "complete") {
    return false;
  }
  return Boolean(cmpFamilyForResult(result));
}

function cmpFamilyForResult(result: Wc01V2PostRejectCalibrationSiteResult): string | undefined {
  const proofFamily = result.actual.rejectAction.proof
    .map((proof) => proof.cmpFamily)
    .find((family): family is string => Boolean(family));
  if (proofFamily) {
    return proofFamily;
  }
  const consentVendor = result.actual.postReject.vendors.find((vendor) =>
    vendor.purpose === "consent_management" || /cmp|consent|onetrust|trustarc|cookiebot|didomi|sourcepoint|ketch/i.test(`${vendor.vendor} ${vendor.product ?? ""}`),
  );
  if (consentVendor?.product && /onetrust/i.test(consentVendor.product)) {
    return "OneTrust";
  }
  if (consentVendor?.vendor && /onetrust/i.test(consentVendor.vendor)) {
    return "OneTrust";
  }
  if (consentVendor?.vendor && /trustarc/i.test(consentVendor.vendor)) {
    return "TrustArc";
  }
  if (consentVendor?.vendor && /cookiebot/i.test(consentVendor.vendor)) {
    return "Cookiebot";
  }
  if (consentVendor?.vendor && /didomi/i.test(consentVendor.vendor)) {
    return "Didomi";
  }
  if (consentVendor?.vendor && /sourcepoint/i.test(consentVendor.vendor)) {
    return "Sourcepoint";
  }
  if (consentVendor?.vendor && /ketch/i.test(consentVendor.vendor)) {
    return "Ketch";
  }
  return consentVendor ? "generic_cmp" : undefined;
}

function cmpFamilyReliability(siteResults: Wc01V2PostRejectCalibrationSiteResult[]): Wc01V2PostRejectCalibrationSummary["cmpFamilyReliability"] {
  const groups = new Map<string, Wc01V2PostRejectCalibrationSiteResult[]>();
  for (const result of siteResults) {
    const family = cmpFamilyForResult(result) ?? "unknown_cmp";
    groups.set(family, [...(groups.get(family) ?? []), result]);
  }
  return [...groups.entries()]
    .map(([cmpFamily, results]) => {
      const attemptedCount = results.filter((result) => result.actual.rejectAction.attemptedCount > 0).length;
      const succeededCount = results.filter((result) => result.actual.rejectAction.succeededCount > 0).length;
      const comparableWindowSuccessCount = results.filter((result) =>
        result.actual.rejectAction.succeededCount > 0 &&
        result.actual.postReject.diagnostics.comparableMeasurement.comparableCount > 0
      ).length;
      return {
        cmpFamily,
        supportedCount: results.length,
        attemptedCount,
        succeededCount,
        successRate: attemptedCount > 0 ? succeededCount / attemptedCount : 0,
        comparableWindowSuccessCount,
        comparableWindowSuccessRate: succeededCount > 0 ? comparableWindowSuccessCount / succeededCount : 0,
      };
    })
    .sort((left, right) => right.supportedCount - left.supportedCount || left.cmpFamily.localeCompare(right.cmpFamily));
}

function topRejectFailureReasons(siteResults: Wc01V2PostRejectCalibrationSiteResult[]): Wc01V2PostRejectCalibrationSummary["topRejectFailureReasons"] {
  const counts = new Map<string, number>();
  for (const result of siteResults) {
    const reasons = result.actual.rejectAction.failureReasons.length > 0
      ? result.actual.rejectAction.failureReasons
      : result.actual.rejectAction.status === "no_attempt"
        ? ["no_reject_action_attempt"]
        : [];
    for (const reason of reasons) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason))
    .slice(0, 10);
}

function summarizeRejectAction(bundle?: CanonicalEvidenceBundle): Wc01V2PostRejectActual["rejectAction"] {
  const attempts = bundle?.consentActionAttempts.filter((attempt) => attempt.actionType === "reject_all") ?? [];
  const attempted = attempts.filter((attempt) => attempt.attempted);
  const succeeded = attempts.filter((attempt) => attempt.succeeded);
  const failureReasons = uniqueStrings(attempts.map((attempt) => attempt.failureReason));
  const proof = attempts
    .flatMap((attempt) => attempt.actionProof ? [attempt.actionProof] : [])
    .map((item) => ({
      candidateObserved: item.candidateObserved,
      candidateLabelText: item.candidateLabelText,
      candidateNormalizedActionType: item.candidateNormalizedActionType,
      candidateSelectorSummary: item.candidateSelectorSummary,
      candidateConfidence: item.candidateConfidence,
      candidateDetectionMethod: item.candidateDetectionMethod,
      actionPath: item.actionPath,
      cmpFamily: item.cmpFamily,
      cmpProvider: item.cmpProvider,
      frameContext: item.frameContext,
      attemptedStatus: item.attemptedStatus,
      failureReason: item.failureReason,
      actionTimestampMs: item.actionTimestampMs,
      postClickSettleMs: item.postClickSettleMs,
      beforeScreenshotPath: item.beforeScreenshotRef?.path,
      afterScreenshotPath: item.afterScreenshotRef?.path,
      beforeDomExcerptPresent: Boolean(item.beforeDomExcerpt),
      afterDomExcerptPresent: Boolean(item.afterDomExcerpt),
      preActionConsentStateMarkerCount: (item.preActionConsentStateMarkers ?? []).length,
      postActionConsentStateMarkerCount: (item.postActionConsentStateMarkers ?? []).length,
    }));
  const status = attempts.length === 0
    ? "no_attempt"
    : succeeded.length > 0
      ? "succeeded"
      : attempted.length > 0
        ? "attempted_failed"
        : "not_attempted";

  return {
    status,
    attemptedCount: attempted.length,
    succeededCount: succeeded.length,
    failureReasons,
    proofAvailable: proof.length > 0,
    proof,
  };
}

function summarizeComparableMeasurement(bundle?: CanonicalEvidenceBundle) {
  const comparisons = bundle?.consentFlowComparisons.filter((comparison) =>
    comparison.comparedScenarios.includes("reject"),
  ) ?? [];
  const comparableMeasurements = comparisons
    .flatMap((comparison) => comparison.comparableMeasurement ? [comparison.comparableMeasurement] : []);
  return {
    comparableCount: comparableMeasurements.filter((item) => item.comparable).length,
    nonComparableCount: comparableMeasurements.filter((item) => !item.comparable).length,
    reasons: uniqueStrings(comparableMeasurements.map((item) => item.reason)),
  };
}

function testabilityStatus(input: {
  artifactStatus: Wc01V2PostRejectActual["artifactStatus"];
  detected: boolean;
  noGoDetected: boolean;
  testable: boolean;
}): Wc01V2PostRejectActual["postReject"]["diagnostics"]["testabilityStatus"] {
  if (input.artifactStatus !== "complete") {
    return "missing_artifacts";
  }
  if (input.noGoDetected) {
    return "excluded_no_go";
  }
  if (!input.detected) {
    return "not_detected";
  }
  return input.testable ? "testable" : "not_testable";
}

function postRejectPromotionBlockers(input: {
  artifactStatus: Wc01V2PostRejectActual["artifactStatus"];
  confidentComparison: boolean;
  detected: boolean;
  noGoDetected: boolean;
  nonTrackerDiagnosticOnly: boolean;
  rejectActionStatus: Wc01V2PostRejectActual["rejectAction"]["status"];
  rows: Wc01V2ShadowRow[];
  testable: boolean;
}) {
  const blockers: string[] = [];
  if (input.artifactStatus !== "complete") {
    blockers.push(input.artifactStatus);
  }
  if (input.noGoDetected) {
    blockers.push("no_go_excluded");
  }
  if (!input.detected) {
    blockers.push("post_reject_persistence_not_detected");
  }
  if (input.rejectActionStatus !== "succeeded") {
    blockers.push(`reject_action_not_confident:${input.rejectActionStatus}`);
  }
  if (!input.confidentComparison) {
    blockers.push("comparison_not_confidently_testable");
  }
  if (!input.testable) {
    blockers.push("not_testable");
  }
  if (input.nonTrackerDiagnosticOnly) {
    blockers.push("non_tracker_purpose_diagnostic_only");
  }
  if (input.rows.some((row) => row.policy.demotionReasons.includes("review_signal_only_no_gap_conclusion"))) {
    blockers.push("review_signal_only_no_gap_conclusion");
  }
  return uniqueStrings(blockers);
}

function summarizePostRejectCounts(
  bundle: CanonicalEvidenceBundle | undefined,
  rows: Wc01V2ShadowRow[],
) {
  const persistedDeltas = bundle?.consentFlowComparisons.flatMap((comparison) =>
    comparison.journeyPhaseDeltas.filter((delta) => delta.persistedAfterReject)
  ) ?? [];
  const criteriaCounts = rows.reduce((counts, row) => {
    for (const criterion of row.policy.matchedCriteria) {
      const match = /^post_reject_persisted_(delta|endpoint|cookie|vendor)_count:(\d+)$/i.exec(criterion);
      if (!match) {
        continue;
      }
      const key = match[1];
      const value = Number.parseInt(match[2] ?? "0", 10);
      if (key === "delta") {
        counts.persistedDeltaCount = Math.max(counts.persistedDeltaCount, value);
      } else if (key === "endpoint") {
        counts.endpointCount = Math.max(counts.endpointCount, value);
      } else if (key === "cookie") {
        counts.cookieCount = Math.max(counts.cookieCount, value);
      } else if (key === "vendor") {
        counts.vendorCount = Math.max(counts.vendorCount, value);
      }
    }
    return counts;
  }, {
    persistedDeltaCount: 0,
    endpointCount: 0,
    cookieCount: 0,
    vendorCount: 0,
  });

  const endpointCount = Math.max(
    criteriaCounts.endpointCount,
    uniqueStrings([
      ...persistedDeltas.map((delta) => delta.endpointHostname),
      ...(bundle?.consentFlowComparisons.flatMap((comparison) => comparison.collectionEndpointsPersistingAfterReject) ?? []),
    ]).length,
  );
  const cookieCount = Math.max(
    criteriaCounts.cookieCount,
    uniqueStrings([
      ...persistedDeltas.map((delta) => delta.cookieName),
      ...(bundle?.consentFlowComparisons.flatMap((comparison) => comparison.cookiesPersistingAfterReject) ?? []),
    ]).length,
  );
  const vendorCount = Math.max(
    criteriaCounts.vendorCount,
    uniqueStrings([
      ...persistedDeltas.map((delta) => delta.vendor ?? delta.displayName),
      ...(bundle?.consentFlowComparisons.flatMap((comparison) => comparison.vendorsPersistingAfterReject) ?? []),
    ]).length,
  );

  return {
    persistedDeltaCount: Math.max(criteriaCounts.persistedDeltaCount, persistedDeltas.length),
    endpointCount,
    cookieCount,
    vendorCount,
    evidenceExcerptCount: rows.reduce((count, row) => count + row.evidence.excerptIds.length, 0),
    sourceRefCount: rows.reduce((count, row) => count + row.evidence.sourceRefIds.length, 0),
  };
}

function summarizeVendors(rows: Wc01V2ShadowRow[]) {
  const vendorMap = new Map<string, { vendor: string; product?: string; purpose?: string }>();
  for (const row of rows) {
    for (const vendor of row.vendors) {
      const key = [vendor.vendor, vendor.product ?? "", vendor.purpose ?? ""].join("|").toLowerCase();
      if (!vendorMap.has(key)) {
        vendorMap.set(key, {
          vendor: vendor.vendor,
          product: vendor.product,
          purpose: vendor.purpose,
        });
      }
    }
  }
  return [...vendorMap.values()].sort((left, right) => left.vendor.localeCompare(right.vendor));
}

function detectNoGo(
  artifactRoot: string,
  bundlePath: string | undefined,
  bundle: CanonicalEvidenceBundle | undefined,
) {
  const reasons: string[] = [];
  for (const moduleRun of bundle?.modulesRun ?? []) {
    for (const error of moduleRun.errors) {
      if (NO_GO_MODULE_ERROR_PATTERNS.some((pattern) => pattern.test(error))) {
        reasons.push(`module_error:${moduleRun.moduleName}`);
      }
    }
  }

  if (bundle?.runtimeCoverage?.limitationKeys?.some((key) => /blocked|captcha|forbidden|unavailable|not_representative/i.test(key))) {
    reasons.push("runtime_coverage_no_go_limitation");
  }

  const textPath = bundlePath ? join(dirname(bundlePath), "dom-text-pre-consent.txt") : undefined;
  const domText = readTextSyncBestEffort(textPath, artifactRoot);
  if (domText && NO_GO_DOM_TEXT_PATTERNS.some((pattern) => pattern.test(domText))) {
    reasons.push("retained_dom_text_no_go_pattern");
  }

  const networkEvents = bundle?.networkEvents ?? [];
  const responseEvents = bundle?.networkResponseEvents ?? [];
  const homepageResponseForbidden = responseEvents.some((event) => {
    const record = event as Record<string, unknown>;
    const responseUrl = event.responseUrl ?? event.url ?? "";
    const pathValue = stringValue(record.path) ?? "";
    return event.status === 403 &&
      event.firstParty === true &&
      (/https:\/\/(?:www\.)?[^/]+\/?$/.test(responseUrl) || pathValue === "/");
  });
  if (homepageResponseForbidden) {
    reasons.push("homepage_response_403");
  }

  const cloudflareChallengeObserved = networkEvents.some((event) => {
    const requestUrl = event.requestUrl ?? event.url ?? "";
    const hostname = event.requestHostname ?? event.hostname ?? "";
    const pathValue = event.path ?? "";
    const documentUrl = event.documentUrl ?? event.topLevelUrl ?? "";
    return requestUrl.includes("/cdn-cgi/challenge-platform/") ||
      pathValue.includes("/cdn-cgi/challenge-platform/") ||
      documentUrl.includes("__cf_chl_rt_tk=") ||
      (hostname === "challenges.cloudflare.com" && requestUrl.includes("/turnstile/"));
  });
  if (cloudflareChallengeObserved) {
    reasons.push("network_cloudflare_challenge");
  }

  const datadomeChallengeObserved = [...networkEvents, ...responseEvents].some((event) => {
    const record = event as Record<string, unknown>;
    const requestUrl = stringValue(record.requestUrl) ?? stringValue(record.responseUrl) ?? stringValue(record.url) ?? "";
    const hostname = stringValue(record.requestHostname) ?? stringValue(record.hostname) ?? "";
    const pathValue = stringValue(record.path) ?? "";
    const cookieNames = stringArrayValue(record.cookieNamesSet);
    return hostname.endsWith("captcha-delivery.com") ||
      requestUrl.includes("captcha-delivery.com/captcha") ||
      pathValue.includes("/captcha/") ||
      cookieNames.includes("datadome");
  });
  if (datadomeChallengeObserved) {
    reasons.push("network_datadome_challenge");
  }

  return {
    detected: reasons.length > 0,
    reasons: uniqueStrings(reasons),
  };
}

function readTextSyncBestEffort(textPath: string | undefined, artifactRoot: string) {
  if (!textPath) {
    return "";
  }
  try {
    const fs = require("node:fs") as typeof import("node:fs");
    const relativePath = relative(artifactRoot, textPath);
    if (relativePath.startsWith("..")) {
      return "";
    }
    return fs.readFileSync(textPath, "utf8");
  } catch {
    return "";
  }
}

function postRejectStatus(input: {
  artifactStatus: Wc01V2PostRejectActual["artifactStatus"];
  detected: boolean;
  noGoDetected: boolean;
  promotable: boolean;
  testable: boolean;
}): Wc01V2PostRejectActual["postReject"]["status"] {
  if (input.artifactStatus !== "complete") {
    return "missing_artifacts";
  }
  if (input.noGoDetected) {
    return "excluded_no_go";
  }
  if (!input.detected) {
    return "not_detected";
  }
  if (input.promotable) {
    return "detected_promotable";
  }
  if (!input.testable) {
    return "detected_not_testable";
  }
  return "detected_not_testable";
}

function postRejectReasons(input: {
  artifactStatus: Wc01V2PostRejectActual["artifactStatus"];
  confidentComparison: boolean;
  detected: boolean;
  noGoDetected: boolean;
  nonTrackerDiagnosticOnly: boolean;
  rejectActionStatus: Wc01V2PostRejectActual["rejectAction"]["status"];
}) {
  return uniqueStrings([
    input.artifactStatus !== "complete" ? `artifact_status:${input.artifactStatus}` : null,
    input.noGoDetected ? "no_go_excluded" : null,
    !input.detected && input.artifactStatus === "complete" && !input.noGoDetected ? "post_reject_persistence_not_detected" : null,
    input.detected ? "post_reject_persistence_detected" : null,
    input.detected && input.rejectActionStatus !== "succeeded" ? `reject_action_not_confident:${input.rejectActionStatus}` : null,
    input.detected && !input.confidentComparison ? "comparison_not_confidently_testable" : null,
    input.nonTrackerDiagnosticOnly ? "non_tracker_purpose_diagnostic_only" : null,
  ]);
}

function expectedRejectEquivalent(actual: Wc01V2PostRejectActual): Wc01V2PostRejectExpectedRejectAction {
  if (actual.noGo.detected) {
    return "no_go";
  }
  if (actual.rejectAction.status === "succeeded") {
    return "succeeded";
  }
  if (actual.rejectAction.status === "no_attempt") {
    return "no_reject_path";
  }
  return "not_testable";
}

function artifactStatusFor(
  bundle: CanonicalEvidenceBundle | undefined,
  shadow: Wc01V2ShadowProjection | undefined,
): Wc01V2PostRejectActual["artifactStatus"] {
  if (bundle && shadow) {
    return "complete";
  }
  if (!bundle && !shadow) {
    return "missing_both";
  }
  return bundle ? "missing_shadow" : "missing_bundle";
}

type ArtifactIndex = {
  bundlesBySite: Map<string, ArtifactMatch[]>;
  shadowsBySite: Map<string, ArtifactMatch[]>;
};

type ArtifactMatch = {
  path: string;
  modifiedMs: number;
};

async function buildArtifactIndex(artifactRoot: string): Promise<ArtifactIndex> {
  const bundlesBySite = new Map<string, ArtifactMatch[]>();
  const shadowsBySite = new Map<string, ArtifactMatch[]>();
  await walkArtifacts(artifactRoot, async (filePath) => {
    const fileName = filePath.split("/").at(-1);
    if (fileName !== "CanonicalEvidenceBundle.json" && fileName !== "Wc01V2ShadowProjection.json") {
      return;
    }
    const siteKey = filePath.split("/").at(-2);
    if (!siteKey) {
      return;
    }
    const fileStat = await stat(filePath);
    const match = { path: filePath, modifiedMs: fileStat.mtimeMs };
    const target = fileName === "CanonicalEvidenceBundle.json" ? bundlesBySite : shadowsBySite;
    const matches = target.get(siteKey) ?? [];
    matches.push(match);
    target.set(siteKey, matches);
  });

  for (const matches of [...bundlesBySite.values(), ...shadowsBySite.values()]) {
    matches.sort((left, right) => right.modifiedMs - left.modifiedMs);
  }

  return { bundlesBySite, shadowsBySite };
}

async function walkArtifacts(root: string, visit: (filePath: string) => Promise<void>) {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = join(root, entry.name);
    if (entry.isDirectory()) {
      await walkArtifacts(entryPath, visit);
    } else if (entry.isFile()) {
      await visit(entryPath);
    }
  }
}

function selectArtifactPath(
  matches: ArtifactMatch[] | undefined,
  expectation: Wc01V2PostRejectCalibrationSiteExpectation,
) {
  if (!matches || matches.length === 0) {
    return undefined;
  }
  if (expectation.preferredProfile) {
    const profilePattern = `-${expectation.preferredProfile}-`;
    const profileMatch = matches.find((match) => match.path.includes(profilePattern));
    if (profileMatch) {
      return profileMatch.path;
    }
  }
  return matches[0]?.path;
}

async function readJsonIfPresent<T>(filePath: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function validateManifest(manifest: Wc01V2PostRejectCalibrationManifest) {
  if (manifest.manifestVersion !== WC01_V2_POST_REJECT_CALIBRATION_VERSION) {
    throw new Error(`Unsupported post-reject calibration manifest version: ${manifest.manifestVersion}`);
  }
  if (!Array.isArray(manifest.sites) || manifest.sites.length < 25 || manifest.sites.length > 100) {
    throw new Error("Post-reject calibration manifest must contain 25-100 sites.");
  }
  const siteKeys = new Set<string>();
  for (const site of manifest.sites) {
    if (!site.siteKey || !site.url) {
      throw new Error("Each post-reject calibration site requires siteKey and url.");
    }
    if (siteKeys.has(site.siteKey)) {
      throw new Error(`Duplicate post-reject calibration siteKey: ${site.siteKey}`);
    }
    siteKeys.add(site.siteKey);
  }
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function escapeMarkdownTableCell(value: string) {
  return value.replace(/\|/g, "/").replace(/\n/g, " ");
}

function summarizeMarkdownBlockers(result: Wc01V2PostRejectCalibrationSiteResult) {
  const rowBlockers = uniqueStrings(result.actual.postReject.rows.flatMap((row) => [
    ...row.missingCorroborators,
    ...row.demotionReasons,
  ]));
  const reasons = uniqueStrings([
    ...result.actual.postReject.diagnostics.promotionBlockers,
    ...result.actual.postReject.reasons,
    ...rowBlockers,
    ...result.evaluation.warnings,
  ]);
  return reasons.slice(0, 5).join(", ") || "none";
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function stringArrayValue(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

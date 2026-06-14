import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  buildWc01V2ManualReviewerPacket,
  buildWc01V2ManualReviewerPacketJson,
  type Wc01V2ManualReviewerPacket,
} from "./wc01-v2-manual-reviewer-packet";
import {
  buildWc01V2ManualReviewerPacketInspectionSummary,
  generateWc01V2ManualReviewerPacketBatch,
  generateWc01V2ManualReviewerPacketSingleFromFile,
  renderWc01V2ManualReviewerPacketMarkdown,
} from "./wc01-v2-manual-reviewer-packet-output";
import {
  type Wc01V2ConcernPolicyComparisonDryRun,
  WC01_V2_CONCERN_POLICY_COMPARISON_DRY_RUN_VERSION,
} from "./wc01-v2-concern-policy-comparison";

test("parser accepts valid comparison artifact and builds internal-only packet", () => {
  const packet = buildWc01V2ManualReviewerPacketJson(JSON.stringify(comparisonFixture()));

  assert.equal(packet.packetVersion, "wc01.v2_manual_reviewer_packet.1");
  assert.equal(packet.productionEligible, false);
  assert.equal(packet.topFindingEligible, false);
  assert.equal(packet.gapEligible, false);
  assert.equal(packet.queueItemCount, 4);
  assert.equal(packet.internalOnlyBanner, "Internal shadow diagnostic only. Not customer-facing report output.");
  assertNoForbiddenOutput(packet);
});

test("fails closed on root or result production/top/gap eligibility", () => {
  assert.throws(
    () => buildWc01V2ManualReviewerPacketJson(JSON.stringify({
      ...comparisonFixture(),
      productionEligible: true,
    })),
    /forbidden eligibility/,
  );
  assert.throws(
    () => buildWc01V2ManualReviewerPacketJson(JSON.stringify(mutatedComparison((comparison) => {
      (comparison.comparisonResults[0] as { topFindingEligible: boolean }).topFindingEligible = true;
    }))),
    /forbidden eligibility/,
  );
  assert.throws(
    () => buildWc01V2ManualReviewerPacketJson(JSON.stringify(mutatedComparison((comparison) => {
      (comparison.comparisonResults[0] as { gapEligible: boolean }).gapEligible = true;
    }))),
    /forbidden eligibility/,
  );
});

test("fails closed on forbidden gap token, legal terms, raw blocked fields, and unsupported version", () => {
  assert.throws(
    () => buildWc01V2ManualReviewerPacketJson(JSON.stringify({
      ...comparisonFixture(),
      note: "gap_observed",
    })),
    /forbidden gap status token/,
  );
  assert.throws(
    () => buildWc01V2ManualReviewerPacketJson(JSON.stringify({
      ...comparisonFixture(),
      note: "illegal",
    })),
    /legal-conclusion language/,
  );
  assert.throws(
    () => buildWc01V2ManualReviewerPacketJson(JSON.stringify({
      ...comparisonFixture(),
      requestBody: "raw",
    })),
    /raw blocked evidence fields/,
  );
  assert.throws(
    () => buildWc01V2ManualReviewerPacketJson(JSON.stringify({
      ...comparisonFixture(),
      comparisonVersion: "unsupported",
    })),
    /Unsupported Wc01V2ConcernPolicyComparisonDryRun version/,
  );
});

test("comparison outcomes route to expected reviewer queue lanes", () => {
  const packet = buildWc01V2ManualReviewerPacket(comparisonFixture());

  assert.equal(itemFor(packet, "accepted").queueLane, "standard_internal_review_candidate");
  assert.equal(itemFor(packet, "sensitive").queueLane, "sensitive_context_review_required");
  assert.equal(itemFor(packet, "missing").queueLane, "evidence_quality_review");
  assert.equal(itemFor(packet, "suppressed").queueLane, "blocked_suppressed_diagnostic_only");
  assert.equal(itemFor(packet, "sensitive").sensitiveContext.requiresExtraReview, true);
});

test("reviewer action schema is non-persisted and never eligible", () => {
  const packet = buildWc01V2ManualReviewerPacket(comparisonFixture());

  assert.deepEqual(
    packet.reviewerActionOptions.map((option) => option.action).sort(),
    [
      "evidence_shape_confirmed",
      "internal_only",
      "needs_more_evidence",
      "policy_copy_review_required",
      "rejected_overbroad",
      "sensitive_context_escalated",
    ].sort(),
  );
  assert.equal(packet.reviewerActionOptions.every((option) =>
    option.productionEligible === false &&
    option.topFindingEligible === false &&
    option.gapEligible === false
  ), true);
});

test("output includes safe evidence pointers and comparison-safe diagnostic fields", () => {
  const packet = buildWc01V2ManualReviewerPacket(comparisonFixture());
  const item = itemFor(packet, "accepted");

  assert.deepEqual(item.evidence.sourceRefIds, ["ref_pre_consent"]);
  assert.deepEqual(item.evidence.displaySafeExcerptIds, ["excerpt_pre_consent"]);
  assert.equal(item.evidence.displaySafeExcerptCount, 1);
  assert.equal(item.evidence.comparisonArtifactOnly, true);
  assert.equal(item.evidence.sourceRefsAvailable, true);
  assert.deepEqual(item.vendorDiagnostics.vendorNames, ["Example Analytics"]);
  assert.deepEqual(item.vendorDiagnostics.supportingPurposes, ["advertising"]);
  assert.equal(item.vendorDiagnostics.metadataAvailable, true);
  assert.equal(item.evidenceQuality.confidence, "high");
  assert.equal(item.evidenceQuality.directness, "direct");
  assert.equal(item.familyEvidenceContext.consentStateContext?.phase, "pre_consent");
  assert.equal(item.reviewFlags.includes("copy_policy_review_required"), true);
  assertNoForbiddenOutput(packet);
});

test("sensitive-context categories and family-specific contexts are carried without eligibility", () => {
  const packet = buildWc01V2ManualReviewerPacket(comparisonFixture());
  const sensitive = itemFor(packet, "sensitive");
  const missing = itemFor(packet, "missing");

  assert.deepEqual(sensitive.sensitiveContext.categories, ["finance"]);
  assert.equal(sensitive.guardrailStatus.productionEligible, false);
  assert.equal(sensitive.familyEvidenceContext.cookieStorageContext?.party, "third_party");
  assert.equal(sensitive.familyEvidenceContext.cookieStorageContext?.storageType, "cookie");
  assert.equal(missing.familyEvidenceContext.sessionReplayContext?.collectionEvidence, "collection_endpoint");
  assert.equal(missing.familyEvidenceContext.sessionReplayContext?.libraryOnly, false);
});

test("single-file packet generator writes JSON and markdown summaries", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "wc01-reviewer-packet-"));
  try {
    const inputPath = join(tmp, "Wc01V2ConcernPolicyComparisonDryRun.json");
    const outPath = join(tmp, "Wc01V2ManualReviewerPacket.json");
    await writeFile(inputPath, `${JSON.stringify(comparisonFixture(), null, 2)}\n`, "utf8");

    const generated = await generateWc01V2ManualReviewerPacketSingleFromFile({ inputPath, outPath });
    const saved = JSON.parse(await readFile(outPath, "utf8")) as Wc01V2ManualReviewerPacket;
    const summary = buildWc01V2ManualReviewerPacketInspectionSummary(saved);
    const markdown = renderWc01V2ManualReviewerPacketMarkdown(summary, saved);

    assert.equal(generated.summary.queueItemCount, 4);
    assert.equal(summary.laneCounts.sensitive_context_review_required, 1);
    assert.match(markdown, /Internal shadow diagnostic only/);
    assertNoForbiddenOutput(saved);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("batch packet generator continues on malformed inputs and reports failures", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "wc01-reviewer-packet-batch-"));
  try {
    const inputDir = join(tmp, "input");
    const outDir = join(tmp, "out");
    await mkdir(join(inputDir, "good"), { recursive: true });
    await mkdir(join(inputDir, "bad"), { recursive: true });
    await writeFile(
      join(inputDir, "good", "Wc01V2ConcernPolicyComparisonDryRun.json"),
      `${JSON.stringify(comparisonFixture(), null, 2)}\n`,
      "utf8",
    );
    await writeFile(join(inputDir, "bad", "Wc01V2ConcernPolicyComparisonDryRun.json"), "{not-json", "utf8");

    const summary = await generateWc01V2ManualReviewerPacketBatch({ inputDir, outDir });

    assert.equal(summary.totalInputFilesFound, 2);
    assert.equal(summary.succeededCount, 1);
    assert.equal(summary.failedCount, 1);
    assert.equal(summary.totalQueueItems, 4);
    assert.equal(summary.malformedArtifacts.length, 1);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("manual reviewer packet modules do not import production policy, report, checklist, executive, scoring, or regulatory-lens builders", () => {
  const packageRoot = process.cwd().endsWith("packages/certscore-report-adapter")
    ? process.cwd()
    : resolve(process.cwd(), "packages/certscore-report-adapter");
  const sources = [
    readFileSync(join(packageRoot, "src/wc01-v2-manual-reviewer-packet.ts"), "utf8"),
    readFileSync(join(packageRoot, "src/wc01-v2-manual-reviewer-packet-output.ts"), "utf8"),
    readFileSync(join(packageRoot, "src/cli/wc01-v2-manual-reviewer-packet.ts"), "utf8"),
  ].join("\n")
    .split("\n")
    .filter((line) => /^\s*import\b/.test(line))
    .join("\n");

  assert.doesNotMatch(sources, /apps\/web\/.*concern-policy/);
  assert.doesNotMatch(sources, /normalized-concerns/);
  assert.doesNotMatch(sources, /unified-findings/);
  assert.doesNotMatch(sources, /coverage-checklist/);
  assert.doesNotMatch(sources, /executive-summary/);
  assert.doesNotMatch(sources, /top-finding/);
  assert.doesNotMatch(sources, /scoring/);
  assert.doesNotMatch(sources, /regulatory-lens/);
  assert.doesNotMatch(sources, /shared-scan-detail-view/);
});

function comparisonFixture(): Wc01V2ConcernPolicyComparisonDryRun {
  return {
    comparisonVersion: WC01_V2_CONCERN_POLICY_COMPARISON_DRY_RUN_VERSION,
    source: {
      adapterVersion: "wc01.v2_normalized_concern_candidate_draft.1",
      sourceUrl: "https://example.com",
      scanId: "scan_example",
      reviewId: "review_example",
    },
    productionEligible: false,
    topFindingEligible: false,
    gapEligible: false,
    status: "comparison_review_only",
    candidateCount: 4,
    comparisonResults: [
      resultFixture("accepted", "pre_consent_tracking", "would_accept_for_internal_review", [
        "candidate_shape_matches_mock_policy_requirements",
      ]),
      resultFixture("sensitive", "pre_consent_cookie_storage", "would_remain_internal_only", [
        "candidate_remains_internal_only",
        "candidate_shape_matches_mock_policy_requirements",
        "sensitive_context_extra_review_required",
      ]),
      resultFixture("missing", "session_replay_behavioral_analytics", "would_require_more_evidence", [
        "candidate_shape_requires_more_evidence",
      ], ["missing_display_safe_excerpt_refs"]),
      resultFixture("suppressed", "pre_consent_tracking", "would_be_suppressed", [
        "candidate_shape_suppressed_by_mock_policy",
      ]),
    ],
    blockedCandidates: [],
    guardrails: {
      noProductionConcernPolicyCall: true,
      noPersistence: true,
      noUnifiedFindings: true,
      noReportMutation: true,
      noChecklistExecutiveScoringImports: true,
      noCustomerFacingCopy: true,
      noGapObserved: true,
      noLegalConclusionLanguage: true,
      noRawBlockedFields: true,
    },
  };
}

function resultFixture(
  id: string,
  family: Wc01V2ConcernPolicyComparisonDryRun["comparisonResults"][number]["sourceFamily"],
  outcome: Wc01V2ConcernPolicyComparisonDryRun["comparisonResults"][number]["simulatedPolicyOutcome"],
  reasons: string[],
  missingRequirements: string[] = [],
): Wc01V2ConcernPolicyComparisonDryRun["comparisonResults"][number] {
  return {
    candidateId: `v2_policy_simulation.v2_concern_input.${family}_source.${family}.${id}`,
    sourceFamily: family,
    proposedNormalizedConcernKey: `v2.${family}.candidate`,
    simulatedPolicyOutcome: outcome,
    wouldPolicyAcceptCandidate: outcome === "would_accept_for_internal_review" ||
      outcome === "would_remain_internal_only",
    wouldPolicyRequireMoreEvidence: outcome === "would_require_more_evidence",
    wouldRemainInternalOnly: outcome === "would_remain_internal_only",
    wouldBeSuppressed: outcome === "would_be_suppressed",
    productionEligible: false,
    topFindingEligible: false,
    gapEligible: false,
    reasons,
    missingRequirements,
    reviewerEvidence: reviewerEvidenceFixture(family, id === "sensitive"),
    guardrails: {
      noGapObserved: true,
      noLegalConclusionLanguage: true,
      noRawBlockedFields: true,
      noProductionEligibility: true,
      noTopFindingEligibility: true,
      noGapEligibility: true,
    },
  };
}

function reviewerEvidenceFixture(
  family: Wc01V2ConcernPolicyComparisonDryRun["comparisonResults"][number]["sourceFamily"],
  sensitive: boolean,
): Wc01V2ConcernPolicyComparisonDryRun["comparisonResults"][number]["reviewerEvidence"] {
  return {
    sourceRefIds: family === "pre_consent_tracking" ? ["ref_pre_consent"] : [`ref_${family}`],
    displaySafeExcerptIds: family === "pre_consent_tracking" ? ["excerpt_pre_consent"] : [`excerpt_${family}`],
    displaySafeExcerptCount: 1,
    vendorNames: ["Example Analytics"],
    supportingPurposes: ["advertising"],
    diagnosticPurposes: ["tag_management"],
    confidence: "high",
    directness: "direct",
    sensitiveContext: {
      present: sensitive,
      requiresExtraReview: sensitive,
      categories: sensitive ? ["finance"] : [],
      requiredReviewReasons: sensitive ? ["sensitive_context_requires_extra_policy_review"] : [],
    },
    familyEvidenceContext: {
      consentStateContext: family === "pre_consent_tracking" || family === "pre_consent_cookie_storage"
        ? {
          phase: "pre_consent",
          actionObserved: "choice_not_made",
          sourceRefIds: ["ref_pre_consent"],
        }
        : undefined,
      cookieStorageContext: family === "pre_consent_cookie_storage"
        ? {
          party: "third_party",
          storageType: "cookie",
          necessaryOrSecurityExcluded: true,
          sourceRefIds: [`ref_${family}`],
        }
        : undefined,
      sessionReplayContext: family === "session_replay_behavioral_analytics"
        ? {
          collectionEvidence: "collection_endpoint",
          libraryOnly: false,
          sourceRefIds: [`ref_${family}`],
        }
        : undefined,
    },
    caveats: [],
    coverageLimitations: [],
    missingCorroborators: [],
    demotionReasons: [],
  };
}

function mutatedComparison(
  mutate: (comparison: Wc01V2ConcernPolicyComparisonDryRun) => void,
) {
  const comparison = structuredClone(comparisonFixture());
  mutate(comparison);
  return comparison;
}

function itemFor(packet: Wc01V2ManualReviewerPacket, id: string) {
  const item = packet.queueItems.find((candidate) => candidate.candidateId.endsWith(`.${id}`));
  assert.ok(item);
  return item;
}

function assertNoForbiddenOutput(value: unknown) {
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(serialized, /gap_observed/);
  assert.doesNotMatch(serialized, /\b(violation|violates|illegal|unlawful|noncompliant|non-compliant|non_compliant|breach)\b/i);
  assert.doesNotMatch(serialized, /\b(requestBody|responseBody|setCookieHeaders|cookieValue|rawCookie|bodySizeBytes|rawNanoReasoning|fullDomText|fullPolicyText)\b/i);
}

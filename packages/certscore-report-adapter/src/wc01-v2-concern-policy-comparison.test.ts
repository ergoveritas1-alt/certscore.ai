import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { projectWc01V2ShadowToAllowlistDryRun } from "./wc01-v2-allowlist-bridge";
import {
  wc01V2AllowlistExcerptFixture,
  wc01V2AllowlistShadowFixture,
  wc01V2AllowlistShadowRowFixture,
  wc01V2AllowlistVendorFixture,
} from "./wc01-v2-allowlist-fixtures";
import { projectAllowlistDryRunToConcernPolicyInputDraft } from "./wc01-v2-concern-policy-input-draft";
import { simulateConcernPolicyForInputDraft } from "./wc01-v2-concern-policy-simulation";
import {
  compareV2NormalizedConcernCandidates,
  compareV2NormalizedConcernCandidatesJson,
  type Wc01V2ConcernPolicyComparisonDryRun,
} from "./wc01-v2-concern-policy-comparison";
import {
  buildWc01V2ConcernPolicyComparisonInspectionSummary,
  generateWc01V2ConcernPolicyComparisonBatch,
  generateWc01V2ConcernPolicyComparisonSingleFromFile,
  renderWc01V2ConcernPolicyComparisonMarkdown,
} from "./wc01-v2-concern-policy-comparison-output";
import {
  projectSimulationToNormalizedConcernCandidateDraft,
  type V2NormalizedConcernAdapterDryRun,
  type V2NormalizedConcernCandidateDraft,
} from "./wc01-v2-normalized-concern-adapter";

test("valid pre_consent_tracking compares as accepted for internal review", () => {
  const comparison = compareV2NormalizedConcernCandidates(adapterFixture());
  const result = resultFor(comparison, "pre_consent_tracking");

  assert.equal(result.simulatedPolicyOutcome, "would_accept_for_internal_review");
  assert.equal(result.wouldPolicyAcceptCandidate, true);
  assert.equal(result.productionEligible, false);
  assert.equal(result.sourceFindingKey, "pre_consent_tracking_detected");
  assert.deepEqual(result.reviewerEvidence.sourceRefIds, ["ref_pre_consent_tracking_detected"]);
  assert.deepEqual(result.reviewerEvidence.displaySafeExcerptIds, ["excerpt_fixture"]);
  assert.equal(result.reviewerEvidence.displaySafeExcerptCount, 1);
  assert.deepEqual(result.reviewerEvidence.vendorNames, ["Example Vendor"]);
  assert.deepEqual(result.reviewerEvidence.supportingPurposes, ["advertising"]);
  assert.equal(result.reviewerEvidence.confidence, "high");
  assert.equal(result.reviewerEvidence.directness, "direct");
  assert.equal(result.reviewerEvidence.familyEvidenceContext.consentStateContext?.phase, "pre_consent");
  assertNoForbiddenOutput(comparison);
});

test("valid pre_consent_tracking sensitive context remains internal-only", () => {
  const comparison = compareV2NormalizedConcernCandidates(adapterFixture({ url: "https://healthline.com" }));
  const result = resultFor(comparison, "pre_consent_tracking");

  assert.equal(result.simulatedPolicyOutcome, "would_remain_internal_only");
  assert.equal(result.wouldPolicyAcceptCandidate, true);
  assert.equal(result.wouldRemainInternalOnly, true);
  assert.equal(result.reasons.includes("sensitive_context_extra_review_required"), true);
  assert.equal(result.reviewerEvidence.sensitiveContext.requiresExtraReview, true);
  assert.equal(result.reviewerEvidence.sensitiveContext.categories.length > 0, true);
  assert.equal(result.productionEligible, false);
  assertNoForbiddenOutput(comparison);
});

test("comparison carries safe evidence pointers without promoting diagnostic purposes", () => {
  const comparison = compareV2NormalizedConcernCandidates(mutatedSingleCandidate("pre_consent_tracking", (candidate) => {
    candidate.evidence.diagnosticPurposes.push("tag_management");
    candidate.evidence.vendorPurposeBasis.push({
      purpose: "security" as never,
      vendorNames: ["Security Vendor"],
      sourceRefIds: candidate.evidence.sourceRefIds,
    });
  }));
  const result = comparison.comparisonResults[0];

  assert.ok(result);
  assert.equal(result.simulatedPolicyOutcome, "would_be_suppressed");
  assert.deepEqual(result.reviewerEvidence.supportingPurposes, ["advertising"]);
  assert.equal(result.reviewerEvidence.diagnosticPurposes.includes("tag_management"), true);
  assert.equal(result.reviewerEvidence.diagnosticPurposes.includes("security"), true);
  assert.equal(result.reviewerEvidence.vendorNames.includes("Security Vendor"), false);
  assertNoForbiddenOutput(comparison);
});

test("missing refs or excerpts requires more evidence", () => {
  const comparison = compareV2NormalizedConcernCandidates(mutatedSingleCandidate("pre_consent_tracking", (candidate) => {
    candidate.evidence.sourceRefIds = [];
    candidate.evidence.displaySafeExcerptIds = [];
    candidate.evidence.displaySafeEvidenceCount = 0;
  }));
  const result = comparison.comparisonResults[0];

  assert.equal(result?.simulatedPolicyOutcome, "would_require_more_evidence");
  assert.equal(result?.missingRequirements.includes("missing_source_refs"), true);
  assert.equal(result?.missingRequirements.includes("missing_display_safe_excerpt_refs"), true);
});

test("weak confidence requires more evidence", () => {
  const comparison = compareV2NormalizedConcernCandidates(mutatedSingleCandidate("pre_consent_tracking", (candidate) => {
    (candidate.evidence as { confidence: string }).confidence = "low";
  }));

  assert.equal(comparison.comparisonResults[0]?.simulatedPolicyOutcome, "would_require_more_evidence");
  assert.equal(comparison.comparisonResults[0]?.missingRequirements.includes("missing_or_weak_confidence"), true);
});

test("tag-management-only candidate is suppressed", () => {
  const comparison = compareV2NormalizedConcernCandidates(mutatedSingleCandidate("pre_consent_tracking", (candidate) => {
    candidate.evidence.vendorPurposeBasis = [];
    candidate.evidence.diagnosticPurposes = ["tag_management"];
  }));

  assert.equal(comparison.comparisonResults[0]?.simulatedPolicyOutcome, "would_be_suppressed");
  assert.equal(comparison.comparisonResults[0]?.reasons.includes("tag_management_or_consent_management_only_non_supporting"), true);
});

test("Tier C mixed candidate is suppressed", () => {
  const comparison = compareV2NormalizedConcernCandidates(mutatedSingleCandidate("pre_consent_tracking", (candidate) => {
    candidate.evidence.vendorPurposeBasis.push({
      purpose: "security" as never,
      vendorNames: ["Security Vendor"],
      sourceRefIds: candidate.evidence.sourceRefIds,
    });
  }));

  assert.equal(comparison.comparisonResults[0]?.simulatedPolicyOutcome, "would_be_suppressed");
  assert.equal(comparison.comparisonResults[0]?.reasons.includes("tier_c_supporting_purpose"), true);
});

test("valid pre_consent_cookie_storage compares as accepted for internal review", () => {
  const comparison = compareV2NormalizedConcernCandidates(adapterFixture());
  const result = resultFor(comparison, "pre_consent_cookie_storage");

  assert.equal(result.simulatedPolicyOutcome, "would_accept_for_internal_review");
  assert.equal(result.wouldPolicyAcceptCandidate, true);
  assert.equal(result.reviewerEvidence.familyEvidenceContext.cookieStorageContext?.party, "third_party");
  assert.equal(result.reviewerEvidence.familyEvidenceContext.cookieStorageContext?.storageType, "cookie");
});

test("first-party-only storage is suppressed", () => {
  const comparison = compareV2NormalizedConcernCandidates(mutatedSingleCandidate("pre_consent_cookie_storage", (candidate) => {
    candidate.limitations.policyCaveats.push("first_party_only_storage");
  }));

  assert.equal(comparison.comparisonResults[0]?.simulatedPolicyOutcome, "would_be_suppressed");
  assert.equal(comparison.comparisonResults[0]?.reasons.includes("first_party_only_storage"), true);
});

test("CMP/security/necessary storage is suppressed", () => {
  const comparison = compareV2NormalizedConcernCandidates(mutatedSingleCandidate("pre_consent_cookie_storage", (candidate) => {
    candidate.evidence.cookieStorageContext = {
      ...candidate.evidence.cookieStorageContext!,
      necessaryOrSecurityExcluded: false as true,
    };
  }));

  assert.equal(comparison.comparisonResults[0]?.simulatedPolicyOutcome, "would_be_suppressed");
  assert.equal(comparison.comparisonResults[0]?.reasons.includes("necessary_security_or_cmp_storage_excluded"), true);
});

test("valid session replay collection compares as accepted for internal review", () => {
  const comparison = compareV2NormalizedConcernCandidates(adapterFixture());
  const result = resultFor(comparison, "session_replay_behavioral_analytics");

  assert.equal(result.simulatedPolicyOutcome, "would_accept_for_internal_review");
  assert.equal(result.wouldPolicyAcceptCandidate, true);
  assert.equal(result.reviewerEvidence.familyEvidenceContext.sessionReplayContext?.collectionEvidence, "collection_endpoint");
  assert.equal(result.reviewerEvidence.familyEvidenceContext.sessionReplayContext?.libraryOnly, false);
});

test("library-only session replay requires more evidence", () => {
  const comparison = compareV2NormalizedConcernCandidates(mutatedSingleCandidate("session_replay_behavioral_analytics", (candidate) => {
    candidate.evidence.sessionReplayContext = {
      ...candidate.evidence.sessionReplayContext!,
      libraryOnly: true as false,
    };
  }));

  assert.equal(comparison.comparisonResults[0]?.simulatedPolicyOutcome, "would_require_more_evidence");
  assert.equal(comparison.comparisonResults[0]?.missingRequirements.includes("library_only_without_collection"), true);
});

test("sensitive-context session replay remains internal-only", () => {
  const comparison = compareV2NormalizedConcernCandidates(adapterFixture({ url: "https://hotjar.com" }));
  const result = resultFor(comparison, "session_replay_behavioral_analytics");

  assert.equal(result.simulatedPolicyOutcome, "would_remain_internal_only");
  assert.equal(result.wouldRemainInternalOnly, true);
});

test("unsupported version and malformed artifacts fail closed", () => {
  assert.throws(
    () => compareV2NormalizedConcernCandidatesJson(JSON.stringify({
      ...adapterFixture(),
      adapterRunVersion: "unsupported",
    })),
    /Unsupported V2NormalizedConcernCandidateDraft adapter version/,
  );
  assert.throws(
    () => compareV2NormalizedConcernCandidatesJson("{not-json"),
    /Unexpected token|Expected property name/,
  );
});

test("forbidden gap, legal, and raw injection fail closed", () => {
  assert.throws(
    () => compareV2NormalizedConcernCandidatesJson(JSON.stringify({
      ...adapterFixture(),
      requestBody: "blocked",
    })),
    /raw blocked evidence fields/,
  );
  assert.throws(
    () => compareV2NormalizedConcernCandidatesJson(JSON.stringify({
      ...adapterFixture(),
      note: "gap_observed",
    })),
    /forbidden gap status token/,
  );
  assert.throws(
    () => compareV2NormalizedConcernCandidatesJson(JSON.stringify({
      ...adapterFixture(),
      note: "illegal",
    })),
    /legal-conclusion language/,
  );
});

test("sensitive context missing extra-review metadata is blocked", () => {
  const comparison = compareV2NormalizedConcernCandidates(mutatedSingleCandidate("pre_consent_tracking", (candidate) => {
    candidate.sensitiveContext = {
      present: true,
      categories: ["health"],
      requiresExtraReview: true,
      requiredReviewReasons: [],
    };
  }));

  assert.equal(comparison.comparisonResults.length, 0);
  assert.equal(comparison.blockedCandidates[0]?.blockReasons.includes("missing_sensitive_context_review_metadata"), true);
});

test("single-file comparison generator writes JSON and markdown summaries", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "wc01-policy-comparison-"));
  try {
    const inputPath = join(tmp, "V2NormalizedConcernCandidateDraft.json");
    const outPath = join(tmp, "Wc01V2ConcernPolicyComparisonDryRun.json");
    await writeFile(inputPath, `${JSON.stringify(adapterFixture({ url: "https://healthline.com" }), null, 2)}\n`, "utf8");

    const generated = await generateWc01V2ConcernPolicyComparisonSingleFromFile({ inputPath, outPath });
    const saved = JSON.parse(await readFile(outPath, "utf8")) as Wc01V2ConcernPolicyComparisonDryRun;
    const summary = buildWc01V2ConcernPolicyComparisonInspectionSummary(saved);
    const markdown = renderWc01V2ConcernPolicyComparisonMarkdown(summary);

    assert.equal(generated.summary.resultCount, 3);
    assert.equal(summary.outcomesByStatus.would_remain_internal_only, 3);
    assert.match(markdown, /Dry run only\. Mock policy-shape comparison\./);
    assertNoForbiddenOutput(saved);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("batch comparison continues on malformed artifacts", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "wc01-policy-comparison-batch-"));
  try {
    const inputDir = join(tmp, "input");
    const outDir = join(tmp, "out");
    await mkdir(join(inputDir, "good"), { recursive: true });
    await mkdir(join(inputDir, "bad"), { recursive: true });
    await writeFile(
      join(inputDir, "good", "V2NormalizedConcernCandidateDraft.json"),
      `${JSON.stringify(adapterFixture(), null, 2)}\n`,
      "utf8",
    );
    await writeFile(join(inputDir, "bad", "V2NormalizedConcernCandidateDraft.json"), "{not-json", "utf8");

    const summary = await generateWc01V2ConcernPolicyComparisonBatch({ inputDir, outDir });

    assert.equal(summary.totalInputFilesFound, 2);
    assert.equal(summary.succeededCount, 1);
    assert.equal(summary.failedCount, 1);
    assert.equal(summary.totalResults, 3);
    assert.equal(summary.totalBlockedCandidates, 0);
    assert.equal(summary.malformedArtifacts.length, 1);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("comparison modules do not import production policy, report, checklist, executive, scoring, or regulatory-lens builders", () => {
  const packageRoot = process.cwd().endsWith("packages/certscore-report-adapter")
    ? process.cwd()
    : resolve(process.cwd(), "packages/certscore-report-adapter");
  const sources = [
    readFileSync(join(packageRoot, "src/wc01-v2-concern-policy-comparison.ts"), "utf8"),
    readFileSync(join(packageRoot, "src/wc01-v2-concern-policy-comparison-output.ts"), "utf8"),
    readFileSync(join(packageRoot, "src/cli/wc01-v2-concern-policy-comparison-dry-run.ts"), "utf8"),
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

function adapterFixture(input: { url?: string } = {}) {
  const shadow = wc01V2AllowlistShadowFixture([
    wc01V2AllowlistShadowRowFixture({
      sourceFindingKey: "pre_consent_tracking_detected",
      vendors: [wc01V2AllowlistVendorFixture({ purpose: "advertising" })],
      policy: {
        reviewOnlyReasons: ["shadow_projection_only"],
        matchedCriteria: ["collection_endpoint_observed", "pre_consent_tracking_signal_true"],
        missingCorroborators: [],
        demotionReasons: [],
      },
    }),
    wc01V2AllowlistShadowRowFixture({
      sourceFindingKey: "third_party_cookie_pre_consent",
      vendors: [wc01V2AllowlistVendorFixture({ purpose: "analytics" })],
      evidence: {
        excerptIds: ["excerpt_cookie"],
        sourceRefIds: ["ref_cookie"],
        displaySafeExcerpts: [wc01V2AllowlistExcerptFixture({
          evidenceKind: "cookie",
          displayLabel: "Cookie observed",
          cookieNames: ["_ga"],
          hostname: "analytics.vendor.test",
        })],
        capped: false,
        omittedCount: 0,
      },
    }),
    wc01V2AllowlistShadowRowFixture({
      sourceFindingKey: "session_replay_or_behavioral_analytics_observed",
      vendors: [wc01V2AllowlistVendorFixture({ purpose: "session_replay" })],
      evidence: {
        excerptIds: ["excerpt_session_replay_collect"],
        sourceRefIds: ["ref_session_replay_collect"],
        displaySafeExcerpts: [wc01V2AllowlistExcerptFixture({
          evidenceKind: "network_request",
          displayLabel: "Session replay collection endpoint",
          hostname: "collector.session-replay.test",
        })],
        capped: false,
        omittedCount: 0,
      },
      policy: {
        reviewOnlyReasons: ["shadow_projection_only"],
        matchedCriteria: ["session_replay_collection_observed"],
        missingCorroborators: [],
        demotionReasons: [],
      },
    }),
  ]);
  if (input.url) {
    shadow.source = { ...shadow.source, url: input.url };
  }
  return projectSimulationToNormalizedConcernCandidateDraft(
    simulateConcernPolicyForInputDraft(
      projectAllowlistDryRunToConcernPolicyInputDraft(projectWc01V2ShadowToAllowlistDryRun(shadow)),
    ),
  );
}

function mutatedSingleCandidate(
  family: V2NormalizedConcernCandidateDraft["proposed"]["concernFamily"],
  mutate: (candidate: V2NormalizedConcernCandidateDraft) => void,
): V2NormalizedConcernAdapterDryRun {
  const adapterRun = adapterFixture();
  const candidate = structuredClone(candidateFor(adapterRun, family));
  mutate(candidate);
  adapterRun.candidates = [candidate];
  return adapterRun;
}

function candidateFor(
  adapterRun: V2NormalizedConcernAdapterDryRun,
  family: V2NormalizedConcernCandidateDraft["proposed"]["concernFamily"],
) {
  const candidate = adapterRun.candidates.find((item) => item.proposed.concernFamily === family);
  assert.ok(candidate);
  return candidate;
}

function resultFor(comparison: Wc01V2ConcernPolicyComparisonDryRun, family: string) {
  const result = comparison.comparisonResults.find((item) => item.sourceFamily === family);
  assert.ok(result);
  return result;
}

function assertNoForbiddenOutput(value: unknown) {
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(serialized, /gap_observed/);
  assert.doesNotMatch(serialized, /\b(violation|violates|illegal|unlawful|noncompliant|non-compliant|non_compliant|breach)\b/i);
  assert.doesNotMatch(serialized, /\b(requestBody|responseBody|setCookieHeaders|cookieValue|rawCookie|bodySizeBytes|rawNanoReasoning|fullDomText|fullPolicyText)\b/i);
}

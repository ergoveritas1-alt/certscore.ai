import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  projectWc01V2ShadowToAllowlistDryRun,
  type Wc01V2AllowlistDryRun,
} from "./wc01-v2-allowlist-bridge";
import {
  wc01V2AllowlistExcerptFixture,
  wc01V2AllowlistShadowFixture,
  wc01V2AllowlistShadowRowFixture,
  wc01V2AllowlistVendorFixture,
} from "./wc01-v2-allowlist-fixtures";
import {
  projectAllowlistDryRunJsonToConcernPolicyInputDraft,
  projectAllowlistDryRunToConcernPolicyInputDraft,
} from "./wc01-v2-concern-policy-input-draft";
import {
  buildWc01V2ConcernInputDryRunInspectionSummary,
  generateWc01V2ConcernInputBatch,
  generateWc01V2ConcernInputSingleFromFile,
  renderWc01V2ConcernInputDryRunMarkdown,
} from "./wc01-v2-concern-policy-input-output";

test("allowlist candidates convert into review-only concern policy input drafts", () => {
  const allowlist = allowlistFixture();
  const draft = projectAllowlistDryRunToConcernPolicyInputDraft(allowlist);

  assert.equal(allowlist.candidates.length, 2);
  assert.equal(allowlist.blockedRows.length, 1);
  assert.equal(draft.concernInputs.length, 2);
  assert.equal(draft.blockedCandidates.length, 0);
  assert.equal(draft.productionEligible, false);
  assert.equal(draft.status, "draft_review_only");
  assert.deepEqual(
    draft.concernInputs.map((input) => input.proposedConcernFamily).sort(),
    ["pre_consent_cookie_storage", "pre_consent_tracking"],
  );
  for (const input of draft.concernInputs) {
    assert.equal(input.reviewStatus, "review_only_candidate");
    assert.equal(input.productionEligible, false);
    assert.equal(input.topFindingEligible, false);
    assert.equal(input.gapEligible, false);
    assert.equal(input.policyGates.requiresConcernPolicyReview, true);
    assert.equal(input.policyGates.requiresEvidenceContractReview, true);
    assert.equal(input.policyGates.requiresCopyReview, true);
    assert.equal(input.policyGates.requiresTopFindingPolicyReview, true);
    assert.equal(input.evidenceRefs.sourceRefIds.length > 0, true);
    assert.equal(input.suggestedNormalizedConcern.narrativeTier, "internal_review_only");
    assert.equal(input.sourceContext.shadowStatus, "observed");
    assert.equal(input.sourceContext.moduleStatusContextAvailable, false);
    assert.equal(input.evidenceAssessment.confidenceBand, "high");
    assert.equal(input.evidenceAssessment.directnessClassification, "direct");
    assert.equal(input.evidenceAssessment.vendorPurposeBasis.length > 0, true);
    assert.equal(input.evidenceAssessment.requiredEvidence.length > 0, true);
    assert.equal(input.evidenceAssessment.familySpecificCaveats.length > 0, true);
    assert.equal(input.evidenceAssessment.familyGateSatisfied, true);
    assert.equal(input.reviewLanguage.allowedPhrases.length > 0, true);
    assert.equal(input.reviewLanguage.prohibitedPhraseKeys.length > 0, true);
    assert.equal(input.reviewLanguage.prohibitedPhraseKeys.some((key) => key.includes("gap_status_token")), true);
    assert.equal(input.sensitiveContextReview.sensitiveContextFlag, false);
    assert.equal(input.sensitiveContextReview.requiresExtraPolicyReview, false);
  }
  assertNoForbiddenOutput(draft);
});

test("sensitive-context flags come only from explicit local map and do not promote eligibility", () => {
  const healthlineDraft = projectAllowlistDryRunToConcernPolicyInputDraft(
    allowlistFixture({ url: "https://healthline.com" }),
  );
  const exampleDraft = projectAllowlistDryRunToConcernPolicyInputDraft(
    allowlistFixture({ url: "https://example.test" }),
  );

  assert.equal(healthlineDraft.concernInputs.every((input) =>
    input.sensitiveContextReview.sensitiveContextFlag
  ), true);
  assert.equal(healthlineDraft.concernInputs.every((input) =>
    input.sensitiveContextReview.sensitiveContextCategories.includes("health")
  ), true);
  assert.equal(healthlineDraft.concernInputs.every((input) =>
    input.sensitiveContextReview.requiresExtraPolicyReview
  ), true);
  assert.equal(healthlineDraft.concernInputs.every((input) =>
    input.productionEligible === false && input.topFindingEligible === false && input.gapEligible === false
  ), true);
  assert.equal(exampleDraft.concernInputs.every((input) =>
    input.sensitiveContextReview.sensitiveContextFlag === false
  ), true);
  assertNoForbiddenOutput(healthlineDraft);
});

test("blocked allowlist rows do not resurrect as concern inputs", () => {
  const allowlist = allowlistFixture();
  const draft = projectAllowlistDryRunToConcernPolicyInputDraft(allowlist);

  assert.equal(allowlist.blockedRows[0]?.sourceFindingKey, "policy_runtime_vendor_alignment_review_signal");
  assert.equal(draft.concernInputs.some((input) => input.sourceFindingKey === "policy_runtime_vendor_alignment_review_signal"), false);
});

test("disallowed or unsafe candidates are blocked by the concern input draft stage", () => {
  const allowlist = allowlistFixture();
  const [baseCandidate] = allowlist.candidates;
  assert.ok(baseCandidate);

  const disallowed: Wc01V2AllowlistDryRun = {
    ...allowlist,
    candidates: [
      {
        ...baseCandidate,
        source: { ...baseCandidate.source, sourceFindingKey: "third_party_vendors_observed" },
        proposedConcernFamily: "tracker_inventory",
      },
      {
        ...baseCandidate,
        source: { ...baseCandidate.source, rowId: "security_mixed" },
        purposeClassification: {
          supportingPurposes: ["advertising"],
          diagnosticPurposes: ["security"],
        },
      },
      {
        ...baseCandidate,
        source: { ...baseCandidate.source, rowId: "missing_refs" },
        evidence: {
          ...baseCandidate.evidence,
          sourceRefIds: [],
        },
      },
      {
        ...baseCandidate,
        source: { ...baseCandidate.source, rowId: "missing_excerpts" },
        evidence: {
          ...baseCandidate.evidence,
          excerptIds: [],
          displaySafeExcerptCount: 0,
        },
      },
      {
        ...baseCandidate,
        source: { ...baseCandidate.source, rowId: "weak_confidence" },
        confidence: {
          band: "low",
          directVsInferred: "direct",
        },
      },
    ],
  };

  const draft = projectAllowlistDryRunToConcernPolicyInputDraft(disallowed);
  assert.equal(draft.concernInputs.length, 0);
  assert.equal(draft.blockedCandidates.length, 5);
  assert.ok(draft.blockedCandidates.some((candidate) =>
    candidate.blockReasons.includes("source_finding_key_not_allowed_for_concern_input_draft")
  ));
  assert.ok(draft.blockedCandidates.some((candidate) =>
    candidate.blockReasons.includes("tier_c_diagnostic_purpose_present")
  ));
  assert.ok(draft.blockedCandidates.some((candidate) =>
    candidate.blockReasons.includes("missing_source_refs")
  ));
  assert.ok(draft.blockedCandidates.some((candidate) =>
    candidate.blockReasons.includes("missing_excerpt_or_display_safe_evidence")
  ));
  assert.ok(draft.blockedCandidates.some((candidate) =>
    candidate.blockReasons.includes("weak_or_missing_confidence_band")
  ));
  assertNoForbiddenOutput(draft);
});

test("pre-consent tracking retains direct runtime, consent-state, and vendor-purpose metadata", () => {
  const draft = projectAllowlistDryRunToConcernPolicyInputDraft(allowlistFixture());
  const input = requiredInput(draft, "pre_consent_tracking");

  assert.equal(input.sourceFindingKey, "pre_consent_tracking_detected");
  assert.equal(input.evidenceAssessment.requiredEvidence.includes("direct_runtime_evidence"), true);
  assert.equal(input.evidenceAssessment.requiredEvidence.includes("pre_consent_or_consent_state_context"), true);
  assert.equal(input.evidenceAssessment.vendorPurposeBasis.includes("advertising"), true);
  assert.equal(input.evidenceAssessment.sourceMatchedCriteria.includes("collection_endpoint_observed"), true);
  assert.equal(
    input.evidenceAssessment.familySpecificCaveats.includes(
      "analytics_and_advertising_not_automatically_equivalent_policy_review_required",
    ),
    true,
  );
  assertNoForbiddenOutput(draft);
});

test("pre-consent cookie storage remains separate and first-party-only storage blocks upstream", () => {
  const dryRun = projectWc01V2ShadowToAllowlistDryRun(wc01V2AllowlistShadowFixture([
    wc01V2AllowlistShadowRowFixture({
      sourceFindingKey: "third_party_cookie_pre_consent",
      vendors: [wc01V2AllowlistVendorFixture({ purpose: "analytics" })],
      evidence: {
        excerptIds: ["excerpt_first_party_cookie"],
        sourceRefIds: ["ref_first_party_cookie"],
        displaySafeExcerpts: [wc01V2AllowlistExcerptFixture({
          evidenceKind: "cookie",
          displayLabel: "Cookie observed",
          cookieNames: ["_ga"],
          hostname: "example.test",
        })],
        capped: false,
        omittedCount: 0,
      },
    }),
  ]));
  const draft = projectAllowlistDryRunToConcernPolicyInputDraft(dryRun);

  assert.equal(dryRun.candidates.length, 0);
  assert.equal(draft.concernInputs.length, 0);
  assert.equal(dryRun.blockedRows[0]?.blockReasons.includes("first_party_only_cookie_or_storage_context"), true);
  assertNoForbiddenOutput(draft);

  const passDraft = projectAllowlistDryRunToConcernPolicyInputDraft(allowlistFixture());
  const input = requiredInput(passDraft, "pre_consent_cookie_storage");
  assert.equal(input.suggestedNormalizedConcern.concernFamily, "pre_consent_cookie_storage");
  assert.notEqual(input.suggestedNormalizedConcern.concernFamily, "pre_consent_tracking");
  assert.equal(
    input.evidenceAssessment.familySpecificCaveats.includes(
      "cookie_storage_separate_from_pre_consent_tracking_unless_policy_owners_approve_merge",
    ),
    true,
  );
});

test("session replay library-only blocks upstream but collection evidence can become review-only draft input", () => {
  const libraryOnly = projectWc01V2ShadowToAllowlistDryRun(wc01V2AllowlistShadowFixture([
    wc01V2AllowlistShadowRowFixture({
      sourceFindingKey: "session_replay_or_behavioral_analytics_observed",
      vendors: [wc01V2AllowlistVendorFixture({ purpose: "session_replay" })],
      policy: {
        reviewOnlyReasons: ["shadow_projection_only"],
        matchedCriteria: ["session_replay_library_observed", "library_loaded_only"],
        missingCorroborators: [],
        demotionReasons: [],
      },
    }),
  ]));
  const libraryDraft = projectAllowlistDryRunToConcernPolicyInputDraft(libraryOnly);
  assert.equal(libraryOnly.candidates.length, 0);
  assert.equal(libraryDraft.concernInputs.length, 0);
  assert.equal(libraryOnly.blockedRows[0]?.blockReasons.includes("library_only_without_collection"), true);

  const collection = projectWc01V2ShadowToAllowlistDryRun(wc01V2AllowlistShadowFixture([
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
  ]));
  const collectionDraft = projectAllowlistDryRunToConcernPolicyInputDraft(collection);
  const input = requiredInput(collectionDraft, "session_replay_behavioral_analytics");

  assert.equal(collectionDraft.concernInputs.length, 1);
  assert.equal(input.evidenceAssessment.requiredEvidence.includes("collection_endpoint_or_equivalent_strong_runtime_evidence"), true);
  assert.equal(input.evidenceAssessment.sourceMatchedCriteria.includes("session_replay_collection_observed"), true);
  assert.equal(input.evidenceAssessment.familySpecificCaveats.includes("library_only_evidence_blocked"), true);
  assertNoForbiddenOutput(collectionDraft);
});

test("bad allowlist JSON fails validation and forbidden tokens are rejected", () => {
  assert.throws(
    () => projectAllowlistDryRunJsonToConcernPolicyInputDraft("{\"dryRunVersion\":\"bad\"}"),
    /Unsupported Wc01V2AllowlistDryRun version/,
  );
  assert.throws(
    () => projectAllowlistDryRunJsonToConcernPolicyInputDraft(JSON.stringify({ ...allowlistFixture(), notes: ["gap_observed"] })),
    /forbidden gap status token/,
  );
});

test("single-file concern input generator writes JSON and markdown summaries", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "wc01-concern-input-"));
  try {
    const allowlistPath = join(tmp, "Wc01V2AllowlistDryRun.json");
    const outPath = join(tmp, "Wc01V2ConcernPolicyInputDraft.json");
    await writeFile(allowlistPath, `${JSON.stringify(allowlistFixture(), null, 2)}\n`, "utf8");

    const generated = await generateWc01V2ConcernInputSingleFromFile({ allowlistPath, outPath });
    const saved = JSON.parse(await readFile(outPath, "utf8"));
    const summary = buildWc01V2ConcernInputDryRunInspectionSummary(saved);
    const markdown = renderWc01V2ConcernInputDryRunMarkdown(summary);

    assert.equal(generated.summary.concernInputDraftCount, 2);
    assert.equal(summary.totalAllowlistCandidates, 2);
    assert.equal(summary.blockedCandidateCount, 0);
    assert.equal(summary.countsBySuggestedConcernKey["v2_draft.pre_consent_tracking.review_only"], 1);
    assert.equal(summary.sensitiveContextFlaggedCount, 0);
    assert.equal(summary.draftsRequiringExtraPolicyReview, 0);
    assert.equal(summary.reviewOnlyLanguageStatus.inputsWithReviewLanguage, 2);
    assert.equal(summary.reviewOnlyLanguageStatus.inputsMissingReviewLanguage, 0);
    assert.equal(summary.bannedTokenGuardrailStatus.containsForbiddenGapStatusToken, false);
    assert.equal(summary.bannedTokenGuardrailStatus.containsLegalConclusionClaimLanguage, false);
    assert.match(markdown, /Dry run only\. Not production concern policy input\. Not persisted normalized concerns\. Not customer-facing report output\./);
    assert.match(markdown, /Sensitive-context flagged draft count: 0/);
    assert.match(markdown, /Review-Only Language Status/);
    assertNoForbiddenOutput(saved);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("batch concern input generator continues on malformed artifacts", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "wc01-concern-input-batch-"));
  try {
    const allowlistDir = join(tmp, "allowlist");
    const outDir = join(tmp, "out");
    await mkdir(join(allowlistDir, "good"), { recursive: true });
    await mkdir(join(allowlistDir, "bad"), { recursive: true });
    await writeFile(
      join(allowlistDir, "good", "Wc01V2AllowlistDryRun.json"),
      `${JSON.stringify(allowlistFixture(), null, 2)}\n`,
      "utf8",
    );
    await writeFile(join(allowlistDir, "bad", "Wc01V2AllowlistDryRun.json"), "{not-json", "utf8");

    const summary = await generateWc01V2ConcernInputBatch({ allowlistDir, outDir });

    assert.equal(summary.totalAllowlistFilesFound, 2);
    assert.equal(summary.succeededCount, 1);
    assert.equal(summary.failedCount, 1);
    assert.equal(summary.totalAllowlistCandidates, 2);
    assert.equal(summary.totalConcernInputs, 2);
    assert.equal(summary.totalBlockedCandidates, 0);
    assert.equal(summary.reviewOnlyLanguageStatus.inputsWithReviewLanguage, 2);
    assert.equal(summary.bannedTokenGuardrailStatus.containsForbiddenGapStatusToken, false);
    assert.equal(summary.malformedArtifacts.length, 1);
    assert.equal(summary.sitesWithConcernInputs.includes("good"), true);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("concern input draft modules do not import production policy, finding, checklist, or report builders", () => {
  const packageRoot = process.cwd().endsWith("packages/certscore-report-adapter")
    ? process.cwd()
    : resolve(process.cwd(), "packages/certscore-report-adapter");
  const sources = [
    readFileSync(join(packageRoot, "src/wc01-v2-concern-policy-input-draft.ts"), "utf8"),
    readFileSync(join(packageRoot, "src/wc01-v2-concern-policy-input-output.ts"), "utf8"),
    readFileSync(join(packageRoot, "src/cli/wc01-v2-concern-policy-input-dry-run.ts"), "utf8"),
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
  assert.doesNotMatch(sources, /shared-scan-detail-view/);
});

function allowlistFixture(input: { url?: string } = {}) {
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
      sourceFindingKey: "policy_runtime_vendor_alignment_review_signal",
      status: "review_signal",
    }),
  ]);
  if (input.url) {
    shadow.source = { ...shadow.source, url: input.url };
  }
  return projectWc01V2ShadowToAllowlistDryRun(shadow);
}

function requiredInput(
  draft: ReturnType<typeof projectAllowlistDryRunToConcernPolicyInputDraft>,
  family: string,
) {
  const input = draft.concernInputs.find((item) => item.proposedConcernFamily === family);
  assert.ok(input);
  return input;
}

function assertNoForbiddenOutput(value: unknown) {
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(serialized, /gap_observed/);
  assert.doesNotMatch(serialized, /\b(violation|violates|illegal|unlawful|noncompliant|non-compliant|non_compliant|breach)\b/i);
  assert.doesNotMatch(serialized, /\b(requestBody|responseBody|setCookieHeaders|cookieValue|rawCookie|bodySizeBytes|rawNanoReasoning|fullDomText|fullPolicyText)\b/i);
}

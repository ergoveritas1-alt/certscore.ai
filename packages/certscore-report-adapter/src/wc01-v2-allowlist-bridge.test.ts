import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  wc01V2AllowlistExcerptFixture,
  wc01V2AllowlistShadowFixture,
  wc01V2AllowlistShadowRowFixture,
  wc01V2AllowlistVendorFixture,
} from "./wc01-v2-allowlist-fixtures";
import {
  projectWc01V2ShadowToAllowlistDryRun,
  type Wc01V2AllowlistDryRun,
} from "./wc01-v2-allowlist-bridge";
import {
  buildWc01V2AllowlistDryRunInspectionSummary,
  generateWc01V2AllowlistDryRunBatch,
  generateWc01V2AllowlistDryRunSingleFromFile,
  renderWc01V2AllowlistDryRunMarkdown,
} from "./wc01-v2-allowlist-output";

test("Tier A rows map only when tightened gates pass", () => {
  const dryRun = projectWc01V2ShadowToAllowlistDryRun(wc01V2AllowlistShadowFixture([
    wc01V2AllowlistShadowRowFixture({
      sourceFindingKey: "pre_consent_tracking_detected",
      vendors: [wc01V2AllowlistVendorFixture({ purpose: "advertising_measurement" })],
      policy: { ...basePolicy(), matchedCriteria: ["collection_endpoint_observed", "pre_consent_tracking_signal_true"] },
    }),
    wc01V2AllowlistShadowRowFixture({
      sourceFindingKey: "third_party_cookie_pre_consent",
      vendors: [wc01V2AllowlistVendorFixture({ purpose: "analytics" })],
      evidence: {
        excerptIds: ["excerpt_cookie"],
        sourceRefIds: ["ref_cookie"],
        displaySafeExcerpts: [cookieExcerpt()],
        capped: false,
        omittedCount: 0,
      },
    }),
    wc01V2AllowlistShadowRowFixture({
      sourceFindingKey: "session_replay_or_behavioral_analytics_observed",
      vendors: [wc01V2AllowlistVendorFixture({ purpose: "session_replay" })],
      policy: { ...basePolicy(), matchedCriteria: ["session_replay_collection_observed"] },
    }),
  ]));

  assert.equal(dryRun.candidates.length, 3);
  assert.equal(dryRun.blockedRows.length, 0);
  assert.deepEqual(
    dryRun.candidates.map((candidate) => candidate.proposedConcernFamily).sort(),
    [
      "pre_consent_cookie_storage",
      "pre_consent_tracking",
      "session_replay_behavioral_analytics",
    ],
  );
  for (const candidate of dryRun.candidates) {
    assert.equal(candidate.status, "candidate_review_only");
    assert.equal(candidate.productionEligible, false);
    assert.equal(candidate.topFindingEligible, false);
    assert.equal(candidate.gapEligible, false);
    assert.equal(candidate.evidence.sourceRefIds.length > 0, true);
    assert.equal(candidate.gate.passed, true);
    assert.equal(candidate.purposeClassification.supportingPurposes.length > 0, true);
  }
  assertNoForbiddenOutput(dryRun);
});

test("third_party_vendors_observed is blocked as inventory-only context", () => {
  const dryRun = projectWc01V2ShadowToAllowlistDryRun(wc01V2AllowlistShadowFixture([
    wc01V2AllowlistShadowRowFixture({
      sourceFindingKey: "third_party_vendors_observed",
      vendors: [wc01V2AllowlistVendorFixture({ purpose: "advertising" })],
      policy: { ...basePolicy(), matchedCriteria: ["observed_vendor_journey_present"] },
    }),
  ]));

  assert.equal(dryRun.candidates.length, 0);
  assert.equal(dryRun.blockedRows[0]?.tier, "tier_a_failed_gates");
  assert.ok(dryRun.blockedRows[0]?.blockReasons.includes("inventory_only_signal"));
  assert.ok(dryRun.blockedRows[0]?.blockReasons.includes("requires_pre_consent_or_collection_context"));
  assert.ok(dryRun.blockedRows[0]?.blockReasons.includes("inventory_signal_requires_stronger_tracking_context"));
});

test("third_party_vendors_observed stays support-only when a stronger row passes separately", () => {
  const dryRun = projectWc01V2ShadowToAllowlistDryRun(wc01V2AllowlistShadowFixture([
    wc01V2AllowlistShadowRowFixture({
      sourceFindingKey: "third_party_vendors_observed",
      vendors: [wc01V2AllowlistVendorFixture({ purpose: "advertising" })],
      policy: { ...basePolicy(), matchedCriteria: ["observed_vendor_journey_present", "collection_endpoint_observed", "pre_consent_tracking_signal_true"] },
    }),
    wc01V2AllowlistShadowRowFixture({
      sourceFindingKey: "pre_consent_tracking_detected",
      vendors: [wc01V2AllowlistVendorFixture({ purpose: "advertising" })],
      policy: { ...basePolicy(), matchedCriteria: ["collection_endpoint_observed", "pre_consent_tracking_signal_true"] },
    }),
  ]));

  assert.equal(dryRun.candidates.length, 1);
  assert.equal(dryRun.candidates[0]?.source.sourceFindingKey, "pre_consent_tracking_detected");
  assert.equal(dryRun.candidates.some((candidate) => candidate.proposedConcernFamily === "tracker_inventory"), false);
  assert.equal(dryRun.blockedRows.length, 1);
  assert.equal(dryRun.blockedRows[0]?.sourceFindingKey, "third_party_vendors_observed");
  assert.ok(dryRun.blockedRows[0]?.blockReasons.includes("inventory_only_signal"));
});

test("Tier A rows fail closed when source refs are missing", () => {
  const dryRun = projectWc01V2ShadowToAllowlistDryRun(wc01V2AllowlistShadowFixture([
    wc01V2AllowlistShadowRowFixture({
      sourceFindingKey: "pre_consent_tracking_detected",
      evidence: {
        excerptIds: ["excerpt_fixture"],
        sourceRefIds: [],
        displaySafeExcerpts: [wc01V2AllowlistExcerptFixture()],
        capped: false,
        omittedCount: 0,
      },
    }),
  ]));

  assert.equal(dryRun.candidates.length, 0);
  assert.equal(dryRun.blockedRows[0]?.tier, "tier_a_failed_gates");
  assert.ok(dryRun.blockedRows[0]?.blockReasons.includes("missing_source_refs"));
});

test("Tier A rows fail closed when excerpts and display-safe evidence are missing", () => {
  const dryRun = projectWc01V2ShadowToAllowlistDryRun(wc01V2AllowlistShadowFixture([
    wc01V2AllowlistShadowRowFixture({
      sourceFindingKey: "pre_consent_tracking_detected",
      evidence: {
        excerptIds: [],
        sourceRefIds: ["ref_fixture"],
        displaySafeExcerpts: [],
        capped: false,
        omittedCount: 0,
      },
    }),
  ]));

  assert.equal(dryRun.candidates.length, 0);
  assert.ok(dryRun.blockedRows[0]?.blockReasons.includes("missing_excerpt_or_display_safe_evidence"));
});

test("Tier A rows fail closed on non-allowed statuses and banner remains blocked", () => {
  for (const status of ["review_signal", "coverage_limitation", "not_testable", "assisted_candidate"] as const) {
    const dryRun = projectWc01V2ShadowToAllowlistDryRun(wc01V2AllowlistShadowFixture([
      wc01V2AllowlistShadowRowFixture({
        sourceFindingKey: "pre_consent_tracking_detected",
        status,
      }),
    ]));
    assert.equal(dryRun.candidates.length, 0);
    assert.ok(dryRun.blockedRows[0]?.blockReasons.includes("status_not_allowed_for_tier_a"));
  }

  const bannerDryRun = projectWc01V2ShadowToAllowlistDryRun(wc01V2AllowlistShadowFixture([
    wc01V2AllowlistShadowRowFixture({
      sourceFindingKey: "consent_banner_observed_or_not_observed",
      status: "not_observed",
      vendors: [],
      evidence: {
        excerptIds: ["excerpt_absence"],
        sourceRefIds: ["ref_absence"],
        displaySafeExcerpts: [consentUiExcerpt({ displayLabel: "Consent search scope", displayValueRedacted: "No consent banner observed in bounded homepage search scope." })],
        capped: false,
        omittedCount: 0,
      },
    }),
  ]));

  assert.equal(bannerDryRun.candidates.length, 0);
  assert.equal(bannerDryRun.blockedRows[0]?.tier, "tier_a_failed_gates");
  assert.ok(bannerDryRun.blockedRows[0]?.blockReasons.includes("consent_surface_gate_split_required"));
  assert.ok(bannerDryRun.blockedRows[0]?.blockReasons.includes("consent_absence_requires_bounded_search_scope"));

  const observedBannerDryRun = projectWc01V2ShadowToAllowlistDryRun(wc01V2AllowlistShadowFixture([
    wc01V2AllowlistShadowRowFixture({
      sourceFindingKey: "consent_banner_observed_or_not_observed",
      status: "observed",
      vendors: [],
      evidence: {
        excerptIds: ["excerpt_banner"],
        sourceRefIds: ["ref_banner"],
        displaySafeExcerpts: [consentUiExcerpt()],
        capped: false,
        omittedCount: 0,
      },
    }),
  ]));

  assert.equal(observedBannerDryRun.candidates.length, 0);
  assert.equal(observedBannerDryRun.blockedRows[0]?.tier, "tier_a_failed_gates");
  assert.ok(observedBannerDryRun.blockedRows[0]?.blockReasons.includes("consent_surface_gate_split_required"));
  assert.ok(observedBannerDryRun.blockedRows[0]?.blockReasons.includes("consent_surface_mapping_blocked_for_now"));
});

test("Tier B rows always block", () => {
  const dryRun = projectWc01V2ShadowToAllowlistDryRun(wc01V2AllowlistShadowFixture([
    wc01V2AllowlistShadowRowFixture({
      sourceFindingKey: "policy_runtime_vendor_alignment_review_signal",
      status: "review_signal",
    }),
    wc01V2AllowlistShadowRowFixture({
      sourceFindingKey: "accept_reject_runtime_delta_observed",
      status: "review_signal",
    }),
  ]));

  assert.equal(dryRun.candidates.length, 0);
  assert.equal(dryRun.blockedRows.length, 2);
  assert.equal(dryRun.blockedRows.every((row) => row.tier === "tier_b_review_only"), true);
});

test("Tier C-only purposes never become tracker candidates", () => {
  for (const purpose of ["security", "performance_monitoring", "customer_support", "cdn", "static", "site_owned_infrastructure", "fraud_prevention", "bot_defense", "rum", "live_chat"] as const) {
    const dryRun = projectWc01V2ShadowToAllowlistDryRun(wc01V2AllowlistShadowFixture([
      wc01V2AllowlistShadowRowFixture({
        sourceFindingKey: "third_party_vendors_observed",
        vendors: [wc01V2AllowlistVendorFixture({ purpose })],
      }),
    ]));

    assert.equal(dryRun.candidates.length, 0, purpose);
    assert.equal(dryRun.blockedRows[0]?.tier, "tier_c_never_tracker_default", purpose);
    assert.ok(dryRun.blockedRows[0]?.blockedPurposes?.includes(purpose));
  }
});

test("consent-management-only and tag-management-only do not create tracker candidates", () => {
  const dryRun = projectWc01V2ShadowToAllowlistDryRun(wc01V2AllowlistShadowFixture([
    wc01V2AllowlistShadowRowFixture({
      sourceFindingKey: "pre_consent_tracking_detected",
      vendors: [wc01V2AllowlistVendorFixture({ purpose: "consent_management" })],
    }),
    wc01V2AllowlistShadowRowFixture({
      sourceFindingKey: "pre_consent_tracking_detected",
      vendors: [wc01V2AllowlistVendorFixture({ purpose: "tag_management" })],
    }),
  ]));

  assert.equal(dryRun.candidates.length, 0);
  assert.equal(dryRun.blockedRows[0]?.tier, "tier_c_never_tracker_default");
  assert.equal(dryRun.blockedRows[1]?.tier, "tier_a_failed_gates");
  assert.ok(dryRun.blockedRows[1]?.blockReasons.includes("tag_or_consent_management_only"));

  const summary = buildWc01V2AllowlistDryRunInspectionSummary(dryRun);
  assert.equal(summary.candidateSupportingPurposeCounts.tag_management ?? 0, 0);
  assert.equal(summary.candidateSupportingPurposeCounts.consent_management ?? 0, 0);
});

test("tag_management plus advertising keeps tag management diagnostic-only", () => {
  const dryRun = projectWc01V2ShadowToAllowlistDryRun(wc01V2AllowlistShadowFixture([
    wc01V2AllowlistShadowRowFixture({
      sourceFindingKey: "pre_consent_tracking_detected",
      vendors: [
        wc01V2AllowlistVendorFixture({ purpose: "tag_management", vendor: "Google Tag Manager" }),
        wc01V2AllowlistVendorFixture({ purpose: "advertising", vendor: "Google Ads" }),
      ],
    }),
  ]));

  const candidate = dryRun.candidates[0];
  assert.equal(dryRun.candidates.length, 1);
  assert.deepEqual(candidate?.purposeClassification.supportingPurposes, ["advertising"]);
  assert.deepEqual(candidate?.purposeClassification.diagnosticPurposes, ["tag_management"]);
  assert.ok(candidate?.gate.caveats.includes("tag_management_diagnostic_only"));

  const summary = buildWc01V2AllowlistDryRunInspectionSummary(dryRun);
  assert.equal(summary.candidateSupportingPurposeCounts.advertising, 1);
  assert.equal(summary.candidateSupportingPurposeCounts.tag_management ?? 0, 0);
  assert.equal(summary.candidateDiagnosticPurposeCounts.tag_management, 1);
  assert.equal(summary.tagManagementSupportingCount, 0);
  assert.equal(summary.tagManagementDiagnosticPresenceCount, 1);
  assert.equal(summary.tierBcLeakageCount, 0);
  assert.equal(summary.candidatesWithTierCDiagnosticPurposeCount, 0);
});

test("consent_management plus advertising remains diagnostic and non-supporting", () => {
  const dryRun = projectWc01V2ShadowToAllowlistDryRun(wc01V2AllowlistShadowFixture([
    wc01V2AllowlistShadowRowFixture({
      sourceFindingKey: "pre_consent_tracking_detected",
      vendors: [
        wc01V2AllowlistVendorFixture({ purpose: "consent_management", vendor: "Consent Manager" }),
        wc01V2AllowlistVendorFixture({ purpose: "advertising", vendor: "Google Ads" }),
      ],
    }),
  ]));

  const candidate = dryRun.candidates[0];
  const summary = buildWc01V2AllowlistDryRunInspectionSummary(dryRun);
  assert.equal(dryRun.candidates.length, 1);
  assert.deepEqual(candidate?.purposeClassification.supportingPurposes, ["advertising"]);
  assert.deepEqual(candidate?.purposeClassification.diagnosticPurposes, ["consent_management"]);
  assert.equal(summary.consentManagementSupportingCount, 0);
  assert.equal(summary.tierBcLeakageCount, 0);
  assert.equal(summary.candidatesWithTierCDiagnosticPurposeCount, 0);
});

test("mixed tracker and Tier C diagnostic purposes block until evidence subset gate exists", () => {
  for (const purpose of ["security", "performance_monitoring", "customer_support", "fraud_prevention", "bot_defense", "rum", "live_chat"] as const) {
    const dryRun = projectWc01V2ShadowToAllowlistDryRun(wc01V2AllowlistShadowFixture([
      wc01V2AllowlistShadowRowFixture({
        sourceFindingKey: "pre_consent_tracking_detected",
        vendors: [
          wc01V2AllowlistVendorFixture({ purpose: "advertising", vendor: "Ad Vendor" }),
          wc01V2AllowlistVendorFixture({ purpose, vendor: `Tier C ${purpose}` }),
        ],
      }),
    ]));

    const summary = buildWc01V2AllowlistDryRunInspectionSummary(dryRun);
    assert.equal(dryRun.candidates.length, 0, purpose);
    assert.equal(dryRun.blockedRows[0]?.tier, "tier_a_failed_gates", purpose);
    assert.ok(dryRun.blockedRows[0]?.blockReasons.includes("tier_c_diagnostic_purpose_present"), purpose);
    assert.ok(dryRun.blockedRows[0]?.blockReasons.includes("mixed_tracker_and_tier_c_purpose_requires_evidence_subset_gate"), purpose);
    assert.ok(dryRun.blockedRows[0]?.missingRequirements?.includes("tracker_purpose_evidence_subset_gate"), purpose);
    assert.equal(summary.candidatesBlockedForTierCDiagnosticPurposeCount, 1, purpose);
    assert.equal(summary.mixedTrackerAndTierCBlockedCount, 1, purpose);
    assert.equal(summary.tierBcLeakageCount, 0, purpose);
  }
});

test("first-party-only cookie storage blocks third_party_cookie_pre_consent", () => {
  const dryRun = projectWc01V2ShadowToAllowlistDryRun(wc01V2AllowlistShadowFixture([
    wc01V2AllowlistShadowRowFixture({
      sourceFindingKey: "third_party_cookie_pre_consent",
      vendors: [wc01V2AllowlistVendorFixture({ purpose: "analytics" })],
      evidence: {
        excerptIds: ["excerpt_first_party_cookie"],
        sourceRefIds: ["ref_first_party_cookie"],
        displaySafeExcerpts: [cookieExcerpt({ hostname: "www.example.test" })],
        capped: false,
        omittedCount: 0,
      },
    }),
  ]));

  assert.equal(dryRun.candidates.length, 0);
  assert.equal(dryRun.blockedRows[0]?.tier, "tier_a_failed_gates");
  assert.ok(dryRun.blockedRows[0]?.blockReasons.includes("first_party_only_cookie_or_storage_context"));
  assert.ok(dryRun.blockedRows[0]?.missingRequirements?.includes("third_party_cookie_or_storage_context"));
});

test("third-party cookie storage with display-safe party context may pass dry-run gates", () => {
  const dryRun = projectWc01V2ShadowToAllowlistDryRun(wc01V2AllowlistShadowFixture([
    wc01V2AllowlistShadowRowFixture({
      sourceFindingKey: "third_party_cookie_pre_consent",
      vendors: [wc01V2AllowlistVendorFixture({ purpose: "analytics" })],
      evidence: {
        excerptIds: ["excerpt_third_party_cookie"],
        sourceRefIds: ["ref_third_party_cookie"],
        displaySafeExcerpts: [cookieExcerpt({ hostname: "analytics.vendor.test" })],
        capped: false,
        omittedCount: 0,
      },
    }),
  ]));

  assert.equal(dryRun.candidates.length, 1);
  assert.equal(dryRun.candidates[0]?.status, "candidate_review_only");
  assert.equal(dryRun.candidates[0]?.proposedConcernFamily, "pre_consent_cookie_storage");
  assert.equal(dryRun.candidates[0]?.productionEligible, false);
  assert.equal(dryRun.candidates[0]?.topFindingEligible, false);
  assert.equal(dryRun.candidates[0]?.gapEligible, false);
});

test("session replay library-only evidence blocks", () => {
  const dryRun = projectWc01V2ShadowToAllowlistDryRun(wc01V2AllowlistShadowFixture([
    wc01V2AllowlistShadowRowFixture({
      sourceFindingKey: "session_replay_or_behavioral_analytics_observed",
      vendors: [wc01V2AllowlistVendorFixture({ purpose: "session_replay" })],
      policy: { ...basePolicy(), matchedCriteria: ["session_replay_library_observed", "library_loaded_only"] },
    }),
  ]));

  assert.equal(dryRun.candidates.length, 0);
  assert.ok(dryRun.blockedRows[0]?.blockReasons.includes("library_only_without_collection"));
});

test("session replay collection endpoint observed may pass dry-run gates", () => {
  const dryRun = projectWc01V2ShadowToAllowlistDryRun(wc01V2AllowlistShadowFixture([
    wc01V2AllowlistShadowRowFixture({
      sourceFindingKey: "session_replay_or_behavioral_analytics_observed",
      vendors: [wc01V2AllowlistVendorFixture({ purpose: "session_replay" })],
      evidence: {
        excerptIds: ["excerpt_session_replay_collect"],
        sourceRefIds: ["ref_session_replay_collect"],
        displaySafeExcerpts: [sessionReplayCollectionExcerpt()],
        capped: false,
        omittedCount: 0,
      },
      policy: { ...basePolicy(), matchedCriteria: ["session_replay_collection_observed"] },
    }),
  ]));

  assert.equal(dryRun.candidates.length, 1);
  assert.equal(dryRun.candidates[0]?.status, "candidate_review_only");
  assert.equal(dryRun.candidates[0]?.proposedConcernFamily, "session_replay_behavioral_analytics");
  assert.deepEqual(dryRun.candidates[0]?.purposeClassification.supportingPurposes, ["session_replay"]);
});

test("single-file summary counts candidates and blocks correctly", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "wc01-allowlist-"));
  try {
    const shadowPath = join(tmp, "Wc01V2ShadowProjection.json");
    const outPath = join(tmp, "Wc01V2AllowlistDryRun.json");
    const shadow = wc01V2AllowlistShadowFixture([
      wc01V2AllowlistShadowRowFixture({ sourceFindingKey: "pre_consent_tracking_detected" }),
      wc01V2AllowlistShadowRowFixture({ sourceFindingKey: "policy_runtime_vendor_alignment_review_signal", status: "review_signal" }),
    ]);
    await writeFile(shadowPath, `${JSON.stringify(shadow, null, 2)}\n`, "utf8");

    const generated = await generateWc01V2AllowlistDryRunSingleFromFile({ shadowPath, outPath });
    const saved = JSON.parse(await readFile(outPath, "utf8")) as Wc01V2AllowlistDryRun;
    const summary = buildWc01V2AllowlistDryRunInspectionSummary(saved);
    const markdown = renderWc01V2AllowlistDryRunMarkdown(summary);

    assert.equal(generated.summary.candidateCount, 1);
    assert.equal(summary.blockedCount, 1);
    assert.equal(summary.candidatesByProposedConcernFamily.pre_consent_tracking, 1);
    assert.equal(summary.blockedByTier.tier_b_review_only, 1);
    assert.equal(summary.thirdPartyVendorsObservedCandidateCount, 0);
    assert.equal(summary.tierBcLeakageCount, 0);
    assert.equal(summary.candidatesWithTierCDiagnosticPurposeCount, 0);
    assert.equal(summary.candidatesBlockedForTierCDiagnosticPurposeCount, 0);
    assert.equal(summary.mixedTrackerAndTierCBlockedCount, 0);
    assert.equal(summary.tagManagementSupportingCount, 0);
    assert.equal(summary.consentManagementSupportingCount, 0);
    assert.equal(summary.candidatesWithTagManagementPresentCount, 0);
    assert.match(markdown, /Dry run only\. Not production normalized concerns\. Not customer-facing report output\./);
    assert.match(markdown, /no candidate topFindingEligible: true/);
    assertNoForbiddenOutput(saved);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("batch mode continues on malformed artifacts", async () => {
  const tmp = await mkdtemp(join(tmpdir(), "wc01-allowlist-batch-"));
  try {
    const shadowDir = join(tmp, "shadow");
    const outDir = join(tmp, "out");
    await mkdir(join(shadowDir, "good"), { recursive: true });
    await mkdir(join(shadowDir, "bad"), { recursive: true });
    await writeFile(
      join(shadowDir, "good", "Wc01V2ShadowProjection.json"),
      `${JSON.stringify(wc01V2AllowlistShadowFixture([
        wc01V2AllowlistShadowRowFixture({ sourceFindingKey: "pre_consent_tracking_detected" }),
      ]), null, 2)}\n`,
      "utf8",
    );
    await writeFile(join(shadowDir, "bad", "Wc01V2ShadowProjection.json"), "{not-json", "utf8");

    const summary = await generateWc01V2AllowlistDryRunBatch({ shadowDir, outDir });

    assert.equal(summary.totalShadowFilesFound, 2);
    assert.equal(summary.succeededCount, 1);
    assert.equal(summary.failedCount, 1);
    assert.equal(summary.totalCandidates, 1);
    assert.equal(summary.thirdPartyVendorsObservedCandidateCount, 0);
    assert.equal(summary.tierBcLeakageCount, 0);
    assert.equal(summary.candidatesWithTierCDiagnosticPurposeCount, 0);
    assert.equal(summary.candidatesBlockedForTierCDiagnosticPurposeCount, 0);
    assert.equal(summary.mixedTrackerAndTierCBlockedCount, 0);
    assert.equal(summary.malformedArtifacts.length, 1);
    assert.equal(summary.sitesWithCandidates.includes("good"), true);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("bridge modules do not import production report/checklist/executive/top-finding builders", () => {
  const packageRoot = process.cwd().endsWith("packages/certscore-report-adapter")
    ? process.cwd()
    : resolve(process.cwd(), "packages/certscore-report-adapter");
  const sources = [
    readFileSync(join(packageRoot, "src/wc01-v2-allowlist-bridge.ts"), "utf8"),
    readFileSync(join(packageRoot, "src/wc01-v2-allowlist-output.ts"), "utf8"),
  ].join("\n")
    .split("\n")
    .filter((line) => /^\s*import\b/.test(line))
    .join("\n");

  assert.doesNotMatch(sources, /shared-scan-detail-view/);
  assert.doesNotMatch(sources, /executive-findings-projection/);
  assert.doesNotMatch(sources, /executive-summary/);
  assert.doesNotMatch(sources, /coverage-checklist/);
  assert.doesNotMatch(sources, /unified-findings/);
  assert.doesNotMatch(sources, /top-finding/);
});

function basePolicy() {
  return {
    reviewOnlyReasons: ["shadow_projection_only"],
    matchedCriteria: ["collection_endpoint_observed"],
    missingCorroborators: [],
    demotionReasons: [],
  };
}

function cookieExcerpt(input: Parameters<typeof wc01V2AllowlistExcerptFixture>[0] = {}) {
  return wc01V2AllowlistExcerptFixture({
    evidenceKind: "cookie",
    displayLabel: "Cookie observed",
    cookieNames: ["_ga"],
    displayValueRedacted: "_ga=<redacted>",
    hostname: "analytics.vendor.test",
    ...input,
  });
}

function sessionReplayCollectionExcerpt() {
  return wc01V2AllowlistExcerptFixture({
    evidenceKind: "network_request",
    displayLabel: "Session replay collection endpoint",
    displayValueRedacted: "session.example.test/rec",
    hostname: "session.example.test",
    path: "/rec",
  });
}

function consentUiExcerpt(input = {}) {
  return wc01V2AllowlistExcerptFixture({
    evidenceKind: "ui_control",
    displayLabel: "Consent banner",
    displayValueRedacted: "Accept all / Reject all",
    sourceEventType: "consent_ui_observation",
    ...input,
  });
}

function assertNoForbiddenOutput(value: unknown) {
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(serialized, /gap_observed/);
  assert.doesNotMatch(serialized, /\b(violation|violates|illegal|unlawful|noncompliant|non-compliant)\b/i);
  assert.doesNotMatch(serialized, /\b(requestBody|responseBody|setCookieHeaders|cookieValue|rawCookie|bodySizeBytes|rawNanoReasoning|fullDomText|fullPolicyText)\b/i);
}

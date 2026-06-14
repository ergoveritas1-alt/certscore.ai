import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  canonicalEvidenceBundleSchema,
  type CanonicalEvidenceBundle,
  type FindingCandidate,
  type ReviewResult,
} from "@certscore/contracts";
import { reviewEvidenceBundle } from "@certscore/review-engine";
import {
  DEFAULT_MAX_DISPLAY_SAFE_EXCERPT_GROUPS_PER_ROW,
  DEFAULT_MAX_DISPLAY_SAFE_EXCERPTS_PER_ROW,
  projectReviewResultToV2ReportDraft,
  type V2ReportProjectionDraft,
} from "./index";
import { projectionSanitizationWarnings } from "./cli/sanitization";

test("runtime evidence projects observed rows with display-safe excerpts", async () => {
  const projection = await projectionForFixture("ga-collection");
  const row = requiredRow(projection, "pre_consent_tracking_detected");

  assert.equal(row.status, "observed");
  assert.ok(row.evidencePacket.displaySafeExcerpts.length > 0);
  assert.equal(
    row.evidencePacket.displaySafeExcerptStats.maxPerRow,
    DEFAULT_MAX_DISPLAY_SAFE_EXCERPTS_PER_ROW,
  );
  assert.equal(row.evidencePacket.redactionPolicy, "display_safe_excerpts_only");
  assert.match(JSON.stringify(row.evidencePacket.displaySafeExcerpts), /displayValueRedacted/);
});

test("projection excludes raw runtime event containers and raw query values", async () => {
  const projection = await projectionForFixture("ga-collection");
  const serialized = JSON.stringify(projection);

  assert.doesNotMatch(serialized, /networkEvents/);
  assert.doesNotMatch(serialized, /cookieEvents/);
  assert.doesNotMatch(serialized, /runtimeTimeline/);
  assert.doesNotMatch(serialized, /requestBody/);
  assert.doesNotMatch(serialized, /bodySizeBytes/);
  assert.doesNotMatch(serialized, /G-TEST/);
  assert.match(serialized, /tid=%3Credacted%3E/);
});

test("missing policy and consent modules project as coverage limitations", async () => {
  const projection = await projectionForFixture("ga-collection");

  assert.equal(
    requiredRow(projection, "privacy_notice_observed_or_not_observed").status,
    "coverage_limitation",
  );
  assert.equal(
    requiredRow(projection, "reject_control_observed_or_not_observed").status,
    "coverage_limitation",
  );
  assert.ok(
    requiredRow(
      projection,
      "privacy_notice_observed_or_not_observed",
    ).coverageLimitations.some((limitation) => limitation.limitationKey === "policy_surface_not_run"),
  );
  assert.ok(
    requiredRow(
      projection,
      "reject_control_observed_or_not_observed",
    ).coverageLimitations.some((limitation) => limitation.limitationKey === "consent_flow_not_run"),
  );
});

test("consent-flow deltas remain review signals and never gap observed", async () => {
  const projection = await projectionForFixture("consent-flow-persistence");

  assert.equal(
    requiredRow(projection, "tracking_after_refusal_review_signal").status,
    "review_signal",
  );
  assert.equal(
    requiredRow(projection, "reject_did_not_reduce_tracking_review_signal").status,
    "review_signal",
  );
  assertNoGapObserved(projection);
});

test("unresolved endpoints remain review signals without named vendor conclusions", async () => {
  const projection = await projectionForFixture("ptvpixel-unresolved");
  const row = requiredRow(projection, "unresolved_collection_endpoint_review_signal");

  assert.equal(row.status, "review_signal");
  assert.deepEqual(row.relatedVendors, []);
  assertNoGapObserved(projection);
});

test("policy/runtime alignment is review-only and never gap observed", () => {
  const projection = projectReviewResultToV2ReportDraft({
    review: reviewWithCandidates([
      candidate({
        findingKey: "policy_runtime_vendor_alignment_review_signal",
        title: "Policy/runtime vendor alignment review signal",
        matchedCriteria: ["runtime_vendor_without_policy_mention"],
        sourceEvidenceRefs: [{ refId: "ref_policy_alignment", eventId: "policy_surface_1" }],
        evidenceExcerptIds: ["excerpt_policy_alignment"],
      }),
    ]),
  });

  assert.equal(
    requiredRow(projection, "policy_runtime_vendor_alignment_review_signal").status,
    "review_signal",
  );
  assertNoGapObserved(projection);
});

test("Nano-assisted unverified candidates are not promoted to observed", () => {
  const projection = projectReviewResultToV2ReportDraft({
    review: reviewWithCandidates([
      candidate({
        findingKey: "privacy_choices_link_observed",
        title: "Privacy choices link observed",
        matchedCriteria: ["nano_assisted_link_classification"],
        sourceEvidenceRefs: [],
        evidenceExcerptIds: [],
      }),
    ]),
  });

  assert.equal(requiredRow(projection, "privacy_choices_link_observed").status, "not_observed");
  assertNoGapObserved(projection);
});

test("module limitations are preserved in projection and WC01 draft rows", async () => {
  const bundle = await readFixture("policy-surface-positive");
  const bundleWithPartialPolicy: CanonicalEvidenceBundle = {
    ...bundle,
    modulesRun: bundle.modulesRun.map((moduleRun) =>
      moduleRun.moduleName === "policySurfaceScanner"
        ? { ...moduleRun, status: "partial", errors: ["fixture partial"] }
        : moduleRun,
    ),
  };
  const review = await reviewEvidenceBundle(bundleWithPartialPolicy);
  const projection = projectReviewResultToV2ReportDraft({
    review,
    bundle: bundleWithPartialPolicy,
  });
  const row = requiredRow(projection, "privacy_notice_observed_or_not_observed");
  const wc01Row = projection.wc01CompatibleRows.find((item) =>
    item.sourceFindingKey === "privacy_notice_observed_or_not_observed",
  );

  assert.equal(row.status, "coverage_limitation");
  assert.ok(row.coverageLimitations.some((limitation) =>
    limitation.limitationKey === "module_partial:policySurfaceScanner",
  ));
  assert.equal(wc01Row?.assessmentStatus, "coverage_limitation");
});

test("high-volume row excerpts are retained as bounded representative groups without changing evidence ids", () => {
  const evidenceExcerptIds = Array.from({ length: 120 }, (_, index) => `excerpt_${index}`);
  const projection = projectReviewResultToV2ReportDraft({
    review: {
      ...reviewWithCandidates([
        candidate({
          findingKey: "pre_consent_tracking_detected",
          title: "Pre-consent tracking detected",
          sourceEvidenceRefs: evidenceExcerptIds.map((excerptId) => ({ refId: `ref_${excerptId}`, eventId: excerptId })),
          evidenceExcerptIds,
        }),
      ]),
      evidenceExcerpts: evidenceExcerptIds.map((excerptId, index) => ({
        excerptId,
        sourceEventId: excerptId,
        sourceEventType: "network_request",
        sourceScanner: index % 2 === 0 ? "pre_consent_runtime" : "consent_flow_runtime",
        scenario: `scenario_${index}`,
        consentStateAtTime: index % 3 === 0 ? "pre_consent" : "post_accept",
        pagePhase: "initial_navigation",
        observedAtMs: index,
        evidenceKind: "network_request",
        displayLabel: "Collection endpoint request",
        displayValueRedacted: `collector${index}.example.test/collect`,
        hostname: "collector.example.test",
        path: `/collect/${index}`,
        queryParamNames: ["cid"],
        cookieNames: [],
        headerNames: [],
        vendorRef: `vendor_${index}`,
        artifactRefs: [],
        sensitivity: "redacted",
        redactionReason: "query values omitted",
        confidence: 0.9,
        directVsInferred: "direct",
      })),
    },
  });
  const row = requiredRow(projection, "pre_consent_tracking_detected");

  assert.equal(row.evidenceExcerptIds.length, 120);
  assert.ok(row.evidencePacket.displaySafeExcerpts.length <= DEFAULT_MAX_DISPLAY_SAFE_EXCERPTS_PER_ROW);
  assert.equal(row.evidencePacket.displaySafeExcerpts.length, DEFAULT_MAX_DISPLAY_SAFE_EXCERPTS_PER_ROW);
  assert.equal(row.evidencePacket.sourceEvidenceRefs.length, DEFAULT_MAX_DISPLAY_SAFE_EXCERPTS_PER_ROW);
  assert.equal(row.evidencePacket.displaySafeExcerptStats.originalCount, 120);
  assert.ok(row.evidencePacket.displaySafeExcerptStats.omittedCount > 0);
  assert.equal(row.evidencePacket.displaySafeExcerptStats.capped, true);
  assert.equal(
    row.evidencePacket.displaySafeExcerptStats.representativeGroupKeys.length,
    DEFAULT_MAX_DISPLAY_SAFE_EXCERPT_GROUPS_PER_ROW,
  );
});

test("representative excerpt retention applies deterministic per-group caps", () => {
  const evidenceExcerptIds = Array.from({ length: 10 }, (_, index) => `excerpt_${index}`);
  const projection = projectReviewResultToV2ReportDraft({
    maxDisplaySafeExcerptGroupsPerRow: 2,
    maxDisplaySafeExcerptsPerGroup: 2,
    maxDisplaySafeExcerptsPerRow: 3,
    review: {
      ...reviewWithCandidates([
        candidate({
          findingKey: "pre_consent_tracking_detected",
          title: "Pre-consent tracking detected",
          sourceEvidenceRefs: evidenceExcerptIds.map((excerptId) => ({ refId: `ref_${excerptId}`, eventId: excerptId })),
          evidenceExcerptIds,
        }),
      ]),
      evidenceExcerpts: evidenceExcerptIds.map((excerptId, index) => ({
        excerptId,
        sourceEventId: excerptId,
        sourceEventType: "network_request",
        sourceScanner: "pre_consent_runtime",
        scenario: "fresh_pre_consent",
        consentStateAtTime: "pre_consent",
        pagePhase: "initial_navigation",
        observedAtMs: index,
        evidenceKind: "network_request",
        displayLabel: "Collection endpoint request",
        displayValueRedacted: `collector.example.test/collect/${index}`,
        hostname: index < 5 ? "collector-a.example.test" : "collector-b.example.test",
        path: index < 5 ? "/collect/a" : "/collect/b",
        queryParamNames: ["cid"],
        cookieNames: [],
        headerNames: [],
        vendorRef: index < 5 ? "vendor_a" : "vendor_b",
        artifactRefs: [],
        sensitivity: "redacted",
        redactionReason: "query values omitted",
        confidence: 0.9,
        directVsInferred: "direct",
      })),
    },
  });
  const row = requiredRow(projection, "pre_consent_tracking_detected");

  assert.deepEqual(
    row.evidencePacket.displaySafeExcerpts.map((excerpt) => excerpt.excerptId),
    ["excerpt_0", "excerpt_1", "excerpt_5"],
  );
  assert.equal(row.evidencePacket.sourceEvidenceRefs.length, 3);
  assert.equal(row.evidencePacket.displaySafeExcerptStats.projectedCount, 3);
  assert.equal(row.evidencePacket.displaySafeExcerptStats.deduped, true);
});

test("sanitizer allows known internal diagnostic reason keys only in internal reason fields", async () => {
  const projection = await projectionForFixture("ga-collection");
  const internalReason = "first_party_cookie_not_third_party_cookie_finding";
  projection.rows[0]?.demotionReasons.push(internalReason);
  projection.wc01CompatibleRows[0]?.retainedEvidence.demotionReasons.push(internalReason);

  assert.deepEqual(
    projectionSanitizationWarnings(projection).filter((warning) =>
      warning === "contains_long_opaque_value_without_redaction_context",
    ),
    [],
  );
});

test("sanitizer still flags long opaque values in display excerpts", async () => {
  const projection = await projectionForFixture("ga-collection");
  const row = requiredRow(projection, "pre_consent_tracking_detected");
  row.evidencePacket.displaySafeExcerpts[0] = {
    ...row.evidencePacket.displaySafeExcerpts[0]!,
    displayValueRedacted: "AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz112233",
  };

  assert.ok(
    projectionSanitizationWarnings(projection).includes("contains_long_opaque_value_without_redaction_context"),
  );
});

test("sanitizer still flags long opaque values in source evidence refs", async () => {
  const projection = await projectionForFixture("ga-collection");
  const row = requiredRow(projection, "pre_consent_tracking_detected");
  row.sourceEvidenceRefs.push({
    refId: "ref_AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz112233",
    eventId: "event_fixture",
  });

  assert.ok(
    projectionSanitizationWarnings(projection).includes("contains_long_opaque_value_without_redaction_context"),
  );
});

test("sanitizer still flags bare long asset values in displayable source-ref URL fields", async () => {
  const projection = await projectionForFixture("ga-collection");
  const row = requiredRow(projection, "pre_consent_tracking_detected");
  row.sourceEvidenceRefs.push({
    refId: "ref_asset_url",
    eventId: "event_fixture",
    url: "https://www.ikea.com/global/en/media/CF_Milan_FY_26_some_roomsets_4_5_living_wide_44caf52d5e.jpg?f=%3Credacted%3E",
  });

  assert.ok(
    projectionSanitizationWarnings(projection).includes("contains_long_opaque_value_without_redaction_context"),
  );
});

test("sanitizer still flags long opaque query parameter names before source-ref normalization", async () => {
  const projection = await projectionForFixture("ga-collection");
  const row = requiredRow(projection, "pre_consent_tracking_detected");
  row.sourceEvidenceRefs.push({
    refId: "ref_greenhouse_sync",
    eventId: "event_greenhouse_sync",
    url: "https://ecf.d41.co/sync/3?6b44172d18624c55a4d068276cff6e94-08c07ec89cef45d29b9dc337a94179ca-1-1515-paapi100=%3Credacted%3E&RampID=%3Credacted%3E",
  });

  assert.ok(
    projectionSanitizationWarnings(projection).includes("contains_long_opaque_value_without_redaction_context"),
  );
});

test("projection redacts long source-ref path tokens without losing traceability", () => {
  const projection = projectReviewResultToV2ReportDraft({
    review: reviewWithCandidates([
      candidate({
        findingKey: "vendors_appear_only_after_accept_review_signal",
        title: "Vendors appear only after accept review signal",
        sourceEvidenceRefs: [
          {
            refId: "ref_ikea_asset",
            eventId: "event_ikea_asset",
            url: "https://www.ikea.com/global/en/media/CF_Milan_FY_26_some_roomsets_4_5_living_wide_44caf52d5e.jpg?f=webp",
          },
          {
            refId: "ref_airbnb_api",
            eventId: "event_airbnb_api",
            url: "https://www.airbnb.com/api/v3/NaviServerAnnouncementsQuery/3e5e283823527d579dec0734123cbf1ab34564dbd77cfd848b87b2375258ad32?currency=USD&variables=raw",
          },
          {
            refId: "ref_greenhouse_sync",
            eventId: "event_greenhouse_sync",
            url: "https://ecf.d41.co/sync/3?6b44172d18624c55a4d068276cff6e94-08c07ec89cef45d29b9dc337a94179ca-1-1515-paapi100=raw&RampID=raw",
          },
        ],
        evidenceExcerptIds: ["excerpt_policy_alignment"],
      }),
    ]),
  });
  const row = requiredRow(projection, "vendors_appear_only_after_accept_review_signal");

  assert.equal(row.sourceEvidenceRefs[0]?.refId, "ref_ikea_asset");
  assert.equal(row.sourceEvidenceRefs[1]?.refId, "ref_airbnb_api");
  assert.equal(row.sourceEvidenceRefs[2]?.refId, "ref_greenhouse_sync");
  assert.match(row.sourceEvidenceRefs[0]?.url ?? "", /%3Credacted%3E\.jpg/);
  assert.match(row.sourceEvidenceRefs[1]?.url ?? "", /NaviServerAnnouncementsQuery\/%3Credacted%3E/);
  assert.match(row.sourceEvidenceRefs[1]?.url ?? "", /currency=%3Credacted%3E/);
  assert.match(row.sourceEvidenceRefs[2]?.url ?? "", /redacted_param=%3Credacted%3E/);
  assert.match(row.sourceEvidenceRefs[2]?.url ?? "", /RampID=%3Credacted%3E/);
  assert.doesNotMatch(
    row.sourceEvidenceRefs[2]?.url ?? "",
    /6b44172d18624c55a4d068276cff6e94-08c07ec89cef45d29b9dc337a94179ca/,
  );
  assert.equal(row.evidenceExcerptIds[0], "excerpt_policy_alignment");
  assert.equal(row.evidencePacket.displaySafeExcerpts.length, 1);
  assert.equal(projectionSanitizationWarnings(projection).includes("contains_long_opaque_value_without_redaction_context"), false);
});

test("sanitizer does not exempt cookie-looking internal tokens just because they use underscores", async () => {
  const projection = await projectionForFixture("ga-collection");
  projection.rows[0]?.demotionReasons.push(
    "cookie_value_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  );

  assert.ok(
    projectionSanitizationWarnings(projection).includes("contains_long_opaque_value_without_redaction_context"),
  );
});

async function projectionForFixture(name: string) {
  const bundle = await readFixture(name);
  const review = await reviewEvidenceBundle(bundle);
  return projectReviewResultToV2ReportDraft({ review, bundle });
}

async function readFixture(name: string): Promise<CanonicalEvidenceBundle> {
  const raw = await readFile(
    path.resolve(
      process.cwd(),
      "../certscore-contracts/fixtures/saved-bundles",
      `${name}.json`,
    ),
    "utf8",
  );
  return canonicalEvidenceBundleSchema.parse(JSON.parse(raw));
}

function requiredRow(projection: V2ReportProjectionDraft, findingKey: string) {
  const row = projection.rows.find((item) => item.findingKey === findingKey);
  assert.ok(row, `Expected row for ${findingKey}`);
  return row;
}

function assertNoGapObserved(projection: V2ReportProjectionDraft) {
  assert.doesNotMatch(JSON.stringify(projection), /gap_observed/);
}

function reviewWithCandidates(candidates: FindingCandidate[]): ReviewResult {
  return {
    reviewId: "review_test",
    scanId: "scan_test",
    url: "https://example.test",
    reviewedAt: "2026-06-08T00:00:00.000Z",
    schemaVersion: "certscore.v2.alpha.1",
    sourceBundleSchemaVersion: "certscore.v2.alpha.1",
    sourceModulesPresent: ["policySurfaceScanner", "preConsentRuntimeScanner"],
    findingCandidates: candidates,
    evidenceExcerpts: [
      {
        excerptId: "excerpt_policy_alignment",
        sourceEventId: "policy_surface_1",
        sourceEventType: "policy_surface_placeholder",
        sourceScanner: "policy_surface",
        scenario: "policy_surface_review",
        consentStateAtTime: "not_applicable",
        pagePhase: "network_idle",
        observedAtMs: 1,
        evidenceKind: "policy_surface_placeholder",
        displayLabel: "Policy/runtime alignment excerpt",
        displayValueRedacted: "Runtime vendor observed; policy excerpt did not include a matching vendor mention.",
        queryParamNames: [],
        cookieNames: [],
        headerNames: [],
        artifactRefs: [],
        sensitivity: "safe",
        confidence: 0.82,
        directVsInferred: "mixed",
      },
    ],
    coverageLimitations: [],
  };
}

function candidate(input: Partial<FindingCandidate> & Pick<FindingCandidate, "findingKey" | "title">): FindingCandidate {
  return {
    findingKey: input.findingKey,
    title: input.title,
    eligibility: input.eligibility ?? { status: "eligible", reasons: ["fixture"] },
    matchedCriteria: input.matchedCriteria ?? ["fixture_observed"],
    missingCorroborators: input.missingCorroborators ?? [],
    demotionReasons: input.demotionReasons ?? [],
    confidence: input.confidence ?? 0.88,
    directVsInferred: input.directVsInferred ?? "direct",
    sourceEvidenceRefs: input.sourceEvidenceRefs ?? [{ refId: "ref_fixture" }],
    evidenceExcerptIds: input.evidenceExcerptIds ?? [],
    relatedVendors: input.relatedVendors ?? [],
    sourceModulesRequired: input.sourceModulesRequired ?? ["policySurfaceScanner"],
    sourceModulesPresent: input.sourceModulesPresent ?? ["policySurfaceScanner"],
    coverageLimitations: input.coverageLimitations ?? [],
  };
}

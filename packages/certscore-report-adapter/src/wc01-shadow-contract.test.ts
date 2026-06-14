import assert from "node:assert/strict";
import test from "node:test";
import type { DisplaySafeEvidenceExcerpt } from "@certscore/contracts";
import {
  wc01ShadowDisplaySafeExcerptFixture,
  wc01ShadowProjectionFixture,
  wc01ShadowRowFixture,
  wc01ShadowVendorFixture,
} from "./fixtures/wc01-shadow-fixtures";
import {
  projectV2ToWc01ShadowProjection,
  type Wc01V2ShadowProjection,
} from "./wc01-shadow-contract";
import type { V2ProjectionStatus } from "./index";

test("shadow projection is never production eligible and never top/gap eligible", () => {
  const shadow = projectV2ToWc01ShadowProjection(wc01ShadowProjectionFixture([
    wc01ShadowRowFixture({ findingKey: "pre_consent_tracking_detected", status: "observed" }),
    wc01ShadowRowFixture({ findingKey: "third_party_vendors_observed", status: "checked" }),
  ]));

  assert.equal(shadow.productionEligible, false);
  assert.equal(shadow.rows.every((item) => item.topFindingEligible === false), true);
  assert.equal(shadow.rows.every((item) => item.gapEligible === false), true);
  assertNoGapObserved(shadow);
});

test("observed v2 rows remain internal non-gap diagnostic rows", () => {
  const shadow = projectV2ToWc01ShadowProjection(wc01ShadowProjectionFixture([
    wc01ShadowRowFixture({
      findingKey: "third_party_vendors_observed",
      status: "observed",
      relatedVendors: [wc01ShadowVendorFixture({ purpose: "advertising", vendor: "Example Ads" })],
    }),
  ]));
  const projected = requiredShadowRow(shadow, "third_party_vendors_observed");

  assert.equal(projected.status, "observed");
  assert.equal(projected.wc01AssessmentStatus, "checked");
  assert.equal(projected.gapEligible, false);
  assert.equal(projected.topFindingEligible, false);
  assertNoGapObserved(shadow);
});

test("unresolved endpoint rows remain review-only", () => {
  const shadow = projectV2ToWc01ShadowProjection(wc01ShadowProjectionFixture([
    wc01ShadowRowFixture({
      findingKey: "unresolved_collection_endpoint_review_signal",
      status: "observed",
      category: "runtime",
    }),
  ]));
  const projected = requiredShadowRow(shadow, "unresolved_collection_endpoint_review_signal");

  assert.equal(projected.status, "review_signal");
  assert.equal(projected.wc01AssessmentStatus, "review_signal");
  assert.ok(projected.policy.reviewOnlyReasons.includes("review_only_finding_key"));
});

test("policy/runtime alignment rows remain review-only", () => {
  const shadow = projectV2ToWc01ShadowProjection(wc01ShadowProjectionFixture([
    wc01ShadowRowFixture({
      findingKey: "policy_runtime_vendor_alignment_review_signal",
      status: "observed",
      category: "policy_surface",
    }),
  ]));
  const projected = requiredShadowRow(shadow, "policy_runtime_vendor_alignment_review_signal");

  assert.equal(projected.status, "review_signal");
  assert.equal(projected.wc01AssessmentStatus, "review_signal");
  assertNoGapObserved(shadow);
});

test("consent-flow delta and persistence rows remain review-only or limited", () => {
  const shadow = projectV2ToWc01ShadowProjection(wc01ShadowProjectionFixture([
    wc01ShadowRowFixture({
      findingKey: "accept_reject_runtime_delta_observed",
      status: "observed",
      category: "consent_flow",
    }),
    wc01ShadowRowFixture({
      findingKey: "vendors_persist_after_reject_review_signal",
      status: "coverage_limitation",
      category: "consent_flow",
      coverageLimitations: [{
        limitationKey: "consent_flow_partial",
        description: "Consent flow scanner finished partial.",
        affectedFindingKeys: ["vendors_persist_after_reject_review_signal"],
        sourceModulesRequired: ["consentFlowScanner"],
        sourceModulesPresent: [],
      }],
    }),
  ]));

  assert.equal(requiredShadowRow(shadow, "accept_reject_runtime_delta_observed").status, "review_signal");
  assert.equal(requiredShadowRow(shadow, "vendors_persist_after_reject_review_signal").status, "coverage_limitation");
  assertNoGapObserved(shadow);
});

test("failed, missing, skipped, partial, and not-testable modules fail closed", () => {
  const shadow = projectV2ToWc01ShadowProjection(wc01ShadowProjectionFixture([
    wc01ShadowRowFixture({
      findingKey: "privacy_notice_observed_or_not_observed",
      status: "observed",
      category: "policy_surface",
      sourceModulesRequired: ["policySurfaceScanner"],
      sourceModulesPresent: [],
    }),
    wc01ShadowRowFixture({
      findingKey: "cookie_policy_observed_or_not_observed",
      status: "observed",
      category: "policy_surface",
      sourceModulesRequired: ["policySurfaceScanner"],
      sourceModulesPresent: ["policySurfaceScanner"],
      moduleRunStatus: "partial",
    }),
    wc01ShadowRowFixture({
      findingKey: "reject_control_observed_or_not_observed",
      status: "not_testable",
      category: "consent_flow",
      sourceModulesRequired: ["consentFlowScanner"],
      sourceModulesPresent: ["consentFlowScanner"],
      moduleRunStatus: "failed",
    }),
  ]));

  assert.equal(requiredShadowRow(shadow, "privacy_notice_observed_or_not_observed").status, "coverage_limitation");
  assert.equal(requiredShadowRow(shadow, "cookie_policy_observed_or_not_observed").status, "coverage_limitation");
  assert.equal(requiredShadowRow(shadow, "reject_control_observed_or_not_observed").status, "not_testable");
  assert.equal(
    requiredShadowRow(shadow, "privacy_notice_observed_or_not_observed").policy.reviewOnlyReasons.includes(
      "source_module_missing_or_incomplete",
    ),
    true,
  );
});

test("security, performance, support, infrastructure, CDN, RUM, and live-chat vendors stay diagnostic", () => {
  const shadow = projectV2ToWc01ShadowProjection(wc01ShadowProjectionFixture([
    wc01ShadowRowFixture({
      findingKey: "third_party_vendors_observed",
      status: "observed",
      relatedVendors: [
        wc01ShadowVendorFixture({ purpose: "security", vendor: "HUMAN Security", basis: ["bot-defense"] }),
        wc01ShadowVendorFixture({ purpose: "performance_monitoring", vendor: "Akamai mPulse", basis: ["RUM"] }),
        wc01ShadowVendorFixture({ purpose: "customer_support", vendor: "Sprinklr", basis: ["live-chat"] }),
        wc01ShadowVendorFixture({ purpose: "infrastructure", vendor: "Example CDN", basis: ["cdn_static_asset"] }),
      ],
    }),
  ]));
  const projected = requiredShadowRow(shadow, "third_party_vendors_observed");

  assert.equal(projected.gapEligible, false);
  assert.equal(projected.topFindingEligible, false);
  assert.equal(projected.policy.reviewOnlyReasons.includes("non_tracker_purpose_diagnostic_only"), true);
  assert.equal(
    projected.vendors.every((item) => item.basis.includes("diagnostic_non_tracker_purpose_only")),
    true,
  );
  assert.equal(projected.vendors.every((item) => item.regulatoryRelevance.length === 0), true);
});

test("display-safe excerpts are preserved narrowly and raw evidence fields are not surfaced", () => {
  const unsafeExcerpt = {
    ...wc01ShadowDisplaySafeExcerptFixture({
      displayValueRedacted:
        "https://collector.example/collect?gclid=CLICK123&token=AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz112233",
    }),
    requestBody: "should not surface",
    responseBody: "should not surface",
    cookieValue: "should not surface",
    setCookieHeaders: ["should not surface"],
    fullDomText: "should not surface",
    rawNanoReasoning: "should not surface",
  } as DisplaySafeEvidenceExcerpt & Record<string, unknown>;
  const shadow = projectV2ToWc01ShadowProjection(wc01ShadowProjectionFixture([
    wc01ShadowRowFixture({
      findingKey: "pre_consent_tracking_detected",
      status: "observed",
      displaySafeExcerpts: [unsafeExcerpt],
      sourceEvidenceRefs: [{
        refId: "ref_network",
        eventId: "event_fixture",
        url: "https://collector.example/collect?gclid=CLICK123&cid=raw",
      }],
    }),
  ]));
  const serialized = JSON.stringify(shadow);
  const projected = requiredShadowRow(shadow, "pre_consent_tracking_detected");

  assert.deepEqual(projected.evidence.excerptIds, ["excerpt_fixture"]);
  assert.equal(projected.evidence.sourceRefIds[0], "ref_network");
  assert.match(projected.evidence.displaySafeExcerpts[0]?.displayValueRedacted ?? "", /gclid=<redacted>/);
  assert.doesNotMatch(serialized, /CLICK123/);
  assert.doesNotMatch(serialized, /AaBbCcDdEeFf/);
  assert.doesNotMatch(serialized, /requestBody|responseBody|cookieValue|setCookieHeaders|fullDomText|rawNanoReasoning/);
  assert.doesNotMatch(serialized, /cid=raw/);
});

test("shadow evidence ids stay coherent with retained display-safe excerpts", () => {
  const retainedExcerpt = wc01ShadowDisplaySafeExcerptFixture({
    excerptId: "excerpt_retained",
    sourceEventId: "net_retained",
    displayValueRedacted: "collector.example.test/collect",
  });
  const shadow = projectV2ToWc01ShadowProjection(wc01ShadowProjectionFixture([
    wc01ShadowRowFixture({
      findingKey: "pre_consent_tracking_detected",
      status: "observed",
      displaySafeExcerpts: [retainedExcerpt],
      evidenceExcerptIds: ["excerpt_retained", "excerpt_unbacked"],
      sourceEvidenceRefs: [
        {
          refId: "ref_net_retained",
          eventId: "net_retained",
          url: "https://collector.example.test/collect",
        },
        {
          refId: "ref_net_unbacked",
          eventId: "net_unbacked",
          url: "https://unbacked.example.test/collect",
        },
      ],
    }),
  ]));
  const projected = requiredShadowRow(shadow, "pre_consent_tracking_detected");

  assert.deepEqual(projected.evidence.excerptIds, ["excerpt_retained"]);
  assert.deepEqual(projected.evidence.sourceRefIds, ["ref_net_retained"]);
  assert.equal(projected.evidence.displaySafeExcerpts.length, 1);
  assertNoGapObserved(shadow);
});

test("sanitizer warnings are carried through without blocking shadow projection", () => {
  const shadow = projectV2ToWc01ShadowProjection(wc01ShadowProjectionFixture([
    wc01ShadowRowFixture({
      findingKey: "pre_consent_tracking_detected",
      status: "observed",
      sourceEvidenceRefs: [{
        refId: "ref_AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz112233",
      }],
    }),
  ]));

  assert.ok(shadow.sanitizerWarnings.includes("contains_long_opaque_value_without_redaction_context"));
  assert.equal(shadow.productionEligible, false);
  assertNoGapObserved(shadow);
});

test("unsupported statuses fail closed to coverage limitation", () => {
  const shadow = projectV2ToWc01ShadowProjection(wc01ShadowProjectionFixture([
    wc01ShadowRowFixture({
      findingKey: "unsupported_status_fixture",
      status: "gap_observed" as V2ProjectionStatus,
    }),
  ]));
  const projected = requiredShadowRow(shadow, "unsupported_status_fixture");

  assert.equal(projected.status, "coverage_limitation");
  assert.equal(projected.wc01AssessmentStatus, "coverage_limitation");
  assertNoGapObserved(shadow);
});

test("legal-conclusion and raw-field language is withheld from diagnostic strings", () => {
  const shadow = projectV2ToWc01ShadowProjection(wc01ShadowProjectionFixture([
    wc01ShadowRowFixture({
      findingKey: "policy_runtime_vendor_alignment_review_signal",
      status: "review_signal",
      title: "This is not emitted as a violation title",
      matchedCriteria: ["vendor violates policy", "requestBody present"],
      missingCorroborators: ["non-compliant disclosure"],
      demotionReasons: ["rawCookie evidence unavailable"],
      coverageLimitations: [{
        limitationKey: "fixture_limitation",
        description: "Scanner cannot say this violates anything.",
        affectedFindingKeys: ["policy_runtime_vendor_alignment_review_signal"],
        sourceModulesRequired: ["policySurfaceScanner"],
        sourceModulesPresent: [],
      }],
    }),
  ]));
  const serialized = JSON.stringify(shadow);
  const projected = requiredShadowRow(shadow, "policy_runtime_vendor_alignment_review_signal");

  assert.equal(projected.policy.reviewOnlyReasons.includes("unsafe_legal_conclusion_language_withheld"), true);
  assert.equal(projected.policy.reviewOnlyReasons.includes("unsafe_raw_field_withheld"), true);
  assert.doesNotMatch(serialized, /\bviolation|violates|non-compliant|requestBody|rawCookie\b/i);
});

function requiredShadowRow(
  projection: Wc01V2ShadowProjection,
  sourceFindingKey: string,
) {
  const row = projection.rows.find((item) => item.sourceFindingKey === sourceFindingKey);
  assert.ok(row, `Expected shadow row for ${sourceFindingKey}`);
  return row;
}

function assertNoGapObserved(value: unknown) {
  assert.doesNotMatch(JSON.stringify(value), /gap_observed/);
}

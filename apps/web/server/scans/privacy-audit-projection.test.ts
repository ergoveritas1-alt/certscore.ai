import assert from "node:assert/strict";
import test from "node:test";
import type { CanonicalEvidenceBundle } from "@certscore/contracts";
import { privacyAuditEvidenceSchema } from "@certscore/api-contracts";
import { readPrivacyAuditEvidence, resolveReportReviewFocus, reviewFocusScopeNote, reportUrlWithFocus } from "../../lib/scans/report-review-focus";
import { projectPrivacyAuditEvidence } from "./privacy-audit-projection";

const url = "https://example.test/";
const source = { verificationStatus: "verified", sha256: "a".repeat(64) };
function bundle(surfaces: Array<Record<string, unknown>> = [], overrides: Record<string, unknown> = {}) {
  return { scanId: "scan-fixture", completedAt: "2026-09-25T12:00:00.000Z", policySurfaceObservations: surfaces,
    domSnapshots: [{ url, documentIdentity: { source: "cdp_loader_id", token: "document-1" } }],
    ...overrides } as unknown as CanonicalEvidenceBundle;
}
function surface(overrides: Record<string, unknown> = {}) {
  return { observationId: "dns", surfaceType: "do_not_sell_or_share", url: `${url}choices`,
    linkText: "Do Not Sell or Share My Personal Information", linkObservationState: "observed",
    directlyLinkedFromScannedPage: true, discoveryMethod: "footer_link", documentFetchState: "not_attempted", ...overrides };
}

test("only verified retained bundles produce a score-neutral privacy workpaper", () => {
  assert.equal(projectPrivacyAuditEvidence(bundle(), { ...source, verificationStatus: "unverified" }, url), null);
  assert.equal(projectPrivacyAuditEvidence(bundle(), { ...source, sha256: "bad" }, url), null);
  const result = projectPrivacyAuditEvidence(bundle(), source, url)!;
  assert.equal(result.scoreEffect, "none");
  assert.equal(result.negativeControlCoverage, "not_verified");
  assert.equal(result.collectionPointNoticeAssessment, "not_assessed");
  assert.deepEqual(result.controls, []);
  assert.equal(readPrivacyAuditEvidence({ privacyAuditEvidence: result }, "different-scan"), null);
  assert.equal(readPrivacyAuditEvidence({ privacyAuditEvidence: { ...result, documentUrl: "invalid" } }, result.scanId), null);
  assert.ok(privacyAuditEvidenceSchema.safeParse(result).success);
});

test("DNS, privacy choices and cookie settings remain distinct; rights and guessed paths do not prove controls", () => {
  const result = projectPrivacyAuditEvidence(bundle([
    surface(), surface({ observationId: "choices", linkText: "Your California Privacy Choices" }),
    surface({ observationId: "cookies", linkText: "Cookie Settings" }),
    surface({ observationId: "rights", linkText: "Exercise your privacy rights" }),
    surface({ observationId: "guessed", discoveryMethod: "common_path" }),
    surface({ observationId: "nested", traversalDepth: 1, parentObservationId: "privacy" }),
    surface({ observationId: "mention", linkObservationState: "unknown" }),
  ]), source, url)!;
  assert.deepEqual(result.controls.map(row => row.kind), ["do_not_sell_or_share", "your_privacy_choices", "cookie_settings"]);
  assert.ok(result.controls.every(row => row.interaction === "not_tested"));
});

test("dynamic controls require visible geometry and same-document retained proof", () => {
  const observation = { documentUrl: url, documentIdentity: { source: "cdp_loader_id", token: "document-1" }, captureStatus: "observed",
    controls: [{ label: "Your Privacy Choices", visible: true, visibilityEvidence: "box_model_verified", artifactRef: "consent-control:1" }] };
  const project = (overrides: Record<string, unknown> = {}) => projectPrivacyAuditEvidence(bundle([], { consentUiObservations: [{ ...observation, ...overrides }] }), source, url)!;
  assert.equal(project().controls[0]?.destinationUrl, null);
  for (const overrides of [{ documentUrl: `${url}other` }, { documentIdentity: { token: "stale" } }, { captureStatus: "incomplete" }, { inventoryOutcome: "document_mismatch" },
    { controls: [{ ...observation.controls[0], visible: false }] }, { controls: [{ ...observation.controls[0], visibilityEvidence: "unknown" }] }]) {
    assert.equal(project(overrides).controls.length, 0);
  }
});

test("notice excerpts need usable target-owned text; partial text cannot claim complete coverage", () => {
  const text = "We share personal information for advertising. You have the right to delete your information. We retain records for two years. Opt out using our privacy choices.";
  const notice = surface({ surfaceType: "california_notice", linkText: "California Privacy Notice", status: "fetched",
    documentEvaluationState: "usable", documentRole: "policy_document", targetRelationship: "target_controller", textExcerpt: text,
    contentCoverage: { status: "complete", sourceTextChars: text.length + 100 } });
  const project = (overrides: Record<string, unknown> = {}) => projectPrivacyAuditEvidence(bundle([{ ...notice, ...overrides }]), source, url)!;
  assert.equal(project().notices[0]?.coverage, "partial");
  assert.ok(project().notices[0]?.passages.some(passage => passage.topic === "sale_sharing"));
  assert.equal(project({ contentCoverage: { status: "complete", sourceTextChars: text.length } }).notices[0]?.coverage, "complete");
  for (const overrides of [{ status: "failed" }, { documentEvaluationState: "unusable" }, { targetRelationship: "third_party" }, { textExcerpt: "" }]) assert.equal(project(overrides).notices.length, 0);
});

test("privacy projection bounds output and removes URL credentials, query values and fragments", () => {
  const result = projectPrivacyAuditEvidence(bundle(Array.from({ length: 14 }, (_, index) => surface({ observationId: `dns-${index}`, url: `${url}choices/${index}?token=secret#account` }))), source, "https://name:password@example.test/?id=secret#account")!;
  assert.equal(result.controls.length, 12);
  assert.equal(result.truncated, true);
  assert.doesNotMatch(JSON.stringify(result), /secret|password|token=/);
});

test("review focus defaults to origin, allows either view and preserves geographic scope", () => {
  assert.equal(resolveReportReviewFocus(undefined, "california"), "ccpa_cpra");
  assert.equal(resolveReportReviewFocus(undefined, "CA"), "ccpa_cpra");
  assert.match(reviewFocusScopeNote("gdpr_eprivacy", "EU-DE"), /^Observed from Germany\. Changing/);
  for (const origin of ["eu_ie", "eu_de"]) assert.equal(resolveReportReviewFocus(undefined, origin), "gdpr_eprivacy");
  assert.equal(resolveReportReviewFocus("gdpr_eprivacy", "california"), "gdpr_eprivacy");
  assert.equal(resolveReportReviewFocus("ccpa_cpra", "eu_de"), "ccpa_cpra");
  assert.match(reviewFocusScopeNote("ccpa_cpra", "eu_de"), /California visitor behavior was not tested/);
  assert.match(reviewFocusScopeNote("gdpr_eprivacy", "california"), /EU visitor behavior was not tested/);
  assert.equal(reportUrlWithFocus("/scan/123?foo=bar#evidence", "ccpa_cpra"), "/scan/123?foo=bar&reviewFocus=ccpa_cpra#evidence");
});

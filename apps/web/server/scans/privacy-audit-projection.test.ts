import assert from "node:assert/strict";
import test from "node:test";
import type { CanonicalEvidenceBundle } from "@certscore/contracts";
import { privacyAuditEvidenceSchema } from "@certscore/api-contracts";
import { readPrivacyAuditEvidence, resolveReportReviewFocus, reviewFocusScopeNote, reportUrlWithFocus } from "../../lib/scans/report-review-focus";
import { projectPrivacyAuditEvidence, projectPrivacyAuditEvidenceForMaterialization } from "./privacy-audit-projection";

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
    linkVisibility: "visible", accessibleNameSource: "text", classifierProvenance: "privacy_surface_classifier.v1",
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
    surface(), surface({ observationId: "choices", surfaceType: "your_privacy_choices", linkText: "Your California Privacy Choices" }),
    surface({ observationId: "cookies", surfaceType: "cookie_settings", linkText: "Cookie Settings" }),
    surface({ observationId: "rights", linkText: "Exercise your privacy rights" }),
    surface({ observationId: "guessed", discoveryMethod: "common_path" }),
    surface({ observationId: "nested", traversalDepth: 1, parentObservationId: "privacy" }),
    surface({ observationId: "mention", linkObservationState: "unknown" }),
  ]), source, url)!;
  assert.deepEqual(result.controls.map(row => row.kind), ["do_not_sell_or_share", "your_privacy_choices", "cookie_settings"]);
  assert.ok(result.controls.every(row => row.interaction === "not_tested"));
});

test("non-fetchable observed DNS links keep all six retained production destinations", () => {
  const destinations = [
    "https://www.pdfescape.com/ccpa/",
    "https://datatrust.coca-cola.com/us/en/notices/do-not-sell-or-share-my-personal-information",
    "https://www.geocaching.com/account/documents/donotsell",
    "https://preferences.snyk.io/dont_sell",
    "https://www.imvu.com/next/policyhub/ccpa/",
    "https://forms.progress.com/ccpa-subscription",
  ];
  const result = projectPrivacyAuditEvidence(bundle(destinations.map((destination, index) => surface({
    observationId: `dns-${index}`, url: destination, normalizedUrl: destination, fetchable: false,
    documentFetchState: "not_attempted",
  }))), source, url)!;
  assert.deepEqual(result.controls.map((control) => control.destinationUrl), destinations);
  assert.ok(result.controls.every((control) => control.retrieval === "not_attempted" && control.interaction === "not_tested"));
});

test("a visible direct privacy-choices link survives an insufficient cross-subdomain destination", () => {
  const destination = "https://privacy.example.test/main/web/main";
  const result = projectPrivacyAuditEvidence(bundle([surface({
    observationId: "privacy-choices", surfaceType: "your_privacy_choices", linkText: "Your Privacy Choices",
    url: destination, normalizedUrl: destination, linkSourcePageUrl: url,
    documentFetchState: "failed", documentEvaluationState: "insufficient",
  })]), source, url)!;
  assert.equal(result.controls.length, 1);
  assert.equal(result.controls[0]?.kind, "your_privacy_choices");
  assert.equal(result.controls[0]?.destinationUrl, destination);
  assert.equal(result.controls[0]?.retrieval, "failed");
});

test("visible named controls require typed proof; historical and hidden candidates do not gain new control claims", () => {
  const cases = [
    surface({ observationId: "hidden", linkVisibility: "hidden" }),
    surface({ observationId: "legacy", linkVisibility: undefined, accessibleNameSource: undefined }),
    surface({ observationId: "url-only", linkText: "", accessibleNameSource: "none", url: `${url}do-not-sell` }),
    surface({ observationId: "generic", linkText: "Learn more", url: `${url}do-not-sell` }),
    surface({ observationId: "other-document", linkSourcePageUrl: "https://other.test/" }),
  ];
  for (const candidate of cases) assert.deepEqual(projectPrivacyAuditEvidence(bundle([candidate]), source, url)?.controls, []);
  const icon = projectPrivacyAuditEvidence(bundle([surface({
    observationId: "icon", linkText: "Do Not Sell or Share", accessibleNameSource: "image_alt",
    url: `${url}do-not-sell`, fetchable: false,
  })]), source, url)!;
  assert.equal(icon.controls[0]?.accessibleNameSource, "image_alt");
  assert.equal(icon.controls[0]?.classificationProvenance, "privacy_surface_classifier.v1");
  assert.equal(icon.controls[0]?.destinationUrl, `${url}do-not-sell`);
  assert.equal(projectPrivacyAuditEvidence(bundle([surface({ linkSourcePageUrl: url })]), source, url)?.controls.length, 1);
  for (const raw of ["#privacy", "javascript:openChoices()", "/"]) {
    const candidate = surface({ observationId: raw, url: raw, normalizedUrl: url, fetchable: false });
    assert.equal(projectPrivacyAuditEvidence(bundle([candidate]), source, url)?.controls[0]?.destinationUrl, null);
  }
});

test("historical workpaper survives rematerialization only with the same verified scan, source and document", () => {
  const historicalBundle = bundle([surface({ linkVisibility: undefined, accessibleNameSource: undefined })]);
  const oldWorkpaper = { ...projectPrivacyAuditEvidence(bundle([surface()]), source, url)!,
    controls: [{ kind: "do_not_sell_or_share" as const, label: "Do Not Sell or Share My Personal Information",
      sourceUrl: url, destinationUrl: `${url}choices`, placement: "footer_link", evidenceRef: "policy-surface:dns",
      retrieval: "not_attempted" as const, interaction: "not_tested" as const }] };
  const materialized = projectPrivacyAuditEvidenceForMaterialization(historicalBundle, source, url, oldWorkpaper);
  assert.deepEqual(materialized, oldWorkpaper);
  for (const stale of [
    { ...oldWorkpaper, scanId: "other" }, { ...oldWorkpaper, sourceHash: "b".repeat(64) },
    { ...oldWorkpaper, documentUrl: "https://other.test/" }, { ...oldWorkpaper, capturedAt: "2026-09-24T12:00:00.000Z" },
  ]) assert.deepEqual(projectPrivacyAuditEvidenceForMaterialization(historicalBundle, source, url, stale)?.controls, []);
  assert.deepEqual(projectPrivacyAuditEvidenceForMaterialization(bundle([surface()]), source, url, oldWorkpaper)?.controls[0]?.accessibleNameSource, "text");
  assert.equal(projectPrivacyAuditEvidenceForMaterialization(historicalBundle, { ...source, verificationStatus: "unverified" }, url, oldWorkpaper), null);
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

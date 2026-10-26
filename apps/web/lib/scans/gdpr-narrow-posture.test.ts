import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { gdprNarrowPostureSchema, GDPR_NARROW_RULES, type CanonicalEvidenceBundle, type GdprNoticeOmissionReview } from "@certscore/contracts";
import { projectGdprNarrowPosture } from "../../server/scans/gdpr-narrow-projection";
import { buildNormalizedConcerns } from "./normalized-concerns";
import { buildUnifiedFindingDisplayPackets } from "./unified-findings";
import { deriveGdprEprivacyCoveragePolicyOutcomes } from "./gdpr-eprivacy-coverage-policy";
import { deriveGdprEprivacyCoverageChecklist } from "./gdpr-eprivacy-coverage-checklist";
import { deriveGdprEprivacyDeductionBreakdown } from "./regulatory-coverage-score";
import { buildRegulatoryGapTopFindings } from "./regulatory-gap-top-findings";
import { readBoundGdprNarrow } from "./gdpr-narrow-evidence";
import { bindNarrowGeometry } from "../../server/scans/gdpr-narrow-geometry";
import { compactEvidenceJsonForDisplay } from "./compact-evidence-json";
import { regulatoryReviewContext } from "./regulatory-review-catalog";
import { HISTORICAL_NARROW_POLICY_VERSION, type GdprEprivacyScoringPolicyVersion } from "./scoring-policy";
import { deriveConcernPolicy } from "./concern-policy";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GdprEprivacyCoverageChecklistCard as PrimaryChecklist } from "../../components/scans/gdpr-eprivacy-coverage-checklist-card";
import { GdprEprivacyCoverageChecklistCard as AlternateChecklist } from "../../components/scanso2/gdpr-eprivacy-coverage-checklist-card";
import { RegulatoryChecklistAdvancedEvidenceProvider as PrimaryEvidence } from "../../components/scans/regulatory-checklist-advanced-evidence-context";
import { RegulatoryChecklistAdvancedEvidenceProvider as AlternateEvidence } from "../../components/scanso2/regulatory-checklist-advanced-evidence-context";
import { buildGdprEprivacyChecklistPresentation } from "./gdpr-eprivacy-checklist-presentation";

const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const targetUrl = "https://example.test/";
const source = { verificationStatus: "verified", sha256: "a".repeat(64) };
const bannerText = "We use cookies for marketing and advertising. By continuing to browse this site, you agree to this use.";
function fixture() {
  const text = "Privacy notice. We collect your IP address to deliver our website and send service messages. ".repeat(20);
  const documents = [{ observationId: "notice", url: "https://example.test/privacy", textSha256: digest(text), textChars: text.length, locale: "en" as const }];
  const review: GdprNoticeOmissionReview = { contractVersion: "certscore.gdpr-notice-omission-review.v1",
    scanId: "scan-test", sourceBundleSha256: source.sha256, targetUrl,
    documents, documentSetSha256: digest(JSON.stringify(documents)),
    provenance: { method: "model_review", reviewer: "fixture-reviewer", evaluatorVersion: "review-fixture.v1", reviewId: "review-1", reviewedAt: "2026-10-25T12:00:00.000Z" },
    scope: { governingNoticeConfirmed: true, materialSupplementsResolved: true, equivalentLanguageReviewed: true, supplementDispositions: [] },
    verdicts: ["legal_basis", "retention", "complaint"].map(topic => ({ topic: topic as "legal_basis" | "retention" | "complaint",
      verdict: "omission_confirmed", rationale: `The complete governing notice and resolved supplements do not state the ${topic} disclosure for the described processing.` })),
  };
  const bundle = { scanId: "scan-test", consentInteractionEvents: [],
    consentUiObservations: [{ observationId: "ui", captureStatus: "observed", layerInspected: "first_layer", documentUrl: targetUrl,
      documentIdentity: { source: "cdp_loader_id", token: "loader" }, observedAtMs: 1500,
      defaultToggleStatesObserved: true, nonEssentialDefaultsOff: false, precheckedOptionalPurposeCount: 1,
      precheckedOptionalPurposeLabels: ["Marketing"], textExcerpt: bannerText }],
    policySurfaceInspection: { inspectionCompleted: true, linkDiscoveryCoverageStatus: "complete", retrievalDiagnostics: { observedLinkFailureCount: 0 } },
    policySurfaceObservations: [{ observationId: "notice", url: documents[0]!.url, normalizedUrl: documents[0]!.url,
      surfaceType: "privacy_policy", documentRole: "policy_document", targetRelationship: "target_controller",
      documentEvaluationState: "usable", documentFetchState: "fetched", documentLanguage: "en", textExcerpt: text,
      // Section truncation is independent from complete verified whole text.
      contentCoverage: { status: "truncated" }, documentTextCoverage: { status: "complete", retainedTextChars: text.length, sourceTextChars: text.length },
      governingPolicySelection: { state: "primary" } }],
  } as unknown as CanonicalEvidenceBundle;
  const geometry = { pageUrl: targetUrl, documentIdentity: { token: "loader" },
    candidates: [{ label: "Marketing", intersectsViewport: true, boundingBox: { width: 100, height: 30 } }],
    containers: [{ textExcerpt: bannerText, intersectsViewport: true }] };
  return { bundle, geometry: verifiedFixtureGeometry(geometry), documentUrl: targetUrl, source, noticeReview: review };
}
function verifiedFixtureGeometry<T extends Record<string, unknown>>(geometry: T): T & { narrowSourceVerification?: unknown } {
  const { narrowSourceVerification: _old, ...payload } = geometry;
  const raw = JSON.stringify(payload); const sha256 = digest(raw); const sizeBytes = Buffer.byteLength(raw);
  return bindNarrowGeometry(payload, { scanId: "scan-test", auxiliaryArtifacts: [
    { fileName: "ConsentControlGeometryEvidence.json", sha256, sizeBytes },
  ] }, sha256, sizeBytes) as T;
}
function pipeline(input = fixture()) {
  const assessment = projectGdprNarrowPosture(input)!;
  const runtime = JSON.parse(JSON.stringify({ gdprNarrowPosture: assessment,
    gdprNarrowPostureSource: { ...source, scanId: assessment.scanId, targetUrl: assessment.targetUrl } }));
  const concerns = buildNormalizedConcerns({ runtimeArtifacts: runtime, reviewFindingCandidates: [], validationFindings: [] });
  const findings = buildUnifiedFindingDisplayPackets({ runtimeArtifacts: runtime, reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map() });
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({ runtimeArtifacts: runtime, normalizedConcerns: concerns, scanCompleted: true, coverageLimited: false });
  const rows = deriveGdprEprivacyCoverageChecklist({ coverageOutcomes: outcomes, unifiedFindings: findings, projectedFindings: [], scanCompleted: true, coverageLimited: false });
  return { assessment, runtime, concerns, findings, outcomes, rows };
}
function historicalRows() {
  const f = fixture(), assessment = projectGdprNarrowPosture(f)!;
  assessment.noticeReview = f.noticeReview;
  for (const verdict of f.noticeReview.verdicts) assessment.issues.push({
    kind: verdict.topic, method: "reviewed_notice_omission.v1", sourceUrl: f.noticeReview.documents[0]!.url,
    evidenceRef: f.noticeReview.provenance.reviewId, evidenceText: verdict.rationale,
    documents: f.noticeReview.documents, documentSetSha256: f.noticeReview.documentSetSha256,
    scope: "complete_governing_notice_and_material_supplements",
  });
  gdprNarrowPostureSchema.parse(assessment);
  const runtime = { gdprNarrowPosture: assessment,
    gdprNarrowPostureSource: { ...source, scanId: assessment.scanId, targetUrl: assessment.targetUrl } };
  const rows = assessment.issues.map(issue => ({ id: GDPR_NARROW_RULES[issue.kind].rowId, label: GDPR_NARROW_RULES[issue.kind].title,
    assessmentStatus: "gap_observed", evidenceState: "observed", status: "Gap observed", evidenceRefs: [issue.evidenceRef],
    criticalEvidence: { retainedEvidence: { ...runtime, gdprNarrowKind: issue.kind } },
  }));
  return { runtime, rows };
}
const total = (rows: Parameters<typeof deriveGdprEprivacyDeductionBreakdown>[0], version?: GdprEprivacyScoringPolicyVersion) =>
  deriveGdprEprivacyDeductionBreakdown(rows, version).reduce((sum, f) => sum + f.deductionPoints, 0);

test("only the two source-bound consent observations reach concerns, findings, checklist and current score", () => {
  const result = pipeline();
  assert.equal(result.assessment.issues.length, 2);
  assert.equal(result.assessment.noticeReview, undefined);
  assert.equal(result.concerns.filter(c => c.promotionEligibility === "eligible").length, 2);
  assert.equal(result.findings.filter(f => f.unifiedFindingId.startsWith("gdpr_narrow_")).length, 2);
  for (const finding of result.findings.filter(f => f.unifiedFindingId.startsWith("gdpr_narrow_"))) {
    assert.equal(finding.surfacingDecision.reportable, false);
    assert.equal(finding.surfacingDecision.family, "consent_tracking");
    assert.ok(finding.surfacingDecision.appliedRules.includes("evidence.gdpr_narrow.checklist_projection"));
    assert.ok(!finding.surfacingDecision.appliedRules.includes("unknown.conservative_fallback"));
  }
  for (const id of ["consent_optional_defaults_on", "consent_browsing_as_consent"])
    assert.equal(result.rows.find(r => r.id === id)?.assessmentStatus, "gap_observed", id);
  assert.equal(total(result.rows), 8);
  assert.equal(total([...result.rows, ...result.rows]), 8);
  assert.equal(total(result.rows, "gdpr-eprivacy-posture.v24"), 0);
  const tops = buildRegulatoryGapTopFindings({ gdprEprivacyArea: { id: "gdpr", title: "GDPR/ePrivacy", rows: result.rows } });
  assert.equal(tops.filter(t => /Privacy notice disclosures/.test(t.label)).length, 0);
  assert.equal(tops.filter(t => /Optional cookie purposes/.test(t.label)).length, 1);
  assert.equal(tops.filter(t => /Browsing presented/.test(t.label)).length, 0);
});

test("individual weights, caps, duplicate flat rows and missing-policy precedence", () => {
  const result = pipeline();
  for (const [id, points] of [["consent_optional_defaults_on", 8], ["consent_browsing_as_consent", 6], ["legal_basis_disclosure_observed", 0], ["retention_disclosure_observed", 0], ["supervisory_authority_complaint_disclosure", 0]] as const)
    assert.equal(total(result.rows.filter(r => r.id === id)), points);
  const gap = (id: string) => ({ ...result.rows.find(r => r.id === "consent_optional_defaults_on")!, id, criticalEvidence: { ...result.rows[0]!.criticalEvidence, retainedEvidence: {} } });
  assert.equal(total([...result.rows, gap("reject_all_path_availability")]), 12);
  assert.equal(total([...result.rows, gap("privacy_notice_availability")]), 17);
});

test("persisted v25 omission assessments remain auditable but cannot create current findings or effects", () => {
  const { runtime, rows } = historicalRows();
  assert.equal(readBoundGdprNarrow(runtime)?.issues.length, 5);
  const concerns = buildNormalizedConcerns({ runtimeArtifacts: runtime, reviewFindingCandidates: [], validationFindings: [] });
  assert.deepEqual(concerns.map(c => c.originKey).sort(), ["privacy.gdpr_narrow.implied_consent", "privacy.gdpr_narrow.optional_defaults"]);
  assert.equal(total(rows), 8); assert.equal(total(rows, HISTORICAL_NARROW_POLICY_VERSION), 20);
  assert.equal(total([...rows, ...rows], HISTORICAL_NARROW_POLICY_VERSION), 20);
  for (const [kind, points] of [["legal_basis", 6], ["retention", 4], ["complaint", 2]] as const) {
    const row = rows.find(r => r.id === GDPR_NARROW_RULES[kind].rowId)!;
    assert.equal(total([row]), 0); assert.equal(total([row], HISTORICAL_NARROW_POLICY_VERSION), points);
    const policy = deriveConcernPolicy({ concern: { canonicalConcernKey: `old-${kind}`, originKey: `privacy.gdpr_narrow.${kind}`,
      originType: "runtime_artifact", suggestedUnifiedFindingId: `gdpr_narrow_${kind}`, title: row.label,
      policyIsPrimarySource: true, policyPageType: "privacy_policy" }, rawEvidence: row.criticalEvidence.retainedEvidence, evidenceStrengthFlags: [] });
    assert.equal(policy.promotionEligibility, "blocked"); assert.equal(policy.externalSurfacingEligibility, "suppress");
    assert.deepEqual(buildRegulatoryGapTopFindings({ gdprEprivacyArea: { id: "gdpr", title: "GDPR/ePrivacy", rows: [row] } }), []);
    const customer = JSON.stringify(compactEvidenceJsonForDisplay(row.criticalEvidence.retainedEvidence));
    assert.doesNotMatch(customer, /reviewed governing privacy notice did not state|Internal score|omission_confirmed/);
  }
});

test("duplicate and reordered consent rows retain one strongest top card and one consent family effect", () => {
  const { rows } = pipeline();
  const active = rows.filter(r => r.id === "consent_optional_defaults_on" || r.id === "consent_browsing_as_consent");
  for (const repeated of [active, [...active, ...active], [...active, ...active].reverse()]) {
    assert.equal(total(repeated), 8);
    const tops = buildRegulatoryGapTopFindings({ gdprEprivacyArea: { id: "gdpr", title: "GDPR/ePrivacy", rows: repeated } });
    assert.equal(tops.length, 1); assert.ok(tops[0]!.id.endsWith("consent_optional_defaults_on"));
  }
  const onlyBrowsing = active.filter(r => r.id === "consent_browsing_as_consent");
  assert.equal(total([...onlyBrowsing, ...onlyBrowsing]), 6);
  assert.ok(buildRegulatoryGapTopFindings({ gdprEprivacyArea: { id: "gdpr", title: "GDPR/ePrivacy", rows: onlyBrowsing } })[0]!.id.endsWith("consent_browsing_as_consent"));
});

test("notice no-match, absent review, unknown/present review and source drift never create omissions", () => {
  const input = fixture(); delete (input as { noticeReview?: unknown }).noticeReview;
  assert.deepEqual(projectGdprNarrowPosture(input)?.issues.map(i => i.kind), ["optional_defaults", "implied_consent"]);
  for (const verdict of ["unknown", "present"] as const) {
    const f = fixture(); f.noticeReview.verdicts.forEach(v => v.verdict = verdict);
    assert.equal(projectGdprNarrowPosture(f)?.issues.filter(i => i.documents).length, 0);
  }
  const f = fixture(); f.noticeReview.documents[0]!.textSha256 = "f".repeat(64);
  assert.equal(projectGdprNarrowPosture(f)?.issues.filter(i => i.documents).length, 0);
  const r = pipeline(); r.runtime.gdprNarrowPostureSource.sha256 = "f".repeat(64);
  assert.equal(readBoundGdprNarrow(r.runtime), null);
  const changed = structuredClone(historicalRows().runtime.gdprNarrowPosture); changed.noticeReview!.verdicts[0]!.verdict = "present";
  assert.equal(gdprNarrowPostureSchema.safeParse(changed).success, false);
});

test("incomplete scope, wrong audience/index/language, mismatched source and no-go fail closed", () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { f.source = { ...source, verificationStatus: "local_unverified" }; },
    f => { f.bundle.scanNoGoAssessment = { decision: "no_go" } as CanonicalEvidenceBundle["scanNoGoAssessment"]; },
  ] as Array<(f: ReturnType<typeof fixture>) => void>) { const f = fixture(); mutate(f); assert.equal(projectGdprNarrowPosture(f), null); }
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { f.bundle.policySurfaceObservations[0]!.documentRole = "policy_index"; },
    f => { f.bundle.policySurfaceObservations[0]!.targetRelationship = "service_provider"; },
    f => { f.bundle.policySurfaceObservations[0]!.documentLanguage = "de"; },
    f => { f.bundle.policySurfaceObservations[0]!.documentTextCoverage!.status = "truncated"; },
    f => { f.bundle.policySurfaceInspection!.retrievalDiagnostics!.observedLinkFailureCount = 1; },
    f => { f.bundle.policySurfaceObservations.push({ ...f.bundle.policySurfaceObservations[0]!, observationId: "unreviewed-supplement", normalizedUrl: "https://example.test/supplement", governingPolicySelection: { ...f.bundle.policySurfaceObservations[0]!.governingPolicySelection!, state: "supporting" } }); },
    f => { f.bundle.policySurfaceObservations.push({ ...f.bundle.policySurfaceObservations[0]!, observationId: "linked-terms", surfaceType: "terms", url: "https://example.test/terms", normalizedUrl: "https://example.test/terms", governingPolicySelection: undefined,
      selectionReasonCodes: ["linked_from_retained_privacy"], textExcerpt: "We retain personal data until you ask us to delete it. We process it to perform our contract." }); },
  ] as Array<(f: ReturnType<typeof fixture>) => void>) { const f = fixture(); mutate(f); assert.equal(projectGdprNarrowPosture(f)?.issues.filter(i => i.documents).length, 0); }
});

test("newsletter, essential defaults, general terms, analytics-only, negation and document drift stay neutral", () => {
  for (const text of ["By continuing to browse, you agree to our Terms of Service. We also use advertising cookies.",
    "We use cookies for analytics. By continuing to browse you consent to cookies.",
    "We use cookies for advertising. By continuing to browse you do not consent to cookies.",
    "Advertising cookies are never used. By continuing to browse you consent to cookies.",
    "We block all marketing cookies. By continuing to browse you consent to cookies.",
    "Cookies for advertising are not used on this site. By continuing to browse you consent to cookies.",
    "We do not use advertising cookies. We use essential cookies. By continuing to browse you consent to cookies.",
    "We use cookies for advertising after you opt in. By continuing to browse you consent to cookies.",
    "For example, by continuing to browse you consent to cookies. This advertising wording is invalid."]) {
    const f = fixture(); f.bundle.consentUiObservations[0]!.textExcerpt = text; f.geometry.containers[0]!.textExcerpt = text;
    f.geometry = verifiedFixtureGeometry(f.geometry);
    assert.equal(projectGdprNarrowPosture(f)?.issues.some(i => i.kind === "implied_consent"), false, text);
  }
  const f = fixture(); f.bundle.consentUiObservations[0]!.precheckedOptionalPurposeLabels = ["Necessary"];
  assert.equal(projectGdprNarrowPosture(f)?.issues.some(i => i.kind === "optional_defaults"), false);
  f.geometry.documentIdentity.token = "other-loader";
  assert.equal(projectGdprNarrowPosture(f)?.issues.some(i => !i.documents), false);
  const result = pipeline();
  const complaintRows = result.rows.filter(r => r.id === "supervisory_authority_complaint_disclosure");
  assert.deepEqual(buildRegulatoryGapTopFindings({ gdprEprivacyArea: { id: "gdpr", title: "GDPR/ePrivacy", rows: complaintRows } }), []);
});

test("consent proof requires a receipt for the original geometry bytes and rejects later mutation", () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { delete f.geometry.narrowSourceVerification; },
    f => { f.geometry.candidates[0]!.label = "Advertising"; },
    f => { f.geometry = bindNarrowGeometry(f.geometry, { scanId: "scan-test", auxiliaryArtifacts: [] }, "b".repeat(64), 30) as typeof f.geometry; },
  ] as Array<(f: ReturnType<typeof fixture>) => void>) {
    const f = fixture(); mutate(f);
    assert.equal(projectGdprNarrowPosture(f)?.issues.filter(i => !i.documents).length, 0);
  }
});

test("retained heading concatenation preserves affirmative marketing wording without relaxing negation", () => {
  const retained = "Your Privacy Choices for *.samaritanspurse.org domainsWe use cookies to enhance site navigation, analyze site usage, customize your experience, and assist in our marketing efforts. By continuing to navigate the site or selecting “Accept Cookies,” you consent to the use of cookies on your device. You can accept or reject particular categories of cookies by clicking “Privacy Choices.”";
  const f = fixture(); f.bundle.consentUiObservations[0]!.textExcerpt = retained; f.geometry.containers[0]!.textExcerpt = retained;
  f.geometry = verifiedFixtureGeometry(f.geometry);
  assert.equal(projectGdprNarrowPosture(f)?.issues.some(i => i.kind === "implied_consent"), true);
  f.geometry.containers[0]!.textExcerpt = bannerText;
  f.geometry = verifiedFixtureGeometry(f.geometry);
  assert.equal(projectGdprNarrowPosture(f)?.issues.some(i => i.kind === "implied_consent"), false);
  f.bundle.consentUiObservations[0]!.textExcerpt = "IfWe use cookies for advertising, we will ask first. By continuing to browse you consent to cookies.";
  f.geometry.containers[0]!.textExcerpt = f.bundle.consentUiObservations[0]!.textExcerpt;
  f.geometry = verifiedFixtureGeometry(f.geometry);
  assert.equal(projectGdprNarrowPosture(f)?.issues.some(i => i.kind === "implied_consent"), false);
});

test("customer evidence keeps active factual conclusions without omission rationale or scoring mechanics", () => {
  const f = fixture(); f.noticeReview.verdicts[0]!.rationale = "Internal score deduction discussion belongs only to diagnostic review data and never to the customer report.";
  const result = pipeline(f);
  const tops = buildRegulatoryGapTopFindings({ gdprEprivacyArea: { id: "gdpr", title: "GDPR/ePrivacy", rows: result.rows } });
  assert.equal(tops.some(t => t.id.endsWith("reviewed_notice_omissions")), false);
  const primary = tops.find(t => t.id.endsWith("consent_optional_defaults_on"))!;
  assert.ok(regulatoryReviewContext(primary.id, "gdpr_eprivacy"));
  assert.equal(regulatoryReviewContext(primary.id, "ccpa_cpra"), null);
  const publicJson = JSON.stringify(compactEvidenceJsonForDisplay({ top: primary.evidenceDetails,
    checklist: result.rows.map(row => row.criticalEvidence.retainedEvidence) }));
  assert.doesNotMatch(publicJson, /Internal score deduction|noticeReview|review-fixture|gdprNarrowPosture/);
  assert.match(publicJson, /reviewedPostureEvidence/);
});


test("both report renderers show both factual consent rows in Consent Surface without internal review data", () => {
  const { rows } = pipeline();
  const items = rows.filter(row => row.id === "consent_optional_defaults_on" || row.id === "consent_browsing_as_consent");
  const presentation = buildGdprEprivacyChecklistPresentation(items);
  assert.equal(presentation.rows.length, 2);
  for (const [Card, Provider] of [[PrimaryChecklist, PrimaryEvidence], [AlternateChecklist, AlternateEvidence]] as const) {
    const html = renderToStaticMarkup(createElement(Provider, { value: { expandAllAdvancedEvidence: true } },
      createElement(Card, { items, presentation, defaultOpen: true, showSummaryStrip: false })));
    assert.match(html, /Consent Surface/);
    for (const item of items) assert.ok(html.includes(item.label), item.id);
    assert.match(html, /reviewedPostureEvidence/);
    assert.match(html, /selectedOptionalPurposes/);
    assert.match(html, /firstLayerText/);
    assert.doesNotMatch(html, /GDPR Transparency|gdprNarrowPosture|noticeReview|review-fixture|omission_confirmed|deductionPoints|deduction|scoring mechanics/i);
  }
});

function paragraphFixture(text: string) {
  const f = fixture();
  f.bundle.consentUiObservations[0]!.textExcerpt = 'Unrelated page-leading content';
  f.bundle.consentUiObservations[0]!.precheckedOptionalPurposeLabels = [];
  f.bundle.consentUiObservations[0]!.precheckedOptionalPurposeCount = 0;
  f.bundle.consentUiObservations[0]!.nonEssentialDefaultsOff = true;
  const geometry = { ...f.geometry, containers: [{ containerId: 'paragraph', selectorHint: '#consent-prose', layer: 'first_layer',
    textExcerpt: text, htmlExcerpt: `<div id="consent-prose">${text}</div>`, intersectsViewport: true, boundingBox: { width: 500, height: 100 } }] };
  return { ...f, geometry: verifiedFixtureGeometry(geometry) };
}

test('bound visible paragraphs recover page-excerpt loss and reversed consent grammar without extra effects', () => {
  for (const text of [bannerText, 'We use cookies to personalize content and ads. You consent to our cookies if you click “OK” or continue to use our website.']) {
    const result = pipeline(paragraphFixture(text));
    assert.deepEqual(result.assessment.issues.map(i => i.kind), ['implied_consent']);
    const issue = result.assessment.issues[0]!;
    assert.equal(issue.method, 'explicit_advertising_assent.v2-paragraph');
    assert.equal(issue.evidenceText, text);
    assert.equal(issue.geometryContainerId, 'paragraph');
    assert.equal(issue.geometryContainerSelector, '#consent-prose');
    assert.equal(total(result.rows), 6);
    assert.equal(total([...result.rows, ...result.rows]), 6);
    assert.equal(total(result.rows, HISTORICAL_NARROW_POLICY_VERSION), 0);
    assert.equal(buildRegulatoryGapTopFindings({ gdprEprivacyArea: { id: 'gdpr', title: 'GDPR/ePrivacy', rows: result.rows } }).length, 1);
    const malformed = structuredClone(result.assessment); delete malformed.issues[0]!.geometryContainerId;
    assert.equal(gdprNarrowPostureSchema.safeParse(malformed).success, false);
  }
});

test('paragraph recovery preserves visibility, first-layer, source, identity, time and no-interaction gates', () => {
  for (const mutate of [
    (f: ReturnType<typeof paragraphFixture>) => { f.geometry.containers[0]!.intersectsViewport = false; },
    f => { f.geometry.containers[0]!.layer = 'preference_center'; },
    f => { f.geometry.containers[0]!.boundingBox.width = 0; },
    f => { f.geometry.containers[0]!.htmlExcerpt = '<div>Other prose</div>'; },
    f => { f.geometry.containers[0]!.htmlExcerpt = `<div><span hidden>${bannerText}</span></div>`; },
    f => { f.geometry.containers[0]!.textExcerpt = bannerText + 'x'.repeat(1200); f.geometry.containers[0]!.htmlExcerpt = `<div>${f.geometry.containers[0]!.textExcerpt}</div>`; },
    f => { f.bundle.consentUiObservations[0]!.captureStatus = 'no_evidence'; },
    f => { f.bundle.consentUiObservations[0]!.documentIdentity!.token = 'different'; },
    f => { f.bundle.consentUiObservations[0]!.documentUrl = 'https://different.test/'; },
    f => { f.bundle.consentUiObservations[0]!.observedAtMs = Infinity; },
    f => { f.bundle.consentInteractionEvents.push({} as CanonicalEvidenceBundle['consentInteractionEvents'][number]); },
  ] as Array<(f: ReturnType<typeof paragraphFixture>) => void>) {
    const f = paragraphFixture(bannerText); mutate(f); f.geometry = verifiedFixtureGeometry(f.geometry);
    assert.equal(projectGdprNarrowPosture(f)?.issues.some(i => i.kind === 'implied_consent'), false);
  }
  const f = paragraphFixture(bannerText); f.geometry.containers[0]!.textExcerpt = bannerText + ' mutated';
  assert.equal(projectGdprNarrowPosture(f)?.issues.length, 0);
});

test('a purpose clause and assent in separate containers cannot be combined', () => {
  const f = paragraphFixture('We use cookies for advertising.');
  const second = { ...f.geometry.containers[0]!, containerId: 'second', selectorHint: '#second', textExcerpt: 'By continuing to browse, you agree to our use of cookies.',
    htmlExcerpt: '<div>By continuing to browse, you agree to our use of cookies.</div>' };
  f.geometry.containers.push(second); f.geometry = verifiedFixtureGeometry(f.geometry);
  assert.equal(projectGdprNarrowPosture(f)?.issues.length, 0);
});

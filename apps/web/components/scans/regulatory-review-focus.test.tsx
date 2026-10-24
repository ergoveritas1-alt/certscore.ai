import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { PrivacyAuditEvidence } from "@certscore/api-contracts";
import { CaliforniaPrivacyWorkpaper, RegulatoryReviewFocus } from "./regulatory-review-focus";
import { ReportPdfAccessProvider, ShadowReportShareMenu } from "./report-lab/shadow-report-actions";

test("review selector is compact and exposes both focus choices", () => {
  const markup = renderToStaticMarkup(<RegulatoryReviewFocus focus="ccpa_cpra" />);
  assert.match(markup, /<form[^>]+aria-label="Review focus"/);
  assert.match(markup, /<form[^>]+method="get"/);
  assert.doesNotMatch(markup, /Report view|>Review focus<\/span>/);
  assert.match(markup, /value="gdpr_eprivacy"[^>]+aria-pressed="false"/);
  assert.match(markup, /value="ccpa_cpra"[^>]+aria-pressed="true"/);
  assert.doesNotMatch(markup, /California visitor behavior|href="#gpc-evidence"|A separate CCPA\/CPRA score|Consent evidence/);
});

test("California evidence is scoped to CCPA and remains compact when unavailable", () => {
  assert.equal(renderToStaticMarkup(<CaliforniaPrivacyWorkpaper focus="gdpr_eprivacy" />), "");
  const html = renderToStaticMarkup(<CaliforniaPrivacyWorkpaper focus="ccpa_cpra" />);
  assert.match(html, /California privacy review/);
  assert.match(html, /Evidence unavailable/);
  assert.match(html, /does not establish that these items are absent/);
  assert.doesNotMatch(html, /<details[^>]+open=|0 retained choices/);
});

test("retained California choices and notices remain accessible only in CCPA focus", () => {
  const evidence: PrivacyAuditEvidence = {
    contractVersion: "certscore.privacy-audit-evidence.v1", scanId: "fixture", documentUrl: "https://example.test/",
    capturedAt: "2026-09-25T12:00:00.000Z", sourceHash: "a".repeat(64), verificationStatus: "verified",
    scoreEffect: "none", passagePolicy: "california_notice_passages.v1", negativeControlCoverage: "not_verified",
    collectionPointNoticeAssessment: "not_assessed", truncated: false,
    controls: [{ kind: "your_privacy_choices", label: "Your privacy choices", sourceUrl: "https://example.test/",
      destinationUrl: "https://example.test/choices", placement: "footer", evidenceRef: "choice:1", retrieval: "fetched", interaction: "not_tested" }],
    notices: [{ kind: "california_notice", url: "https://example.test/privacy", evidenceRef: "notice:1",
      directlyLinkedFromScannedPage: true, coverage: "partial", passages: [{ topic: "privacy_rights", excerpt: "You can request deletion." }] }],
  };
  assert.equal(renderToStaticMarkup(<CaliforniaPrivacyWorkpaper focus="gdpr_eprivacy" evidence={evidence} />), "");
  const html = renderToStaticMarkup(<CaliforniaPrivacyWorkpaper focus="ccpa_cpra" evidence={evidence} />);
  assert.match(html, /1 choice · 1 notice/);
  assert.match(html, /href="https:\/\/example.test\/choices"/);
  assert.match(html, /You can request deletion/);
  assert.match(html, /Choices found/);
  assert.match(html, /Disclosures captured/);
  assert.match(html, /Privacy rights/);
  assert.match(html, /View retained passages/);
  assert.match(html, /Evidence scope/);
  assert.doesNotMatch(html, /Opt-out functionality and notice completeness were not tested/);
  assert.match(html, /Evidence provenance/);
  assert.doesNotMatch(html, /<details[^>]+open=/);
  assert.doesNotMatch(renderToStaticMarkup(<CaliforniaPrivacyWorkpaper focus="ccpa_cpra" evidence={evidence} />), /Effectiveness has not been verified/);
});

test("California evidence distinguishes identified links from verified visitor-facing choices", () => {
  const evidence: PrivacyAuditEvidence = {
    contractVersion: "certscore.privacy-audit-evidence.v2", scanId: "fixture", documentUrl: "https://example.test/",
    capturedAt: "2026-09-25T12:00:00.000Z", sourceHash: "a".repeat(64), verificationStatus: "verified",
    scoreEffect: "none", passagePolicy: "california_notice_passages.v1", negativeControlCoverage: "not_verified",
    collectionPointNoticeAssessment: "not_assessed", truncated: false, controls: [], notices: [],
    controlCandidates: [{ kind: "cookie_settings", label: "Cookie Settings", sourceUrl: "https://example.test/",
      destinationUrl: "https://example.test/cookie-settings", placement: "header_link",
      evidenceRef: "policy-surface:cookies", verification: "visibility_unverified" }],
  };
  const html = renderToStaticMarkup(<CaliforniaPrivacyWorkpaper focus="ccpa_cpra" evidence={evidence} />);
  assert.match(html, /0 choices · 0 notices/);
  assert.match(html, /Link identified: “Cookie Settings” · visibility not verified/);
  assert.doesNotMatch(html, /Observed: “Cookie Settings”/);
});

test("advanced PDF downloads start with GDPR/ePrivacy while sharing and workpapers preserve focus", () => {
  const markup = renderToStaticMarkup(<ReportPdfAccessProvider allowed><ShadowReportShareMenu reportUrl="/scan/fixture?reviewFocus=ccpa_cpra" scanId="fixture" siteLabel="example.test" fullSite /></ReportPdfAccessProvider>);
  assert.match(markup, /format=pdf[^"<]*reviewFocus=gdpr_eprivacy/);
  assert.match(markup, /format=csv[^"<]*reviewFocus=ccpa_cpra/);
  assert.match(markup, /workpaper=tracking[^"<]*reviewFocus=ccpa_cpra/);
  assert.match(markup, /https%3A%2F%2Fcertscore.ai%2Fscan%2Ffixture%3FreviewFocus%3Dccpa_cpra/);
  assert.doesNotMatch(markup, /format=csv[^"<]*scope=full-site/);
});


test("privacy workpaper rejects evidence bound to another report", () => {
  const evidence = { contractVersion: "certscore.privacy-audit-evidence.v1", scanId: "other", documentUrl: "https://example.test/",
    capturedAt: "2026-09-25T12:00:00.000Z", sourceHash: "a".repeat(64), verificationStatus: "verified",
    scoreEffect: "none", passagePolicy: "california_notice_passages.v1", negativeControlCoverage: "not_verified",
    collectionPointNoticeAssessment: "not_assessed", truncated: false, controls: [], notices: [] } as const;
  const html = renderToStaticMarkup(<CaliforniaPrivacyWorkpaper focus="ccpa_cpra" scanId="current" evidence={{ ...evidence, controls: [], notices: [] }} />);
  assert.match(html, /Evidence unavailable/);
  assert.doesNotMatch(html, /Source SHA-256/);
});


test("California coverage has one linked summary and one complete evidence review without mutating assessments", async () => {
  const {CaliforniaCoverageSummary} = await import("./regulatory-review-focus");
  const {SitePriorityReview} = await import("./site-priority-review");
  const {californiaCoverageFixture,CA_FIXTURE_SOURCE,CA_FIXTURE_URL} = await import("../../server/scans/california-review-coverage.fixture");
  const {projectCaliforniaPrivacyReview} = await import("../../server/scans/california-privacy-review-projection");
  const fixture = californiaCoverageFixture("Privacy Policy. California residents may request access, correction and deletion of personal information. We share personal information with service providers for billing. We use cookies for analytics.");
  fixture.bundle.policySurfaceInspection!.californiaReviewPolicy="california-privacy-review.v7";
  fixture.bundle.policySurfaceObservations.forEach(surface=>{surface.documentLanguage="en";});
  const assessment=projectCaliforniaPrivacyReview(fixture.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,fixture.policyEvidence)!;
  if(assessment.contractVersion!=="certscore.california-privacy-review.v7")throw Error("v7 expected");
  const before=structuredClone(assessment);
  const summary=renderToStaticMarkup(<CaliforniaCoverageSummary coverage={assessment.reviewCoverage}/>);
  assert.match(summary,/href="#california-privacy-evidence"/);
  assert.equal((summary.match(/>California coverage</g)??[]).length,1);
  assert.match(summary,/<details[^>]+group\/signal/);
  assert.match(summary,/View California privacy review/);
  assert.doesNotMatch(summary,/Rights clause assessment|Sale\/sharing clause assessment|Collection-notice matching/);
  const detail=renderToStaticMarkup(<CaliforniaPrivacyWorkpaper focus="ccpa_cpra" scanId={assessment.scanId} assessment={assessment}
    coverage={assessment.reviewCoverage} rightsAssessment={assessment.rightsAssessment} saleSharingAssessment={assessment.saleSharingAssessment}
    collectionNoticeAssessment={assessment.collectionNoticeAssessment} gpcAvailable/>);
  assert.equal((detail.match(/id="california-privacy-evidence"/g)??[]).length,1);
  for(const label of ["California privacy review","Assessment coverage","Rights clause assessment","Sale/sharing clause assessment","Collection-notice matching","Choice and request inspection","Sale/sharing choice inspection","Request routes on the scanned page"])assert.ok(detail.includes(label),label);
  assert.match(detail,/href="#gpc-evidence"/);
  const initial=detail.split("data-california-review-details")[0]!;
  assert.doesNotMatch(initial,/Rights wording found/);
  assert.doesNotMatch(initial,/Business applicability|unassessed|not determined|incomplete|Rights clause assessment|Assessment coverage|Source SHA-256/i);
  assert.match(detail,/Evidence &amp; assessment details/);
  assert.doesNotMatch(detail,/<details[^>]+open=/);
  assert.doesNotMatch(detail,/California review coverage|California coverage:|score deduction|point deduction/i);
  const top=renderToStaticMarkup(<SitePriorityReview findings={[]} pending={false} sitewideAvailable scannedPages={1} reviewFocus="ccpa_cpra" californiaAssessment={assessment}/>);
  assert.doesNotMatch(top,/data-testid="california-choice-inspection"|California review coverage/);
  assert.deepEqual(assessment,before);
});


test("regular and public report menus omit PDF downloads", () => {
  for (const allowed of [false, undefined]) {
    const menu = <ShadowReportShareMenu reportUrl="/scan/fixture" scanId="fixture" siteLabel="example.test" />;
    const markup = renderToStaticMarkup(allowed === undefined ? menu : <ReportPdfAccessProvider allowed={allowed}>{menu}</ReportPdfAccessProvider>);
    assert.doesNotMatch(markup, /format=pdf/);
    assert.match(markup, /format=json/);
  }
});


test("California snapshot leads with observed, not observed or unknown without effectiveness copy", async () => {
  const {CaliforniaCoverageSummary} = await import("./regulatory-review-focus");
  const {californiaCoverageFixture,CA_FIXTURE_SOURCE,CA_FIXTURE_URL} = await import("../../server/scans/california-review-coverage.fixture");
  const {projectCaliforniaPrivacyReview} = await import("../../server/scans/california-privacy-review-projection");
  const fixture=californiaCoverageFixture();
  const review=projectCaliforniaPrivacyReview(fixture.bundle,CA_FIXTURE_SOURCE,CA_FIXTURE_URL,fixture.policyEvidence)!;
  assert.ok("reviewCoverage" in review);
  const coverage=review.reviewCoverage;
  assert.match(renderToStaticMarkup(<CaliforniaCoverageSummary />),/Sale\/sharing opt-out link unknown/);
  for (const state of ["observed","not_observed",null] as const) {
    const title=state === "observed" ? "Sale/sharing opt-out link observed" : state === "not_observed" ? "Sale/sharing opt-out link not observed" : "Sale/sharing opt-out link unknown";
    const choicePresence=state ? {state,title,scanId:fixture.bundle.scanId,sourceHash:"a".repeat(64),labels:state === "observed" ? ["Do Not Sell or Share My Personal Information"] : []} : null;
    const html=renderToStaticMarkup(<CaliforniaCoverageSummary coverage={coverage} choicePresence={choicePresence} />);
    assert.ok(html.includes(title));
    assert.equal((html.match(/<summary/g)??[]).length,1);
    assert.ok(html.indexOf("data-california-opt-out-presence") < html.indexOf("View California privacy review"));
    assert.doesNotMatch(html,/effectiveness|unverified|deduction|<details[^>]* open=/i);
    if (!state) assert.doesNotMatch(html,/link not observed|link observed/);
  }
});

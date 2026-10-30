import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { deriveConsentControlAssessment } from "@certscore/contracts";
import { californiaCoverageFixture, CA_FIXTURE_POLICY, CA_FIXTURE_SOURCE, CA_FIXTURE_URL } from "../../server/scans/california-review-coverage.fixture";
import { projectCaliforniaPrivacyReview } from "../../server/scans/california-privacy-review-projection";
import { buildUnifiedFindingDisplayPackets } from "./unified-findings";
import { projectCaliforniaRegulatoryPriorities } from "./california-regulatory-priorities";
import { deriveCaliforniaRegulatoryScore } from "./california-regulatory-score";
import { buildAssessmentHighlightsPresentation } from "./assessment-highlights";
import { buildRegulatoryAssessmentHighlights } from "./regulatory-assessment-highlights";
import { projectCaliforniaAssessmentResultSummary } from "./california-assessment-result-summary";
import { FullSiteExecutiveSummary } from "../../components/scans/full-site-executive-summary";
import { SitePriorityReview } from "../../components/scans/site-priority-review";

const identity = { scanId: "california-local-fixture", documentUrl: CA_FIXTURE_URL, sourceHash: CA_FIXTURE_SOURCE.sha256 };
// No supported disclosure gap: this fixture exercises the neutral facts-only fallback.
const policy = CA_FIXTURE_POLICY.replace("We do not sell or share personal information.", "");
function canonical(text = policy, runtime: "none" | "cookies" | "browser_storage" | "both" | "technical" = "none") {
  const f = californiaCoverageFixture(text);
  if (runtime === "cookies" || runtime === "both") f.bundle.cookieEvents = [
    { eventId: "cookie-fixture", scenario: "fresh_pre_consent", documentUrl: CA_FIXTURE_URL, cookieName: "fixture_cookie", cookiePurpose: "unknown" },
  ] as never;
  if (runtime === "browser_storage" || runtime === "both") f.bundle.storageSnapshots = [
    { artifactId: "storage-fixture", scenario: "fresh_pre_consent", url: CA_FIXTURE_URL, localStorageKeys: ["fixture_storage"], sessionStorageKeys: [] },
  ] as never;
  if (runtime === "technical") f.bundle.networkEvents = [
    { eventId: "resource-fixture", scenario: "fresh_pre_consent", documentUrl: CA_FIXTURE_URL, thirdParty: true },
  ] as never;
  f.bundle.policySurfaceInspection!.californiaReviewPolicy = "california-privacy-review.v10";
  f.bundle.policySurfaceObservations.forEach(row => { row.documentLanguage = "en"; });
  const review = projectCaliforniaPrivacyReview(f.bundle, CA_FIXTURE_SOURCE, CA_FIXTURE_URL, f.policyEvidence)!;
  const parent = deriveConsentControlAssessment({ scan: { scanId: f.bundle.scanId, finalUrl: CA_FIXTURE_URL } });
  parent.californiaPrivacyReview = review;
  const packets = buildUnifiedFindingDisplayPackets({ reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map(), runtimeArtifacts: { consentControlAssessment: parent } });
  const findings = projectCaliforniaRegulatoryPriorities(packets).map((row, i) => ({ ...row, rank: i + 1, pages: [{ id: identity.scanId, url: identity.documentUrl, homepage: true }] }));
  const score = () => deriveCaliforniaRegulatoryScore({ assessment: review, checklistRows: [], unifiedFindings: packets });
  return { review, packets, findings, score };
}

test("neutral California results follow canonical findings through the shared renderer without restoring demoted issues", () => {
  const r = canonical(), before = structuredClone(r.findings), score = r.score();
  assert.ok(r.findings.length > 0, "Exercise actual canonical finding payloads, not a workpaper-only fixture.");
  const result = projectCaliforniaAssessmentResultSummary(r.findings, identity)!;
  assert.ok(result);
  assert.ok(result.sourceRefs.some(ref => r.findings.some(finding => finding.id === ref)));
  const actual = buildRegulatoryAssessmentHighlights(r.findings, "ccpa_cpra", { kind: "page" }, {}, identity, score.reviewCoverage);
  assert.equal(actual.topIssues.length, 0, "Contextual results are not added to the priority count.");
  assert.match(actual.highlights.text, /^The privacy notice includes general consumer wording/);
  assert.match(actual.highlights.text, /general consumer wording about requests to delete personal information/);
  assert.doesNotMatch(actual.highlights.text, /Next,|Check whether|review how|match collection notices/);
  assert.equal("action" in result, false);
  assert.doesNotMatch(actual.highlights.text, /No named|not observed|non.discrimination|incomplete|ineffective|compliant|adequate|0 issues/i);
  assert.ok(actual.highlights.text.length <= 430);
  assert.ok(actual.highlights.links.every(link => link.targetId === "california-privacy-evidence"));
  assert.deepEqual(actual.highlights, buildAssessmentHighlightsPresentation([], { kind: "page" }, { assessmentResult: result }));
  assert.deepEqual(r.findings, before);
  assert.deepEqual(r.score(), score);
});

test("workpaper-only, unrecognized and malformed metadata cannot supply executive facts", () => {
  const r = canonical(), finding = r.findings.find(row => row.evidenceJson.californiaPrivacyReview)!;
  for (const candidate of [
    { ...finding, id: "not_a_canonical_california_finding" },
    { ...finding, evidenceJson: { californiaPrivacyReview: r.review } },
    { ...finding, evidenceJson: { ...finding.evidenceJson, findingId: "different_finding" } },
    { ...finding, evidenceJson: { ...finding.evidenceJson, californiaPrivacyReview: { ...r.review, sourceHash: "invalid" } } },
    { ...finding, evidenceJson: {} },
  ]) assert.equal(projectCaliforniaAssessmentResultSummary([candidate], identity), null);
  assert.equal(projectCaliforniaAssessmentResultSummary([], identity), null);
  assert.equal(projectCaliforniaAssessmentResultSummary(r.findings), null);
});

test("assessment result context cannot borrow another scan, document or conflicting assessment", () => {
  const r = canonical();
  for (const wrong of [{ ...identity, scanId: "other-scan" }, { ...identity, documentUrl: "https://other.test/" },
    { ...identity, sourceHash: "f".repeat(64) }, { ...identity, sourceHash: undefined }])
    assert.equal(projectCaliforniaAssessmentResultSummary(r.findings, wrong), null);
  const other = canonical(policy.replace("contact privacy@example.test", "contact requests@example.test"));
  assert.equal(projectCaliforniaAssessmentResultSummary([...r.findings, ...other.findings], identity), null);
});

test("missing deletion proof and other-jurisdiction wording never become positive California rights facts", () => {
  const missing = canonical(policy.replace("You have the right to delete your personal information. ", ""));
  const result = projectCaliforniaAssessmentResultSummary(missing.findings, identity);
  assert.ok(result);
  assert.doesNotMatch(result.facts.join(" "), /requests to delete personal information/);
  const other = canonical();
  const findings = structuredClone(other.findings);
  for (const finding of findings) {
    const review = finding.evidenceJson.californiaPrivacyReview as typeof other.review;
    if ("rightsAssessment" in review && review.rightsAssessment) {
      const topic = review.rightsAssessment.topics.find(row => row.topic === "right_to_delete")!;
      topic.context = "other_jurisdiction_only";
    }
  }
  assert.doesNotMatch(projectCaliforniaAssessmentResultSummary(findings, identity)?.facts.join(" ") ?? "", /requests to delete personal information/);
});

test("EU, site-wide and actual priority findings preserve their existing editorial selection", () => {
  const r = canonical();
  const eu = buildRegulatoryAssessmentHighlights(r.findings, "gdpr_eprivacy", { kind: "page" }, {}, identity);
  assert.doesNotMatch(eu.highlights.text, /We reviewed the privacy notice|requests to delete personal information/i);
  const site = buildRegulatoryAssessmentHighlights(r.findings, "ccpa_cpra", { kind: "site", scannedPages: 5 }, {}, identity);
  assert.doesNotMatch(site.highlights.text, /We reviewed the privacy notice|requests to delete personal information/i);
  const stronger = canonical(policy + " We sell personal information to advertising partners.");
  const actual = buildRegulatoryAssessmentHighlights(stronger.findings, "ccpa_cpra", { kind: "page" }, {}, identity);
  assert.ok(actual.topIssues.length);
  assert.deepEqual(actual.highlights, buildAssessmentHighlightsPresentation(actual.topIssues, { kind: "page" }));
  assert.doesNotMatch(actual.highlights.text, /We reviewed the privacy notice/);
});

test("both California report surfaces share the same source-bound result summary and unchanged score", () => {
  const r = canonical(), californiaScore = r.score();
  const expected = buildRegulatoryAssessmentHighlights(r.findings, "ccpa_cpra", { kind: "page" }, {}, identity, californiaScore.reviewCoverage).highlights;
  const props = { reportIdentity: identity, reviewFocus: "ccpa_cpra" as const, pending: false, scannedPages: 1 };
  for (const markup of [
    renderToStaticMarkup(<FullSiteExecutiveSummary {...props} californiaScore={californiaScore} score={{ value: 91, scoredPages: 1, priorityReview: r.findings }} />),
    renderToStaticMarkup(<SitePriorityReview {...props} findings={r.findings} californiaAssessment={r.review} sitewideAvailable />),
  ]) {
    assert.match(markup, /The privacy notice includes general consumer wording/);
    assert.match(markup, /general consumer wording about requests to delete personal information/);
    assert.match(markup, /href="#california-privacy-evidence"/);
    assert.doesNotMatch(markup, /Assessment incomplete|No CCPA\/CPRA priority issues|No named sale\/sharing choice/);
    assert.ok(expected.text.startsWith("The privacy notice includes general consumer wording"));
  }
  const executive = renderToStaticMarkup(<FullSiteExecutiveSummary {...props} californiaScore={californiaScore} score={{ value: 91, scoredPages: 1, priorityReview: r.findings }} />);
  assert.match(executive, new RegExp(`California score ${californiaScore.score} out of 100`));
});

test("unresolved collection and disclosure statuses cannot generate executive to-dos", () => {
  for (const runtime of ["none", "cookies", "browser_storage", "both", "technical"] as const) {
    const r = canonical(policy, runtime);
    const before = structuredClone(r.findings), score = r.score();
    const result = projectCaliforniaAssessmentResultSummary(r.findings, identity)!;
    assert.ok(result);
    assert.equal("action" in result, false);
    assert.deepEqual(result.facts, ["The privacy notice includes general consumer wording about requests to delete personal information."]);
    const copy = buildAssessmentHighlightsPresentation([], { kind: "page" }, { assessmentResult: result });
    assert.equal(copy.text, result.facts.join(" "));
    assert.doesNotMatch(copy.text, /Next,|Check whether|review how|match collection notices|sale.sharing|collection points/);
    assert.deepEqual(r.findings, before);
    assert.deepEqual(r.score(), score);
  }
});

test("shared renderer ignores legacy context actions and preserves real finding actions", () => {
  const context = {
    facts: ["A source-bound assessment observation was recorded."],
    action: "Review every disclosure and check every collection notice.",
    targetId: "evidence", sourceRefs: ["projected-assessment:fixture"],
  };
  for (const scope of [{ kind: "page" }, { kind: "site", scannedPages: 3 }] as const) {
    const empty = buildAssessmentHighlightsPresentation([], scope, { assessmentResult: context });
    assert.equal(empty.text, context.facts[0]);
    assert.doesNotMatch(empty.text, /Review every|check every/);
    const finding = { id: "regulatory_gap__gdpr_eprivacy__privacy_notice_availability", title: "Privacy policy not found", status: "Potential gap",
      summary: "Privacy policy not found within the assessed scope.", correctionSteps: ["Publish an accessible privacy notice."] };
    const actual = buildAssessmentHighlightsPresentation([finding], scope, { assessmentResult: context });
    assert.match(actual.text, /Privacy policy not found/);
    assert.match(actual.text, /Publish an accessible privacy notice/);
    assert.doesNotMatch(actual.text, /source-bound assessment observation|Review every|check every/);
  }
});

for(const focus of ["gdpr_eprivacy","ccpa_cpra"] as const) {
  for(const scope of [{kind:"page"},{kind:"site",scannedPages:3}] as const) {
    test(`${focus}/${scope.kind}: lower-ranked canonical findings fill available space after the strongest observation`,()=>{
      // Inputs represent already-projected findings; selection must not use score or raw signals.
      const strong={id:"regulatory_gap__gdpr_eprivacy__privacy_notice_availability",title:"Privacy policy not found",status:"Potential gap",severity:"high" as const,rank:1,
        summary:"Privacy policy not found within the assessed scope.",correctionSteps:["Publish an accessible privacy policy."]};
      const lower={id:"site_integrity_cms_security",title:"CMS version review",status:"Review",severity:"low" as const,rank:2,
        summary:"The retained version needs review; an installed security fix was not verified.",correctionSteps:["Verify the installed version and available fixes."]};
      const findings=[lower,strong],before=structuredClone(findings);
      const actual=buildRegulatoryAssessmentHighlights(findings,focus,scope,{score:86});
      const text=`${actual.highlights.text} ${actual.highlights.expanded?.text??""}`;
      assert.match(actual.highlights.text,/^“Privacy policy not found”/);
      assert.match(text,/CMS version review/);
      assert.match(text,/installed security fix was not verified/);
      assert.ok(actual.highlights.links.some(link=>link.label.includes("CMS version review")));
      assert.ok(actual.highlights.text.length<=430);
      assert.ok((actual.highlights.expanded?.text.length??0)<=1000);
      assert.deepEqual(findings,before);
      assert.deepEqual(buildRegulatoryAssessmentHighlights(findings,focus,scope,{score:40}).highlights,actual.highlights);
    });
  }
  test(`${focus}: no minimum finding count and stronger findings consume available slots first`,()=>{
    const empty=buildRegulatoryAssessmentHighlights([],focus,{kind:"page"});
    assert.equal(empty.topIssues.length,0);
    assert.ok(empty.highlights.links.every(link=>link.label==="Detailed evidence" && link.targetId==="evidence"));
    const strong=Array.from({length:8},(_,i)=>({id:`reviewed_fixture_${i}`,rank:i+1,title:`Concrete finding ${i}`,status:"Potential gap",severity:"high" as const,summary:`Observed concrete issue ${i}.`,correctionSteps:["Correct the observed issue."]}));
    const lower={id:"site_integrity_cms_security",rank:9,title:"Lower version review",status:"Review",severity:"low" as const,summary:"Installed fixes remain unresolved."};
    const copy=buildRegulatoryAssessmentHighlights([lower,...strong],focus,{kind:"page"}).highlights;
    assert.doesNotMatch(`${copy.text} ${copy.expanded?.text??""}`,/Lower version review/);
    assert.match(copy.text,/Concrete finding 0/);
  });
  test(`${focus}: lower-prominence observations cannot fill space with an unqualified title`,()=>{
    const findings=[{id:"site_integrity_cms_security",rank:1,title:"CMS review",status:"Review",severity:"low" as const,
      summary:`${"Unfamiliar version qualification must stay attached. ".repeat(30)}Review remains unresolved.`}];
    const copy=buildRegulatoryAssessmentHighlights(findings,focus,{kind:"page"}).highlights;
    assert.doesNotMatch(`${copy.text} ${copy.expanded?.text??""}`,/CMS review|Unfamiliar version/);
    assert.equal(copy.links.length,0);
  });
}

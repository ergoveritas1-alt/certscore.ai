import assert from "node:assert/strict";
import test from "node:test";
import { buildAssessmentBrief } from "./assessment-brief";
import { buildAssessmentHighlights, ASSESSMENT_HIGHLIGHTS_MAX_LENGTH } from "./assessment-highlights";
const page = { kind: "page" } as const;
const reject = Object.freeze({ id: "regulatory_gap__gdpr_eprivacy__post_reject_tracking_reduction", title: "Non-essential activity after confirmed Reject", status: "Potential gap", summary: "Non-essential requests were observed during the retained capture after confirmed Reject.", correctionSteps: ["Review the optional services that ran after rejection and retest the Reject path."] });

test("a high score cannot hide a projected refusal concern", () => {
  const brief = buildAssessmentBrief([reject], page, { score: 85, coverage: { state: "complete" } });
  assert.equal(brief.attention, "attention");
  assert.equal(brief.basis, "projected_gap");
  assert.equal(brief.primary?.sourceRef, reject.id);
  const copy = buildAssessmentHighlights([reject], page, { score: 85 });
  assert.match(copy, /^A privacy concern needs attention/);
  assert.ok(copy.includes(reject.summary));
  assert.ok(copy.includes(reject.correctionSteps[0]!));
  assert.doesNotMatch(copy, /low risk|compliant|Strong|priority issues were identified/);
});

test("explicit low severity supports proportionate wording, zero deduction alone does not", () => {
  const finding = { id: "site_integrity_cms_security", title: "Software lifecycle review", status: "Partial concern", summary: "The declared software branch needs a support-status check.", correctionSteps: ["Verify the installed release and support arrangements."] };
  const low = buildAssessmentBrief([{ ...finding, severity: "low" }], page, { score: 100 });
  assert.equal(low.attention, "targeted_improvements");
  assert.match(low.lead, /targeted improvements/);
  const unknown = buildAssessmentBrief([finding], page, { score: 100 });
  assert.equal(unknown.attention, "review");
  assert.doesNotMatch(unknown.lead, /minor|low risk|targeted improvements/);
});

test("storage review does not inherit a non-essential classification from its topic", () => {
  const finding = { id: "regulatory_gap__gdpr_eprivacy__pre_consent_cookies_storage", title: "Pre-consent storage classification review", status: "Partial concern", summary: "Storage was retained; its purpose classification needs review." };
  const copy = buildAssessmentHighlights([finding], page, { score: 100 });
  assert.match(copy, /cookies and storage before consent/);
  assert.doesNotMatch(copy, /non-essential|tracking continued/);
});

test("known maintenance warnings do not displace a canonical gap", () => {
  const low = Object.freeze({ id: "site_integrity_cms_security", title: "Lifecycle review", severity: "low" as const });
  const input = Object.freeze([low, reject]);
  const brief = buildAssessmentBrief(input, page);
  assert.equal(brief.primary?.id, reject.id);
  assert.equal(brief.secondary[0]?.id, low.id);
  assert.equal(input[0], low);
});

test("a secondary accessibility priority does not upgrade a partial privacy lead", () => {
  const partial = { id: "regulatory_gap__gdpr_eprivacy__outdated_transfer_framework_reference", title: "Outdated transfer framework referenced", status: "Partial concern", summary: "An obsolete transfer framework reference was observed; the current transfer basis was not established." };
  const accessibility = { id: "accessibility_priority_group", title: "Accessibility issues", priority: "high" as const, status: "Observed" };
  const brief = buildAssessmentBrief([partial, accessibility], { kind: "site", scannedPages: 12 }, { score: 90 });
  assert.equal(brief.attention, "review");
  assert.equal(brief.primary?.id, partial.id);
  assert.match(buildAssessmentHighlights([partial, accessibility], brief.scope, { score: 90 }), /^The assessment calls for focused review of privacy disclosures/);
});

test("a projected gap may lead before a partial review without changing the input", () => {
  const partial = Object.freeze({ id: "partial", title: "Policy wording review", status: "Partial concern" });
  const input = Object.freeze([partial, reject]);
  const brief = buildAssessmentBrief(input, page);
  assert.equal(brief.primary?.id, reject.id);
  assert.equal(input[0], partial);
});

test("importance and coverage remain independent", () => {
  const context = { score: 85, coverage: { state: "limited" as const, limitedCount: 2 } };
  const brief = buildAssessmentBrief([reject], page, context);
  assert.equal(brief.attention, "attention");
  assert.equal(brief.coverage.state, "limited");
  const copy = buildAssessmentHighlights([reject], page, context);
  assert.match(copy, /See Detailed evidence for checks that could not be completed/);
  assert.ok(copy.includes(reject.summary));
});

test("completed and limited empty assessments never claim legal compliance", () => {
  const complete = buildAssessmentBrief([], page, { score: 100, coverage: { state: "complete" } });
  const limited = buildAssessmentBrief([], page, { score: 100, coverage: { state: "limited", limitedCount: 3 } });
  assert.equal(complete.attention, "no_priority_observed");
  assert.equal(limited.attention, "limited");
  assert.match(buildAssessmentHighlights([], page, { coverage: limited.coverage }), /See Detailed evidence for checks that could not be completed/);
  assert.equal(buildAssessmentHighlights([], page, { coverage: limited.coverage }).match(/Detailed evidence/g)?.length, 1);
  assert.doesNotMatch(`${complete.lead} ${limited.lead}`, /compliant|secure|no risk|passed|all clear/i);
});

test("low score bands use the existing score policy without inventing findings", () => {
  for (const [score, attention] of [[35, "high_priority"], [60, "needs_work"]] as const) {
    const brief = buildAssessmentBrief([], page, { score });
    assert.equal(brief.attention, attention);
    assert.equal(brief.basis, "existing_score_band");
    assert.equal(brief.primary, null);
    assert.deepEqual(brief.sourceRefs, []);
  }
});

test("accessibility is not described as privacy risk or automatically minor", () => {
  const finding = { id: "accessibility_priority_group", title: "Accessibility issues", priority: "high" as const, status: "Observed", summary: "A keyboard navigation barrier was reproduced.", correctionSteps: ["Restore keyboard access to the affected control."] };
  const brief = buildAssessmentBrief([finding], page, { score: 94 });
  assert.equal(brief.attention, "attention");
  assert.equal(brief.primary?.domain, "accessibility");
  assert.doesNotMatch(buildAssessmentHighlights([finding], page), /privacy|minor|regulatory violation/);
});

test("whole qualifications and original remediation survive the prose projection", () => {
  const summary = "Drupal declares an older release. The installed version and any backported fixes have not been verified.";
  const finding = { id: "site_integrity_cms_security", title: "Software lifecycle review", severity: "low" as const, summary, correctionSteps: ["Verify the installed version and support arrangements before planning an update."] };
  const copy = buildAssessmentHighlights([finding], page);
  assert.ok(copy.includes(summary));
  assert.ok(copy.includes(finding.correctionSteps[0]!));
  assert.doesNotMatch(copy, /site is vulnerable|update immediately/);
});

test("site scope is retained without turning homepage findings into sitewide observations", () => {
  const brief = buildAssessmentBrief([reject], { kind: "site", scannedPages: 10 }, { coverage: { state: "unknown" } });
  assert.deepEqual(brief.scope, { kind: "site", scannedPages: 10 });
  assert.equal(brief.primary?.summary, reject.summary);
  assert.doesNotMatch(buildAssessmentHighlights([reject], brief.scope), /all 10 pages|throughout the site|sitewide tracking/);
});

test("oversized source prose is never cut into an unqualified assertion", () => {
  const finding = { title: "Review ".repeat(100), summary: "Unqualified assertion. ".repeat(100), correctionSteps: ["Long action. ".repeat(100)] };
  const copy = buildAssessmentHighlights([finding], page);
  assert.ok(copy.length <= ASSESSMENT_HIGHLIGHTS_MAX_LENGTH);
  assert.doesNotMatch(copy, /Unqualified assertion/);
  assert.match(copy, /Detailed evidence/);
});

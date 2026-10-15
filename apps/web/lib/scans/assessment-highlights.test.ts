import assert from "node:assert/strict";
import test from "node:test";
import { buildAssessmentBrief } from "./assessment-brief";
import { ASSESSMENT_HIGHLIGHTS_MAX_LENGTH, buildAssessmentHighlights, buildAssessmentHighlightsPresentation } from "./assessment-highlights";
const page = { kind: "page" } as const;
const privacy = Object.freeze({ id: "regulatory_gap__gdpr_eprivacy__privacy_notice_availability", title: "Privacy policy not found", status: "Potential gap", summary: "Completed discovery did not identify a privacy policy within the scanned scope.", correctionSteps: ["Publish a privacy policy explaining the site's personal-data practices."] });

test("supported missing-policy gaps stay visible and retain their existing highlight priority", () => {
  const findings = Object.freeze([Object.freeze({ id: "other", title: "Other issue" }), privacy]);
  const copy = buildAssessmentHighlights(findings, page);
  assert.match(copy, /privacy concern needs attention/);
  assert.match(copy, /Privacy policy not found within the assessed scope/);
  assert.ok(copy.includes(privacy.correctionSteps[0]!));
  assert.equal(findings[0]?.id, "other");
});

test("retrieval limitations and failed discovery cannot become missing-policy findings", () => {
  for (const findings of [[], [{ id: "privacy_policy_unavailable", title: "Privacy policy not retrievable", summary: "Retrieval failed; policy availability is not established." }]]) {
    const copy = buildAssessmentHighlights(findings, page);
    assert.doesNotMatch(copy, /Privacy policy not found/);
    if (findings.length) assert.match(copy, /availability is not established/);
  }
});

test("short assessments have no minimum-length padding or routine positive context", () => {
  const copy = buildAssessmentHighlights([{ title: "Review consent controls", summary: "Reject was not observed in this visit." }], page);
  assert.ok(copy.length < 340);
  assert.match(copy, /Reject was not observed in this visit/);
  assert.doesNotMatch(copy, /practical review aid|Other retained checks|Transport security checks/);
});

test("generic source boilerplate yields to the specific projected finding title", () => {
  const copy = buildAssessmentHighlights([{ id: "regulatory_gap__gdpr_eprivacy__post_reject_tracking_reduction", title: "Non-essential activity after confirmed Reject", status: "Potential gap", summary: "Potential issue based on scan evidence." }], page);
  assert.match(copy, /Non-essential activity after confirmed Reject/);
  assert.doesNotMatch(copy, /Potential issue based on scan evidence/);
});

test("oversized prose cannot crowd out the action or secondary findings", () => {
  const copy = buildAssessmentHighlights([
    { title: "CMS security review", summary: "Retained version context. ".repeat(50), correctionSteps: ["Verify the declared release."] },
    { title: "Reject-path review" }, { title: "Accessibility issues" },
  ], page);
  assert.match(copy, /Verify the declared release/);
  assert.match(copy, /Reject-path review/);
  assert.match(copy, /Accessibility issues/);
  assert.ok(copy.length <= ASSESSMENT_HIGHLIGHTS_MAX_LENGTH);
});

test("CMS qualifications stay whole, including the limits of version detection", () => {
  const summary = "WordPress declares 4.5.33. The version is declared, not runtime-confirmed; verify the installed release and backported fixes.";
  assert.ok(buildAssessmentHighlights([{ title: "Unsupported CMS branch", summary }], page).includes(summary));
  const oversized = buildAssessmentHighlights([{ title: "Unsupported CMS branch", summary: `${summary} ${"Additional context. ".repeat(50)}` }], page);
  assert.doesNotMatch(oversized, /WordPress declares|Additional context/);
  assert.match(oversized, /recommended fixes/);
});

test("bounded negatives and unconfirmed actions preserve their projected meaning", () => {
  for (const summary of [
    "No activity observed during capture; this does not establish activity outside the captured window.",
    "Two requests were recorded after the click; semantic refusal registration remains unconfirmed.",
    "Exact unchanged storage persistence was observed; active use was not established.",
  ]) {
    const copy = buildAssessmentHighlights([{ title: "Action evidence review", summary }], page);
    assert.ok(copy.includes(summary));
    assert.doesNotMatch(copy, /did not stop|confirmed Reject path|tracking was not tested/);
  }
});

test("secondary titles receive context without inventing behavior or changing the brief", () => {
  const findings = [{ title: "Pre-consent storage", summary: "Classified non-essential storage was observed before consent." },
    { title: "Third-party embedded service", summary: "An embed was retained; tracking classification is not established." }];
  const brief = buildAssessmentBrief(findings, page);
  assert.equal(brief.secondary[0]?.summary, findings[1]!.summary);
  const copy = buildAssessmentHighlights(findings, page);
  assert.match(copy, /storage was observed before consent/);
  assert.match(copy, /Also review “Third-party embedded service”/);
  assert.doesNotMatch(copy, /embed.*tracking observed|before the first consent surface/);
});

test("large lists retain their full source count internally without filling the paragraph with counts", () => {
  const findings = Array.from({ length: 1000 }, (_, index) => ({ id: `issue-${index}`, title: `Issue ${index + 1}` }));
  const brief = buildAssessmentBrief(findings, { kind: "site", scannedPages: 10 });
  assert.equal(brief.findingCount, 1000);
  assert.equal(brief.sourceRefs.length, 1000);
  const copy = buildAssessmentHighlights(findings, brief.scope);
  assert.ok(copy.length <= ASSESSMENT_HIGHLIGHTS_MAX_LENGTH);
  assert.doesNotMatch(copy, /1,000 priority|Issue 4/);
});

test("incomplete checks are named and linked without inventing a manual-review requirement", () => {
  const context = { coverage: { state: "limited" as const, limitedCount: 2,
    items: [{ id: "privacy_notice_availability", title: "Privacy-policy discovery" }, { id: "transport_security_tls_certificate", title: "Website certificate" }] } };
  const before = structuredClone(context);
  const result = buildAssessmentHighlightsPresentation([], page, context);
  assert.match(result.text, /Could not complete: “Privacy-policy discovery”, “Website certificate”/);
  assert.deepEqual(result.links, [{ label: "“Privacy-policy discovery”", targetId: "evidence-row-privacy_notice_availability" },
    { label: "“Website certificate”", targetId: "evidence-row-transport_security_tls_certificate" }]);
  assert.doesNotMatch(result.text, /checklist item|technically limited|verify.*manually/);
  assert.deepEqual(context, before);
});

test("owner-removed callouts do not return through an aggregate coverage count", () => {
  const context = { coverage: { state: "limited" as const, limitedCount: 1, items: [] } };
  const brief = buildAssessmentBrief([privacy], page, context);
  assert.equal(brief.coverage.state, "limited");
  assert.equal(brief.coverage.limitedCount, 1);
  assert.doesNotMatch(buildAssessmentHighlights([privacy], page, context), /Decline|checklist item|Could not complete|technically limited/);
});

test("accessibility groups name existing member findings and link the shared evidence", () => {
  const finding = { id: "accessibility_priority_group", title: "Accessibility issues", evidenceJson: {
    presentationGroup: "accessibility", findings: [{ id: "visual_contrast_accessibility_issue", title: "Visual contrast accessibility issue", summary: "Low-contrast text was detected on one page." }] } };
  const before = structuredClone(finding);
  const result = buildAssessmentHighlightsPresentation([privacy, finding], page);
  assert.match(result.text, /Also review “Low text contrast”/);
  assert.ok(result.links.some(link => link.label === "“Low text contrast”" && link.targetId === "accessibility-evidence"));
  assert.deepEqual(finding, before);
});

test("many incomplete checks preserve the paragraph budget and keep a shared evidence link", () => {
  const result = buildAssessmentHighlightsPresentation([privacy], page, { coverage: { state: "limited", items:
    Array.from({ length: 20 }, (_, i) => ({ id: `check-${i}`, title: `Check ${i}: ${"Long title ".repeat(8)}` })) } });
  assert.ok(result.text.length <= ASSESSMENT_HIGHLIGHTS_MAX_LENGTH);
  assert.ok(result.links.some(link => link.targetId === "evidence"));
});

test("secondary Reject observation remains concrete when a long storage finding leads the summary", () => {
  const findings = [
    { id: "regulatory_gap__gdpr_eprivacy__pre_consent_cookies_storage", title: "Pre-consent storage classification review",
      summary: "Cookies or browser storage were retained before consent. First retained item: country (example.test): unknown, first observed 1.677s after scan start. Essentiality was not confirmed for every item.",
      correctionSteps: ["Review the supporting evidence and recommended fixes in Detailed evidence."] },
    { id: "regulatory_gap__gdpr_eprivacy__post_reject_tracking_reduction", title: "Post-choice tracking reduction",
      summary: "Partial support from scan evidence; 2 tracking request(s) began after the Reject control was clicked (including Cloudflare); first observed 0.96s after the click. Review the recorded requests and how the Reject action controls this tracking activity." },
    { id: "accessibility_priority_group", title: "Accessibility issues" },
  ];
  const saved = structuredClone(findings);
  const context = {coverage:{state:"limited" as const,items:[{id:"tracking_before_consent",title:"Pre-consent non-essential tracking"}]}};
  const brief = buildAssessmentBrief(findings, page, context);
  const result = buildAssessmentHighlightsPresentation(findings, page, context);
  assert.equal(brief.primary?.id, findings[0]!.id);
  assert.ok(result.text.includes(findings[1]!.summary!));
  assert.match(result.text, /Could not complete: “Pre-consent non-essential tracking”/);
  assert.doesNotMatch(result.text, /confirmed Reject|failed to reject|ignored Reject/);
  assert.ok(result.links.some(link => link.label === "“Post-choice tracking reduction”"));
  assert.ok(result.text.length <= ASSESSMENT_HIGHLIGHTS_MAX_LENGTH);
  assert.deepEqual(findings, saved);
});

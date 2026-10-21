import assert from "node:assert/strict";
import test from "node:test";
import { accessibilityAuditFixture } from "../../../../packages/certscore-contracts/src/accessibility-audit.fixture";
import { webmasterRemediation, webmasterRemediationText } from "../../lib/scans/webmaster-remediation";
import { pdfGroupRemediation } from "./report-pdf-remediation";
import { pdfFrontmatter } from "./report-pdf-frontmatter";
import type { CanonicalReportExport } from "./report-export";
import type { PdfReviewGroup } from "./report-pdf-reader";

function fixture(id: string, topic = "policy") {
  const audit = accessibilityAuditFixture();
  const report = {
    scan: { id: audit.scanId, requestedUrl: audit.documentUrl },
    projection: { unifiedFindings: [{ unifiedFindingId: id, title: id, summary: "Existing issue", details: { family: topic, ruleExamples: ["label", "button-name"] }, evidence: { entities: {} }, presentation: { suggestedFix: "STALE_GENERIC" } }], checklist: [] },
    appendix: {}, accessibilityEvidence: audit,
  } as unknown as CanonicalReportExport;
  const group = { id, topic, title: id, status: "Finding", observations: [{ id, topic, title: id, status: "Finding", explanation: "Existing issue", steps: ["STALE_GENERIC"] }] } as PdfReviewGroup;
  return { report, group };
}

test("all current remediation families supply owner, source-level fixes and measurable completion criteria", () => {
  for (const id of ["initial-tracking", "refusal", "device-identification", "policy_behavior_conflict", "california_rights_disclosure_not_observed", "semantic_labeling_accessibility_issue", "text_alternative_accessibility_issue", "site_integrity_hidden_outbound_links"]) {
    const plan = webmasterRemediation(id)!;
    assert.ok(plan.owner.length > 15, id);
    assert.ok(plan.steps.length >= 3, id);
    assert.ok(plan.verification.length > 180, id);
    assert.doesNotMatch(webmasterRemediationText(plan), /Review the flagged evidence|Perform a targeted DOM audit|unique aria-labels/);
  }
  assert.equal(webmasterRemediation("invented-finding"), null);
  assert.match(webmasterRemediationText(webmasterRemediation("post-refusal-review")!), /do not assume every post-refusal request/);
});

test("runtime repair targets come only from this existing issue's projected entities", () => {
  const { report, group } = fixture("initial-tracking", "storage");
  report.projection.unifiedFindings[0]!.unifiedFindingId = "preconsent_tracking";
  report.projection.unifiedFindings[0]!.evidence!.entities = { runtimeRequestUrls: ["https://metrics.example/collect?v=[redacted]"], preconsent_cookie_names: ["_example"] };
  const before = structuredClone(report);
  const plan = pdfGroupRemediation(report, group);
  assert.match(plan.locations.join(" "), /metrics.example\/collect/);
  assert.match(plan.locations.join(" "), /_example.*Snapshot presence/);
  assert.doesNotMatch(plan.locations.join(" "), /OneTrust|Google Analytics|C0004/);
  assert.deepEqual(report, before);
  report.projection.unifiedFindings = [];
  assert.match(pdfGroupRemediation(report, group).locations.join(" "), /endpoints\/initiators not retained/);
});

test("accessibility fixes bind each rule and selector without recommending unrelated attributes", () => {
  const { report, group } = fixture("semantic_labeling_accessibility_issue", "accessibility");
  const plan = pdfGroupRemediation(report, group);
  assert.deepEqual(plan.rules.map(rule => rule.id).sort(), ["button-name", "label"]);
  const text = pdfFrontmatter(report, "http://localhost:3000", { text: (text, options) => [{ text, ...options }], heading: text => ({ text }) }).map(line => line.text).join("\n");
  assert.match(text, /label: #label/);
  assert.match(text, /button-name: #button-name/);
  assert.match(text, /<label for="contact-email">/);
  assert.match(text, /aria-label="Open search"/);
  assert.match(text, /actual action, not this example/);
  assert.doesNotMatch(text, /image-alt|color-contrast|STALE_GENERIC|unique aria-labels|tabindex sequence/);
  report.accessibilityEvidence!.scanId = "wrong-scan";
  assert.equal(pdfGroupRemediation(report, group).rules.length, 0);
  assert.match(pdfGroupRemediation(report, group).locations.join(" "), /unavailable or not bound/);
});

test("policy mismatch includes the exact projected passage and linked runtime target", () => {
  const { report, group } = fixture("policy_behavior_conflict");
  report.projection.unifiedFindings[0]!.details = { family: "contradiction", policySourceUrl: "https://example.com/privacy", policySnippet: "Optional analytics waits for consent." } as never;
  report.projection.unifiedFindings[0]!.evidence!.entities = { runtimeRequestUrls: ["https://metrics.example/collect"] };
  const plan = pdfGroupRemediation(report, group);
  assert.match(plan.locations.join(" "), /Optional analytics waits for consent/);
  assert.match(plan.locations.join(" "), /Linked runtime request: https:\/\/metrics.example\/collect/);
  assert.match(plan.steps.join(" "), /do not merely weaken a consent promise/);
});

test("unsupported repair kinds fail honestly to diagnosis, never fabricate a selector or completed fix", () => {
  const { report, group } = fixture("new-unmapped-finding");
  group.observations[0]!.steps = [];
  const plan = pdfGroupRemediation(report, group);
  assert.match(plan.steps.join(" "), /obtain that diagnostic detail.*Do not guess selectors/);
  assert.match(plan.verification, /remain open rather than be marked remediated/);
  assert.equal(plan.locations.length, 1);
});

test("new repair locations omit private infrastructure without changing the retained evidence", () => {
  const { report, group } = fixture("policy_behavior_conflict");
  report.projection.unifiedFindings[0]!.details = { family: "contradiction", policySourceUrl: "http://127.0.0.1:3000/privacy" } as never;
  const before = structuredClone(report);
  const plan = pdfGroupRemediation(report, group);
  assert.doesNotMatch(plan.locations.join(" "), /127\.0\.0\.1|localhost/);
  assert.match(plan.locations.join(" "), /non-public location was omitted/);
  assert.deepEqual(report, before);
});

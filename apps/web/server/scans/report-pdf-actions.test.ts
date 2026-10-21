import assert from "node:assert/strict";
import test from "node:test";
import type { CanonicalReportExport } from "./report-export";
import { pdfAppendixActions } from "./report-pdf-actions";
import { PDF_REPORT_TOPICS } from "./report-pdf-topics";
import { accessibilityAuditFixture } from "../../../../packages/certscore-contracts/src/accessibility-audit.fixture";

function fixture() {
  return { projection: { unifiedFindings: [] }, appendix: { evidenceDossier: { checklistDetails: [] } } } as unknown as CanonicalReportExport;
}

test("repair area uses explicit finding identity and retained guidance without changing source data", () => {
  const report = fixture();
  report.projection.unifiedFindings = [{
    unifiedFindingId: "weak_cookie_security_attributes", severity: "high", title: "Cookie attributes",
    presentation: { suggestedFix: "Review Secure and SameSite for the listed cookie." },
    evidence: { pageUrls: ["https://example.test/account"], entities: { cookies: ["session"] } },
  }] as unknown as CanonicalReportExport["projection"]["unifiedFindings"];
  report.appendix.evidenceDossier!.checklistDetails = [{
    id: "weak_cookie_security_attributes", topic: "storage", label: "Cookie attributes", status: "Review signal",
    explanation: "Retained attributes need review.", note: "", facts: [], subchecks: [],
    correctionSteps: ["Update the responsible Set-Cookie response."], evidenceRefs: ["cookie:session:1"],
  }];
  const before = structuredClone(report);
  const actions = pdfAppendixActions(report);
  assert.equal(actions.storage.length, 1, "Exact matching checklist row enriches the finding, not a duplicate task");
  assert.deepEqual(actions.storage[0]!.affected, ["https://example.test/account", "Cookie: session"]);
  assert.ok(actions.storage[0]!.steps.includes("Update the responsible Set-Cookie response."));
  assert.ok(actions.storage[0]!.references.includes("cookie:session:1"));
  assert.deepEqual(report, before);
});

test("missing evidence and positive rows never become fixes; review retains its original status", () => {
  const report = fixture();
  report.appendix.evidenceDossier!.checklistDetails = (["Observed", "Not observed", "Insufficient evidence", "Not testable", "Review signal", "Gap observed"] as const).map((status, i) => ({
    id: `row-${i}`, topic: "policy", label: status, status, explanation: status, note: "", facts: [], subchecks: [],
    correctionSteps: ["Inspect the retained disclosure."], evidenceRefs: [],
  }));
  const actions = pdfAppendixActions(report);
  assert.deepEqual(actions.policy.map(action => action.status), ["Review signal", "Gap observed"]);
  for (const topic of PDF_REPORT_TOPICS.filter(topic => topic.id !== "policy")) assert.deepEqual(actions[topic.id], []);
});

test("automated accessibility issues get concrete repairs while manual-review items remain investigations", () => {
  const report = fixture();
  report.accessibilityEvidence = accessibilityAuditFixture();
  const before = structuredClone(report);
  const actions = pdfAppendixActions(report).accessibility;
  assert.match(actions.find(action => action.id === "image-alt")!.steps.join(" "), /alt attribute.*decorative/);
  assert.match(actions.find(action => action.id === "label")!.steps.join(" "), /for attribute.*unique id/);
  const buttonAction = actions.find(action => action.id === "button-name")!;
  assert.match(buttonAction.steps.join(" "), /accessible name.*actual action/);
  assert.match(buttonAction.verification!, /Tab to the button.*Enter\/Space activation in staging/);
  assert.match(actions.find(action => action.id === "color-contrast")!.steps.join(" "), /CSS.*measured and required ratios/);
  assert.deepEqual(report, before);
  report.accessibilityEvidence.reviewItems = report.accessibilityEvidence.violations;
  report.accessibilityEvidence.violations = [];
  for (const action of pdfAppendixActions(report).accessibility) {
    assert.equal(action.status, "Manual review");
    assert.match(action.steps.join(" "), /Confirm the issue in context/);
    assert.equal(action.additionalGuidanceUrl, undefined);
  }
});

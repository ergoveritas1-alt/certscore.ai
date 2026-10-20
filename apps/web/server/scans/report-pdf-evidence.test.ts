import assert from "node:assert/strict";
import test from "node:test";
import type { CanonicalReportExport } from "./report-export";
import { pdfNarrativeFindings, pdfFindingLocations, pdfFindingEntityRows } from "./report-pdf-evidence";
import { pdfTopicForFinding } from "./report-pdf-topics";
import { pdfAppendixActions } from "./report-pdf-actions";

test("canonical identities and category ownership override a conflicting legacy family in PDF chapters", () => {
  for (const [id, owner, expected] of [
    ["cookie_policy_present", "data_handling_disclosures", "policy"],
    ["privacy_policy_present", "notice_scope_entity_identity", "policy"],
    ["post_refusal_non_essential_activity", "enforcement_outcomes_after_user_choice", "consent"],
    ["retained-policy-finding", "privacy_contacts_accountability", "policy"],
  ]) {
    const finding = { unifiedFindingId: id, details: { family: "accessibility" }, categoryAlignments: [{ relation: "owner", evidenceCategoryId: owner }] };
    const before = structuredClone(finding);
    assert.equal(pdfTopicForFinding(finding), expected);
    assert.deepEqual(finding, before);
  }
});

test("audit-only and supporting findings remain in the export without becoming PDF findings or repair tasks", () => {
  const findings = [
    { unifiedFindingId: "cookie_policy_present", severity: "medium", presentationDecision: { status: "audit_only" }, surfacingDecision: { decisionState: "support_only", reportLane: "confidence_and_coverage" } },
    { unifiedFindingId: "privacy_policy_present", severity: "medium", surfacingDecision: { decisionState: "support_only" } },
    { unifiedFindingId: "post_refusal_non_essential_activity", severity: "high", presentationDecision: { status: "surface" }, surfacingDecision: { decisionState: "review", reportLane: "main" } },
  ];
  const report = { projection: { unifiedFindings: findings }, appendix: { evidenceDossier: { checklistDetails: [] } } } as unknown as CanonicalReportExport;
  const before = structuredClone(report);
  assert.deepEqual(pdfNarrativeFindings(report).map(finding => finding.unifiedFindingId), ["post_refusal_non_essential_activity"]);
  const actions = pdfAppendixActions(report);
  assert.deepEqual(actions.consent.map(action => action.id), ["post_refusal_non_essential_activity"]);
  assert.equal(Object.values(actions).flat().length, 1);
  assert.deepEqual(report, before);
});

test("structured packets stay traceable in the workpaper while repair locations contain actionable targets", () => {
  const entities = { runtimeVendors: ["Example Analytics"], observedRuntimeVendors: ["Example Analytics"], cookies: ["analytics_id"], runtimeRequestUrls: ["https://metrics.example.test/collect"], accessibilitySelectors: ["#contact-email"],
    accessibilityAxeEvidence: [JSON.stringify({ selectors: ["#contact-email"], html: "<input>", failureSummary: "RAW_STRUCTURED_EVIDENCE" })],
    consentGovernanceDisclosureEvidence: [JSON.stringify({ sourceHash: "a".repeat(64), observed: true })] };
  const before = structuredClone(entities);
  const locations = pdfFindingLocations(entities);
  assert.equal(locations.filter(location => location === "Vendor: Example Analytics").length, 1);
  assert.ok(locations.some(location => location.includes("https://metrics.example.test/collect")));
  assert.ok(locations.some(location => location.includes("#contact-email")));
  assert.doesNotMatch(locations.join(" "), /RAW_STRUCTURED_EVIDENCE|sourceHash/);
  const rows = pdfFindingEntityRows(entities, key => key);
  assert.ok(rows.some(row => row[0] === "Structured evidence in JSON workpaper" && row[1]!.includes("accessibilityAxeEvidence: 1 record")));
  assert.doesNotMatch(JSON.stringify(rows), /RAW_STRUCTURED_EVIDENCE|<input>/);
  assert.deepEqual(entities, before);
});

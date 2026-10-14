import assert from "node:assert/strict";
import test from "node:test";
import { canonicalPolicyDocumentBrandRelationship } from "@certscore/contracts";
import { buildGdprTransparencyTopicCoverageDiagnostics, extractPolicySections, retainedArticle13SectionEvidenceFromSections } from "./scanners/policy-surface-scanner.js";

test("a complete retained topic survives unrelated extraction truncation; absent topics remain limited", () => {
  const sourceUrl = "https://example.test/privacy";
  const visibleText = "Privacy policy. Retention period. We retain personal data for three years after the service relationship ends and then delete it unless a legal obligation requires a longer period.";
  const sections = extractPolicySections({sourceUrl, visibleText, html:`<main><h1>Privacy policy</h1><h2>Retention period</h2><p>${visibleText}</p></main>`});
  const evidence = retainedArticle13SectionEvidenceFromSections(sections, sourceUrl);
  const input = {
    contentCoverage: {status:"truncated" as const,sourceTextChars:10000,extractedSectionCount:20,retainedSectionCount:2,retainedTableRowCount:0,limitationKeys:["section_limit"]},
    documentRole:"policy_document" as const,
    documentTextCoverage:{status:"complete" as const,sourceTextChars:10000,retainedTextChars:10000,limitationKeys:[]},
    ownership:{targetRelationship:"target_controller" as const,ownershipConfidence:.98,ownershipReasonCodes:["same_registrable_domain_as_scan_target"]},sectionEvidence:evidence,
  };
  const rows = buildGdprTransparencyTopicCoverageDiagnostics(input)!;
  const retention = rows.find(row => row.topic === "data_retention")!;
  assert.equal(retention.contractVersion,"gdpr_transparency_topic_coverage_diagnostic.v2");
  assert.equal(retention.evaluationState,"observed"); assert.equal(retention.sectionExtractionState,"complete"); assert.equal(retention.coverageState,"complete");
  assert.ok(rows.filter(row=>row.evaluationState==="unknown").every(row=>row.coverageState==="limited"));
  for (const patch of [{sectionExtractionState:"truncated" as const}, {evidenceTextSha256:undefined}, {sourceDocumentTextSha256:undefined}, {extractionLimitation:"truncated"}, {selectedEvidenceStrength:"weak" as const}]) {
    const altered = {...input,sectionEvidence:evidence.map(row => ({...row,...patch}))};
    assert.equal(buildGdprTransparencyTopicCoverageDiagnostics(altered)?.find(row => row.topic === "data_retention")?.coverageState,"limited");
  }
  for (const targetRelationship of ["service_provider", "unknown"] as const) assert.equal(buildGdprTransparencyTopicCoverageDiagnostics({...input,ownership:{...input.ownership,targetRelationship}})?.find(row=>row.topic==="data_retention")?.coverageState,"limited");
});

test("Ars publisher relationship is exact, date-bound and not generalized to unrelated publishers", () => {
  const args = {targetUrl:"https://arstechnica.com/",documentUrl:"https://www.condenast.com/privacy-policy",observedAt:"2026-10-14T00:00:00Z"};
  assert.equal(canonicalPolicyDocumentBrandRelationship(args)?.ownerEntity,"Condé Nast");
  for (const patch of [{targetUrl:"https://other.example/"},{documentUrl:"https://condenast.com.evil.example/privacy"},{documentUrl:"https://vendor.example/privacy"},{observedAt:"2026-10-13T23:59:59Z"},{observedAt:undefined}]) assert.equal(canonicalPolicyDocumentBrandRelationship({...args,...patch}),undefined);
});

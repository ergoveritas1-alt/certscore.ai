import { assessCmsSignals, cmsSecurityProjectionSchema, formDestinationProjectionSchema, consentControlAssessmentSchema, type CmpAuditAssessment } from "@certscore/contracts";
import { observedControlAssessment } from "../../lib/scans/test-fixtures/observed-control-assessment";
import type { NormalizedConcern } from "../../lib/scans/normalized-concerns";

/** Retained and normalized test packets for PDF inventory/pagination regressions. */
export function reportCmpEvidenceFixture(scanId: string, declarations = 100) {
  const rows: CmpAuditAssessment["rows"] = ["categories", "services", "privacy_access", "consent_record", "duration", "declared_not_found", "found_not_declared", "cookie_information", "implementation", "prominence"].map(id => ({ id: id as CmpAuditAssessment["rows"][number]["id"], status: "not_assessed", detail: "No verified evidence retained for this check.", evidenceRefs: [] }));
  const row = (id: string) => rows.find(item => item.id === id)!;
  Object.assign(row("categories"), { status: "partially_assessed", detail: "Captured categories and privacy-choice settings.", evidenceRefs: ["cmp:preferences:1"], inventory: { categories: [{ name: "Strictly necessary", checked: true }, { name: "Analytics", checked: false }, { name: "Marketing", checked: false }], privacyChoices: [{ label: "Analytics consent", enabled: true, checked: false }] } });
  Object.assign(row("services"), { status: "partially_assessed", detail: "Named services in the retained CMP inventory.", evidenceRefs: ["cmp:services:1"], inventory: { services: [{ name: "Example Analytics", source: "cmp_api_inventory", sourceRef: "cmp:services:1" }] } });
  Object.assign(row("cookie_information"), { status: "observed", detail: "Cookie descriptions captured from the CMP.", evidenceRefs: ["cmp:declarations:1"], inventory: { declarations: Array.from({ length: declarations }, (_, index) => ({ name: `retained_cookie_${index + 1}`, purpose: "Audience measurement", duration: "30 days", source: "cmp_api_inventory" })) } });
  Object.assign(row("implementation"), { status: "partially_assessed", detail: "Activity in the retained choice window.", evidenceRefs: ["cmp:activity:1"], inventory: { choiceActivity: [{ action: "reject", windowMs: 8000, requestCount: 2, nonEssentialRequestCount: 1, requests: [{ hostname: "metrics.example.test", path: "/collect", vendor: "Example Analytics", purpose: "analytics", msAfterClick: 750, nonEssential: true }] }] } });
  const assessment = consentControlAssessmentSchema.parse({ ...structuredClone(observedControlAssessment), scan: { ...observedControlAssessment.scan, scanId }, cmpAudit: {
    version: "cmp_audit_assessment.v6", scanId, sourceSha256: "a".repeat(64), support: { state: "supported", provider: "OneTrust", recipeVersion: "fixture.v1", reason: "Verified fixture inspection" }, rows,
  } });
  const normalizedConcerns = assessment.cmpAudit!.rows.map(row => ({ originKey: `consent.cmp_audit.${row.id}`, originType: "runtime_artifact", externalSurfacingEligibility: "eligible", promotionEligibility: "internal_only", evidenceBundle: { rawEvidence: { cmpAuditSourceSha256: assessment.cmpAudit!.sourceSha256, cmpAuditRow: row } } })) as unknown as NormalizedConcern[];
  return { assessment, normalizedConcerns };
}

export function reportTechnicalEvidenceFixture(scanId: string) {
  const signals = [{ evidenceRef: "site_integrity:dom:0", kind: "meta_generator" as const, value: "Drupal 7.98", sourceUrl: "https://example.test/", artifactRef: "runtime:dom:1" }];
  const cms = cmsSecurityProjectionSchema.parse({ contractVersion: "certscore.cms-security-projection.v1", scanId, verificationStatus: "verified", sourceHash: "a".repeat(64), documentUrl: "https://example.test/", documentToken: "doc-1", capturedAt: "2026-10-20T12:00:00.000Z", evidenceRef: "runtime:cms", signals, assessment: assessCmsSignals(signals, "2026-10-20T12:00:00.000Z") });
  const forms = formDestinationProjectionSchema.parse({ contractVersion: "certscore.form-destination-projection.v1", scanId, verificationStatus: "verified", sourceHash: "b".repeat(64), trace: { contractVersion: "certscore.form-destination-trace.v1", mode: "passive", events: [{ evidenceRef: "form_trace:event:0", kind: "input", observedAtMs: 100, documentUrl: "https://example.test/", documentToken: "doc-1", formIndex: 0, actionUrl: "https://example.test/contact", actionDomain: "example.test", fields: [{ evidenceRef: "form_trace:field:0:0", name: "email", category: "email", personal: true }] }], requests: [{ evidenceRef: "form_trace:request:0", networkRequestId: "request-1", eventRef: "form_trace:event:0", observedAtMs: 200, url: "https://metrics.example.test/collect", domain: "metrics.example.test", method: "POST", party: "third_party", outsideDeclaredDestination: true, status: "response_observed", relation: "temporal_only", matches: [] }], coverage: { truncated: false, unsupportedPayloads: 1, scope: "main_document_existing_window", activeSubmission: false } } });
  return { cms, forms };
}

export function reportVisualEvidenceFixture(scanId: string, screenshotSha256: string) {
  return consentControlAssessmentSchema.parse({
    ...structuredClone(observedControlAssessment), artifactVersion: "2.2",
    scan: { ...observedControlAssessment.scan, scanId },
    document: { ...observedControlAssessment.document, canonicalDocumentToken: "doc-token", observedDocumentTokens: ["doc-token"] },
    visualEvidence: { status: "available", artifactRefs: ["screenshot"], reasonCodes: [] },
    provenance: { ...observedControlAssessment.provenance, contractVersion: "2.2" },
    controls: Object.fromEntries(Object.entries(observedControlAssessment.controls).map(([intent, control]) => [intent, {
      ...control, inspection: { policy: "control_specific_inspection.v1", status: "complete", evidenceRefs: ["ConsentControlGeometryEvidence.json"] },
    }])),
    evidence: ["accept", "reject"].map(intent => ({ evidenceId: `candidate-${intent}`, intent, label: intent, locale: "en",
      layer: "first_layer", visible: true, actionable: true, observedAtMs: 10, documentId: "doc-1", documentToken: "doc-token",
      channels: ["geometry"], artifactRefs: ["screenshot"], classifier: null })),
    visualComparison: { version: "consent_control_visual_comparison.v1", documentToken: "doc-token", screenshotArtifactRef: "screenshot",
      screenshotSha256, imageWidth: 1000, imageHeight: 800, captureSkewMs: 5,
      accept: { candidateId: "candidate-accept", bounds: [600, 250, 140, 40], fillContrast: 2, outerEmphasisFraction: 0.1, backgroundUniformity: 1, interiorUniformity: 1 },
      reject: { candidateId: "candidate-reject", bounds: [200, 250, 160, 40], fillContrast: 2, outerEmphasisFraction: 0.1, backgroundUniformity: 1, interiorUniformity: 1 } },
  });
}

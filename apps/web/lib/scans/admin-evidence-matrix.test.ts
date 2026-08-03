import assert from "node:assert/strict";
import test from "node:test";
import type { GdprEprivacyCoverageChecklistItem } from "./gdpr-eprivacy-coverage-checklist";
import { parseAdminEvidenceMatrix, projectAdminEvidenceMatrix } from "./admin-evidence-matrix";

function row(id: string, status: GdprEprivacyCoverageChecklistItem["status"], note: string): GdprEprivacyCoverageChecklistItem {
  return { id, status, note, explanation: note, label: id } as GdprEprivacyCoverageChecklistItem;
}

function policyRow(
  id: string,
  result: string,
  retainedEvidence: Record<string, unknown> = {}
): GdprEprivacyCoverageChecklistItem {
  return {
    ...row(id, result === "disclosure_observed" ? "Observed" : "Not confirmed", id),
    criticalEvidence: {
      missingOrIncompleteSourceSignals: [],
      pipeline: {
        concernPolicyKey: "gdpr_transparency_article13",
        projectionStage: "coverage_policy",
        wc01NormalizedConcernKey: "gdpr_transparency_article13",
        ws01EvidenceRole: "retained_policy_evidence"
      },
      projectedFindings: [],
      retainedEvidence: {
        ...retainedEvidence,
        policyEvidenceAssessment: { result }
      },
      statusBasis: "canonical policy evidence assessment"
    }
  };
}

test("projects bounded Admin evidence only from canonical checklist rows", () => {
  const matrix = projectAdminEvidenceMatrix({
    checklistRows: [
      row("controller_contact_disclosure", "Observed", "Controller details retained."),
      row("reject_all_path_availability", "Review signal", "No observable refusal path before non-essential activity."),
      row("transport_security_https_delivery", "Gap observed", "HTTP delivery retained."),
      row("session_replay_fingerprinting_review", "Not confirmed", "Review retained runtime evidence."),
      row("device_identification_fingerprinting_signal_observed", "Not observed", "No fingerprinting signal retained."),
      row("consent_surface_observed", "Not observed", "No operational consent surface was retained."),
      row("cmp_framework_signal_observed", "Observed", "Configuration review recommended."),
      row("accept_consent_control", "Not observed", "No operational consent surface was retained."),
      row("options_settings_preferences_control", "Not observed", "No operational consent surface was retained."),
      row("privacy_notice_availability", "Observed", "Privacy notice retained.")
    ],
    cmpVendorName: "Example CMP",
    generatedAt: "2026-08-02T12:00:00.000Z",
    sourceProjectionVersion: "scan_report_display_projection.v1"
  });

  assert.equal(matrix.version, "admin_evidence_matrix.v2");
  assert.equal(matrix.privacyConsent.reject?.status, "review_signal");
  assert.equal(matrix.privacyConsent.mechanism?.status, "not_observed");
  assert.equal(matrix.transparency.results.CC?.status, "observed");
  assert.equal(matrix.transparency.results.LB, null);
  assert.deepEqual(matrix.transparency.aggregate, { concern: 0, observed: 1, projected: 1, review: 0, total: 10, unresolved: 0 });
  assert.equal(matrix.transport.results.HD?.status, "gap_observed");
  assert.equal(matrix.runtime.results.SR?.status, "not_confirmed");
  assert.equal(matrix.runtime.aggregate.concern, 0);
  assert.equal(parseAdminEvidenceMatrix(matrix)?.privacyConsent.cmpVendorName, "Example CMP");
});

test("bounds descriptors and rejects malformed persisted projections", () => {
  const matrix = projectAdminEvidenceMatrix({
    checklistRows: [row("controller_contact_disclosure", "Observed", "x".repeat(400))],
    cmpVendorName: null,
    sourceProjectionVersion: null
  });
  assert.ok((matrix.transparency.results.CC?.descriptor.length ?? 0) <= 220);
  assert.ok(parseAdminEvidenceMatrix({ ...matrix, version: "admin_evidence_matrix.v1" }));
  assert.equal(parseAdminEvidenceMatrix({ ...matrix, version: "admin_evidence_matrix.v3" }), null);
  assert.equal(parseAdminEvidenceMatrix({ ...matrix, transparency: { ...matrix.transparency, aggregate: null } }), null);
});

test("uses canonical policy health when the bounded Pulse checklist omits internal retained evidence", () => {
  const matrix = projectAdminEvidenceMatrix({
    checklistRows: [
      row("controller_contact_disclosure", "Observed", "Controller retained."),
      row("legal_basis_disclosure_observed", "Not confirmed", "No direct passage retained."),
      row("retention_disclosure_observed", "Observed", "Retention retained."),
      row("processing_purposes_disclosure", "Observed", "Purposes retained."),
      row("recipients_vendor_categories_disclosure", "Not confirmed", "No direct passage retained."),
      row("data_subject_rights_disclosure", "Observed", "Rights retained."),
      row("international_transfers_disclosure", "Review signal", "Transfer language ambiguous."),
      row("dpo_contact_point_disclosure", "Observed", "Contact retained."),
      row("supervisory_authority_complaint_disclosure", "Not confirmed", "No direct passage retained."),
      row("automated_decision_making_profiling_disclosure", "Not observed", "No disclosure retained.")
    ],
    cmpVendorName: null,
    policyDisclosureSummary: {
      policyTextExtractionHealth: {
        detectedPolicyLanguage: "fr",
        gdprTransparencyLanguageSupported: true,
        policyTextEvidenceProjectionStatus: "verified_complete",
        policyTextExtractionStatus: "ok"
      }
    },
    sourceProjectionVersion: null
  });

  assert.equal(matrix.policyEvidence?.stage, "topic_evidence_limited");
  assert.equal(matrix.policyEvidence?.detectedLanguage, "fr");
  assert.deepEqual(matrix.policyEvidence?.topicResults, {
    ambiguous: 1,
    disclosureObserved: 5,
    extractionIncomplete: 0,
    notEvaluated: 1,
    notLocatedAutomatically: 3
  });
});

test("projects the canonical policy evidence failure stage and every transparency row", () => {
  const extractionHealth = {
    detectedPolicyLanguage: "de",
    extractionFailureReason: null,
    gdprTransparencyLanguageSupported: true,
    policyTextEvidenceProjectionStatus: "verified_complete",
    policyTextExtractionStatus: "ok"
  };
  const matrix = projectAdminEvidenceMatrix({
    checklistRows: [
      policyRow("policy_text_extraction", "not_evaluated", { policyTextExtractionHealth: extractionHealth }),
      policyRow("controller_contact_disclosure", "disclosure_observed"),
      policyRow("legal_basis_disclosure_observed", "ambiguous"),
      policyRow("retention_disclosure_observed", "not_located_automatically"),
      policyRow("processing_purposes_disclosure", "disclosure_observed"),
      policyRow("recipients_vendor_categories_disclosure", "not_located_automatically"),
      policyRow("data_subject_rights_disclosure", "disclosure_observed"),
      policyRow("international_transfers_disclosure", "ambiguous"),
      policyRow("dpo_contact_point_disclosure", "not_located_automatically"),
      policyRow("supervisory_authority_complaint_disclosure", "not_located_automatically"),
      policyRow("automated_decision_making_profiling_disclosure", "not_located_automatically")
    ],
    cmpVendorName: null,
    sourceProjectionVersion: null
  });

  assert.equal(matrix.transparency.aggregate.projected, 10);
  assert.equal(matrix.transparency.results.AD?.status, "not_confirmed");
  assert.deepEqual(matrix.policyEvidence, {
    detectedLanguage: "de",
    extractionFailureReason: null,
    extractionStatus: "ok",
    gdprTransparencyLanguageSupported: true,
    projectionStatus: "verified_complete",
    stage: "topic_evidence_limited",
    topicResults: {
      ambiguous: 2,
      disclosureObserved: 3,
      extractionIncomplete: 0,
      notEvaluated: 0,
      notLocatedAutomatically: 5
    }
  });
  assert.equal(parseAdminEvidenceMatrix(matrix)?.policyEvidence?.stage, "topic_evidence_limited");
  assert.equal(parseAdminEvidenceMatrix({
    ...matrix,
    policyEvidence: { ...matrix.policyEvidence, stage: "invented" }
  }), null);
});

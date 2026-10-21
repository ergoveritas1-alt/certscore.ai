import assert from "node:assert/strict";
import test from "node:test";
import { derivePolicySurfaceInspectionOutcome } from "@certscore/contracts";

import {
  buildChecklistConcernTopFindings,
  selectCanonicalHighPriorityFindings
} from "./checklist-concern-top-findings";
import type { GdprEprivacyCoverageChecklistItem } from "./gdpr-eprivacy-coverage-checklist";
import type { CertScoreFinding } from "./finding-registry";
import { summarizePostRejectActivity } from "./post-reject-finding-copy";
import { deriveGdprEprivacyCoveragePolicyOutcomes } from "./gdpr-eprivacy-coverage-policy";
import { deriveGdprEprivacyCoverageChecklist } from "./gdpr-eprivacy-coverage-checklist";
import { getAssessmentDirection, getEvidenceLabel } from "./gdpr-eprivacy-assessment-direction";
import { buildGdprEprivacyChecklistPresentation, isGdprEprivacyChecklistPresentation } from "./gdpr-eprivacy-checklist-presentation";
import { deriveRegulatoryCoverageScore } from "./regulatory-coverage-score";
import { deriveCanonicalOverallScoreExplanationForReport } from "../../server/scans/canonical-overall-score";
import { buildSitePriorityReview } from "./full-site-priority-review";

const pipeline = {
  concernPolicyKey: "test.concern",
  projectionStage: "coverage_policy" as const,
  wc01NormalizedConcernKey: "test_concern",
  ws01EvidenceRole: "retained_test_evidence"
};

function row(input: Partial<GdprEprivacyCoverageChecklistItem> & Pick<GdprEprivacyCoverageChecklistItem, "id" | "label" | "status">) {
  return {
    assessmentStatus: input.status === "Gap observed" ? "gap_observed" : "review_signal",
    criticalEvidence: {
      missingOrIncompleteSourceSignals: [],
      pipeline: { ...pipeline },
      projectedFindings: [],
      retainedEvidence: {},
      statusBasis: input.note ?? input.label
    },
    evidenceRefs: [],
    evidenceState: input.status === "Gap observed" ? "observed" : "not_confirmed",
    explanation: input.note ?? input.label,
    note: input.note ?? input.label,
    tone: "review",
    ...input
  } as GdprEprivacyCoverageChecklistItem;
}

test("canonical checklist concerns include every potential gap and partial concern", () => {
  const findings = buildChecklistConcernTopFindings([
    row({
      criticalEvidence: {
        missingOrIncompleteSourceSignals: [],
        pipeline,
        projectedFindings: [{ id: "analytics_cookie_pre_consent", label: "Analytics cookies before consent" }],
        retainedEvidence: {},
        statusBasis: "A classified non-essential cookie was retained before consent."
      },
      id: "pre_consent_cookies_storage",
      label: "Non-essential pre-consent cookies/storage",
      note: "A classified non-essential cookie was retained before consent.",
      status: "Gap observed"
    }),
    row({
      criticalEvidence: {
        missingOrIncompleteSourceSignals: [],
        pipeline,
        projectedFindings: [],
        retainedEvidence: { trackerPriority: "high" },
        statusBasis: "High-priority advertising inventory was retained without promotion-grade tracking proof."
      },
      id: "pre_consent_third_party_tracking",
      label: "Pre-consent non-essential tracking",
      status: "Not confirmed"
    }),
    row({
      assessmentStatus: "coverage_limitation",
      evidenceState: "not_testable",
      id: "legal_basis_disclosure_observed",
      label: "Legal basis disclosure",
      status: "Not testable"
    })
  ]);

  assert.deepEqual(findings.map((finding) => finding.id), [
    "regulatory_gap__gdpr_eprivacy__pre_consent_cookies_storage",
    "regulatory_gap__gdpr_eprivacy__pre_consent_third_party_tracking"
  ]);
  assert.equal(findings[0]?.label, "Non-essential pre-consent cookies/storage");
  assert.equal(findings[1]?.label, "Pre-consent non-essential tracking");
});

test("canonical high-priority selection uses checklist concerns only", () => {
  const checklistFinding = {
    id: "regulatory_gap__gdpr_eprivacy__pre_consent_cookies_storage",
    label: "Non-essential pre-consent cookies/storage"
  } as unknown as CertScoreFinding;

  assert.deepEqual(
    selectCanonicalHighPriorityFindings([checklistFinding]).map((finding) => finding.id),
    [checklistFinding.id]
  );
});

test("canonical high-priority selection retains the checklist tracking concern", () => {
  const checklistFinding = {
    evidenceDetails: { policyEvidenceDetails: { rowId: "pre_consent_third_party_tracking" } },
    id: "regulatory_gap__gdpr_eprivacy__pre_consent_third_party_tracking",
    label: "Pre-consent non-essential tracking"
  } as unknown as CertScoreFinding;
  assert.deepEqual(
    selectCanonicalHighPriorityFindings([checklistFinding]).map((finding) => finding.id),
    [checklistFinding.id]
  );
});

test("canonical checklist concerns promote a production-projectable post-Reject failure", () => {
  const findings = buildChecklistConcernTopFindings([
    row({
      criticalEvidence: {
        missingOrIncompleteSourceSignals: [],
        pipeline,
        projectedFindings: [],
        retainedEvidence: {
          postRejectNonEssentialActivityRetained: true,
          productionProjectable: true,
          rejectInteractionConfirmed: true,
          reportControlObserved: true,
          postRejectNonEssentialRequestCount: 6,
          postRejectNonEssentialRequests: [],
          postRejectActivityDetails: summarizePostRejectActivity(
            [56, 57, 243, 409, 586, 774].map(msAfterReject => ({
              vendor: "HubSpot", activityType: "network_request", msAfterReject,
            })),
          ),
        },
        statusBasis: "Qualifying non-essential activity persisted after confirmed Reject.",
      },
      id: "post_reject_tracking_reduction",
      label: "Post-choice tracking reduction",
      status: "Gap observed",
    }),
  ]);

  assert.deepEqual(findings.map((finding) => finding.id), [
    "regulatory_gap__gdpr_eprivacy__post_reject_tracking_reduction",
  ]);
  assert.match(findings[0]?.remediation ?? "", /confirmed Reject suppresses optional tracker requests/i);
  assert.equal(findings[0]?.label, "HubSpot activity after Reject");
  assert.equal(findings[0]?.shortSummary, "6 non-essential HubSpot requests were observed 56–774 ms after confirmed Reject.");
  assert.equal(findings[0]?.severity, "high");
});

test("canonical high-priority selection has no standalone runtime-finding input", () => {
  assert.deepEqual(selectCanonicalHighPriorityFindings([]), []);
});

test("unconfirmed grouped inventory cannot produce an executive finding", () => {
  const item = row({id: "pre_consent_third_party_tracking", label: "Pre-consent tracking", status: "Not confirmed"});
  item.criticalEvidence.pipeline.projectionStage = "coverage_fallback";
  item.criticalEvidence.pipeline.ws01EvidenceRole = "retained_pre_consent_tracker_inventory";
  assert.deepEqual(buildChecklistConcernTopFindings([item]), []);
});

test("completed policy absence flows through coverage policy and checklist to the leading priority", () => {
  const runtimeArtifacts = {
    policyDisclosureSummary: { privacyPolicyPresent: false },
    policySurfaceInspection: derivePolicySurfaceInspectionOutcome({
      normalizedUrl: "https://example.test/",
      modulesRun: [{ moduleName: "policySurfaceScanner", status: "completed", evidenceRefs: [],
        startedAt: "2026-10-11T00:00:00Z", durationMs: 1000, errors: [] }],
      negativeSearchEvidence: {
        contractVersion: "certscore.policy-negative-search.v1", requestedUrl: "https://example.test/",
        staticDocumentUrl: "https://example.test/", renderedDocumentUrl: "https://example.test/",
        staticDocumentHash: "a".repeat(64), renderedInspectionHash: "b".repeat(64),
        staticInspectionComplete: true, renderedInspectionComplete: true, representativeDocuments: true,
        observedPrivacyCandidateCount: 0, uninspectedFrameCount: 0, uninspectedShadowRootCount: 0,
        candidateEnumerationTruncated: false,
      },
    })
  };
  const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
    scanCompleted: true, coverageLimited: false, runtimeArtifacts,
    snapshot: { privacy_policy_present: false }
  });
  assert.equal(outcomes.privacy_notice_availability?.status, "Gap observed");
  const checklist = deriveGdprEprivacyCoverageChecklist({
    scanCompleted: true, coverageLimited: false, coverageOutcomes: outcomes, unifiedFindings: []
  });
  const privacyRow = checklist.find(item => item.id === "privacy_notice_availability");
  assert.ok(privacyRow);
  assert.equal(privacyRow.assessmentStatus, "gap_observed");
  assert.equal(getEvidenceLabel(privacyRow), "Potential gap");
  assert.equal(getAssessmentDirection(privacyRow), "potential_concern");
  const compact = buildGdprEprivacyChecklistPresentation(checklist);
  assert.equal(isGdprEprivacyChecklistPresentation(compact), true);
  assert.equal(compact.rows.find(item => item.id === privacyRow.id)?.status, "Gap observed");
  const privacyPresentation = buildGdprEprivacyChecklistPresentation([privacyRow]);
  assert.equal(isGdprEprivacyChecklistPresentation({ ...privacyPresentation,
    rows: privacyPresentation.rows.map(item => ({ ...item, id: "controller_contact_disclosure" }))
  }), false, "The availability exception must not allow topic absence findings.");
  const overall = deriveCanonicalOverallScoreExplanationForReport({ scanRecord: { runtimeArtifacts: null },
    checklistRows: [privacyRow], unifiedFindings: [] });
  assert.equal(overall?.score, 91, "The shared page score applies the nine-point deduction in either regulatory view.");
  assert.equal(overall?.deductions.flatMap(family => family.rules).find(rule =>
    rule.ruleId === "privacy_notice_availability")?.policyDeductionPoints, 9);
  assert.equal(deriveRegulatoryCoverageScore({ framework: "gdpr_eprivacy", rows: [privacyRow] }).score, 91,
    "The confirmed gap uses the owner-approved nine-point missing-policy deduction.");
  const otherGaps = ["transport_security_https_delivery", "transport_security_form_transport", "cookie_notice_policy_availability"]
    .map(id => row({ id, label: id, status: "Gap observed" }));
  const findings = selectCanonicalHighPriorityFindings(buildChecklistConcernTopFindings([...otherGaps, privacyRow]));
  assert.equal(findings.length, 4);
  const first = findings[0]!;
  assert.equal(first.id, "regulatory_gap__gdpr_eprivacy__privacy_notice_availability");
  assert.equal(first.label, "Privacy policy not found");
  assert.match(first.remediation, /repair its link or public access/);
  assert.match(first.remediation, /Publish readable public HTML at a stable URL/);
  assert.match(first.remediation, /fresh signed-out browser/);
  assert.deepEqual(first.evidenceDetails?.policyEvidenceDetails?.retainedEvidence,
    privacyRow.criticalEvidence.retainedEvidence);
  assert.ok(first.defaultSurfacePriority > findings[1]!.defaultSurfacePriority);
  const siteAssessment = buildSitePriorityReview([privacyRow], [
    { id: "homepage", url: "https://example.test/", homepage: true, findingIds: [privacyRow.id] },
    { id: "contact", url: "https://example.test/contact", homepage: false, findingIds: [] },
  ]);
  assert.equal(siteAssessment.length, 1);
  assert.equal(siteAssessment[0]?.title, "Privacy policy not found");
  assert.equal(siteAssessment[0]?.status, "Potential gap");
  assert.deepEqual(siteAssessment[0]?.pages.map(page => page.id), ["homepage"]);
});

test("incomplete, failed, and positive policy inspection do not create a missing-policy priority", () => {
  const completeInspection = {
    coverageStatus: "complete", documentRetrievalCoverageStatus: "insufficient",
    inspectionCompleted: true, linkDiscoveryCoverageStatus: "complete", limitationKeys: [],
    observedSurfaceTypes: [], outcome: "no_privacy_policy_observed_complete_coverage",
    privacyPolicyObserved: false,
  };
  const variants = [
    {},
    { coverageStatus: "limited", inspectionCompleted: false, privacyPolicyObserved: false, outcome: "indeterminate" },
    { coverageStatus: "complete", inspectionCompleted: true, privacyPolicyObserved: false,
      linkDiscoveryCoverageStatus: "complete", outcome: "no_privacy_policy_observed_complete_coverage",
      limitationKeys: ["privacy_policy_negative_search_coverage_not_verified"] },
    { coverageStatus: "limited", inspectionCompleted: true, privacyPolicyObserved: true,
      outcome: "privacy_policy_observed", limitationKeys: ["privacy_policy_link_observed_document_not_retained"] },
    { ...completeInspection, limitationKeys: { partial: true } },
    { ...completeInspection, observedSurfaceTypes: ["unknown_surface"] },
    { ...completeInspection, observedSurfaceTypes: ["privacy_policy"] },
    { ...completeInspection, documentRetrievalCoverageStatus: "usable" },
  ];
  for (const policySurfaceInspection of variants) {
    const outcomes = deriveGdprEprivacyCoveragePolicyOutcomes({
      scanCompleted: true, coverageLimited: false,
      runtimeArtifacts: { policyDisclosureSummary: { privacyPolicyPresent: false }, policySurfaceInspection },
      snapshot: { privacy_policy_present: false }
    });
    assert.notEqual(outcomes.privacy_notice_availability?.status, "Gap observed");
    const checklist = deriveGdprEprivacyCoverageChecklist({
      scanCompleted: true, coverageLimited: false, coverageOutcomes: outcomes, unifiedFindings: []
    });
    const privacyRow = checklist.find(item => item.id === "privacy_notice_availability");
    assert.ok(privacyRow);
    assert.notEqual(privacyRow.assessmentStatus, "gap_observed");
    assert.equal(deriveRegulatoryCoverageScore({ framework: "gdpr_eprivacy", rows: [
      row({ id: "transport_security_https_delivery", label: "HTTPS", status: "Observed",
        assessmentStatus: "checked", evidenceState: "observed" }),
      privacyRow,
    ] }).score, 100, "The privacy inspection cannot add a nine-point deduction.");
    assert.ok(!buildChecklistConcernTopFindings(checklist).some(finding =>
      finding.id === "regulatory_gap__gdpr_eprivacy__privacy_notice_availability"));
    assert.ok(!buildSitePriorityReview(checklist, []).some(finding =>
      finding.id === "regulatory_gap__gdpr_eprivacy__privacy_notice_availability"));
  }
  assert.deepEqual(buildChecklistConcernTopFindings([row({
    id: "privacy_notice_availability", label: "Privacy notice discovered", status: "Observed",
    assessmentStatus: "checked", evidenceState: "observed"
  })]), []);
});

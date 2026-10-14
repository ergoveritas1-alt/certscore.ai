import type { NormalizedConcern } from "./normalized-concerns";
import { cmpAuditRowsEqual, consentVisualProminenceProjectionSchema, type ConsentControlVisualComparison, type CmpAuditAssessment } from "@certscore/contracts";
import { z } from "zod";
import { consentControlAssessmentSchema } from "@certscore/contracts";
import type { ScanScoreExplanation } from "@certscore/api-contracts";
import type { GdprEprivacyCoverageChecklistItem } from "./gdpr-eprivacy-coverage-checklist";
import type { UnifiedFindingDisplayPacket } from "./unified-findings";
import { projectConsentControlReport } from "./consent-control-report";
import { evidenceRowAnchor } from "./report-evidence-navigation";

export const CMP_AUDIT_REPORT_VERSION = "cmp_audit_report.v1" as const;
export const CMP_AUDIT_CRITERIA = [
  { id: "banner", label: "Cookie banner available" },
  { id: "reject", label: "Option to reject cookies available" },
  { id: "prominence", label: "Accept / Reject prominence comparison" },
  { id: "categories", label: "Selection by categories available" },
  { id: "services", label: "Individual services identified in the CMP" },
  { id: "privacy_link", label: "Link to privacy policy available" },
  { id: "privacy_access", label: "Privacy-policy link reachable before consent interaction" },
  { id: "consent_record", label: "Client-side consent decision recorded" },
  { id: "implementation", label: "Tracking activity after consent choices" },
  { id: "duration", label: "Consent-cookie expiry observed" },
  { id: "declared_not_found", label: "CMP cookie declarations compared with pre-consent capture" },
  { id: "found_not_declared", label: "Observed cookie names missing from CMP declarations" },
  { id: "cookie_information", label: "Information about cookies available (e.g., storage duration)" },
] as const;

export type CmpAuditCriterionId = typeof CMP_AUDIT_CRITERIA[number]["id"];
export type CmpAuditStatus = "Observed" | "Not observed" | "Review recommended" | "Not assessed" | "Partially assessed" | "Feature not supported" | "Informational";
export type CmpAuditRow = {
  id: CmpAuditCriterionId;
  label: string;
  status: CmpAuditStatus;
  detail?: string;
  evidenceAnchor?: string;
  sourceIds: string[];
  deductionPoints?: number;
  supportingEvidence?: {
    prominence?: Pick<ConsentControlVisualComparison, "accept" | "reject" | "captureSkewMs">;
    requests?: Array<{ hostname: string; path: string; vendor: string; category: string; msAfterReject: number }>;
    inventory?: CmpAuditAssessment["rows"][number]["inventory"];
    cookieComparison?: NonNullable<CmpAuditAssessment["rows"][number]["cookieComparison"]>;
  };
};
export type CmpAuditProjection = {
  version: typeof CMP_AUDIT_REPORT_VERSION;
  scope: "starting_page";
  scanId: string;
  assessmentSourceHash: string | null;
  inspectionSupport?: CmpAuditAssessment["support"];
  rows: CmpAuditRow[];
};

/** Presentation of existing canonical assessments/checklists/findings only.
 * CMP identity, recipe support and raw runtime fields are deliberately not inputs.
 * No new finding, scoring rule, or positive implementation verdict is created. */
export function projectCmpAudit(input: {
  scanId: string;
  consentControlAssessment?: unknown;
  normalizedConcerns?: NormalizedConcern[];
  checklistRows?: GdprEprivacyCoverageChecklistItem[];
  unifiedFindings?: UnifiedFindingDisplayPacket[];
  scoreExplanation?: ScanScoreExplanation | null;
}): CmpAuditProjection {
  const rows: CmpAuditRow[] = CMP_AUDIT_CRITERIA.map(criterion => ({
    ...criterion, status: "Not assessed", sourceIds: [],
    detail: "Sufficient verified evidence for this criterion was not retained in this scan.",
  }));
  const set = (id: CmpAuditCriterionId, result: Partial<CmpAuditRow>) => Object.assign(rows.find(row => row.id === id)!, result);
  const parsed = consentControlAssessmentSchema.safeParse(input.consentControlAssessment);
  const assessment = parsed.success && projectConsentControlReport(parsed.data, input.scanId) ? parsed.data : null;
  if (assessment) {
    if (assessment.visualEvidence?.status === "withheld" && assessment.visualEvidence.reasonCodes.some(reason =>
      reason === "finalization_deadline_exceeded" || reason === "moderation_timeout")) {
      set("prominence", {
        detail: "Screenshot safety review timed out; the button comparison was not assessed.",
        sourceIds: ["consentControlAssessment.visualEvidence"],
      });
    }
    if (assessment.surface.status === "observed_actionable" || assessment.surface.status === "observed_non_actionable") {
      set("banner", { status: "Observed", detail: "Consent surface observed on the initial visit.",
        evidenceAnchor: "consent-review-evidence", sourceIds: ["consentControlAssessment.surface"] });
    } else if (assessment.surface.status === "not_observed" && assessment.coverage.status === "complete") {
      set("banner", { status: "Not observed", evidenceAnchor: "consent-review-evidence", sourceIds: ["consentControlAssessment.surface"] });
    }
    const reject = assessment.controls.reject;
    if (reject.state !== "unknown" && (reject.state !== "observed" || reject.layer === "first_layer")) {
      set("reject", { status: reject.state === "observed" ? "Observed" : "Not observed",
        detail: "First-layer Reject or equivalent refusal control.", evidenceAnchor: "consent-review-evidence",
        sourceIds: ["consentControlAssessment.controls.reject"] });
    }
  }

  // Public policy discovery has its own canonical scope; it does not establish
  // banner placement, overlay access, or a CMP-specific inventory comparison.
  const privacy = input.checklistRows?.find(row => row.id === "privacy_notice_availability");
  if (privacy && privacy.assessmentStatus !== "coverage_limitation" && privacy.assessmentStatus !== "not_applicable") {
    const status = privacy.status === "Observed" && privacy.evidenceState === "observed" ? "Observed"
      : privacy.assessmentStatus === "gap_observed" && privacy.evidenceState === "not_observed" ? "Not observed" : null;
    if (status) set("privacy_link", { status, detail: "Public privacy-policy link or surface on the scanned page.",
      sourceIds: [privacy.id], evidenceAnchor: evidenceRowAnchor(privacy.id) });
  }

  const surfaced = (id: string) => input.unifiedFindings?.find(finding =>
    finding.unifiedFindingId === id && finding.presentationDecision.status === "surface");
  const prominence = surfaced("accept_more_prominent_than_reject");
  if (prominence) set("prominence", { status: "Review recommended",
    detail: "Accept was more prominent than Reject in the retained visual comparison.", sourceIds: [prominence.unifiedFindingId] });
  if (prominence && assessment) {
    for (const value of prominence.evidence?.entities?.consentVisualProminence ?? []) {
      try {
        const parsed = consentVisualProminenceProjectionSchema.safeParse(JSON.parse(value));
        if (parsed.success && parsed.data.assessmentSourceHash === assessment.provenance.sourceHash) {
          const { accept, reject, captureSkewMs } = parsed.data.comparison;
          set("prominence", { supportingEvidence: { prominence: { accept, reject, captureSkewMs } }, evidenceAnchor: "consent-review-evidence" });
          break;
        }
      } catch { /* Malformed historical evidence must not supply a comparison. */ }
    }
  }
  if (!prominence && assessment) {
    const neutral = input.normalizedConcerns?.find(concern => concern.originKey === "consent.visual_prominence.observed" &&
      concern.originType === "runtime_artifact" && concern.externalSurfacingEligibility === "eligible" && concern.promotionEligibility === "internal_only");
    const raw = neutral?.evidenceBundle.rawEvidence;
    const materiality = z.object({ policyVersion: z.literal("consent_prominence_materiality.v1"), outcome: z.literal("styling_only"),
      reason: z.literal("styling_without_verified_material_disadvantage") }).safeParse(raw?.consentProminenceMateriality);
    const retained = consentVisualProminenceProjectionSchema.safeParse(raw?.consentVisualProminence);
    if (materiality.success && retained.success && retained.data.assessmentSourceHash === assessment.provenance.sourceHash) {
      const { accept, reject, captureSkewMs } = retained.data.comparison;
      // Observed records a verified comparison under the narrower criterion;
      // the policy's neutral risk outcome and scoring remain unchanged.
      set("prominence", { label: "Accept / Reject prominence comparison", status: "Observed",
        detail: "Accept and Reject were compared in the captured view. No material prominence difference met the review threshold.",
        supportingEvidence: { prominence: { accept, reject, captureSkewMs } }, evidenceAnchor: "consent-review-evidence",
        sourceIds: [neutral!.originKey] });
    }
  }

  const rejectCoverage = input.checklistRows?.find(row => row.id === "post_reject_tracking_reduction");
  set("implementation", { detail: rejectCoverage?.assessmentStatus === "coverage_limitation"
    ? rejectCoverage.limitation || rejectCoverage.note
    : "The retained action evidence does not establish whether settings are implemented correctly. No implementation pass is inferred from an absence of findings.",
    sourceIds: rejectCoverage?.assessmentStatus === "coverage_limitation" ? [rejectCoverage.id] : [] });

  const contradiction = surfaced("acceptance_signal_contradicts_action");
  const afterReject = input.checklistRows?.find(row => row.id === "post_reject_tracking_reduction" &&
    row.evidenceState === "observed" && (row.status === "Gap observed" || row.status === "Review signal") &&
    (row.assessmentStatus === "gap_observed" || row.assessmentStatus === "review_signal"));
  if (contradiction || afterReject) set("implementation", { status: "Review recommended",
    detail: contradiction ? "Saved consent did not match the Accept action." : afterReject!.note,
    evidenceAnchor: contradiction ? "consent-review-evidence" : evidenceRowAnchor(afterReject!.id),
    sourceIds: [contradiction?.unifiedFindingId, afterReject?.id].filter((id): id is string => Boolean(id)) });
  if (afterReject) {
    const retained = afterReject.criticalEvidence?.retainedEvidence;
    const parsed = z.object({ rejectInteractionConfirmed: z.literal(true), postRejectNonEssentialRequests: z.array(z.object({
      url: z.string().url(), hostname: z.string().max(253), vendor: z.string().max(160), category: z.string().max(100),
      activityType: z.literal("network_request"), nonEssential: z.literal(true), msAfterReject: z.number().finite().nonnegative(),
    })).max(100) }).safeParse(retained);
    if (parsed.success && parsed.data.postRejectNonEssentialRequests.length) {
      const requests = parsed.data.postRejectNonEssentialRequests.flatMap(request => {
        const url = new URL(request.url);
        return ["https:", "http:"].includes(url.protocol) && url.hostname === request.hostname
          ? [{ hostname: request.hostname, path: url.pathname, vendor: request.vendor, category: request.category, msAfterReject: request.msAfterReject }] : [];
      });
      if (requests.length) set("implementation", { supportingEvidence: { requests } });
    }
  }

  // Shared checklist projection from already-policy-evaluated concerns. No
  // browser data or provider-name inference is accepted at this boundary.
  const audit = assessment?.cmpAudit;
  // Historical assessments keep their original scope and conclusions.
  if (audit?.version === "cmp_audit_assessment.v1") {
    const legacyLabels = {"services": "Individual services can be disabled separately", "consent_record": "Consent status is properly documented and traceable", "duration": "Duration of consent or rejection is appropriate", "declared_not_found": "Cookies or services mentioned in the CMP are not found"};
    for (const [id, label] of Object.entries(legacyLabels)) set(id as CmpAuditCriterionId, { label });
  }
  if (audit?.version === "cmp_audit_assessment.v2") set("services", { label: "Individual service checkboxes or toggles observed" });
  if (audit && audit.version !== "cmp_audit_assessment.v4") {
    set("privacy_access", { label: "Privacy policy accessible without interacting with cookie banner" });
    set("implementation", { label: "Settings are technically implemented correctly" });
  }
  const labels = { partially_assessed: "Partially assessed", observed: "Observed", not_observed: "Not observed", review: "Review recommended", not_assessed: "Not assessed", feature_not_supported: "Feature not supported" } as const;
  if (audit) for (const row of audit.rows) {
    const concern = input.normalizedConcerns?.find(concern => concern.originKey === `consent.cmp_audit.${row.id}` &&
      concern.originType === "runtime_artifact" && concern.externalSurfacingEligibility === "eligible" &&
      concern.promotionEligibility === "internal_only" && concern.evidenceBundle.rawEvidence?.cmpAuditSourceSha256 === audit.sourceSha256 &&
      cmpAuditRowsEqual(concern.evidenceBundle.rawEvidence?.cmpAuditRow, row));
    // Policy-evaluated review findings take precedence over coverage results.
    if (row.id === "implementation" && (contradiction || afterReject)) continue;
    // Preserve the more specific canonical failure reason when neither path is usable.
    if (row.id === "implementation" && row.status === "not_assessed" && rejectCoverage?.assessmentStatus === "coverage_limitation") continue;
    if (concern) set(row.id, { status: labels[row.status],
      detail: row.id === "duration" && row.inventory?.expiries?.length
        ? "Consent-cookie expiry was captured. Long-term behavior was not tested."
        : row.id === "categories" && row.inventory?.categories?.length
        ? row.detail.replace(/^(\d+) selectable categories observed in the inspected consent surface:.*$/, "$1 categories were available.") : row.detail || undefined,
      sourceIds: row.evidenceRefs,
      ...((row.cookieComparison || row.inventory) ? { supportingEvidence: { ...(row.cookieComparison ? { cookieComparison: row.cookieComparison } : {}), ...(row.inventory ? { inventory: row.inventory } : {}) } } : {}) });
  }

  // Attribute only an already-applied, exactly attributable family amount.
  // A capped multi-rule family cannot be apportioned to a criterion on read.
  const scoredCriteria: Array<[CmpAuditCriterionId, string]> = [
    ["reject", "reject_all_path_availability"], ["privacy_link", "privacy_notice_availability"],
    ["implementation", "post_reject_tracking_reduction"],
  ];
  for (const [id, ruleId] of scoredCriteria) {
    const row = rows.find(candidate => candidate.id === id)!;
    const family = input.scoreExplanation?.deductions.find(candidate =>
      candidate.rules.length === 1 && candidate.rules[0]?.ruleId === ruleId);
    if (family && family.deductionPoints > 0 && ["Not observed", "Review recommended"].includes(row.status)) {
      row.deductionPoints = family.deductionPoints;
    }
  }
  return { version: CMP_AUDIT_REPORT_VERSION, scope: "starting_page", scanId: input.scanId,
    assessmentSourceHash: assessment?.provenance.sourceHash ?? null, ...(audit ? { inspectionSupport: audit.support } : {}), rows };
}

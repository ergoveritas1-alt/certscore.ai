import type { NormalizedConcern } from "./normalized-concerns";
import { cmpAuditRowsEqual, consentVisualProminenceProjectionSchema, type ConsentControlVisualComparison, type CmpAuditAssessment } from "@certscore/contracts";
import { z } from "zod";
import { consentControlAssessmentSchema } from "@certscore/contracts";
import type { PublicCmpAudit, ScanScoreExplanation } from "@certscore/api-contracts";
import type { GdprEprivacyCoverageChecklistItem } from "./gdpr-eprivacy-coverage-checklist";
import type { UnifiedFindingDisplayPacket } from "./unified-findings";
import { projectConsentControlReport } from "./consent-control-report";
import { evidenceRowAnchor } from "./report-evidence-navigation";
import { KNOWN_CMP_REGISTRY } from "@website-signal-risk-scanner/shared";

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
export type CmpAuditStatus = "Observed" | "Not observed" | "Review recommended" | "Not assessed" | "Partially assessed" | "Feature not supported" | "Informational" | "Incomplete" | "Not applicable";
export type CmpAuditRow = {
  id: CmpAuditCriterionId;
  label: string;
  status: CmpAuditStatus;
  detail?: string;
  evidenceAnchor?: string;
  sourceIds: string[];
  limitation?: { group: "preferences" | "actions" | "visual"; code: string };
  deductionPoints?: number;
  supportingEvidence?: {
    prominence?: Pick<ConsentControlVisualComparison, "accept" | "reject" | "captureSkewMs">;
    requests?: Array<{ hostname: string; path: string; vendor: string; category: string; msAfterReject: number }>;
    inventory?: CmpAuditAssessment["rows"][number]["inventory"];
    cookieComparison?: NonNullable<CmpAuditAssessment["rows"][number]["cookieComparison"]>;
  };
};
export type CmpAuditProjection = {
  version: typeof CMP_AUDIT_REPORT_VERSION | "cmp_audit_report.v2" | "cmp_audit_report.v3";
  limitationGroups?: CmpLimitationGroup[];
  scope: "starting_page";
  scanId: string;
  assessmentSourceHash: string | null;
  inspectionSupport?: CmpAuditAssessment["support"];
  experience?: NonNullable<PublicCmpAudit["experience"]>;
  rows: CmpAuditRow[];
};

/** Presentation of existing canonical assessments/checklists/findings only.
 * Provider identity selects presentation only, never assessment or eligibility.
 * No new finding, scoring rule, or positive implementation verdict is created. */
export function projectCmpAudit(input: {
  scanId: string;
  consentControlAssessment?: unknown;
  normalizedConcerns?: NormalizedConcern[];
  checklistRows?: GdprEprivacyCoverageChecklistItem[];
  unifiedFindings?: UnifiedFindingDisplayPacket[];
  scoreExplanation?: ScanScoreExplanation | null;
  consentVendor?: string | null;
}): CmpAuditProjection {
  const rows: CmpAuditRow[] = CMP_AUDIT_CRITERIA.map(criterion => ({
    ...criterion, status: "Not assessed", sourceIds: [],
    detail: "Sufficient verified evidence for this criterion was not retained in this scan.",
  }));
  const set = (id: CmpAuditCriterionId, result: Partial<CmpAuditRow>) => Object.assign(rows.find(row => row.id === id)!, result);
  const parsed = consentControlAssessmentSchema.safeParse(input.consentControlAssessment);
  const controlReport = parsed.success ? projectConsentControlReport(parsed.data, input.scanId) : null;
  const assessment = parsed.success && controlReport ? parsed.data : null;
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
      set("banner", { status: "Not observed", detail: "A cookie banner was not observed during this visit.",
        evidenceAnchor: "consent-review-evidence", sourceIds: ["consentControlAssessment.surface"] });
    }
    const reject = assessment.controls.reject;
    if (reject.state !== "unknown" && (reject.state !== "observed" || reject.layer === "first_layer")) {
      set("reject", { status: reject.state === "observed" ? "Observed" : "Not observed",
        detail: reject.state === "observed" ? "First-layer Reject or equivalent refusal control."
          : "Reject or an equivalent refusal option was not observed during this visit.", evidenceAnchor: "consent-review-evidence",
        sourceIds: ["consentControlAssessment.controls.reject"] });
    }
  }

  // Public policy discovery has its own canonical scope; it does not establish
  // banner placement, overlay access, or a CMP-specific inventory comparison.
  const privacy = input.checklistRows?.find(row => row.id === "privacy_notice_availability");
  if (privacy && privacy.assessmentStatus !== "coverage_limitation" && privacy.assessmentStatus !== "not_applicable") {
    const status = privacy.status === "Observed" && privacy.evidenceState === "observed" ? "Observed"
      : privacy.assessmentStatus === "gap_observed" && privacy.evidenceState === "not_observed" ? "Not observed" : null;
    if (status) set("privacy_link", { status, detail: status === "Observed" ? "Public privacy-policy link or surface on the scanned page."
      : "A privacy-policy link or page was not observed during this visit.",
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

  if (!prominence && assessment) {
    const neutral = input.normalizedConcerns?.find(concern => concern.originKey === "consent.visual_comparison.observed" &&
      concern.originType === "runtime_artifact" && concern.externalSurfacingEligibility === "eligible" && concern.promotionEligibility === "internal_only");
    const retained = consentVisualProminenceProjectionSchema.safeParse(neutral?.evidenceBundle.rawEvidence?.consentVisualProminence);
    if (retained.success && retained.data.assessmentSourceHash === assessment.provenance.sourceHash) {
      const { accept, reject, captureSkewMs } = retained.data.comparison;
      set("prominence", { label: "Accept / Reject prominence comparison", status: "Observed",
        detail: neutral!.description,
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
  if (audit && !["cmp_audit_assessment.v4", "cmp_audit_assessment.v5", "cmp_audit_assessment.v6"].includes(audit.version)) {
    set("privacy_access", { label: "Privacy policy accessible without interacting with cookie banner" });
    set("implementation", { label: "Settings are technically implemented correctly" });
  }
  const labels = { incomplete: "Incomplete", not_applicable: "Not applicable", partially_assessed: "Partially assessed", observed: "Observed", not_observed: "Not observed", review: "Review recommended", not_assessed: "Not assessed", feature_not_supported: "Feature not supported" } as const;
  if (audit) for (const row of audit.rows) {
    const concern = input.normalizedConcerns?.find(concern => concern.originKey === `consent.cmp_audit.${row.id}` &&
      concern.originType === "runtime_artifact" && concern.externalSurfacingEligibility === "eligible" &&
      concern.promotionEligibility === "internal_only" && concern.evidenceBundle.rawEvidence?.cmpAuditSourceSha256 === audit.sourceSha256 &&
      cmpAuditRowsEqual(concern.evidenceBundle.rawEvidence?.cmpAuditRow, row));
    // Shared first-layer reportability also applies to these narrower tables.
    // Independent action evidence remains retained without overriding passive A/R/O.
    const inventory = audit.version === "cmp_audit_assessment.v6" && row.inventory ? {
      ...row.inventory,
      ...(row.inventory.choiceActivity ? { choiceActivity: row.inventory.choiceActivity.filter(activity => controlReport?.controls[activity.action] === "observed") } : {}),
      ...(row.inventory.expiries ? { expiries: row.inventory.expiries.filter(cookie => cookie.visit === "Before choice" || controlReport?.controls[cookie.visit === "Accept" ? "accept" : "reject"] === "observed") } : {}),
      ...(row.inventory.consentStorage ? { consentStorage: row.inventory.consentStorage.filter(record => controlReport?.controls[record.visit === "Accept" ? "accept" : "reject"] === "observed") } : {}),
      ...(row.inventory.declarations && controlReport?.controls.accept !== "observed" ? { declarations: row.inventory.declarations.map(({ observedExpiry, ...declaration }) => declaration) } : {}),
      ...(row.inventory.cookies && controlReport?.controls.accept !== "observed" ? { cookies: row.inventory.cookies.filter(cookie => cookie.observedIn.includes("before_choice"))
        .map(({ observedExpiry, ...cookie }) => ({ ...cookie, observedIn: ["before_choice" as const] })) } : {}),
    } : row.inventory;
    const restrictedCookieScope = Boolean(row.inventory?.cookies?.some(cookie => cookie.observedIn.includes("after_accept")) && controlReport?.controls.accept !== "observed");
    const restrictedDurationScope = inventory?.expiries?.length !== row.inventory?.expiries?.length;
    const restrictedExpiryScope = Boolean(row.inventory?.declarations?.some(cookie => cookie.observedExpiry) && controlReport?.controls.accept !== "observed");
    const restrictedChoiceScope = inventory?.choiceActivity?.length !== row.inventory?.choiceActivity?.length || inventory?.consentStorage?.length !== row.inventory?.consentStorage?.length;
    // Policy-evaluated review findings take precedence over coverage results.
    if (row.id === "implementation" && (contradiction || afterReject)) {
      if (concern && audit.version === "cmp_audit_assessment.v6" && inventory?.choiceActivity) {
        const existing = rows.find(item => item.id === "implementation")!;
        existing.supportingEvidence = { ...existing.supportingEvidence, inventory };
      }
      continue;
    }
    if (row.id === "prominence" && rows.find(item => item.id === "prominence")!.status !== "Not assessed") continue;
    // Preserve the more specific canonical failure reason when neither path is usable.
    if (row.id === "implementation" && row.status === "not_assessed" && rejectCoverage?.assessmentStatus === "coverage_limitation") continue;
    if (concern) set(row.id, { status: labels[row.status], limitation: row.limitation,
      detail: restrictedCookieScope ? "Cookie names were compared with the captured CMP list; see retained evidence."
        : restrictedDurationScope ? "CMP cookie expiry was captured; see retained evidence."
        : restrictedExpiryScope ? "CMP cookie descriptions were captured; see retained evidence."
        : restrictedChoiceScope ? row.id === "consent_record" ? "Browser consent records were captured; see retained evidence." : "Activity checks completed; see retained evidence."
        : ["cmp_audit_assessment.v5", "cmp_audit_assessment.v6"].includes(audit.version) && row.id === "duration" && row.inventory?.expiries?.length
        ? "CMP cookie expiry was captured. Time remaining is shown below."
        : row.id === "duration" && row.inventory?.expiries?.length
        ? "Consent-cookie expiry was captured. Long-term behavior was not tested."
        : row.id === "categories" && row.inventory?.categories?.length
        ? row.detail.replace(/^(\d+) selectable categories observed in the inspected consent surface:.*$/, (_match, count: string) => count === "1" ? "1 category was available." : `${count} categories were available.`) : row.detail || undefined,
      sourceIds: row.evidenceRefs,
      ...((row.cookieComparison || inventory) ? { supportingEvidence: { ...(row.cookieComparison && !restrictedCookieScope ? { cookieComparison: row.cookieComparison } : {}), ...(inventory ? { inventory } : {}) } } : {}) });
  }

  if (audit && ["cmp_audit_assessment.v5", "cmp_audit_assessment.v6"].includes(audit.version)) {
    set("duration", { label: "CMP cookie expiry" });
    set("found_not_declared", { label: "Unmatched cookie names" });
    set("implementation", { label: "Activity after Accept / Reject" });
    const prominenceRow = rows.find(row => row.id === "prominence")!;
    if (prominenceRow.status === "Not assessed" && assessment?.visualEvidence?.status === "withheld") {
      Object.assign(prominenceRow, { status: "Incomplete", detail: "The retained image could not complete screenshot review.",
        limitation: { group: "visual", code: assessment.visualEvidence.reasonCodes[0] ?? "visual_evidence_withheld" }, sourceIds: ["consentControlAssessment.visualEvidence"] });
    }
    if (prominenceRow.status === "Not assessed" && assessment?.assessmentStatus === "complete" && assessment.coverage.status === "complete" &&
      [assessment.controls.accept.state, assessment.controls.reject.state].includes("not_observed")) {
      Object.assign(prominenceRow, { status: "Not applicable", detail: "A comparison requires both Accept and Reject controls; one was not observed in the complete inspection.", sourceIds: ["consentControlAssessment.controls"] });
    }
  }

  if (audit?.version === "cmp_audit_assessment.v6") {
    set("consent_record", { label: "Consent storage observed" });
    set("implementation", { label: "Activity after Accept / Reject" });
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
  return { version: audit?.version === "cmp_audit_assessment.v6" ? "cmp_audit_report.v3" : audit?.version === "cmp_audit_assessment.v5" ? "cmp_audit_report.v2" : CMP_AUDIT_REPORT_VERSION,
    ...(audit && ["cmp_audit_assessment.v5", "cmp_audit_assessment.v6"].includes(audit.version) ? { limitationGroups: cmpLimitationGroups(rows) } : {}), scope: "starting_page", scanId: input.scanId,
    assessmentSourceHash: assessment?.provenance.sourceHash ?? null, ...(audit ? { inspectionSupport: audit.support } : {}), rows,
    experience: projectCmpExperience({ assessment, controls: controlReport?.controls ?? null,
      provider: KNOWN_CMP_REGISTRY.find(entry => [entry.canonicalName, ...entry.aliases]
        .some(name => name.toLowerCase() === input.consentVendor?.trim().toLowerCase()))?.canonicalName ?? null, rows }) };
}

/** Read-only grouping of retained conclusions. Never changes a row, counts,
 * applicability, findings, scoring or action authorization. */
function projectCmpExperience({ assessment, controls, provider, rows }: {
  assessment: z.infer<typeof consentControlAssessmentSchema> | null;
  controls: NonNullable<ReturnType<typeof projectConsentControlReport>>["controls"] | null;
  provider: string | null;
  rows: readonly CmpAuditRow[];
}): NonNullable<PublicCmpAudit["experience"]> {
  const surfaceObserved = assessment && (["observed_actionable", "observed_non_actionable"].includes(assessment.surface.status)
    || Object.values(controls ?? {}).includes("observed"));
  const noSurface = assessment?.assessmentStatus === "complete" && assessment.coverage.status === "complete"
    && assessment.surface.status === "not_observed" && Object.values(assessment.controls).every(control => control.state === "not_observed")
    && assessment.contradictions.length === 0;
  const mode = !assessment ? "capture_limited" : provider ? "cmp_details" : surfaceObserved ? "consent_controls"
    : noSurface ? "consent_signals" : "capture_limited";
  const copy = {
    cmp_details: ["CMP details", "Consent management audit"],
    consent_controls: ["Consent controls", "Consent mechanism observed; provider not identified."],
    consent_signals: ["Consent and cookie signals", "No consent surface was observed on this visit."],
    capture_limited: ["Consent capture limited", "Control evidence unavailable"],
  } as const;
  const meaningful = (row: CmpAuditRow) => ["Observed", "Review recommended", "Partially assessed", "Informational"].includes(row.status)
    || Boolean(row.deductionPoints) || Boolean(row.supportingEvidence);
  return { version: "cmp_details_experience.v1", mode, title: copy[mode][0], summary: copy[mode][1],
    provider, controls,
    defaultCriterionIds: rows.filter(row => mode === "cmp_details" || meaningful(row)
      || (mode === "consent_controls" && ["banner", "reject"].includes(row.id))).map(row => row.id) };
}

/** Historical models without the new metadata retain their full audit. Their
 * absence of metadata is not evidence that no CMP or consent surface existed. */
export function cmpDetailsExperience(audit: CmpAuditProjection | undefined, provider: string | null) {
  return audit?.experience ?? { version: "cmp_details_experience.v1" as const,
    mode: "cmp_details" as const, title: "CMP details", summary: "Consent management audit", provider, controls: null,
    defaultCriterionIds: CMP_AUDIT_CRITERIA.map(row => row.id) };
}

export type CmpLimitationGroup = { id: "preferences" | "actions" | "visual"; code: string; title: string; criterionIds: CmpAuditCriterionId[] };

/** Group persisted coverage outcomes; never infer a finding from missing rows. */
export function cmpLimitationGroups(rows: readonly CmpAuditRow[]): CmpLimitationGroup[] {
  return (["preferences", "actions", "visual"] as const).flatMap(id => {
    const affected = rows.filter(row => row.status === "Incomplete" && row.limitation?.group === id);
    if (!affected.length) return [];
    const code = affected[0]!.limitation!.code;
    const timeout = code.includes("time") || code.includes("deadline") || code === "preference_budget_exhausted";
    const pixelComparison = code === "visual_measurement_unavailable" || code.startsWith("pixel_comparison_");
    const title = id === "preferences" ? timeout ? "Preference inspection timed out" : code.includes("adapter") || code.includes("unsupported") ? "Scanner support for these CMP checks is unavailable" : "Preference inspection incomplete"
      : id === "actions" ? timeout ? "Consent-action observation timed out" : "Consent-action observation incomplete"
      : pixelComparison ? timeout ? "Button comparison timed out" : "Button comparison incomplete"
      : timeout ? "Screenshot review timed out" : code === "safety_check_unavailable" ? "Screenshot review incomplete" : "Screenshot evidence unavailable";
    return [{ id, code, title, criterionIds: affected.map(row => row.id) }];
  });
}

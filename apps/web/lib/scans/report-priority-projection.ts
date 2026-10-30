import type { GdprEprivacyCoverageChecklistItem } from "./gdpr-eprivacy-coverage-checklist";
import type { UnifiedFindingDisplayPacket } from "./unified-findings";
import type { CertScoreFinding } from "./finding-registry";
import type { ShadowFinding } from "../../components/scans/report-lab/shadow-report-data";
import { buildChecklistConcernTopFindings, selectCanonicalHighPriorityFindings } from "./checklist-concern-top-findings";
import { projectExecutiveFindingsFromUnifiedPackets } from "./executive-findings-projection";
import { projectAccessibilityPriorities } from "./accessibility-priority";
import { projectCaliforniaRegulatoryPriorities } from "./california-regulatory-priorities";
import { projectFormDestinationPriority } from "./form-destination-report";
import { projectCmsSecurityPriority } from "./cms-security-report";
import { projectSiteIntegrityPriority } from "./site-integrity-report";
import { groupAccessibilityPriorityEntries } from "./accessibility-priority-group";
import { comparePriorityReviewFindings } from "./priority-review-order";
import { describePostRejectFinding } from "./post-reject-finding-copy";

export type ReportPriorityFinding = ShadowFinding;
type PriorityEvidenceRow = { id: string; title: string; evidenceJson: Record<string, unknown>; correctionSteps: string[] };

export const CHECKLIST_GROUPS = {
  consent: new Set([
    "consent_surface_observed",
    "cmp_framework_signal_observed",
    "reject_all_path_availability",
    "accept_consent_control",
    "options_settings_preferences_control",
    "post_reject_tracking_reduction",
    "cookie_notice_policy_availability",
  ]),
  tracking: new Set([
    "pre_consent_third_party_tracking",
    "third_party_iframe_pre_consent",
    "social_media_embed_pre_consent",
    "embedded_content_pre_consent",
  ]),
  runtime: new Set([
    "pre_consent_cookies_storage",
    "session_replay_fingerprinting_review",
    "device_identification_fingerprinting_signal_observed",
  ]),
  transport: new Set([
    "transport_security_https_delivery",
    "transport_security_tls_certificate",
    "transport_security_http_redirect",
    "transport_security_mixed_content",
    "transport_security_form_transport",
  ]),
} as const;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function recordNumber(source: Record<string, unknown> | null, keys: string[]) {
  for (const key of keys) {
    const value = finiteNumber(source?.[key]);
    if (value !== null) return value;
  }
  return null;
}

export function checklistEvidenceJson(item: GdprEprivacyCoverageChecklistItem) {
  return {
    assessmentStatus: item.assessmentStatus,
    checklistItemId: item.id,
    coverageArea: item.label,
    evidenceState: item.evidenceState,
    explanation: item.explanation,
    note: item.note,
    status: item.status,
    subchecks: item.subchecks,
    tone: item.tone,
    ...item.criticalEvidence,
  };
}

function isPersistenceOnlyRejectEvidence(value: unknown) {
  const evidence = record(value);
  if (!evidence) return false;
  const count = recordNumber(evidence, [
    "preConsentStorageNotClearedCount",
    "pre_consent_storage_not_cleared_count",
  ]) ?? 0;
  return count > 0 &&
    evidence.storagePresenceDoesNotEstablishActiveUse === true &&
    evidence.scoreEffect === "none" &&
    evidence.postRejectNonEssentialActivityRetained !== true &&
    evidence.post_reject_non_essential_activity_retained !== true &&
    evidence.refusalSignalContradictsAction !== true &&
    evidence.refusal_signal_contradicts_action !== true;
}

export function reportPriorityEvidenceRow(item: GdprEprivacyCoverageChecklistItem): PriorityEvidenceRow {
  const evidenceJson = checklistEvidenceJson(item);
  const retainedEvidence = record(evidenceJson.retainedEvidence);
  const persistenceOnly = item.id === "post_reject_tracking_reduction" &&
    isPersistenceOnlyRejectEvidence(retainedEvidence);
  const title = item.id === "post_reject_tracking_reduction"
    ? describePostRejectFinding(retainedEvidence)?.title ?? (persistenceOnly
      ? "Same non-essential identifier remained stored after Reject"
      : "Non-essential activity after confirmed Reject")
    : item.label;
  return { id: item.id, title, evidenceJson, correctionSteps: [] };
}

function mapChecklistFinding(
  finding: CertScoreFinding,
  rank: number,
  evidenceRows: PriorityEvidenceRow[],
): ShadowFinding {
  const policyEvidence = finding.evidenceDetails?.policyEvidenceDetails;
  const rowId = typeof policyEvidence?.rowId === "string" ? policyEvidence.rowId : null;
  const row = rowId ? evidenceRows.find((candidate) => candidate.id === rowId) : null;
  const concernKind = typeof policyEvidence?.regulatoryConcernKind === "string"
    ? policyEvidence.regulatoryConcernKind
    : null;
  const category = (() => {
    if (!row) return finding.section;
    if (CHECKLIST_GROUPS.runtime.has(row.id)) return "Pre-consent runtime";
    if (CHECKLIST_GROUPS.tracking.has(row.id)) return "Tracking & external services";
    if (CHECKLIST_GROUPS.consent.has(row.id)) return "Consent surface";
    if (CHECKLIST_GROUPS.transport.has(row.id)) return "Transport security";
    if (/privacy|policy|disclosure|retention|rights|transfer|controller|recipient/i.test(row.id)) return "Policy & transparency";
    return finding.section;
  })();
  const postRejectCopy = row?.id === "post_reject_tracking_reduction"
    ? describePostRejectFinding(row.evidenceJson.retainedEvidence) : null;
  const summary = (() => {
    if (postRejectCopy) return postRejectCopy.summary;
    if (finding.id === "acceptance_signal_contradicts_action") {
      return "The visitor clicked Accept, but the consent record saved afterward still said analytics and advertising were not allowed. The saved record should match the visitor’s choice.";
    }
    if (row?.id !== "pre_consent_cookies_storage") return finding.shortSummary;
    const retainedEvidence = record(row.evidenceJson.retainedEvidence);
    const evidenceRefs = retainedEvidence?.evidenceRefs;
    const firstRef = Array.isArray(evidenceRefs)
      ? evidenceRefs.find((value): value is string => typeof value === "string" && value.trim().length > 0)
      : null;
    if (!firstRef) return finding.shortSummary;
    return `Cookies or browser storage were retained before consent. First retained item: ${firstRef.replace(/[.\s]+$/, "")}. Essentiality was not confirmed for every item.`;
  })();
  const evidence = postRejectCopy
    ? finding.evidencePreview.map((item) => item.replace(/Post-choice tracking reduction/gi, postRejectCopy.title))
    : finding.evidencePreview;
  return {
    correctionSteps: row?.correctionSteps.length ? row.correctionSteps : [finding.remediation],
    ...(finding.section === "Accessibility" ? { priority: "high" as const } : {}),
    evidence: [...evidence, ...[finding.evidenceDetails?.policyEvidenceDetails?.primaryRuntimeSignal,
      ...(Array.isArray(finding.evidenceDetails?.policyEvidenceDetails?.groupedRuntimeSignals) ? finding.evidenceDetails.policyEvidenceDetails.groupedRuntimeSignals : [])]
      .flatMap(signal => signal && typeof signal === "object" && "shortSummary" in signal && typeof signal.shortSummary === "string" ? [signal.shortSummary] : [])],
    evidenceJson: {
      ...(row?.evidenceJson ?? {}),
      groupedEvidence: Array.isArray(policyEvidence?.groupedRuntimeSignals)
        ? policyEvidence.groupedRuntimeSignals.flatMap(signal => {
            const id = record(signal)?.id;
            const supportingRow = evidenceRows.find(candidate => candidate.id === id);
            return supportingRow ? [{ id, label: supportingRow.title, evidence: supportingRow.evidenceJson }] : [];
          }) : [],
      evidenceDetails: finding.evidenceDetails,
      evidenceRefs: finding.evidenceRefs,
      findingId: finding.id,
    },
    focus: category,
    id: finding.id,
    rank,
    status: finding.section === "Accessibility" ? "Observed" : concernKind === "partial_rating" || finding.id === "acceptance_signal_contradicts_action"
      ? "Partial concern"
      : "Potential gap",
    summary,
    title: postRejectCopy?.title ?? finding.label,
    vendors: [],
  };
}

/** The shared web/export priority projection over canonical checklist and unified
 * findings. It does not classify observations, change eligibility or score. */
export function projectReportPriorityFindings(reportableChecklistRows: GdprEprivacyCoverageChecklistItem[], unifiedFindings: UnifiedFindingDisplayPacket[]): ReportPriorityFinding[] {
  // Older narrative exports can lack the canonical presentation decision.
  // Keep them in details, without inventing a decision or a priority.
  unifiedFindings = unifiedFindings.filter(finding => typeof finding?.presentationDecision?.status === "string");
  const evidenceRows = reportableChecklistRows.map(reportPriorityEvidenceRow);
  const executiveUnifiedFindings = projectExecutiveFindingsFromUnifiedPackets(
    unifiedFindings.filter(
      (finding) => finding.unifiedFindingId === "acceptance_signal_contradicts_action",
    ),
  ).topFindings;
  let findings = selectCanonicalHighPriorityFindings([
    ...buildChecklistConcernTopFindings(reportableChecklistRows),
    ...executiveUnifiedFindings,
    ...projectAccessibilityPriorities(unifiedFindings),
  ]).map((finding, index) => mapChecklistFinding(finding, index + 1, evidenceRows));
  const formDestinationPriority = projectFormDestinationPriority(unifiedFindings);
  if (formDestinationPriority) findings.unshift({ ...formDestinationPriority, rank: 1, focus: "Form destinations", vendors: [] });
  const cmsPriority = projectCmsSecurityPriority(unifiedFindings);
  if (cmsPriority) findings.unshift({ ...cmsPriority, rank: 1, focus: "CMS security", vendors: [] });
  const integrityPriority = projectSiteIntegrityPriority(unifiedFindings);
  if (integrityPriority) findings.push({ ...integrityPriority, rank: findings.length + 1, focus: "Site integrity", vendors: [] });
  findings.push(...projectCaliforniaRegulatoryPriorities(unifiedFindings).map(finding => ({ ...finding, rank: 1, focus: "CCPA/CPRA", vendors: [] })));
  findings.sort(comparePriorityReviewFindings);
  findings = groupAccessibilityPriorityEntries(findings);
  findings.forEach((finding, index) => { finding.rank = index + 1; });
  return findings;
}

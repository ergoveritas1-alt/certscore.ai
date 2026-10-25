import { TECHNOLOGY_NAMES, type CmsSecurityProjection } from "@certscore/contracts";
export type EvidenceSummaryRow = { status: string; priority?: "high" };
export const EVIDENCE_SECTION_TITLES = {
  cmp: "CMP details", consent: "Consent choices", tracking: "Tracking & embeds", policy: "Policies & disclosures",
  runtime: "Cookies & tracking", transport: "Connection security", accessibility: "Accessibility (WCAG)",
  cms: "Tech stack observed", gpc: "Global Privacy Control", privacy: "California privacy review",
} as const;
export const EVIDENCE_SECTION_ORDER = ["cmp", "consent", "tracking", "policy", "accessibility", "runtime", "privacy", "transport", "gpc", "cms"] as const;
/** Summarize existing row statuses only; never promote missing evidence to a concern. */
export function evidenceHeaderStatus(rows: readonly EvidenceSummaryRow[]): { label: "Review" | "Limited"; description: string; concern: boolean } | null {
  if (rows.some(row => row.status === "Gap observed")) return { label: "Review", description: "Observed gap in this section", concern: true };
  if (rows.some(row => row.status === "Potential gap")) return { label: "Review", description: "Potential gap in this section", concern: true };
  if (rows.some(row => ["Partial concern", "Review signal", "Needs review", "Review recommended", "Warning"].includes(row.status))) return { label: "Review", description: "Finding needs review", concern: false };
  if (rows.some(row => row.priority === "high" && row.status === "Observed")) return { label: "Review", description: "Observed finding to review in this section", concern: true };
  if (rows.some(row => ["Not confirmed", "Limited", "Insufficient evidence", "Not testable", "Not assessed", "Partially assessed", "Incomplete"].includes(row.status))) return { label: "Limited", description: "Evidence coverage is limited; not a confirmed issue", concern: false };
  return null;
}

/** Counts only existing statuses, keeping coverage limitations separate from review findings. */
export function evidenceSectionCounts(rows: readonly EvidenceSummaryRow[]) {
  const review = rows.filter(row => evidenceHeaderStatus([row])?.label === "Review").length;
  const limited = rows.filter(row => evidenceHeaderStatus([row])?.label === "Limited").length;
  const unsupported = rows.filter(row => row.status === "Feature not supported").length;
  const observed = rows.filter(row => row.status === "Observed").length;
  return { checks: rows.length, review, limited, observed, unsupported };
}
export function evidenceSectionRecap(rows: readonly EvidenceSummaryRow[]) {
  const { review, limited, observed, unsupported } = evidenceSectionCounts(rows);
  const outcomes = [review ? `${review} to review` : null, limited ? `${limited} limited` : null, unsupported ? `${unsupported} not supported` : null].filter(Boolean);
  if (!outcomes.length) outcomes.push(rows.length && observed === rows.length ? `${observed} observed` : "No review flags");
  return rows.length ? `${rows.length} ${rows.length === 1 ? "check" : "checks"} · ${outcomes.join(" · ")}` : "No checks available";
}

export function accessibilityAuditUnavailableSummary(limitations: readonly string[] = []) {
  return limitations.includes("frames_changed")
    ? "The page or embedded frames changed during the audit. Results could not be verified."
    : "The audit did not return evaluable results.";
}

export function accessibilityEvidenceRecap(audit: { failedRuleCount: number | null; reviewRuleCount: number | null; affectedNodeCount: number | null; status: string }, limitations: readonly string[] = []) {
  if (audit.failedRuleCount === null && limitations.includes("frames_changed")) return "Page or frames changed during audit";
  const review = audit.reviewRuleCount ?? 0;
  const limited = audit.status !== "completed";
  return [audit.failedRuleCount === null ? "Not evaluated" : `${audit.failedRuleCount} ${audit.failedRuleCount === 1 ? "issue" : "issues"}`,
    limitations.includes("child_frames_changed_main_document_retained") ? "Main page only" : null,
    review ? `${review} to review` : null, !review && limited ? "Coverage limited" : null,
    !review && !limited && audit.affectedNodeCount !== null && audit.affectedNodeCount > 0 ? `${audit.affectedNodeCount} affected elements` : null,
  ].filter(Boolean).join(" · ");
}

type CmsVersion = { name: string; version: string | null; versionStatus: string; observedVersions: string[]; versionBasis: string; informationalOnly: boolean };
export function cmsEvidenceVersionLabel(row: CmsVersion) {
  return row.version ?? (row.versionStatus === "conflicting" ? "Conflicting versions"
    : row.observedVersions.length === 1 ? `${row.observedVersions[0]} · ${row.versionBasis === "inferred" ? "Asset version" : "Partial version"}`
      : row.informationalOnly ? "Hosted service" : "Version not detected");
}
export function cmsEvidenceRecap(detections: readonly CmsVersion[], pluginCount: number) {
  const first = detections[0];
  return detections.length > 1 ? `${detections.length} platforms detected`
    : first ? `${first.name}${first.version ? " " : " · "}${cmsEvidenceVersionLabel(first)}`
      : `${pluginCount} ${pluginCount === 1 ? "plugin" : "plugins"} detected`;
}
export function technologyEvidenceRecap(projection: CmsSecurityProjection) {
  const technologies = projection.technologyInventory?.detections ?? [];
  const plugins = projection.pluginInventory?.detections.length ?? 0;
  if (!technologies.length) return cmsEvidenceRecap(projection.assessment.detections, plugins);
  const high = [...new Set(technologies.filter(row => row.confidence === "high").map(row => TECHNOLOGY_NAMES[row.id]))];
  const tentative = technologies.filter(row => row.confidence === "tentative").length;
  return [projection.assessment.detections.length ? cmsEvidenceRecap(projection.assessment.detections, 0) : null,
    ...high.slice(0, 3), high.length > 3 ? `+${high.length - 3} technologies` : null,
    plugins ? `${plugins} ${plugins === 1 ? "plugin" : "plugins"}` : null,
    tentative ? `${tentative} tentative` : null].filter(Boolean).join(" · ");
}
export const CMS_CORRECTION_STEPS = [
  "Confirm the deployed version against the retained declaration and vendor advisory.",
  "Apply the vendor's supported update or mitigation, then verify the deployed version and affected behavior.",
];
export function cmsAdvisoryDisplayCopy(name: string, versionLabel: string, kind: string) {
  return { title: `${kind === "vulnerability" ? "Potential exposure" : "Support ended"}: ${name}`, summary: `${name} · ${versionLabel}` };
}

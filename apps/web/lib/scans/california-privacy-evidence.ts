import { privacyAuditEvidenceSchema, type DetailedEvidenceRow, type DetailedEvidenceSection } from "@certscore/api-contracts";
import { EVIDENCE_SECTION_TITLES } from "./detailed-evidence-presentation";
import { reportStatusLabel } from "./report-status-presentation";

export const PRIVACY_CONTROL_LABELS = { do_not_sell_or_share: "Do Not Sell/Share", your_privacy_choices: "Privacy choices", cookie_settings: "Cookie settings" } as const;
export const PRIVACY_TOPIC_LABELS = { sale_sharing: "Sale/sharing", collection_purposes: "Collection/purposes", retention: "Retention", privacy_rights: "Privacy rights", opt_out_methods: "Opt-out methods" } as const;

/** Read-only workpaper presentation, not a checklist assessment or a new finding. */
export function californiaPrivacyEvidence(value: unknown, scanId?: string) {
  const parsed = privacyAuditEvidenceSchema.safeParse(value);
  const evidence = parsed.success && (!scanId || parsed.data.scanId === scanId) ? parsed.data : null;
  const candidates = evidence?.contractVersion === "certscore.privacy-audit-evidence.v2" ? evidence.controlCandidates : [];
  const row = (field: string, index: number, evidenceRef: string, title: string, summary: string, status: string): DetailedEvidenceRow => ({
    id: `${field}:${index}`, title, summary, status, displayStatus: reportStatusLabel(status),
    correctionSteps: [], evidenceRefs: [evidenceRef], evidenceTarget: "california-privacy-evidence",
    source: { field: `privacyAuditEvidence.${field}`, rowId: evidenceRef },
  });
  const rows = [
    ...(evidence?.controls ?? []).map((control, index) => row("controls", index, control.evidenceRef, PRIVACY_CONTROL_LABELS[control.kind],
      `Visible privacy-choice ${control.evidenceRef.startsWith("policy-surface:") ? "link" : "control"} observed: “${control.label}”.`, "Observed")),
    ...candidates.map((control, index) => row("controlCandidates", index, control.evidenceRef, PRIVACY_CONTROL_LABELS[control.kind],
      `Link identified: “${control.label}”; ${control.verification === "visibility_unverified" ? "visibility" : "accessible name"} not verified.`, "Needs review")),
    ...(evidence?.notices ?? []).map((notice, index) => row("notices", index, notice.evidenceRef, notice.kind.replaceAll("_", " "),
      notice.passages.length ? `Retained notice topics: ${notice.passages.map(p => PRIVACY_TOPIC_LABELS[p.topic]).join(", ")}. Notice completeness was not assessed.`
        : "Notice retained; no supported topic passage located in the retained excerpt.", "Retained")),
  ];
  const section: DetailedEvidenceSection = {
    id: "privacy", title: EVIDENCE_SECTION_TITLES.privacy,
    recap: evidence ? `${evidence.controls.length} ${evidence.controls.length === 1 ? "choice" : "choices"} · ${evidence.notices.length} ${evidence.notices.length === 1 ? "notice" : "notices"}` : "Evidence unavailable",
    displayStatus: !evidence ? "Limited" : candidates.length ? "Review" : null,
    // Counts describe retained workpaper items, not findings or verified absence.
    counts: { checks: rows.length, review: candidates.length, limited: 0, observed: evidence?.controls.length ?? 0, unsupported: 0 }, rows,
  };
  return { evidence, candidates, section };
}

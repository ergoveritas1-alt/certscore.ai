/** Customer labels only. Persisted assessment states, evidence and scoring stay intact. */
export const REPORT_STATUS_LABELS: Readonly<Record<string, string>> = {
  "Needs review": "Review",
  "Review findings": "Review",
  "Review recommended": "Review",
  "Manual review": "Manual check",
};

export function reportStatusLabel(status: string): string {
  return REPORT_STATUS_LABELS[status] ?? status;
}

export const REPORT_FOLLOW_UP = {
  review: { label: "Review", description: "Recorded findings or review signals need attention." },
  manual: { label: "Manual check", description: "An automated check was inconclusive; this is not a confirmed failure." },
  limited: { label: "Limited", description: "Evidence coverage is limited; not a confirmed issue." },
} as const;

/** Assessment counts already projected by the canonical accessibility pipeline.
 * A positive failure takes precedence; inconclusive checks never become failures. */
export function accessibilityReportFollowUp(audit: { failedRuleCount: number | null; reviewRuleCount: number | null; status: string }) {
  if (audit.failedRuleCount !== null && audit.failedRuleCount > 0) return { kind: "review" as const, ...REPORT_FOLLOW_UP.review };
  if (audit.reviewRuleCount !== null && audit.reviewRuleCount > 0) return { kind: "manual" as const, ...REPORT_FOLLOW_UP.manual };
  if (audit.status !== "completed" || audit.failedRuleCount === null) return { kind: "limited" as const, ...REPORT_FOLLOW_UP.limited };
  return null;
}

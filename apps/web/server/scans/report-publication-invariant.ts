export const REPORT_PUBLICATION_INVARIANTS = [
  "consent_assessment_invalid", "consent_assessment_missing",
  "artifact_checksum_mismatch", "artifact_size_mismatch",
  "artifact_json_invalid", "artifact_contract_invalid",
  "posture_scores_unavailable",
] as const;
export type ReportPublicationInvariant = typeof REPORT_PUBLICATION_INVARIANTS[number];

export type PublicationSchemaIssue = { code: string; path: string };

/** Keep bounded schema codes and field paths; omit values and messages. */
export function boundedPublicationSchemaIssues(issues: readonly unknown[]): PublicationSchemaIssue[] {
  return issues.slice(0, 6).map(value => {
    const issue = value && typeof value === "object" ? value as {code?:unknown;path?:unknown} : {};
    return {
    code: typeof issue.code === "string" && /^[a-z_]{1,32}$/.test(issue.code) ? issue.code : "invalid",
    path: typeof issue.path === "string" && /^[A-Za-z_.[\]?]{0,170}$/.test(issue.path) ? issue.path : Array.isArray(issue.path) ? issue.path.slice(0, 4).map(segment =>
      typeof segment === "number" && Number.isSafeInteger(segment) && segment >= 0 ? "[]" :
      typeof segment === "string" && /^[A-Za-z_]{1,40}$/.test(segment) ? segment : "?"
    ).join(".") : "",
    };
  });
}

export class ReportPublicationInvariantError extends Error {
  readonly name = "ReportPublicationInvariantError";
  readonly issues: PublicationSchemaIssue[];
  constructor(
    readonly invariant: ReportPublicationInvariant,
    readonly phase: "consent_assessment" | "artifact_verification" | "score_availability",
    options: {message?: string; issues?: readonly {code?: unknown; path?: unknown}[]} = {},
  ) {
    super(options.message ?? `Canonical report publication invariant failed: ${invariant}.`);
    this.issues = boundedPublicationSchemaIssues(options.issues ?? []);
  }
}

/** New canonical publications need both actual scores. Unknown evidence stays
 * unknown; it must never be converted to a numeric fallback to pass this gate. */
export function assertReportablePostureScores(input: { eu: number | null; california: number | null; noGo: boolean }) {
  if (input.noGo) return;
  const score = (value: number | null) => value !== null && Number.isInteger(value) && value >= 0 && value <= 100;
  if (!score(input.eu) || !score(input.california)) throw new ReportPublicationInvariantError("posture_scores_unavailable", "score_availability");
}

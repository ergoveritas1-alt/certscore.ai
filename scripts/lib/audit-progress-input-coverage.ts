export type RetainedReportInputState = "missing_input" | "generation_mismatch" | "generation_unverifiable" |
  "rejected_provenance" | "conflicting_generation" | "verified_report" | "verified_originals";

/** Report-input availability, not scanner success or site behavior. Self-contained
 * so the offline viewer uses exactly the same computation after filtering. */
export function retainedInputCoverage(rows: readonly { reportable: boolean; createdAt: string; retainedReportInput?: RetainedReportInputState }[]) {
  const empty = () => ({ missing_input: 0, generation_mismatch: 0, generation_unverifiable: 0,
    rejected_provenance: 0, conflicting_generation: 0, verified_report: 0, verified_originals: 0, not_evaluated: 0 });
  const states = empty(), days = new Map<string, { date: string; eligible: number; states: ReturnType<typeof empty> }>();
  let eligible = 0;
  for (const row of rows) {
    if (!row.reportable) continue;
    const status = row.retainedReportInput ?? "not_evaluated";
    if (!(status in states)) throw Error("Unknown retained report input disposition");
    const date = Number.isFinite(Date.parse(row.createdAt)) ? new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date(row.createdAt)) : "unknown_date";
    const day = days.get(date) ?? { date, eligible: 0, states: empty() };
    eligible++; states[status]++; day.eligible++; day.states[status]++; days.set(date, day);
  }
  return { eligible, states, days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)) };
}

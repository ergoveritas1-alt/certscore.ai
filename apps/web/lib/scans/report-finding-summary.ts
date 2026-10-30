/** Customer narrative wording only. Historical diagnostic score clauses stay
 * in the canonical workpaper; findings, qualifications and scores are intact. */
export function reportFindingSummary(value: string) {
  return value.replace(/\s*(?:It (?:corroborates review without adding a second score effect|does not affect score)|This is an informational behavior record and does not affect score)\./gi, "");
}

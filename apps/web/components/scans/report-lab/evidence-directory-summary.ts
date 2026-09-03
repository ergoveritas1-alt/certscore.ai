import type { ShadowEvidenceRow } from "./shadow-report-data";

export function countNonNotObservedRows(
  rows: ReadonlyArray<Pick<ShadowEvidenceRow, "status">>,
) {
  return rows.filter((row) => row.status !== "Not observed").length;
}

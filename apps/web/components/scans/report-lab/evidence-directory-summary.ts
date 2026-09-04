import type { ShadowEvidenceRow } from "./shadow-report-data";

export function countNonNotObservedRows(
  rows: ReadonlyArray<Pick<ShadowEvidenceRow, "status">>,
) {
  return rows.filter((row) => row.status !== "Not observed").length;
}

export function countRowsRequiringReview(
  rows: ReadonlyArray<Pick<ShadowEvidenceRow, "status">>,
) {
  return rows.filter((row) =>
    row.status === "Potential gap" ||
    row.status === "Partial concern" ||
    row.status === "Not confirmed" ||
    row.status === "Limited"
  ).length;
}

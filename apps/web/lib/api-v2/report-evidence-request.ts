/** Select a representation of the same authorized retained report. */
export function parseReportEvidenceRequest(query: URLSearchParams) {
  const workpaper = query.get("workpaper");
  const format = query.get("format");
  if (workpaper !== null && workpaper !== "tracking") return null;
  if (format !== null && format !== "download" && format !== "csv") return null;
  const tracking = workpaper === "tracking";
  if (format === "csv" && !tracking) return null;
  return { tracking, csv: format === "csv", download: format === "download" || format === "csv" };
}

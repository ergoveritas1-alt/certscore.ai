import { reportEvidenceSectionSchema } from "@certscore/api-contracts";

/** Select a representation of the same authorized retained report. */
export function parseReportEvidenceRequest(query: URLSearchParams) {
  const workpaper = query.get("workpaper");
  const format = query.get("format");
  const sectionValue = query.get("section");
  if (query.getAll("section").length > 1) return null;
  const section = sectionValue === null ? undefined : reportEvidenceSectionSchema.safeParse(sectionValue);
  if (section && !section.success) return null;
  if (section && workpaper !== null) return null;
  if (workpaper !== null && workpaper !== "tracking") return null;
  if (format !== null && format !== "download" && format !== "csv") return null;
  const tracking = workpaper === "tracking";
  if (format === "csv" && !tracking) return null;
  return { tracking, csv: format === "csv", download: format === "download" || format === "csv", ...(section?.success ? { section: section.data } : {}) };
}

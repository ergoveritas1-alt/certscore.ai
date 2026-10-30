import { reportEvidenceSectionSchema, reportReviewFocusSchema } from "@certscore/api-contracts";

/** Select a representation of the same authorized retained report. */
export function parseReportEvidenceRequest(query: URLSearchParams) {
  const focusValue = query.get("reviewFocus");
  const focus = focusValue === null ? undefined : reportReviewFocusSchema.safeParse(focusValue);
  if (query.getAll("reviewFocus").length > 1 || focus && !focus.success) return null;
  const workpaper = query.get("workpaper");
  const format = query.get("format");
  const sectionValue = query.get("section");
  if (query.getAll("section").length > 1) return null;
  const section = sectionValue === null ? undefined : reportEvidenceSectionSchema.safeParse(sectionValue);
  if (section && !section.success) return null;
  if (focus && workpaper !== null) return null;
  if (section && workpaper !== null) return null;
  if (workpaper !== null && workpaper !== "tracking") return null;
  if (format !== null && format !== "download" && format !== "csv") return null;
  const tracking = workpaper === "tracking";
  if (format === "csv" && !tracking) return null;
  return { tracking, csv: format === "csv", download: format === "download" || format === "csv", ...(section?.success ? { section: section.data } : {}), ...(focus?.success ? { reviewFocus: focus.data } : {}) };
}

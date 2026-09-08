/** Describe persisted capture outcomes without changing their eligibility or score. */
export function describeFullSitePageFailure(page: { status: string; httpStatus?: number | null }) {
  if (page.status === "partial") {
    const httpStatus = page.httpStatus;
    return typeof httpStatus === "number" && Number.isInteger(httpStatus) && httpStatus >= 400 && httpStatus <= 599
      ? `HTTP ${httpStatus} · partial inventory retained; excluded from scoring`
      : "Partial capture; coverage limited";
  }
  if (!["failed", "blocked"].includes(page.status)) return null;
  const httpStatus = page.httpStatus;
  if (typeof httpStatus === "number" && Number.isInteger(httpStatus) && httpStatus >= 400 && httpStatus <= 599)
    return `HTTP ${httpStatus}`;
  if (typeof httpStatus === "number" && Number.isInteger(httpStatus) && httpStatus >= 100 && httpStatus < 400)
    return `Capture could not be assessed (HTTP ${httpStatus})`;
  return "Capture unavailable; HTTP status not retained";
}

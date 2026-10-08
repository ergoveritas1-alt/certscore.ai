import "server-only";
import { buildTimelineReportModel } from "../../components/scans/report-lab/timeline-report-model";
import { loadReviewedPoliciesFromProjection } from "./full-site-reviewed-policies";
import type { ScanDetailResponse } from "./get-scan-by-id";

/** Policy text stays server-side; the report receives only matched excerpts and provenance. */
export async function buildVerifiedTimelineReportModel(record: ScanDetailResponse) {
  const documents = await loadReviewedPoliciesFromProjection(record).catch(() => []);
  return buildTimelineReportModel(record, documents);
}

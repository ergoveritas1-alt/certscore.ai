import "server-only";
import {loadGpcResourceInventory} from "./gpc-resource-inventory";
import { buildTimelineReportModel } from "../../components/scans/report-lab/timeline-report-model";
import { loadReviewedPoliciesFromProjection } from "./full-site-reviewed-policies";
import type { ScanDetailResponse } from "./get-scan-by-id";

/** Policy text stays server-side; the report receives only matched excerpts and provenance. */
export async function buildVerifiedTimelineReportModel(record: ScanDetailResponse, options: {includeGpcInventory?: boolean} = {}) {
  const documents = await loadReviewedPoliciesFromProjection(record).catch(() => []);
  const model = buildTimelineReportModel(record, documents);
  return options.includeGpcInventory && "findings" in model ? {...model,gpcResourceInventory:await loadGpcResourceInventory(record)} : model;
}

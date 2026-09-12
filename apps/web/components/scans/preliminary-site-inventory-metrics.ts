import type { ApiV2PreConsentRuntimePreview } from "@certscore/api-contracts";
import type { ReportInventoryMetric } from "./report-inventory-summary";
import { INVENTORY_METRIC_LABELS } from "../../lib/scans/inventory-resource-semantics";

/** A checkpoint supplies observed lower bounds, never assessed totals or findings. */
export function preliminarySiteInventoryMetrics(preview?: ApiV2PreConsentRuntimePreview | null): ReportInventoryMetric[] | null {
  if (!preview || !["usable", "limited_partial"].includes(preview.runtimeCoverage.status)) return null;
  return [
    { label: INVENTORY_METRIC_LABELS.storage, value: preview.summary.cookieCount, lowerBound: true, note: "Preliminary · cookies only; storage assessment pending." },
    { label: INVENTORY_METRIC_LABELS.requests, value: preview.summary.thirdPartyRequestCount, lowerBound: true, note: "Preliminary · third-party requests only; full inventory pending." },
    // Preview embed rows are service groups, not distinct frame instances.
    { label: INVENTORY_METRIC_LABELS.frames, value: null, note: "Frame inventory pending." },
  ];
}

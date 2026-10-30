import type { ScanDetailResponse } from "../../server/scans/get-scan-by-id";
import type { ReviewedPolicy } from "./full-site-resource-context";
import { getHybridRuntimeEvidence } from "./hybrid-runtime-evidence";
import { buildRetainedRequestInventory } from "./retained-request-inventory";
import { buildRuntimeInventoryProjectionFromScan } from "./runtime-inventory-projection";
import { buildSinglePageResourceInventory } from "./single-page-resource-inventory";

/** The web report and exports use the same bounded initial-visit inventory.
 * Resource classification is descriptive inventory, never a finding or score. */
export function projectReportRuntimeInventory(scan: ScanDetailResponse, reviewedPolicies: ReviewedPolicy[] = []) {
  const projection = buildRuntimeInventoryProjectionFromScan(scan);
  const requests = buildRetainedRequestInventory(getHybridRuntimeEvidence(scan.runtimeArtifacts));
  const resources = buildSinglePageResourceInventory(scan.scan.id, projection.ungroupedRows, requests, reviewedPolicies);
  const inventorySummary = projection.inventorySummary.map(metric =>
    ["Requests", "Network requests"].includes(metric.label) && resources.requestMetric ? resources.requestMetric : metric);
  return { projection, resources, inventorySummary };
}

export const REPORT_TRANSPORT_CHECKS = [
  ["HTTPS delivery", "transport_security_https_delivery"],
  ["HTTP redirect", "transport_security_http_redirect"],
  ["Mixed-content check", "transport_security_mixed_content"],
  ["Form transport", "transport_security_form_transport"],
  ["HTTPS certificate", "transport_security_tls_certificate"],
] as const;

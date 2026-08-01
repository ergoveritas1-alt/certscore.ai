import type { CertScoreFinding } from "./finding-registry";

const SUPPRESSED_EXECUTIVE_TOP_FINDING_IDS = new Set([
  "multi_vendor_tracking_detected",
  "large_third_party_footprint",
  "collection_endpoints_detected",
  "high_request_density"
]);

/**
 * Applies the shared executive headline suppression policy to findings that
 * have already passed through the canonical unified finding projection.
 */
export function filterVisibleExecutiveTopFindings<T extends Pick<CertScoreFinding, "id">>(findings: T[]) {
  return findings.filter((finding) => !SUPPRESSED_EXECUTIVE_TOP_FINDING_IDS.has(finding.id));
}

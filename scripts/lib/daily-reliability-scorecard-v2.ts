/** CertScore.ai audit-only cohort correction. No findings, scores or new reads. */
import { classifyTraffic as classifyV1, type Obj, type Row } from "./daily-reliability-scorecard";
export * from "./daily-reliability-scorecard";
export const RELIABILITY_VERSION = "certscore.daily-reliability.v2";
const OWNED_TEST_URLS = new Set(["https://ergoveritas.com/test1.html", "https://ergoveritas.com/test2.html", "https://ergoveritas.com/test3.html"]);

/** Caller supplies only a checksum-verified canonical bundle. Inventory remains
 * complete, including failed/unknown attempts; these exact owned targets simply
 * cannot be evidence for ordinary production quality. No hostname-wide exclusion. */
export function classifyTraffic(inventory: Obj, bundle?: Obj): Row["cohort"] {
  if (bundle && typeof bundle.url === "string" && OWNED_TEST_URLS.has(bundle.url)) return "excluded_test";
  return classifyV1(inventory, bundle);
}

/** Inventory metric definitions shared by homepage and site reports.
 * Storage counts retained identities, requests count events, and embeds count
 * actual frame observations. SDK/script requests are not additional frames.
 */
export const INVENTORY_METRIC_LABELS = {
  storage: "Cookies & storage",
  requests: "Network requests",
  frames: "Embedded frames",
} as const;
export function inventoryMetricFamily(kind: string) {
  if (kind === "cookie" || kind === "storage") return "storage";
  if (kind === "request" || kind === "tracker") return "requests";
  if (kind === "embed") return "frames";
  return null;
}

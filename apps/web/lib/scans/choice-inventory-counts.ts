import type { ActionResourceInventory } from "./action-resource-inventory";

/** The three choice tiles count distinct classified requests and observed storage.
 * Services group those resources. They do not add another item to the count. */
export function choiceInventoryCounts(capture: ActionResourceInventory) {
  const seen = new Set<string>();
  const groups = new Map<string, { service: string; nonEssential: number; review: number }>();
  const breakdown = { nonEssential: 0, review: 0 };
  for (const service of capture.inventory.services) {
    for (const row of service.resources) {
      if (seen.has(row.key) || !["request", "cookie", "storage"].includes(row.kind)) continue;
      const classification = row.inventoryEvidence;
      if (classification !== "Non-essential" && classification !== "Review") continue;
      seen.add(row.key);
      const key = classification === "Review" ? "review" : "nonEssential";
      const role = row.occurrence.details.choiceRequestRole;
      const label = role === "analytics" || role === "advertising" || role === "sanity_batch_beacon" ? row.name.replace(/^https:\/\//, "") : service.name;
      const group = groups.get(label) ?? {service: label, nonEssential: 0, review: 0};
      group[key]++;
      groups.set(label, group);
      breakdown[key]++;
    }
  }
  const complete = capture.measurement ? capture.measurement.requestCoverage === "complete" : capture.captureCoverage?.status === "complete";
  const count = breakdown.nonEssential + breakdown.review;
  return { count: complete || count > 0 ? count : null, breakdown, contributors: [...groups.values()],
    state: complete ? "recorded" as const : "partial" as const };
}

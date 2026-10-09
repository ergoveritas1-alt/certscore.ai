import { resolveCanonicalVendor } from "@certscore/vendor-resolver";
import { CONSENT_ACTION_RETENTION_OVERFLOW_EVALUATION_LIMIT } from "@certscore/contracts";

export const ACTION_REQUEST_RETENTION_POLICY = "priority_bounded_action_requests.v1" as const;
export type ActionRequestRetentionClass = "delivery_asset" | "known_other" | "unknown" | "tracking" | "consent" | "document";
type Classification = { kind: ActionRequestRetentionClass; group: string; priority: number };
const trackingPurposes = new Set(["advertising", "analytics", "performance_monitoring", "session_replay", "tag_management"]);
const assetTypes = new Set(["image", "font", "media", "stylesheet"]);

/** Selection priority only: CDN attribution never proves necessity or safety. */
export function classifyActionRequestRetention(url: string, resourceType: string): Classification {
  let hostname: string;
  try { hostname = new URL(url).hostname; } catch { return { kind: "unknown", group: "unknown", priority: 2 }; }
  if (resourceType === "document") return { kind: "document", group: hostname, priority: 2 };
  const vendor = resolveCanonicalVendor({ type: "request", url }).observation;
  if (!vendor) return { kind: "unknown", group: hostname, priority: 2 };
  if (trackingPurposes.has(vendor.purpose)) return { kind: "tracking", group: hostname, priority: 2 };
  if (vendor.purpose === "consent_management") return { kind: "consent", group: hostname, priority: 2 };
  if (vendor.purpose === "infrastructure" && ["CDN", "Content delivery", "Font delivery", "Media delivery"].includes(vendor.servicePurpose ?? "")) {
    return { kind: assetTypes.has(resourceType) ? "delivery_asset" : "known_other", group: hostname,
      priority: assetTypes.has(resourceType) ? 0 : 1 };
  }
  return { kind: "known_other", group: hostname, priority: 2 };
}

/** Fixed capacity, lazy classification on overflow, and exact omission accounting.
 * Never represents an omitted row as complete evidence. Unknown rows are not
 * eviction candidates for equally ranked traffic. Preserve the first request
 * from each tracking host before retaining more duplicates from another host.
 */
export function createActionRequestRetention<T extends { request: { url(): string; resourceType(): string } }>(rows: T[], limit: number) {
  const cached = new WeakMap<T, Classification>();
  const classify = (row: T) => {
    let result = cached.get(row);
    if (!result) { result = classifyActionRequestRetention(row.request.url(), row.request.resourceType()); cached.set(row, result); }
    return result;
  };
  let observed = 0, replacements = 0, dropped = 0, priorityEvaluations = 0;
  const omitted = { delivery_asset: 0, known_other: 0, unknown: 0, tracking: 0, consent: 0, document: 0, unclassified: 0 };
  return {
    offer(row: T): { retained: boolean; evicted?: T } {
      observed++;
      if (rows.length < limit) { rows.push(row); return { retained: true }; }
      // Bound CPU independently of hostile request volume. Unexamined overflow
      // is counted honestly; it is neither unknown attribution nor safe traffic.
      if (priorityEvaluations >= CONSENT_ACTION_RETENTION_OVERFLOW_EVALUATION_LIMIT) {
        dropped++; omitted.unclassified++; return { retained: false };
      }
      priorityEvaluations++;
      const incoming = classify(row);
      const inventory = rows.map(classify);
      let selected = -1;
      for (let i = rows.length - 1; i >= 0; i--) {
        if (inventory[i]!.priority < incoming.priority &&
          (selected < 0 || inventory[i]!.priority < inventory[selected]!.priority)) selected = i;
      }
      // Do not let a repeated known tracker consume every protected slot.
      if (selected < 0 && incoming.priority === 2 &&
        !inventory.some((item) => item.kind === incoming.kind && item.group === incoming.group)) {
        const counts = new Map<string, number>();
        for (const item of inventory) if (item.kind === "tracking") counts.set(item.group, (counts.get(item.group) ?? 0) + 1);
        let largest = 1;
        for (let i = rows.length - 1; i >= 0; i--) {
          const item = inventory[i]!;
          if (item.kind === "tracking" && (counts.get(item.group) ?? 0) > largest) {
            selected = i; largest = counts.get(item.group)!;
          }
        }
      }
      dropped++;
      if (selected < 0) { omitted[incoming.kind]++; return { retained: false }; }
      const evicted = rows.splice(selected, 1)[0]!;
      omitted[inventory[selected]!.kind]++; replacements++; rows.push(row);
      return { retained: true, evicted };
    },
    summary() {
      return dropped ? { policyVersion: ACTION_REQUEST_RETENTION_POLICY, requestsObserved: observed,
        requestsRetained: rows.length, replacements, priorityEvaluations, omitted: { ...omitted } } : undefined;
    },
  };
}

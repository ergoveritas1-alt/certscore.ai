import type { Metric } from "./audit-progress";

export const STAGE_LABELS = [
  "Classified non-essential cookie or service presence",
  "Verified collection",
  "Collection meeting full California evidence requirements",
];
export const STAGE_METRICS: Metric[] = (["reject","gpc"] as const).flatMap(path => STAGE_LABELS.map((label, i) => ({
  id: `detail.${path}.stage${i+1}`, label: `${path === "gpc" ? "GPC" : "Reject"} stage ${i+1} · ${label}`,
  group: path === "gpc" ? "GPC" : "Accept & Reject", success:["observed"],
  denominator:"All reportable scans. Stage 1 includes stages 2 and 3. Stage 2 includes verified collection with unresolved sale or sharing purpose and all stage 3 collection. Each scan counts once per stage.",
})));

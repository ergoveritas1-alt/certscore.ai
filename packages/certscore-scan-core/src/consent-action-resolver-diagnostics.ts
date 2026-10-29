import type { PostRefusalInteractionDiagnostics } from "@certscore/contracts";
import type { ConsentControlGeometryArtifact } from "./consent-control-geometry";

type Snapshot = NonNullable<PostRefusalInteractionDiagnostics["resolver"]>["snapshots"][number];
type Observation = Omit<Snapshot, "attempt" | "elapsedMs">;
type ResolverDiagnostics = NonNullable<PostRefusalInteractionDiagnostics["resolver"]>;

/** Counts describe the requested first-layer action, excluding unrelated page
 * buttons. These derived diagnostics never feed the resolver's candidate set. */
export function canonicalResolverDiagnostic(input: {
  geometry: ConsentControlGeometryArtifact | undefined;
  action: "accept_all" | "reject_all";
  actionableCount: number;
  bindingUnverified?: boolean;
}): Observation {
  const {geometry} = input;
  const candidates = geometry?.candidates.filter(candidate => candidate.actionType === input.action && candidate.layer === "first_layer") ?? [];
  const visible = candidates.filter(candidate => candidate.boundingBox.width > 0 && candidate.boundingBox.height > 0 &&
    candidate.intersectsViewport && candidate.computedStyle.display !== "none" && candidate.computedStyle.visibility !== "hidden" &&
    Number(candidate.computedStyle.opacity) > 0.05 && !["hidden", "dom_present_not_visible", "clipped"].includes(candidate.decisionStatus));
  const enabled = visible.filter(candidate => candidate.enabled);
  const labels = candidates.filter(candidate => candidate.classifierConfidence >= 0.8);
  const coverage = geometry?.controlInspection?.captureCoverage;
  const state: Observation["state"] = !geometry ? "geometry_unavailable"
    : input.actionableCount > 1 ? "multiple_actionable" : input.actionableCount === 1 ? "candidate_detected"
      : input.bindingUnverified ? "control_binding_unverified"
        : coverage && (coverage.inventoryTruncated || !coverage.mainFrameAvailable || !coverage.documentAndFramesStable ||
          coverage.capturedFrameCount !== coverage.frameCount) ? "geometry_unavailable"
          : coverage && coverage.documentReadyState !== "complete" ? "document_loading" : candidates.length === 0
        ? input.action === "reject_all" ? "canonical_reject_absent" : "selector_absent"
        : visible.length === 0 ? "control_hidden" : enabled.length === 0 ? "control_disabled"
          : labels.length === 0 ? "label_mismatch" : enabled.every(candidate => candidate.decisionStatus === "covered")
            ? "control_not_hit_target" : "control_binding_unverified";
  return {source: "canonical_geometry", state, selectorMatchCount: candidates.length,
    visibleCount: visible.length, enabledCount: candidates.filter(candidate => candidate.enabled).length,
    labelMatchCount: labels.length, actionableCount: input.actionableCount,
    cmpIds: geometry?.cmp.name ? [geometry.cmp.name] : [],
    controlLabels: [...new Set(candidates.map(candidate => candidate.normalizedLabel))].slice(0, 4)};
}

/** Keep the beginning of the search and the latest result from each independent
 * source. A final named-recipe miss must not erase the latest geometry reason. */
export function appendResolverDiagnostic(resolver: ResolverDiagnostics, snapshot: Observation, attempt: number, elapsedMs: number): void {
  const bounded = retainResolverDiagnostic(snapshot, attempt, elapsedMs);
  resolver.truncated ||= bounded.truncated;
  const rows = [...resolver.snapshots, bounded.snapshot];
  if (rows.length <= 12) { resolver.snapshots.push(bounded.snapshot); return; }
  resolver.truncated = true;
  const latestBySource = new Map(rows.map(row => [row.source, row]));
  const latest = [...latestBySource.values()];
  const tail = new Set(latest);
  resolver.snapshots = [...rows.filter(row => !tail.has(row)).slice(0, 12 - latest.length), ...latest]
    .sort((left, right) => left.attempt - right.attempt);
}

/** Bound diagnostic copies only. Full labels/geometry still govern action binding;
 * this retention helper must never feed truncated text back into the resolver. */
export function retainResolverDiagnostic(snapshot: Observation, attempt: number, elapsedMs: number): { snapshot: Snapshot; truncated: boolean } {
  const count = (value: number, max: number) => Math.min(max, Math.max(0, Math.floor(value)));
  const labels = (values: string[], max: number) => values.filter(value => value.length > 0).slice(0, max).map(value => value.slice(0, 120));
  const bounded = {
    ...snapshot,
    selectorMatchCount: count(snapshot.selectorMatchCount, 64),
    visibleCount: count(snapshot.visibleCount, 64),
    enabledCount: count(snapshot.enabledCount, 64),
    labelMatchCount: count(snapshot.labelMatchCount, 64),
    actionableCount: count(snapshot.actionableCount, 64),
    cmpIds: labels(snapshot.cmpIds, 8),
    controlLabels: labels(snapshot.controlLabels, 4),
  };
  return {
    snapshot: { ...bounded, attempt: Math.max(1, count(attempt, 10_000)), elapsedMs: count(elapsedMs, 30_000) },
    truncated: JSON.stringify(bounded) !== JSON.stringify(snapshot) || attempt > 10_000 || elapsedMs > 30_000,
  };
}

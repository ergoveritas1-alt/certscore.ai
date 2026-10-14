import type { PostRefusalInteractionDiagnostics } from "@certscore/contracts";

type Snapshot = NonNullable<PostRefusalInteractionDiagnostics["resolver"]>["snapshots"][number];
type Observation = Omit<Snapshot, "attempt" | "elapsedMs">;

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

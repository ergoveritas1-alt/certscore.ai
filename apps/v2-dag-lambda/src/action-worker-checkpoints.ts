import { writeFile } from "node:fs/promises";
import path from "node:path";

const ACTION_STAGES = new Set(["browser_launch", "context_setup", "page_setup", "navigation", "target_binding", "resolver", "storage_baseline", "control_readiness", "control_proof", "confirmation_baseline", "click", "confirmation", "observation", "finalization", "cleanup"]);

type ActionCheckpoint = "observation_started" | "action_dispatched" | "packet_validated" | "artifact_upload_started" | "artifact_upload_completed";

/** Bounded diagnostics in the worker's existing failure artifact. No evidence,
 * network upload, retry or publication is created by a checkpoint. */
export function actionWorkerCheckpoints(artifactRoot: string, action: "accept" | "reject") {
  const startedAt = Date.now();
  const checkpoints: Array<{ at: string; elapsedMs: number; name: string; status: string }> = [];
  let pending = Promise.resolve();
  let lastStage: { name: string; elapsedMs: number } | undefined;
  let interruptedStage: typeof lastStage;
  const persist = () => {
    const body = JSON.stringify({ artifactVersion: "certscore.action_worker_checkpoints.v1", checkpoints, ...(lastStage ? { lastStage } : {}), ...(interruptedStage ? { interruptedStage } : {}) });
    pending = pending.then(() => writeFile(path.join(artifactRoot, "V2ScanCorePhases.json"), body, "utf8")).catch(() => undefined);
    return pending;
  };
  const checkpoint = (phase: ActionCheckpoint) => {
    if (checkpoints.length >= 5) return pending;
    checkpoints.push({ at: new Date().toISOString(), elapsedMs: Date.now() - startedAt,
      name: `${action}:${phase}`, status: phase.endsWith("completed") || phase === "packet_validated" ? "completed" : "started" });
    return persist();
  };
  const seen = new Set<string>();
  return Object.assign(checkpoint, { stage(name: string) {
    if (name === "boundary_exhausted") {
      if (interruptedStage || !lastStage) return pending;
      interruptedStage = lastStage; return persist();
    }
    if (!ACTION_STAGES.has(name) || seen.has(name)) return pending;
    seen.add(name); lastStage = {name, elapsedMs: Date.now() - startedAt};
    return persist();
  } });
}

/** Keep failure uploads bounded and free of arbitrary stage strings or values. */
export function retainedActionStage(value: unknown): {name:string;elapsedMs:number} | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row=value as Record<string,unknown>;
  if (typeof row.name !== "string" || !ACTION_STAGES.has(row.name) ||
    typeof row.elapsedMs !== "number" || !Number.isSafeInteger(row.elapsedMs) || row.elapsedMs < 0 || row.elapsedMs > 900_000) return undefined;
  return {name:row.name,elapsedMs:row.elapsedMs};
}

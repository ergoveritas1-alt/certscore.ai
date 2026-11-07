import { readFileSync, rmSync, writeFileSync } from "node:fs";

const readinessPath = "/tmp/certscore-validation-worker.ready";

export function markEcsReadiness() {
  // Linux /proc stat field 22 identifies this incarnation of the PID.
  const stat = readFileSync("/proc/self/stat", "utf8");
  const startTicks = stat.slice(stat.lastIndexOf(") ") + 2).split(" ")[19];
  if (!startTicks || !/^\d+$/.test(startTicks)) throw new Error("Worker process start time is unavailable");
  writeFileSync(readinessPath, `${process.pid} ${startTicks}\n`, { mode: 0o600 });
}

export function clearEcsReadiness() {
  try {
    rmSync(readinessPath, { force: true });
  } catch (error) {
    console.error("[validation-worker] failed to clear ECS readiness", {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

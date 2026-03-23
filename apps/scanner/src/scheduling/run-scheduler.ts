import { enqueueScheduledScans } from "./enqueue-scheduled-scans";

async function run() {
  const result = await enqueueScheduledScans();
  console.info("[scanner-scheduler] scheduled scan sweep complete", result);
}

run().catch((error) => {
  console.error("[scanner-scheduler] scheduled scan sweep failed", error);
  process.exitCode = 1;
});

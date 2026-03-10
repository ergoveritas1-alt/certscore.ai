import { enqueueScheduledScans } from "./enqueue-scheduled-scans";

async function run() {
  const result = await enqueueScheduledScans();
  console.info("[scheduler] scheduled scan sweep complete", result);
}

run().catch((error) => {
  console.error("[scheduler] scheduled scan sweep failed", error);
  process.exitCode = 1;
});

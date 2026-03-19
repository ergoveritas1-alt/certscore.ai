import { runValidationSchedulerLoop, runValidationSchedulerTick } from "./scheduler";

async function run() {
  if (process.argv.includes("--once")) {
    const result = await runValidationSchedulerTick();
    console.info("[validation-scheduler] tick complete", result);
    return;
  }

  await runValidationSchedulerLoop();
}

run().catch((error) => {
  console.error("[validation-scheduler] failed", error);
  process.exitCode = 1;
});

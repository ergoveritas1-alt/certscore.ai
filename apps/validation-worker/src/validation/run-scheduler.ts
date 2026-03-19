import { getWorkerEnv } from "../env";
import { runValidationSchedulerTick } from "./pipeline";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (process.argv.includes("--once")) {
    const startedAt = new Date();
    const result = await runValidationSchedulerTick(startedAt);
    console.info("[validation-scheduler] tick complete", {
      ...result,
      startedAt: startedAt.toISOString()
    });
    return;
  }

  const env = getWorkerEnv();
  const pollMs = env.VALIDATION_SCHEDULER_POLL_MINUTES * 60_000;

  for (;;) {
    const startedAt = new Date();
    try {
      const result = await runValidationSchedulerTick(startedAt);
      console.info("[validation-scheduler] tick complete", {
        ...result,
        startedAt: startedAt.toISOString()
      });
    } catch (error) {
      console.error("[validation-scheduler] tick failed", {
        error: error instanceof Error ? error.message : "Unknown error",
        startedAt: startedAt.toISOString()
      });
    }

    await sleep(pollMs);
  }
}

main().catch((error) => {
  console.error("[validation-scheduler] fatal error", error);
  process.exitCode = 1;
});

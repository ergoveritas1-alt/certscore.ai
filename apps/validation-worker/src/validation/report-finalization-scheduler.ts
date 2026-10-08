type FinalizationMode = "publish_report" | "finalize";

/** Keep customer report publication independent of trailing summary persistence. */
export function createReportFinalizationScheduler(concurrency: number) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("Report finalization concurrency must be a positive integer.");
  }
  const stages = new Map<FinalizationMode, {
    active: number;
    waiters: Array<() => void>;
  }>([
    ["publish_report", { active: 0, waiters: [] }],
    ["finalize", { active: 0, waiters: [] }],
  ]);

  return {
    async run<T>(mode: FinalizationMode, operation: () => Promise<T>): Promise<T> {
      const stage = stages.get(mode)!;
      if (stage.active >= concurrency) {
        await new Promise<void>((resolve) => stage.waiters.push(resolve));
      } else {
        stage.active += 1;
      }
      try {
        return await operation();
      } finally {
        const next = stage.waiters.shift();
        // Transfer the permit directly to the oldest waiter. A new arrival
        // must not overtake it or exceed the stage's concurrency limit.
        if (next) next();
        else stage.active -= 1;
      }
    },
  };
}

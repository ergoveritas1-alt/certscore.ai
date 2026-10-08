export type ReportPublicationHandoffStatus = "started" | "coalesced" | "deferred";

/** Preserve synchronous completion for paths that have no durable recovery owner. */
export async function dispatchDurableReportPublication<T>(input: T, options: {
  isRecoverable: (input: T) => Promise<boolean>;
  handoff: (input: T) => ReportPublicationHandoffStatus;
  publish: (input: T) => Promise<unknown>;
}): Promise<ReportPublicationHandoffStatus | "awaited"> {
  if (await options.isRecoverable(input)) return options.handoff(input);
  await options.publish(input);
  return "awaited";
}

/**
 * Detach only an already-durable publication request from the validation slot.
 * This admission bound is not a new publication permit: publish must retain the
 * shared finalization scheduler, per-scan coalescing and persistence guards.
 * Saturation and process exit leave the durable request for existing recovery.
 */
export function createReportPublicationHandoff<T extends { scanId: string }>(options: {
  maxPending: number;
  publish: (input: T) => Promise<unknown>;
  onError: (error: unknown, input: T) => void;
}) {
  if (!Number.isInteger(options.maxPending) || options.maxPending < 1) {
    throw new Error("Report publication handoff capacity must be a positive integer.");
  }
  const pending = new Map<string, Promise<void>>();

  return {
    handoff(input: T): ReportPublicationHandoffStatus {
      if (pending.has(input.scanId)) return "coalesced";
      if (pending.size >= options.maxPending) return "deferred";

      // Register before executing publish, including when it throws synchronously.
      const task = Promise.resolve()
        .then(() => options.publish(input))
        .then(() => undefined)
        .catch((error: unknown) => {
          // A failed diagnostic must not create an unhandled detached rejection.
          try { options.onError(error, input); } catch { /* Durable recovery remains authoritative. */ }
        })
        .finally(() => {
          if (pending.get(input.scanId) === task) pending.delete(input.scanId);
        });
      pending.set(input.scanId, task);
      return "started";
    },
    async drain() {
      await Promise.all([...pending.values()]);
    },
  };
}

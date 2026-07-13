export function abortReason(signal: AbortSignal | undefined): Error | null {
  if (!signal?.aborted) return null;
  return signal.reason instanceof Error
    ? signal.reason
    : new Error(typeof signal.reason === "string" ? signal.reason : "Scan aborted.");
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  const reason = abortReason(signal);
  if (reason) throw reason;
}

export async function boundedCleanup(work: Promise<unknown>, timeoutMs = 1_000): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      work.catch(() => undefined),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, Math.max(0, timeoutMs));
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

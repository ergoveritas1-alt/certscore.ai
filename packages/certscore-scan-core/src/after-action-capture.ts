import type { AfterActionCapture } from "@certscore/contracts";

/** Confirmation time overlaps this window; no extra window starts on failure. */
export async function finishAfterActionWindow(input: {
  dispatchedAtEpochMs: number;
  observationWindowMs: number;
  clickCompleted: boolean;
  signal?: AbortSignal;
  targetStillAuthorized: () => boolean;
}): Promise<AfterActionCapture["stopReason"]> {
  if (!input.clickCompleted) return "click_uncertain";
  const deadline = input.dispatchedAtEpochMs + input.observationWindowMs;
  while (true) {
    if (input.signal?.aborted) return "aborted";
    try { if (!input.targetStillAuthorized()) return "target_changed"; }
    catch { return "target_changed"; }
    const remaining = deadline - Date.now();
    if (remaining <= 0) return "window_elapsed";
    await new Promise<void>((resolve) => {
      const finish = () => { clearTimeout(timer); input.signal?.removeEventListener("abort", finish); resolve(); };
      const timer = setTimeout(finish, Math.min(50, remaining));
      input.signal?.addEventListener("abort", finish, { once: true });
      if (input.signal?.aborted) finish();
    });
  }
}

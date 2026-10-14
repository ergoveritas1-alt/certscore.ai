import type { Page } from "playwright";

/** Spend the caller's existing search window on page initialization before
 * running whole-document selectors/geometry. No new deadline or polling loop.
 * The caller still verifies the loaded target and live control before acting. */
export async function waitForConsentDocumentReady(page: Page, deadlineAtMs: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted || Date.now() >= deadlineAtMs) return false;
  let abort: (() => void) | undefined;
  const cancelled = new Promise<false>(resolve => {
    abort = () => resolve(false);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) resolve(false);
  });
  try {
    return await Promise.race([
      page.waitForLoadState("domcontentloaded", { timeout: Math.max(1, deadlineAtMs - Date.now()) })
        .then(() => !signal?.aborted && Date.now() < deadlineAtMs, () => false),
      cancelled,
    ]);
  } finally {
    if (abort) signal?.removeEventListener("abort", abort);
  }
}

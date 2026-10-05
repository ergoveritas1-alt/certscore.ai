import type { Frame, Page } from "playwright";
import {
  PASSIVE_EVIDENCE_INITIAL_QUIET_WINDOW_MS,
  type PassiveEvidenceActivityTracker,
} from "./passive-evidence-quiet-window.js";

export const RUNTIME_LOADING_DOCUMENT_SETTLE_MAX_MS = 10_000;

export type RuntimeDocumentSettleResult = {
  elapsedMs: number;
  status: "already_ready" | "settled" | "timed_out" | "cancelled" | "document_changed" | "unavailable";
};

/** One passive allowance for an unfinished parser, shared by baseline and GPC. */
export function waitForLoadingRuntimeDocument(input: {
  page: Page;
  signal?: AbortSignal;
  timeoutMs: number;
  tracker: PassiveEvidenceActivityTracker;
}): Promise<RuntimeDocumentSettleResult> {
  const startedAtMs = Date.now();
  const timeoutMs = Math.max(0, Math.min(input.timeoutMs, RUNTIME_LOADING_DOCUMENT_SETTLE_MAX_MS));
  if (input.signal?.aborted || timeoutMs === 0) {
    return Promise.resolve({ elapsedMs: 0, status: input.signal?.aborted ? "cancelled" : "timed_out" });
  }

  return new Promise(resolve => {
    let finished = false;
    let parsed = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let readTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (status: RuntimeDocumentSettleResult["status"]) => {
      if (finished) return;
      finished = true;
      clearTimeout(deadlineTimer);
      if (pollTimer) clearTimeout(pollTimer);
      if (readTimer) clearTimeout(readTimer);
      input.page.off("domcontentloaded", onParsed);
      input.page.off("framenavigated", onNavigation);
      input.page.off("close", onClose);
      input.signal?.removeEventListener("abort", onAbort);
      resolve({ elapsedMs: Math.max(0, Date.now() - startedAtMs), status });
    };
    const checkQuiet = () => {
      if (finished) return;
      const snapshot = input.tracker.snapshot();
      if (parsed && snapshot.inFlightRequestCount === 0 &&
          snapshot.quietForMs >= PASSIVE_EVIDENCE_INITIAL_QUIET_WINDOW_MS) {
        finish("settled");
      } else {
        pollTimer = setTimeout(checkQuiet, 25);
      }
    };
    const onParsed = () => {
      parsed = true;
      // Start the quiet interval after parsing. Requests dispatched by deferred
      // embed scripts remain tracked by the existing network listeners.
      input.tracker.noteActivity();
    };
    const onNavigation = (frame: Frame) => {
      if (frame === input.page.mainFrame()) finish("document_changed");
    };
    const onClose = () => finish("unavailable");
    const onAbort = () => finish("cancelled");
    const deadlineTimer = setTimeout(() => finish("timed_out"), timeoutMs);

    // Subscribe before the read so DOMContentLoaded cannot fall between them.
    input.page.on("domcontentloaded", onParsed);
    input.page.on("framenavigated", onNavigation);
    input.page.on("close", onClose);
    input.signal?.addEventListener("abort", onAbort, { once: true });
    readTimer = setTimeout(() => finish("unavailable"), Math.min(500, timeoutMs));
    void input.page.evaluate(() => document.readyState).then(state => {
      if (finished) return;
      if (readTimer) clearTimeout(readTimer);
      if (state !== "loading") {
        finish("already_ready");
        return;
      }
      checkQuiet();
    }, () => finish("unavailable"));
  });
}

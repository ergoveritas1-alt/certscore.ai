import { CertScoreTimeoutError, ThrottledError, CertScoreScanFailedError } from "./errors.js";
import type { JobStatus, PulseJobStatus } from "./types.js";

export const SUCCESS_STATUSES = new Set<PulseJobStatus>(["completed", "completed_limited"]);
export const FAILURE_STATUSES = new Set<PulseJobStatus>(["failed", "expired"]);

export function parseRetryAfter(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const seconds = Number.parseInt(value, 10);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds;
  }
  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) {
    return Math.max(0, Math.ceil((dateMs - Date.now()) / 1000));
  }
  return undefined;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(done, ms);
    function done() {
      signal?.removeEventListener("abort", abort);
      resolve();
    }
    function abort() {
      clearTimeout(timeout);
      reject(signal?.reason ?? new DOMException("The operation was aborted.", "AbortError"));
    }
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export function retryDelayMs(status: JobStatus, retryAfterSeconds: number | undefined, fallbackMs: number): number {
  if (typeof retryAfterSeconds === "number") {
    return retryAfterSeconds * 1000;
  }
  if (typeof status.retryAfterSeconds === "number") {
    return status.retryAfterSeconds * 1000;
  }
  return fallbackMs;
}

export function adaptivePollIntervalMs(elapsedMs: number): number {
  if (elapsedMs < 15_000) {
    return 1_000;
  }
  if (elapsedMs < 45_000) {
    return 2_000;
  }
  return 5_000;
}

export function throwForTerminalStatus(status: JobStatus): never {
  if (status.status === "rate_limited") {
    throw new ThrottledError(status.message ?? "Pulse scan is rate limited.", {
      code: "rate_limited",
      retryAfterSeconds: status.retryAfterSeconds ?? undefined,
      responseBody: status
    });
  }
  if (FAILURE_STATUSES.has(status.status)) {
    throw new CertScoreScanFailedError(status.error?.message ?? status.message ?? `Pulse scan ended with status ${status.status}.`, {
      code: status.error?.code ?? status.status,
      jobId: status.jobId,
      retryAfterSeconds: status.error?.retryAfterSeconds ?? undefined,
      scanId: status.scanId ?? status.scan_id ?? undefined,
      responseBody: status
    });
  }
  throw new CertScoreScanFailedError(`Pulse scan reached unsupported terminal status ${status.status}.`, {
    code: status.status,
    jobId: status.jobId,
    scanId: status.scanId ?? status.scan_id ?? undefined,
    responseBody: status
  });
}

export function throwTimeout(jobId: string, scanId: string | undefined): never {
  throw new CertScoreTimeoutError("Timed out waiting for CertScore Pulse scan to complete.", { jobId, scanId });
}

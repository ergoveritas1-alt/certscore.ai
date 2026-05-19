import { CertScoreApiError, InvalidUrlError, ScanFailedError, ThrottledError } from "./errors.js";
import { parseRetryAfter, retryDelayMs, sleep, SUCCESS_STATUSES, throwForTerminalStatus, throwTimeout } from "./poll.js";
import type {
  CertScoreClientOptions,
  FreshnessMode,
  GetScanOptions,
  JobStatus,
  PendingJob,
  PulseDetail,
  PulseErrorResponse,
  PulseFormat,
  PulseResult,
  ScanOptions,
  SubmitScanOptions
} from "./types.js";

const DEFAULT_BASE_URL = "https://certscore.ai";
const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_MAX_WAIT_MS = 300_000;
const DEFAULT_POLL_INTERVAL_MS = 5_000;

type JsonFormatOption = { format?: "json" };
type MarkdownFormatOption = { format: "markdown" };

type RequestOptions = {
  signal?: AbortSignal;
  timeout?: number;
};

function normalizeBaseUrl(baseUrl: string | undefined) {
  return (baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function normalizeDetail(detail: PulseDetail | undefined) {
  return detail ?? "standard";
}

function normalizeFormat(format: PulseFormat | undefined) {
  return format ?? "json";
}

function normalizeFreshness(freshness: FreshnessMode | undefined) {
  return freshness ?? "latest";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function statusScanId(status: Partial<JobStatus> | Partial<PendingJob>): string | undefined {
  return typeof status.scanId === "string" ? status.scanId : typeof status.scan_id === "string" ? status.scan_id : undefined;
}

function bodyErrorCode(body: unknown) {
  const record = asRecord(body);
  const error = asRecord(record.error);
  return typeof error.code === "string" ? error.code : undefined;
}

function bodyErrorMessage(body: unknown, fallback: string) {
  const record = asRecord(body);
  const error = asRecord(record.error);
  return typeof error.message === "string" && error.message.trim() ? error.message : fallback;
}

function bodyRetryAfter(body: unknown) {
  const record = asRecord(body);
  const error = asRecord(record.error);
  const retry = error.retryAfterSeconds ?? record.retryAfterSeconds;
  return typeof retry === "number" && Number.isFinite(retry) ? retry : undefined;
}

function withSearchParams(url: URL, params: Record<string, string | number | undefined>) {
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function isAbsoluteUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function isCompletedPulse(body: unknown): body is PulseResult {
  return asRecord(body).type === "certscore_pulse";
}

function isStatus(body: unknown): body is JobStatus {
  return asRecord(body).type === "certscore_pulse_status";
}

export class CertScoreClient {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly timeout: number;

  /** Create a CertScore Pulse API client. */
  constructor(options: CertScoreClientOptions = {}) {
    this.apiKey = options.apiKey;
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
  }

  /** Submit a URL to CertScore Pulse and return a completed JSON result, polling async jobs until completion. */
  scan(url: string, options?: ScanOptions & JsonFormatOption): Promise<PulseResult>;
  /** Submit a URL to CertScore Pulse and return a completed markdown result, polling async jobs until completion. */
  scan(url: string, options: ScanOptions & MarkdownFormatOption): Promise<string>;
  /** Submit a URL to CertScore Pulse and return a completed JSON or markdown result, depending on format. */
  async scan(url: string, options: ScanOptions = {}): Promise<PulseResult | string> {
    const detail = normalizeDetail(options.detail);
    const format = normalizeFormat(options.format);
    const freshness = normalizeFreshness(options.freshness);
    const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
    const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const startedAt = Date.now();

    const endpoint = this.url("/api/v1/pulse");
    withSearchParams(endpoint, {
      url,
      wait: 60,
      detail,
      format,
      freshness
    });
    if (options.callbackUrl) {
      endpoint.searchParams.set("callbackUrl", options.callbackUrl);
    }

    const response = await this.fetch(endpoint, { signal: options.signal });
    if (response.status === 200) {
      return this.parseCompletedResponse(response, format);
    }
    if (response.status !== 202) {
      return await this.throwForResponse(response);
    }

    const pending = (await response.json()) as JobStatus;
    options.onStatusUpdate?.(pending);
    const retryAfter = parseRetryAfter(response.headers.get("Retry-After"));
    return this.pollUntilComplete(pending, {
      detail,
      format,
      pollIntervalMs,
      maxWaitMs,
      startedAt,
      initialRetryAfterSeconds: retryAfter,
      signal: options.signal,
      onStatusUpdate: options.onStatusUpdate
    });
  }

  /** Retrieve a durable scan-backed Pulse result by scanId as JSON. */
  getScan(scanId: string, options?: GetScanOptions & JsonFormatOption): Promise<PulseResult>;
  /** Retrieve a durable scan-backed Pulse result by scanId as markdown. */
  getScan(scanId: string, options: GetScanOptions & MarkdownFormatOption): Promise<string>;
  /** Retrieve a durable scan-backed Pulse result by scanId. */
  async getScan(scanId: string, options: GetScanOptions = {}): Promise<PulseResult | string> {
    return this.fetchScan(scanId, normalizeDetail(options.detail), normalizeFormat(options.format), options.signal);
  }

  /** Fetch the public-safe status for an existing Pulse job. */
  async getJobStatus(jobId: string): Promise<JobStatus> {
    const response = await this.fetch(this.url(`/api/v1/pulse/status/${encodeURIComponent(jobId)}`));
    if (response.ok) {
      return (await response.json()) as JobStatus;
    }
    return await this.throwForResponse(response);
  }

  /** Submit a Pulse scan request with wait=0 and return immediately without polling. */
  async submitScan(url: string, options: SubmitScanOptions = {}): Promise<PendingJob> {
    const detail = normalizeDetail(options.detail);
    const format = normalizeFormat(options.format);
    const freshness = normalizeFreshness(options.freshness);
    const endpoint = this.url("/api/v1/pulse");
    withSearchParams(endpoint, { url, wait: 0, detail, format, freshness });
    const response = await this.fetch(endpoint, { signal: options.signal });

    if (response.status === 202) {
      return (await response.json()) as PendingJob;
    }
    if (response.status === 200) {
      if (format === "markdown") {
        const text = await response.text();
        return {
          type: "certscore_pulse_completed",
          status: "completed",
          completed: true,
          resultUrl: endpoint.toString(),
          markdown: text
        } as PendingJob;
      }
      const pulse = (await response.json()) as PulseResult;
      const nestedScanId = asRecord(pulse.scan).scanId;
      return {
        type: "certscore_pulse_completed",
        status: "completed",
        completed: true,
        scanId: pulse.scanId ?? pulse.scan_id ?? (typeof nestedScanId === "string" ? nestedScanId : null),
        resultUrl:
          typeof pulse.links?.scanJsonUrl === "string"
            ? pulse.links.scanJsonUrl
            : typeof pulse.links?.jsonUrl === "string"
              ? pulse.links.jsonUrl
              : endpoint.toString(),
        reportUrl: typeof pulse.links?.fullReportUrl === "string" ? pulse.links.fullReportUrl : null,
        pulse
      };
    }
    return await this.throwForResponse(response);
  }

  private async pollUntilComplete(
    initial: JobStatus,
    options: {
      detail: PulseDetail;
      format: PulseFormat;
      pollIntervalMs: number;
      maxWaitMs: number;
      startedAt: number;
      initialRetryAfterSeconds?: number;
      signal?: AbortSignal;
      onStatusUpdate?: (status: JobStatus) => void;
    }
  ): Promise<PulseResult | string> {
    let status = initial;
    let retryAfterSeconds = options.initialRetryAfterSeconds;

    while (true) {
      if (SUCCESS_STATUSES.has(status.status)) {
        return this.fetchCompletedFromStatus(status, options.detail, options.format, options.signal);
      }
      if (status.status === "rate_limited" || status.status === "failed" || status.status === "expired") {
        throwForTerminalStatus(status);
      }

      const jobId = status.jobId;
      const scanId = statusScanId(status);
      if (Date.now() - options.startedAt >= options.maxWaitMs) {
        throwTimeout(jobId, scanId);
      }

      const delay = Math.min(retryDelayMs(status, retryAfterSeconds, options.pollIntervalMs), Math.max(0, options.maxWaitMs - (Date.now() - options.startedAt)));
      await sleep(delay, options.signal);

      const pollUrl = this.statusUrlFor(status);
      const response = await this.fetch(pollUrl, { signal: options.signal });
      if (response.status === 202 || response.status === 200 || response.status === 429) {
        const nextStatus = (await response.json()) as JobStatus;
        status = nextStatus;
        retryAfterSeconds = parseRetryAfter(response.headers.get("Retry-After"));
        options.onStatusUpdate?.(status);
        continue;
      }
      return await this.throwForResponse(response);
    }
  }

  private async fetchCompletedFromStatus(status: JobStatus, detail: PulseDetail, format: PulseFormat, signal?: AbortSignal): Promise<PulseResult | string> {
    const scanId = statusScanId(status);
    if (status.resultUrl) {
      const url = this.resolveApiUrl(status.resultUrl);
      withSearchParams(url, { detail, format });
      const response = await this.fetch(url, { signal });
      if (response.status === 200) {
        return this.parseCompletedResponse(response, format);
      }
      return await this.throwForResponse(response);
    }
    if (scanId) {
      return this.fetchScan(scanId, detail, format, signal);
    }
    throw new ScanFailedError("Pulse job completed without a result URL or scanId.", {
      jobId: status.jobId,
      responseBody: status
    });
  }

  private async fetchScan(scanId: string, detail: PulseDetail, format: PulseFormat, signal?: AbortSignal): Promise<PulseResult | string> {
    const endpoint = this.url("/api/v1/pulse");
    withSearchParams(endpoint, { scanId, detail, format });
    const response = await this.fetch(endpoint, { signal });
    if (response.status === 200) {
      return this.parseCompletedResponse(response, format);
    }
    return await this.throwForResponse(response);
  }

  private statusUrlFor(status: JobStatus): URL {
    const candidate = typeof status.statusUrl === "string" ? status.statusUrl : typeof status.nextCheckUrl === "string" ? status.nextCheckUrl : null;
    if (candidate) {
      return this.resolveApiUrl(candidate);
    }
    return this.url(`/api/v1/pulse/status/${encodeURIComponent(status.jobId)}`);
  }

  private async parseCompletedResponse(response: Response, format: PulseFormat): Promise<PulseResult | string> {
    if (format === "markdown") {
      return response.text();
    }
    const body = await response.json();
    if (isCompletedPulse(body)) {
      return body;
    }
    if (isStatus(body)) {
      if (body.status === "rate_limited" || body.status === "failed" || body.status === "expired") {
        throwForTerminalStatus(body);
      }
    }
    throw new CertScoreApiError("CertScore returned an unexpected response shape.", {
      status: response.status,
      responseBody: body
    });
  }

  private async throwForResponse(response: Response): Promise<never> {
    const body = await this.safeBody(response);
    const code = bodyErrorCode(body);
    const message = bodyErrorMessage(body, `CertScore API request failed with HTTP ${response.status}.`);
    const retryAfterSeconds = parseRetryAfter(response.headers.get("Retry-After")) ?? bodyRetryAfter(body);

    if (response.status === 400 && code === "invalid_url") {
      throw new InvalidUrlError(message, { status: response.status, code, responseBody: body });
    }
    if (response.status === 429 || code === "pulse_throttled" || code === "rate_limited") {
      throw new ThrottledError(message, { status: response.status, code, retryAfterSeconds, responseBody: body });
    }
    throw new CertScoreApiError(message, { status: response.status, code, responseBody: body });
  }

  private async safeBody(response: Response): Promise<unknown> {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return response.json().catch(() => undefined) as Promise<PulseErrorResponse | undefined>;
    }
    return response.text().catch(() => undefined);
  }

  private async fetch(url: URL, options: RequestOptions = {}): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new DOMException("CertScore request timed out.", "TimeoutError")), options.timeout ?? this.timeout);
    const abort = () => controller.abort(options.signal?.reason);
    try {
      if (options.signal?.aborted) {
        abort();
      } else {
        options.signal?.addEventListener("abort", abort, { once: true });
      }
      return await fetch(url, {
        method: "GET",
        headers: this.headers(),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
    }
  }

  private headers(): HeadersInit {
    const headers: Record<string, string> = {
      Accept: "application/json, text/markdown;q=0.9"
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  private url(path: string): URL {
    return new URL(path, this.baseUrl);
  }

  private resolveApiUrl(value: string): URL {
    if (isAbsoluteUrl(value)) {
      return new URL(value);
    }
    return this.url(value);
  }
}

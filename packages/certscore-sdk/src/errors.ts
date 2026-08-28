export class CertScoreError extends Error {
  status?: number;
  code?: string;
  responseBody?: unknown;

  constructor(message: string, options: { status?: number; code?: string; responseBody?: unknown; cause?: unknown } = {}) {
    super(message);
    this.name = "CertScoreError";
    this.status = options.status;
    this.code = options.code;
    this.responseBody = options.responseBody;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export class CertScoreApiError extends CertScoreError {
  declare status: number;

  constructor(message: string, options: { status: number; code?: string; responseBody?: unknown; cause?: unknown }) {
    super(message, options);
    this.name = "CertScoreApiError";
    this.status = options.status;
  }
}

export class CertScoreTimeoutError extends CertScoreError {
  jobId: string;
  scanId?: string;

  constructor(message: string, options: { jobId: string; scanId?: string; cause?: unknown }) {
    super(message, { cause: options.cause });
    this.name = "CertScoreTimeoutError";
    this.jobId = options.jobId;
    this.scanId = options.scanId;
  }
}

export { CertScoreTimeoutError as ScanTimeoutError };

export class InvalidUrlError extends CertScoreError {
  constructor(message: string, options: { status?: number; code?: string; responseBody?: unknown; cause?: unknown } = {}) {
    super(message, options);
    this.name = "InvalidUrlError";
  }
}

export class ThrottledError extends CertScoreError {
  retryAfterSeconds?: number;
  creationRateLimit?: Record<string, unknown>;

  constructor(
    message: string,
    options: { status?: number; code?: string; retryAfterSeconds?: number; creationRateLimit?: Record<string, unknown>; responseBody?: unknown; cause?: unknown } = {}
  ) {
    super(message, options);
    this.name = "ThrottledError";
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.creationRateLimit = options.creationRateLimit;
  }
}

export class CertScoreScanFailedError extends CertScoreError {
  scanId?: string;
  jobId?: string;
  retryAfterSeconds?: number;

  constructor(
    message: string,
    options: { scanId?: string | null; jobId?: string | null; status?: number; code?: string; retryAfterSeconds?: number; responseBody?: unknown; cause?: unknown } = {}
  ) {
    super(message, options);
    this.name = "CertScoreScanFailedError";
    this.scanId = options.scanId ?? undefined;
    this.jobId = options.jobId ?? undefined;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export { CertScoreScanFailedError as ScanFailedError };

import { readdir, unlink } from "node:fs/promises";
import path from "node:path";
import type {
  CanonicalEvidenceBundle,
  HomepageScreenshotState,
  ScreenshotArtifact,
  ScreenshotSafetyFailureCode,
} from "@certscore/contracts";
import { proxyFetch } from "@certscore/scan-core/proxy-fetch";
import { imageDigest, MAX_REVIEW_IMAGE_BYTES, readBoundedImage, verifiedPairedScreenshot } from "./screenshot-safety-evidence.js";

export const DEFAULT_SCREENSHOT_SAFETY_MODEL = "omni-moderation-latest";
export const DEFAULT_SCREENSHOT_SAFETY_TIMEOUT_MS = 8_000;
export const CONSENT_SCREENSHOT_SAFETY_FINALIZATION_BUDGET_MS = 2_000;
export const VERIFIED_PAIR_SCREENSHOT_SAFETY_FINALIZATION_BUDGET_MS = 4_000;
export const SCREENSHOT_SAFETY_MAX_ADDED_LATENCY_MS = 4_100;
// General images receive 75 ms of finalization grace; representative consent
// imagery receives 2 seconds. Owner-approved verified paired images may reuse
// their existing review for 4 seconds, with 100 ms for fail-closed cleanup.
export const SCREENSHOT_SAFETY_FINALIZATION_BUDGET_MS = 75;

type ScreenshotMimeType = "image/jpeg" | "image/png" | "image/webp";

export type ScreenshotSafetyClassifier = (input: {
  bytes: Buffer;
  mimeType: ScreenshotMimeType;
  signal?: AbortSignal;
  onPhase?: (phase: "request_started" | "response_headers" | "response_body") => void;
}) => Promise<{ safeForDisplay: boolean }>;

type ScreenshotSafetyEnvironment = NodeJS.ProcessEnv;

type ScreenshotSafetyReviewOutcome =
  | { status: "safe" }
  | { status: "sensitive" }
  | { failureCode: ScreenshotSafetyFailureCode; status: "unavailable" };

class ScreenshotSafetyReviewError extends Error {
  constructor(
    readonly failureCode: ScreenshotSafetyFailureCode,
    message: string,
  ) {
    super(message);
    this.name = "ScreenshotSafetyReviewError";
  }
}

type ReviewTiming = {
  scheduledAtMs: number;
  readStartedAtMs?: number;
  queuedAtMs?: number;
  executionStartedAtMs?: number;
  requestStartedAtMs?: number;
  responseHeadersAtMs?: number;
  responseBodyAtMs?: number;
  completedAtMs?: number;
};
type ReviewJob = {
  bytes: Buffer;
  mimeType: ScreenshotMimeType;
  controller: AbortController;
  promise: Promise<ScreenshotSafetyReviewOutcome>;
  resolve: (outcome: ScreenshotSafetyReviewOutcome) => void;
  timing: ReviewTiming;
  priority: number;
  running: boolean;
  finished: boolean;
  outcome?: ScreenshotSafetyReviewOutcome;
};
type ScheduledScreenshotSafetyReview = {
  timing: ReviewTiming;
  job?: ReviewJob;
  sha256?: string;
  shared: boolean;
  artifactId?: string;
  byteBindingFailure?: "reviewed_image_bytes_changed" | "comparison_image_hash_changed" | "image_file_unavailable";
  bytesVerifiedAtMs?: number;
  priority: number;
  promise: Promise<ScreenshotSafetyReviewOutcome>;
  finalization?: { startedAtMs: number; budgetMs: number; completedAtMs: number; outcome: ScreenshotSafetyReviewOutcome };
};
const MAX_REVIEW_FILES = 12;
const MAX_REVIEW_CONCURRENCY = 2;
// All eight current producer capture IDs fit without downsampling. Bound memory
// by the file limit and existing downstream per-image verification limit.
const MAX_BUFFERED_REVIEW_BYTES = MAX_REVIEW_FILES * MAX_REVIEW_IMAGE_BYTES;

export type HomepageScreenshotSafetyReviewCoordinator = ReturnType<
  typeof createHomepageScreenshotSafetyReviewCoordinator
>;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function boundedTimeoutMs(value: string | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_SCREENSHOT_SAFETY_TIMEOUT_MS;
  return Math.max(2_000, Math.min(20_000, Math.round(parsed)));
}

export function createOpenAiScreenshotSafetyClassifier(
  env: ScreenshotSafetyEnvironment = process.env,
  fetchImpl: typeof fetch = (input, init) => proxyFetch(input, init, env),
): ScreenshotSafetyClassifier {
  return async ({ bytes, mimeType, signal, onPhase }) => {
    const apiKey = env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new ScreenshotSafetyReviewError(
        "configuration_missing",
        "Screenshot safety review is unavailable.",
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(new Error("Screenshot safety review timed out.")),
      boundedTimeoutMs(env.CERTSCORE_SCREENSHOT_SAFETY_TIMEOUT_MS),
    );
    const requestSignal = signal
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal;

    try {
      let response: Response;
      try {
        onPhase?.("request_started");
        response = await fetchImpl("https://api.openai.com/v1/moderations", {
          body: JSON.stringify({
            input: [{
              image_url: {
                url: `data:${mimeType};base64,${bytes.toString("base64")}`,
              },
              type: "image_url",
            }],
            model: env.CERTSCORE_SCREENSHOT_SAFETY_MODEL?.trim() || DEFAULT_SCREENSHOT_SAFETY_MODEL,
          }),
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          method: "POST",
          signal: requestSignal,
        });
      } catch (error) {
        if (controller.signal.aborted) {
          throw new ScreenshotSafetyReviewError(
            "moderation_timeout",
            "Screenshot safety review timed out.",
          );
        }
        throw new ScreenshotSafetyReviewError(
          "moderation_transport_error",
          error instanceof Error ? error.message : "Screenshot safety transport failed.",
        );
      }
      onPhase?.("response_headers");
      if (!response.ok) {
        throw new ScreenshotSafetyReviewError(
          "moderation_http_error",
          `Screenshot safety review failed with HTTP ${response.status}.`,
        );
      }

      let body: Record<string, unknown> | null;
      try {
        body = record(await response.json());
        onPhase?.("response_body");
      } catch {
        throw new ScreenshotSafetyReviewError(
          controller.signal.aborted ? "moderation_timeout" : "moderation_invalid_response",
          "Screenshot safety review could not read its response.",
        );
      }
      const results = Array.isArray(body?.results) ? body.results : [];
      const first = record(results[0]);
      const categories = record(first?.categories);
      if (!categories || typeof categories.sexual !== "boolean") {
        throw new ScreenshotSafetyReviewError(
          "moderation_invalid_response",
          "Screenshot safety review returned an invalid response.",
        );
      }
      const sexualMinors = categories["sexual/minors"];
      if (sexualMinors !== undefined && typeof sexualMinors !== "boolean") {
        throw new ScreenshotSafetyReviewError(
          "moderation_invalid_response",
          "Screenshot safety review returned an invalid response.",
        );
      }

      return {
        safeForDisplay: categories.sexual === false && sexualMinors !== true,
      };
    } finally {
      clearTimeout(timeout);
    }
  };
}

export function createHomepageScreenshotSafetyReviewCoordinator(input: {
  artifactRoot: string;
  classifier?: ScreenshotSafetyClassifier;
  signal?: AbortSignal;
}) {
  const classifier = input.classifier ?? createOpenAiScreenshotSafetyClassifier();
  const reviews = new Map<string, ScheduledScreenshotSafetyReview>();
  const jobs: ReviewJob[] = [];
  const byDigest = new Map<string, ReviewJob>();
  let active = 0;
  let bufferedBytes = 0;
  let closed = false;
  let finalized = false;
  let preferredPath: string | undefined;
  let pairEligibility: { status: "verified" | "unverified" | "deadline_exceeded"; elapsedMs: number } | undefined;
  const unavailable = (): ScreenshotSafetyReviewOutcome => ({ status: "unavailable", failureCode: "temporary_file_unavailable" });
  const priorityFor = (filePath: string) => filePath === preferredPath ? 100 :
    /screenshot-pre-consent-settled\./.test(filePath) ? 20 :
    /screenshot-pre-consent-geometry-proof\./.test(filePath) ? 30 : 0;
  const pump = () => {
    if (closed || input.signal?.aborted) return;
    while (active < MAX_REVIEW_CONCURRENCY) {
      const job = jobs.filter(row => !row.running && !row.finished).sort((a, b) => b.priority - a.priority)[0];
      if (!job) return;
      job.running = true;
      active += 1;
      const signal = input.signal ? AbortSignal.any([input.signal, job.controller.signal]) : job.controller.signal;
      // Classifier execution is distinct from the actual HTTP request (which
      // may never start, for example when configuration is missing).
      job.timing.executionStartedAtMs = Date.now();
      void Promise.resolve().then(() => {
        if (closed || signal.aborted) throw new ScreenshotSafetyReviewError("moderation_transport_error", "Screenshot review cancelled.");
        return classifier({
          bytes: job.bytes,
          mimeType: job.mimeType,
          signal,
          onPhase(phase) {
            if (closed) return;
            const now = Date.now();
            if (phase === "request_started") job.timing.requestStartedAtMs = now;
            if (phase === "response_headers") job.timing.responseHeadersAtMs = now;
            if (phase === "response_body") job.timing.responseBodyAtMs = now;
          },
        });
      }).then(result => {
        if (!result || typeof result.safeForDisplay !== "boolean") {
          return { status: "unavailable", failureCode: "moderation_invalid_response" } as const;
        }
        return { status: result.safeForDisplay ? "safe" : "sensitive" } as ScreenshotSafetyReviewOutcome;
      }).catch((error): ScreenshotSafetyReviewOutcome => ({
        status: "unavailable",
        failureCode: error instanceof ScreenshotSafetyReviewError ? error.failureCode : "moderation_transport_error",
      })).then(outcome => {
        if (closed) return;
        job.finished = true;
        job.outcome = outcome;
        job.timing.completedAtMs = Date.now();
        job.resolve(outcome);
        active -= 1;
        pump();
      });
    }
  };
  const close = () => {
    if (closed) return;
    closed = true;
    input.signal?.removeEventListener("abort", close);
    for (const job of jobs) {
      job.controller.abort(new Error("Screenshot safety finalization completed."));
      if (!job.finished) job.resolve({ status: "unavailable", failureCode: "finalization_deadline_exceeded" });
      job.bytes.fill(0);
    }
  };
  if (input.signal?.aborted) close();
  else input.signal?.addEventListener("abort", close, { once: true });
  const schedule = (screenshot: Pick<ScreenshotArtifact, "captureMethod" | "path"> & Partial<Pick<ScreenshotArtifact, "artifactId">>) => {
    if (closed || isPlaceholderScreenshot(screenshot)) return;
    const filePath = fileWithinArtifactRoot(input.artifactRoot, screenshot.path);
    const mimeType = filePath ? screenshotMimeType(filePath) : null;
    if (!filePath || !mimeType || reviews.has(filePath) || reviews.size >= MAX_REVIEW_FILES) return;
    const entry: ScheduledScreenshotSafetyReview = {
      timing: { scheduledAtMs: Date.now() }, shared: false, priority: priorityFor(filePath),
      artifactId: screenshot.artifactId && /^[a-z0-9_]{1,120}$/.test(screenshot.artifactId) ? screenshot.artifactId : undefined,
      promise: Promise.resolve(unavailable()),
    };
    reviews.set(filePath, entry);
    entry.promise = (async () => {
      let bytes: Buffer | undefined;
      try {
        entry.timing.readStartedAtMs = Date.now();
        bytes = await readBoundedImage(filePath);
        if (closed || input.signal?.aborted) return unavailable();
        entry.sha256 = imageDigest(bytes);
        const key = `${mimeType}:${entry.sha256}`;
        const existing = byDigest.get(key);
        // Retain bounded bytes until finalization so sharing requires literal
        // byte equality, including after a job has already completed.
        if (existing && existing.bytes.equals(bytes)) {
          entry.job = existing;
          entry.shared = true;
          existing.priority = Math.max(existing.priority, priorityFor(filePath));
          return existing.promise;
        }
        if (bufferedBytes + bytes.length > MAX_BUFFERED_REVIEW_BYTES) return unavailable();
        let resolve!: ReviewJob["resolve"];
        const promise = new Promise<ScreenshotSafetyReviewOutcome>(done => { resolve = done; });
        const job: ReviewJob = {
          bytes, mimeType, controller: new AbortController(), promise, resolve,
          timing: { ...entry.timing, queuedAtMs: Date.now() }, priority: priorityFor(filePath), running: false, finished: false,
        };
        bufferedBytes += bytes.length;
        bytes = undefined; // job owns and erases this buffer at finalization
        entry.job = job;
        jobs.push(job);
        byDigest.set(key, job);
        pump();
        return promise;
      } catch {
        return unavailable();
      } finally {
        bytes?.fill(0);
      }
    })();
  };

  return {
    reviewedImage(filePath: string) {
      const entry = reviews.get(filePath);
      const bytes = entry?.job?.bytes;
      if (closed || !entry?.sha256 || !bytes || bytes.length < 24 ||
          bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return undefined;
      return Object.freeze({ sha256: entry.sha256, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) });
    },
    recordPairEligibility(value: NonNullable<typeof pairEligibility>) {
      if (!finalized) pairEligibility = { ...value };
    },
    prioritize(screenshotPath: string | undefined) {
      preferredPath = screenshotPath;
      if (screenshotPath) {
        const entry = reviews.get(screenshotPath);
        if (entry?.job) entry.job.priority = 100;
      }
    },
    cancelPending() { close(); finalized = true; },
    async reviewFor(screenshot: Pick<ScreenshotArtifact, "captureMethod" | "path">, expectedSha256?: string) {
      schedule(screenshot);
      const filePath = fileWithinArtifactRoot(input.artifactRoot, screenshot.path);
      const entry = filePath ? reviews.get(filePath) : undefined;
      if (!entry || !filePath) return unavailable();
      const outcome = await entry.promise;
      if (closed || input.signal?.aborted) return unavailable();
      if (outcome.status === "unavailable") return outcome;
      let bytes: Buffer | undefined;
      try {
        bytes = await readBoundedImage(filePath);
        // A path can be overwritten during capture. Never apply an earlier
        // review to replacement bytes or to a different geometry comparison.
        if (closed || input.signal?.aborted) return unavailable();
        if (!entry.job?.bytes.equals(bytes)) {
          entry.byteBindingFailure = "reviewed_image_bytes_changed";
          return unavailable();
        }
        if (expectedSha256 && entry.sha256 !== expectedSha256) {
          entry.byteBindingFailure = "comparison_image_hash_changed";
          return unavailable();
        }
        entry.bytesVerifiedAtMs = Date.now();
        return outcome;
      } catch {
        if (!closed) entry.byteBindingFailure = "image_file_unavailable";
        return unavailable();
      } finally {
        bytes?.fill(0);
      }
    },
    recordFinalization(screenshotPath: string, startedAtMs: number, budgetMs: number, outcome: ScreenshotSafetyReviewOutcome) {
      const entry = reviews.get(screenshotPath);
      if (entry && !finalized) entry.finalization = { startedAtMs, budgetMs, completedAtMs: Date.now(), outcome };
    },
    diagnostics() {
      return {
        version: "screenshot_safety_review_diagnostics.v1",
        maxConcurrency: MAX_REVIEW_CONCURRENCY,
        pairEligibility,
        reviews: [...reviews.values()].map((entry, index) => ({
          reviewId: index + 1,
          artifactId: entry.artifactId,
          priority: entry.job?.priority ?? entry.priority,
          sharedIdenticalBytes: entry.shared,
          byteBindingFailure: entry.byteBindingFailure,
          bytesVerifiedAtMs: entry.bytesVerifiedAtMs,
          scheduledAtMs: entry.timing.scheduledAtMs,
          readStartedAtMs: entry.timing.readStartedAtMs,
          queuedAtMs: entry.job?.timing.queuedAtMs,
          executionStartedAtMs: entry.job?.timing.executionStartedAtMs,
          requestStartedAtMs: entry.job?.timing.requestStartedAtMs,
          responseHeadersAtMs: entry.job?.timing.responseHeadersAtMs,
          responseBodyAtMs: entry.job?.timing.responseBodyAtMs,
          completedAtMs: entry.job?.timing.completedAtMs,
          finalization: entry.finalization,
          reviewOutcome: entry.job?.outcome,
        })),
      };
    },
    schedule,
  };
}

async function reviewWithinFinalizationBudget(
  review: Promise<ScreenshotSafetyReviewOutcome>,
  deadlineAtMs: number,
): Promise<ScreenshotSafetyReviewOutcome> {
  const remainingMs = Math.max(0, deadlineAtMs - Date.now());
  if (remainingMs === 0) {
    return {
      failureCode: "finalization_deadline_exceeded",
      status: "unavailable",
    };
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      review,
      new Promise<ScreenshotSafetyReviewOutcome>((resolve) => {
        timeout = setTimeout(() => resolve({
          failureCode: "finalization_deadline_exceeded",
          status: "unavailable",
        }), remainingMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function screenshotMimeType(filePath: string): ScreenshotMimeType | null {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return null;
}

function fileWithinArtifactRoot(artifactRoot: string, filePath: string) {
  const root = path.resolve(artifactRoot);
  const resolved = path.resolve(filePath);
  return resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
}

function isPlaceholderScreenshot(
  screenshot: Pick<CanonicalEvidenceBundle["screenshots"][number], "captureMethod">,
) {
  return screenshot.captureMethod === "primary_placeholder" ||
    screenshot.captureMethod === "fresh_context_placeholder";
}

function hasCompletedFirstLayerConsentInventory(bundle: CanonicalEvidenceBundle) {
  return bundle.consentUiObservations.some((observation) =>
    observation.captureStatus === "observed" &&
    observation.inventoryOutcome === "complete_with_controls" &&
    observation.layerInspected === "first_layer" &&
    observation.controls.length > 0
  );
}

function isRepresentativeConsentScreenshot(
  screenshot: ScreenshotArtifact,
  completedFirstLayerInventory: boolean,
) {
  return completedFirstLayerInventory &&
    screenshot.consentStateAtTime === "pre_consent" &&
    screenshot.pagePhase === "network_idle";
}

async function deleteUnretainedScreenshotFiles(
  artifactRoot: string,
  screenshots: ScreenshotArtifact[],
) {
  const retainedPaths = new Set<string>();
  const pathsToDelete = new Set<string>();
  for (const screenshot of screenshots) {
    const resolved = fileWithinArtifactRoot(artifactRoot, screenshot.path);
    if (!resolved) continue;
    if (screenshot.retentionStatus === "available") retainedPaths.add(resolved);
    else pathsToDelete.add(resolved);
  }
  for (const entry of await readdir(artifactRoot, { withFileTypes: true })) {
    if (
      entry.isFile() &&
      /(?:^|-)screenshot[^/]*\.(?:png|jpe?g|webp)$/i.test(entry.name)
    ) {
      pathsToDelete.add(path.join(artifactRoot, entry.name));
    }
  }
  await Promise.all(
    [...pathsToDelete]
      .filter((filePath) => !retainedPaths.has(filePath))
      .map(async (filePath) => {
        try {
          await unlink(filePath);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }),
  );
}

function withScreenshotSafetyOutcomes(
  bundle: CanonicalEvidenceBundle,
  screenshots: ScreenshotArtifact[],
): CanonicalEvidenceBundle {
  const displayableScreenshots = screenshots.filter(
    (screenshot) => !isPlaceholderScreenshot(screenshot) && screenshot.displayStatus === "available",
  );
  const withheldScreenshots = screenshots.filter(
    (screenshot) => !isPlaceholderScreenshot(screenshot) && (
      screenshot.displayStatus === "withheld" ||
      (screenshot.displayStatus === undefined && screenshot.retentionStatus === "withheld")
    ),
  );
  const sensitiveWithheld = withheldScreenshots.some(
    (screenshot) =>
      (screenshot.displayWithheldReason ?? screenshot.withheldReason) === "sensitive_visual_content",
  );
  const firstUnavailable = withheldScreenshots.find(
    (screenshot) =>
      (screenshot.displayWithheldReason ?? screenshot.withheldReason) === "safety_check_unavailable",
  );
  const homepageScreenshot: HomepageScreenshotState = displayableScreenshots.length > 0
    ? { status: "available" }
    : sensitiveWithheld
      ? { status: "withheld", reason: "sensitive_visual_content" }
      : {
          status: "withheld",
          reason: "safety_check_unavailable",
          ...(firstUnavailable?.safetyFailureCode
            ? { failureCode: firstUnavailable.safetyFailureCode }
            : {}),
        };
  const unretainedArtifactIds = new Set(
    screenshots
      .filter((screenshot) => screenshot.retentionStatus === "withheld")
      .map((screenshot) => screenshot.artifactId),
  );
  const unretainedPaths = new Set(
    screenshots
      .filter((screenshot) => screenshot.retentionStatus === "withheld")
      .map((screenshot) => screenshot.path),
  );
  const keepArtifact = (artifact: CanonicalEvidenceBundle["artifactRefs"][number]) =>
    artifact.artifactType !== "screenshot" ||
    (
      !unretainedArtifactIds.has(artifact.artifactId) &&
      (!artifact.path || !unretainedPaths.has(artifact.path))
    );
  const notes = withheldScreenshots.length === 0
    ? bundle.visualCapture?.notes ?? []
    : [...new Set([
        ...(bundle.visualCapture?.notes ?? []),
        displayableScreenshots.length > 0
          ? "Some page imagery was not retained after the visual safety gate."
          : sensitiveWithheld
            ? "Page imagery was not retained after the visual safety gate."
            : "Page imagery was not retained because the visual safety check could not be completed.",
      ])];
  return {
    ...bundle,
    homepageScreenshot,
    screenshots,
    artifactRefs: bundle.artifactRefs.filter(keepArtifact),
    visualCapture: bundle.visualCapture
      ? {
          ...bundle.visualCapture,
          artifactRefs: bundle.visualCapture.artifactRefs.filter(keepArtifact),
          notes,
        }
      : bundle.visualCapture,
  };
}

export async function applyHomepageScreenshotSafetyGate(input: {
  artifactRoot: string;
  bundle: CanonicalEvidenceBundle;
  classifier?: ScreenshotSafetyClassifier;
  reviewCoordinator?: HomepageScreenshotSafetyReviewCoordinator;
  signal?: AbortSignal;
}): Promise<CanonicalEvidenceBundle> {
  const nonPlaceholderScreenshots = input.bundle.screenshots.filter(
    (screenshot) => !isPlaceholderScreenshot(screenshot),
  );
  if (
    input.bundle.homepageScreenshot &&
    nonPlaceholderScreenshots.length > 0 &&
    nonPlaceholderScreenshots.every((screenshot) =>
      screenshot.displayStatus !== undefined || screenshot.retentionStatus === "withheld"
    )
  ) {
    const screenshots = input.bundle.screenshots.map((screenshot): ScreenshotArtifact => {
      if (isPlaceholderScreenshot(screenshot)) return screenshot;
      const reason = screenshot.displayWithheldReason ?? screenshot.withheldReason;
      if (screenshot.displayStatus !== "withheld" && screenshot.retentionStatus !== "withheld") {
        return screenshot;
      }
      return {
        ...screenshot,
        displayStatus: "withheld",
        displayWithheldReason: reason ?? "safety_check_unavailable",
        retentionStatus: "withheld",
        withheldReason: reason ?? "safety_check_unavailable",
      };
    });
    input.reviewCoordinator?.cancelPending();
    await deleteUnretainedScreenshotFiles(input.artifactRoot, screenshots);
    return screenshots.some((screenshot) => screenshot.retentionStatus === "withheld")
      ? withScreenshotSafetyOutcomes(input.bundle, screenshots)
      : input.bundle;
  }
  const pendingScreenshots = input.bundle.screenshots.filter(
    (screenshot) =>
      screenshot.displayStatus === undefined &&
      screenshot.retentionStatus !== "withheld" &&
      !isPlaceholderScreenshot(screenshot),
  );
  if (pendingScreenshots.length === 0) {
    input.reviewCoordinator?.cancelPending();
    return input.bundle;
  }

  const reviewCoordinator = input.reviewCoordinator ??
    createHomepageScreenshotSafetyReviewCoordinator({
      artifactRoot: input.artifactRoot,
      classifier: input.classifier,
      signal: input.signal,
    });
  const finalizationStartedAtMs = Date.now();
  // Start the likely comparison first when no capture-time coordinator exists.
  const ordered = [...pendingScreenshots].sort((a, b) =>
    (b.artifactId === "screenshot_pre_consent_geometry_proof" ? 2 : Number(b.artifactId === "screenshot_pre_consent_settled")) -
    (a.artifactId === "screenshot_pre_consent_geometry_proof" ? 2 : Number(a.artifactId === "screenshot_pre_consent_settled")));
  for (const screenshot of ordered) reviewCoordinator.schedule(screenshot);
  const completedFirstLayerInventory = hasCompletedFirstLayerConsentInventory(input.bundle);
  // Start each existing deadline immediately. Local pair verification must not
  // consume another image's grace or discard a review that already completed.
  const reviews = pendingScreenshots.map(screenshot => {
    const review = reviewCoordinator.reviewFor(screenshot);
    const budgetMs = isRepresentativeConsentScreenshot(screenshot, completedFirstLayerInventory)
      ? CONSENT_SCREENSHOT_SAFETY_FINALIZATION_BUDGET_MS : SCREENSHOT_SAFETY_FINALIZATION_BUDGET_MS;
    return { screenshot, review, budgetMs,
      outcome: reviewWithinFinalizationBudget(review, finalizationStartedAtMs + budgetMs) };
  });
  let eligibilityTimer: ReturnType<typeof setTimeout> | undefined;
  let eligibilityExpired = false;
  const paired = await Promise.race([
    verifiedPairedScreenshot({ ...input, reviewedImage: reviewCoordinator.reviewedImage }),
    new Promise<null>(resolve => {
      eligibilityTimer = setTimeout(() => { eligibilityExpired = true; resolve(null); }, Math.max(0,
        finalizationStartedAtMs + SCREENSHOT_SAFETY_FINALIZATION_BUDGET_MS - Date.now()));
    }),
  ]).finally(() => { if (eligibilityTimer) clearTimeout(eligibilityTimer); });
  reviewCoordinator.recordPairEligibility({ status: paired ? "verified" : eligibilityExpired ? "deadline_exceeded" : "unverified",
    elapsedMs: Date.now() - finalizationStartedAtMs });
  reviewCoordinator.prioritize(paired?.path);
  const reviewed = await Promise.all(reviews.map(async ({ screenshot, outcome, budgetMs }) => {
    let result = await outcome;
    const pairedImage = screenshot.path === paired?.path;
    const finalizationBudgetMs = pairedImage ? VERIFIED_PAIR_SCREENSHOT_SAFETY_FINALIZATION_BUDGET_MS : budgetMs;
    if (pairedImage && paired && (result.status === "safe" ||
      (result.status === "unavailable" && result.failureCode === "finalization_deadline_exceeded"))) {
      // Reuse the same review, with an absolute deadline and expected byte hash.
      // This is not a retry or an additional moderation request.
      result = await reviewWithinFinalizationBudget(
        reviewCoordinator.reviewFor(screenshot, paired.sha256), finalizationStartedAtMs + finalizationBudgetMs);
    }
    reviewCoordinator.recordFinalization(screenshot.path, finalizationStartedAtMs, finalizationBudgetMs, result);
    return { screenshot, outcome: result };
  }));
  reviewCoordinator.cancelPending();
  const outcomesByPath = new Map(reviewed.map(({ screenshot, outcome }) => [screenshot.path, outcome]));
  const screenshots = input.bundle.screenshots.map((screenshot): ScreenshotArtifact => {
    const outcome = outcomesByPath.get(screenshot.path);
    if (!outcome) return screenshot;
    if (outcome.status === "safe") {
      return {
        ...screenshot,
        displayStatus: "available",
        displayWithheldReason: undefined,
        retentionStatus: "available",
        safetyFailureCode: undefined,
        withheldReason: undefined,
      };
    }
    if (outcome.status === "sensitive") {
      return {
        ...screenshot,
        displayStatus: "withheld",
        displayWithheldReason: "sensitive_visual_content",
        retentionStatus: "withheld",
        safetyFailureCode: undefined,
        withheldReason: "sensitive_visual_content",
      };
    }
    return {
      ...screenshot,
      displayStatus: "withheld",
      displayWithheldReason: "safety_check_unavailable",
      retentionStatus: "withheld",
      safetyFailureCode: outcome.failureCode,
      withheldReason: "safety_check_unavailable",
    };
  });
  await deleteUnretainedScreenshotFiles(input.artifactRoot, screenshots);
  return withScreenshotSafetyOutcomes(input.bundle, screenshots);
}

import { readFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import type {
  CanonicalEvidenceBundle,
  HomepageScreenshotState,
  ScreenshotArtifact,
  ScreenshotSafetyFailureCode,
} from "@certscore/contracts";
import { proxyFetch } from "@certscore/scan-core";

export const DEFAULT_SCREENSHOT_SAFETY_MODEL = "omni-moderation-latest";
export const DEFAULT_SCREENSHOT_SAFETY_TIMEOUT_MS = 8_000;
export const CONSENT_SCREENSHOT_SAFETY_FINALIZATION_BUDGET_MS = 2_000;
export const SCREENSHOT_SAFETY_MAX_ADDED_LATENCY_MS = 2_100;
// Reserve 25 ms inside the hard latency ceiling for fail-closed file cleanup
// and canonical bundle projection after the network review wait ends.
export const SCREENSHOT_SAFETY_FINALIZATION_BUDGET_MS = 75;

type ScreenshotMimeType = "image/jpeg" | "image/png" | "image/webp";

export type ScreenshotSafetyClassifier = (input: {
  bytes: Buffer;
  mimeType: ScreenshotMimeType;
  signal?: AbortSignal;
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

type ScheduledScreenshotSafetyReview = {
  controller: AbortController;
  promise: Promise<ScreenshotSafetyReviewOutcome>;
};

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
  return async ({ bytes, mimeType, signal }) => {
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
      if (!response.ok) {
        throw new ScreenshotSafetyReviewError(
          "moderation_http_error",
          `Screenshot safety review failed with HTTP ${response.status}.`,
        );
      }

      let body: Record<string, unknown> | null;
      try {
        body = record(await response.json());
      } catch {
        throw new ScreenshotSafetyReviewError(
          "moderation_invalid_response",
          "Screenshot safety review returned invalid JSON.",
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

  const schedule = (screenshot: Pick<ScreenshotArtifact, "captureMethod" | "path">) => {
    if (isPlaceholderScreenshot(screenshot)) return;
    const filePath = fileWithinArtifactRoot(input.artifactRoot, screenshot.path);
    const mimeType = filePath ? screenshotMimeType(filePath) : null;
    if (!filePath || !mimeType || reviews.has(filePath)) return;

    const controller = new AbortController();
    const signal = input.signal
      ? AbortSignal.any([input.signal, controller.signal])
      : controller.signal;
    const promise = classifyScreenshotFile({ classifier, filePath, mimeType, signal });
    reviews.set(filePath, { controller, promise });
  };

  return {
    cancelPending() {
      for (const review of reviews.values()) {
        review.controller.abort(new Error("Screenshot safety finalization completed."));
      }
    },
    reviewFor(screenshot: Pick<ScreenshotArtifact, "captureMethod" | "path">) {
      schedule(screenshot);
      const filePath = fileWithinArtifactRoot(input.artifactRoot, screenshot.path);
      return filePath ? reviews.get(filePath)?.promise : undefined;
    },
    schedule,
  };
}

async function classifyScreenshotFile(input: {
  classifier: ScreenshotSafetyClassifier;
  filePath: string;
  mimeType: ScreenshotMimeType;
  signal?: AbortSignal;
}): Promise<ScreenshotSafetyReviewOutcome> {
  let bytes: Buffer | null = null;
  try {
    try {
      bytes = await readFile(input.filePath);
    } catch {
      return {
        failureCode: "temporary_file_unavailable",
        status: "unavailable",
      };
    }
    const result = await input.classifier({
      bytes,
      mimeType: input.mimeType,
      signal: input.signal,
    });
    if (!result || typeof result.safeForDisplay !== "boolean") {
      return {
        failureCode: "moderation_invalid_response",
        status: "unavailable",
      };
    }
    return result.safeForDisplay ? { status: "safe" } : { status: "sensitive" };
  } catch (error) {
    return {
      failureCode: error instanceof ScreenshotSafetyReviewError
        ? error.failureCode
        : "moderation_transport_error",
      status: "unavailable",
    };
  } finally {
    bytes?.fill(0);
    bytes = null;
  }
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
    return input.bundle;
  }

  const reviewCoordinator = input.reviewCoordinator ??
    createHomepageScreenshotSafetyReviewCoordinator({
      artifactRoot: input.artifactRoot,
      classifier: input.classifier,
      signal: input.signal,
    });
  const finalizationStartedAtMs = Date.now();
  const completedFirstLayerInventory = hasCompletedFirstLayerConsentInventory(input.bundle);
  const reviews = pendingScreenshots.map((screenshot) => {
    const review = reviewCoordinator.reviewFor(screenshot);
    const finalizationBudgetMs = isRepresentativeConsentScreenshot(
      screenshot,
      completedFirstLayerInventory,
    )
      ? CONSENT_SCREENSHOT_SAFETY_FINALIZATION_BUDGET_MS
      : SCREENSHOT_SAFETY_FINALIZATION_BUDGET_MS;
    return {
      screenshot,
      outcome: review
        ? reviewWithinFinalizationBudget(
            review,
            finalizationStartedAtMs + finalizationBudgetMs,
          )
        : Promise.resolve<ScreenshotSafetyReviewOutcome>({
            failureCode: "temporary_file_unavailable",
            status: "unavailable",
          }),
    };
  });
  const reviewed = await Promise.all(reviews.map(async ({ screenshot, outcome }) => ({
    screenshot,
    outcome: await outcome,
  })));
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

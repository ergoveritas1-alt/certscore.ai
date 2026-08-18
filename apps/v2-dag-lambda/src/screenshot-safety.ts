import { readFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import type {
  CanonicalEvidenceBundle,
  HomepageScreenshotState,
} from "@certscore/contracts";

export const DEFAULT_SCREENSHOT_SAFETY_MODEL = "omni-moderation-latest";
export const DEFAULT_SCREENSHOT_SAFETY_TIMEOUT_MS = 8_000;

type ScreenshotMimeType = "image/jpeg" | "image/png" | "image/webp";

export type ScreenshotSafetyClassifier = (input: {
  bytes: Buffer;
  mimeType: ScreenshotMimeType;
  signal?: AbortSignal;
}) => Promise<{ safeForDisplay: boolean }>;

type ScreenshotSafetyEnvironment = NodeJS.ProcessEnv;

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
  fetchImpl: typeof fetch = fetch,
): ScreenshotSafetyClassifier {
  return async ({ bytes, mimeType, signal }) => {
    const apiKey = env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("Screenshot safety review is unavailable.");
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
      const response = await fetchImpl("https://api.openai.com/v1/moderations", {
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
      if (!response.ok) {
        throw new Error(`Screenshot safety review failed with HTTP ${response.status}.`);
      }

      const body = record(await response.json());
      const results = Array.isArray(body?.results) ? body.results : [];
      const first = record(results[0]);
      const categories = record(first?.categories);
      if (!categories || typeof categories.sexual !== "boolean") {
        throw new Error("Screenshot safety review returned an invalid response.");
      }
      const sexualMinors = categories["sexual/minors"];
      if (sexualMinors !== undefined && typeof sexualMinors !== "boolean") {
        throw new Error("Screenshot safety review returned an invalid response.");
      }

      return {
        safeForDisplay: categories.sexual === false && sexualMinors !== true,
      };
    } finally {
      clearTimeout(timeout);
    }
  };
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
  screenshot: CanonicalEvidenceBundle["screenshots"][number],
) {
  return screenshot.captureMethod === "primary_placeholder" ||
    screenshot.captureMethod === "fresh_context_placeholder";
}

async function deleteHomepageScreenshotFiles(
  artifactRoot: string,
  bundle: CanonicalEvidenceBundle,
) {
  const paths = new Set<string>();
  for (const screenshot of bundle.screenshots) {
    const resolved = fileWithinArtifactRoot(artifactRoot, screenshot.path);
    if (resolved) paths.add(resolved);
  }
  for (const entry of await readdir(artifactRoot, { withFileTypes: true })) {
    if (
      entry.isFile() &&
      /(?:^|-)screenshot[^/]*\.(?:png|jpe?g|webp)$/i.test(entry.name)
    ) {
      paths.add(path.join(artifactRoot, entry.name));
    }
  }
  await Promise.all([...paths].map(async (filePath) => {
    try {
      await unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }));
}

function withHomepageScreenshotState(
  bundle: CanonicalEvidenceBundle,
  homepageScreenshot: HomepageScreenshotState,
): CanonicalEvidenceBundle {
  if (homepageScreenshot.status === "available") {
    return {
      ...bundle,
      homepageScreenshot,
      screenshots: bundle.screenshots.map((screenshot) => ({
        ...screenshot,
        retentionStatus: "available" as const,
        withheldReason: undefined,
      })),
    };
  }

  const note = homepageScreenshot.reason === "sensitive_visual_content"
    ? "Page imagery was withheld by the visual safety gate."
    : "Page imagery was withheld because the visual safety check could not be completed.";
  return {
    ...bundle,
    homepageScreenshot,
    screenshots: bundle.screenshots.map((screenshot) => ({
      ...screenshot,
      retentionStatus: "withheld" as const,
      withheldReason: homepageScreenshot.reason,
    })),
    artifactRefs: bundle.artifactRefs.filter((artifact) => artifact.artifactType !== "screenshot"),
    visualCapture: bundle.visualCapture
      ? {
          ...bundle.visualCapture,
          artifactRefs: bundle.visualCapture.artifactRefs.filter(
            (artifact) => artifact.artifactType !== "screenshot",
          ),
          notes: [...new Set([...bundle.visualCapture.notes, note])],
        }
      : bundle.visualCapture,
  };
}

export async function applyHomepageScreenshotSafetyGate(input: {
  artifactRoot: string;
  bundle: CanonicalEvidenceBundle;
  classifier?: ScreenshotSafetyClassifier;
  signal?: AbortSignal;
}): Promise<CanonicalEvidenceBundle> {
  if (
    input.bundle.homepageScreenshot?.status === "withheld" ||
    (
      input.bundle.homepageScreenshot?.status === "available" &&
      input.bundle.screenshots.every((screenshot) => screenshot.retentionStatus === "available")
    )
  ) {
    return input.bundle;
  }
  const pendingScreenshots = input.bundle.screenshots.filter(
    (screenshot) => screenshot.retentionStatus !== "withheld" && !isPlaceholderScreenshot(screenshot),
  );
  if (pendingScreenshots.length === 0) {
    return input.bundle;
  }

  const classifier = input.classifier ?? createOpenAiScreenshotSafetyClassifier();
  let withheldReason: Extract<HomepageScreenshotState, { status: "withheld" }>["reason"] | null = null;
  for (const screenshot of pendingScreenshots) {
    let bytes: Buffer | null = null;
    try {
      const filePath = fileWithinArtifactRoot(input.artifactRoot, screenshot.path);
      const mimeType = filePath ? screenshotMimeType(filePath) : null;
      if (!filePath || !mimeType) {
        throw new Error("Screenshot safety review could not resolve the temporary image.");
      }
      bytes = await readFile(filePath);
      const result = await classifier({ bytes, mimeType, signal: input.signal });
      if (!result || typeof result.safeForDisplay !== "boolean") {
        throw new Error("Screenshot safety review returned an invalid classification.");
      }
      if (!result.safeForDisplay) {
        withheldReason = "sensitive_visual_content";
        break;
      }
    } catch {
      withheldReason = "safety_check_unavailable";
      break;
    } finally {
      bytes?.fill(0);
      bytes = null;
    }
  }

  if (!withheldReason) {
    return withHomepageScreenshotState(input.bundle, { status: "available" });
  }

  await deleteHomepageScreenshotFiles(input.artifactRoot, input.bundle);
  return withHomepageScreenshotState(input.bundle, {
    status: "withheld",
    reason: withheldReason,
  });
}

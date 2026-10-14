import { z } from "zod";

const consentScreenshotCropFields = {
  x: z.number().finite().nonnegative(), y: z.number().finite().nonnegative(),
  width: z.number().finite().positive(), height: z.number().finite().positive(),
  imageWidth: z.number().int().positive().max(16000), imageHeight: z.number().int().positive().max(16000),
  screenshotSha256: z.string().regex(/^[a-f0-9]{64}$/),
};
const withinImage = (crop: { x: number; y: number; width: number; height: number; imageWidth: number; imageHeight: number }) =>
  crop.x + crop.width <= crop.imageWidth && crop.y + crop.height <= crop.imageHeight;
export const consentBannerCropSchema = z.object({ version: z.literal("consent_banner_crop.v1"),
  ...consentScreenshotCropFields }).strict().refine(withinImage);
export const consentRejectCropSchema = z.object({ version: z.literal("consent_control_crop.v1"), control: z.literal("reject"),
  ...consentScreenshotCropFields }).strict().refine(withinImage);
export type ConsentBannerCrop = z.infer<typeof consentBannerCropSchema>;
export type ConsentBannerPreview = { href: string; crop: ConsentBannerCrop };
export type ConsentRejectCrop = z.infer<typeof consentRejectCropSchema>;
export type ConsentRejectPreview = { href: string; crop: ConsentRejectCrop };

export type HomepageScreenshotWithheldReason = "sensitive_visual_content" | "safety_check_unavailable";
export type HomepageScreenshotState =
  | { status: "available" }
  | { status: "withheld"; reason: HomepageScreenshotWithheldReason };

export type VisualEvidenceArtifactStatus = "available" | "capture_failed" | "upload_failed" | "disabled" | "withheld";

export type VisualEvidenceArtifact = {
  bucket: string | null;
  byteSize: number | null;
  capturedAt: string | null;
  captureStep: string;
  consentState: string;
  deviceScaleFactor: number | null;
  finalUrl: string | null;
  height: number | null;
  id: string;
  interactionState: string;
  key: string | null;
  mimeType: string | null;
  pageUrl: string | null;
  sha256: string | null;
  status: VisualEvidenceArtifactStatus;
  statusReason: string | null;
  viewport: {
    height: number | null;
    width: number | null;
  };
  width: number | null;
  bannerCrop?: ConsentBannerCrop;
  rejectCrop?: ConsentRejectCrop;
};

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getStatus(value: unknown): VisualEvidenceArtifactStatus {
  return value === "available" || value === "capture_failed" || value === "upload_failed" || value === "disabled" || value === "withheld"
    ? value
    : "disabled";
}

export function normalizeVisualEvidenceArtifact(value: unknown): VisualEvidenceArtifact | null {
  const record = getRecord(value);
  if (!record) {
    return null;
  }

  const id = getString(record.id);
  const status = getStatus(record.status);
  const key = getString(record.key);
  const viewport = getRecord(record.viewport);
  const width = getNumber(record.width) ?? getNumber(viewport?.width);
  const height = getNumber(record.height) ?? getNumber(viewport?.height);
  const bannerCrop = consentBannerCropSchema.safeParse(record.bannerCrop);
  const rejectCrop = consentRejectCropSchema.safeParse(record.rejectCrop);

  if (!id && !key) {
    return null;
  }

  return {
    bucket: getString(record.bucket),
    byteSize: getNumber(record.byteSize ?? record.byte_size),
    capturedAt: getString(record.capturedAt ?? record.captured_at),
    captureStep: getString(record.captureStep ?? record.capture_step) ?? "initial_load",
    consentState: getString(record.consentState ?? record.consent_state) ?? "pre_interaction",
    deviceScaleFactor: getNumber(record.deviceScaleFactor ?? record.device_scale_factor),
    finalUrl: getString(record.finalUrl ?? record.final_url),
    height,
    id: id ?? `initial_load:${key}`,
    interactionState: getString(record.interactionState ?? record.interaction_state) ?? "none",
    key,
    mimeType: getString(record.mimeType ?? record.mime_type),
    pageUrl: getString(record.pageUrl ?? record.page_url),
    sha256: getString(record.sha256),
    status,
    statusReason: getString(record.statusReason ?? record.status_reason),
    viewport: {
      height,
      width
    },
    width,
    ...(status === "available" && key && bannerCrop.success ? { bannerCrop: bannerCrop.data } : {}),
    ...(status === "available" && key && rejectCrop.success ? { rejectCrop: rejectCrop.data } : {})
  };
}

export function getHomepageScreenshotState(
  runtimeArtifacts: Record<string, unknown> | null | undefined,
): HomepageScreenshotState | null {
  const value = getRecord(
    runtimeArtifacts?.homepageScreenshot ?? runtimeArtifacts?.homepage_screenshot,
  );
  if (value?.status === "available") {
    return { status: "available" };
  }
  if (
    value?.status === "withheld" &&
    (value.reason === "sensitive_visual_content" || value.reason === "safety_check_unavailable")
  ) {
    return { status: "withheld", reason: value.reason };
  }

  const withheldArtifact = getVisualEvidenceArtifacts(runtimeArtifacts).find(
    (artifact) => artifact.status === "withheld",
  );
  if (
    withheldArtifact?.statusReason === "sensitive_visual_content" ||
    withheldArtifact?.statusReason === "safety_check_unavailable"
  ) {
    return { status: "withheld", reason: withheldArtifact.statusReason };
  }
  return null;
}

export function getVisualEvidenceArtifacts(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  const rows = Array.isArray(runtimeArtifacts?.visual_evidence_artifacts)
    ? runtimeArtifacts.visual_evidence_artifacts
    : Array.isArray(runtimeArtifacts?.visualEvidenceArtifacts)
      ? runtimeArtifacts.visualEvidenceArtifacts
      : [];

  return rows
    .map(normalizeVisualEvidenceArtifact)
    .filter((artifact): artifact is VisualEvidenceArtifact => artifact !== null);
}

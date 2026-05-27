export type VisualEvidenceArtifactStatus = "available" | "capture_failed" | "upload_failed" | "disabled";

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
  viewport: {
    height: number | null;
    width: number | null;
  };
  width: number | null;
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
  return value === "available" || value === "capture_failed" || value === "upload_failed" || value === "disabled"
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
    viewport: {
      height,
      width
    },
    width
  };
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


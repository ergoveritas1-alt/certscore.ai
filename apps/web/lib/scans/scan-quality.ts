export type ScanQualityLevel = "high" | "moderate" | "low";

export type ScanQualitySummary = {
  coverageRatio: number | null;
  level: ScanQualityLevel;
  label: string;
  warning: string | null;
};

export function deriveScanQualitySummary(input: {
  interruptionReason?: string | null;
  pagesRequested?: number | null;
  pagesScanned?: number | null;
  status?: string | null;
}): ScanQualitySummary {
  const requested =
    typeof input.pagesRequested === "number" && Number.isFinite(input.pagesRequested) ? input.pagesRequested : null;
  const scanned =
    typeof input.pagesScanned === "number" && Number.isFinite(input.pagesScanned) ? input.pagesScanned : null;
  const coverageRatio =
    requested && requested > 0
      ? Math.max(0, Math.min(1, (scanned ?? 0) / requested))
      : typeof scanned === "number"
        ? (scanned > 0 ? 1 : 0)
        : null;
  const normalizedStatus = typeof input.status === "string" ? input.status.trim().toLowerCase() : null;
  const interruptionReason = input.interruptionReason?.trim() || null;

  if (interruptionReason || normalizedStatus === "failed" || scanned === 0) {
    return {
      coverageRatio,
      level: "low",
      label: "Low confidence",
      warning: interruptionReason
    };
  }

  if (typeof coverageRatio === "number" && coverageRatio < 0.75) {
    return {
      coverageRatio,
      level: "moderate",
      label: "Moderate confidence",
      warning: null
    };
  }

  return {
    coverageRatio,
    level: "high",
    label: "High confidence",
    warning: null
  };
}

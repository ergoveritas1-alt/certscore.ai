export type PulseCalibrationContextInput = {
  scan: {
    provenance?: {
      lambdaAwsRegion?: string | null;
      requestedScanFromValue?: string | null;
    } | null;
  };
  snapshot?: Record<string, unknown> | null;
};

function boundedRecordSubset(record: Record<string, unknown>, keys: string[]) {
  const output: Record<string, unknown> = {};
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      output[key] = value.slice(0, 80);
    } else if (typeof value === "number" || typeof value === "boolean" || value === null) {
      output[key] = value;
    }
  }
  return output;
}

export function projectPulseCalibrationContext(input: PulseCalibrationContextInput) {
  const primaryLanguage = input.snapshot?.site_language_primary;
  const primaryLanguageRecord = primaryLanguage && typeof primaryLanguage === "object" && !Array.isArray(primaryLanguage)
    ? primaryLanguage as Record<string, unknown>
    : null;
  const primaryLanguageLocale = typeof primaryLanguage === "string" ? primaryLanguage.trim().slice(0, 16) : null;
  return {
    scannerRegion: input.scan.provenance?.lambdaAwsRegion ?? null,
    scanFrom: input.scan.provenance?.requestedScanFromValue ?? null,
    primaryLanguage: primaryLanguageRecord
      ? boundedRecordSubset(primaryLanguageRecord, ["locale", "confidence", "source"])
      : primaryLanguageLocale
        ? { locale: primaryLanguageLocale, confidence: null, source: "materialized_snapshot" }
        : null
  };
}

export function projectGdprTransparencyTopicCandidateSummary(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const row = candidate as Record<string, unknown>;
    return [{
      classifierProvenance: typeof row.classifierProvenance === "string" ? row.classifierProvenance.slice(0, 80) : null,
      confidence: typeof row.confidence === "number" && Number.isFinite(row.confidence) ? row.confidence : null,
      matchedLocale: typeof row.matchedLocale === "string" ? row.matchedLocale.slice(0, 16) : null,
      matchStrength: typeof row.matchStrength === "string" ? row.matchStrength.slice(0, 24) : null,
      productionCredit: row.productionCredit === true,
      topic: typeof row.topic === "string" ? row.topic.slice(0, 80) : null
    }];
  });
}

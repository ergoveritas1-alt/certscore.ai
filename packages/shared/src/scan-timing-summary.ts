export const SCAN_TIMING_SUMMARY_SCHEMA_VERSION = "certscore.scan_timing_summary.v1";

const MAX_LAMBDA_PHASE_TIMINGS = 16;
const MAX_SCAN_CORE_PHASES = 32;
const MAX_MODULES = 8;
const MAX_MODULE_TIMINGS = 24;
const MAX_ARTIFACT_REFS = 16;
const MAX_LABEL_LENGTH = 96;
const MAX_DETAIL_LENGTH = 240;
const MAX_URI_LENGTH = 320;

export type ScanTimingSummaryPhaseTiming = {
  completedAt?: string;
  durationMs?: number;
  label: string;
  startedAt?: string;
  status?: string;
};

export type ScanTimingSummaryCorePhase = {
  at?: string;
  durationMs?: number;
  elapsedMs?: number;
  name: string;
  status?: string;
};

export type ScanTimingSummaryModuleTiming = {
  durationMs?: number;
  moduleId?: string;
  moduleName: string;
  status?: string;
  timingBreakdown: Array<{
    detail?: string;
    durationMs?: number;
    label: string;
  }>;
  timingRowsOmitted: number;
};

export type ScanTimingSummaryArtifactRef = {
  fileName: string;
  kind: string;
  localPath?: string;
  sha256?: string;
  sizeBytes?: number;
  sourceUri?: string;
};

export type ScanTimingSummary = {
  artifactRefs: ScanTimingSummaryArtifactRef[];
  createdAt: string;
  handoffTimings: {
    artifactMirrorDurationMs?: number | null;
    artifactMirroredAt?: string | null;
    lambdaCompletedAt?: string | null;
    lambdaToWc01ResultRecordedMs?: number | null;
    sqsApproximateReceiveCount?: number | null;
    sqsConsumerReceivedAt?: string | null;
    sqsMessageId?: string | null;
    sqsQueueRegion?: string | null;
    sqsSentAt?: string | null;
    wc01ResultRecordedAt?: string | null;
  };
  lambdaPhaseTimings: ScanTimingSummaryPhaseTiming[];
  moduleTimings: ScanTimingSummaryModuleTiming[];
  scanCorePhases: ScanTimingSummaryCorePhase[];
  schemaVersion: typeof SCAN_TIMING_SUMMARY_SCHEMA_VERSION;
  truncated: boolean;
  truncation: {
    artifactRefsOmitted: number;
    lambdaPhaseTimingsOmitted: number;
    moduleTimingRowsOmitted: number;
    modulesOmitted: number;
    scanCorePhasesOmitted: number;
  };
};

export type BuildScanTimingSummaryInput = {
  artifactMirror?: unknown;
  artifactPointers?: unknown;
  canonicalEvidenceBundle?: unknown;
  createdAt?: string;
  handoffTiming?: unknown;
  lambdaCompletedAt?: string | null;
  lambdaPhaseTimings?: unknown;
  mirrorManifest?: unknown;
  scanCorePhases?: unknown;
};

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function boundedString(value: unknown, maxLength = MAX_LABEL_LENGTH) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLength) : null;
}

function boundedIsoString(value: unknown) {
  const text = boundedString(value, 48);
  if (!text) {
    return null;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? text : null;
}

function boundedNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : null;
  }
  return null;
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined && entryValue !== null)
  ) as T;
}

function boundedPhaseTiming(value: unknown): ScanTimingSummaryPhaseTiming | null {
  const record = asRecord(value);
  const label = boundedString(record.label);
  if (!label) {
    return null;
  }
  return compactObject({
    completedAt: boundedIsoString(record.completedAt) ?? undefined,
    durationMs: boundedNumber(record.durationMs) ?? undefined,
    label,
    startedAt: boundedIsoString(record.startedAt) ?? undefined,
    status: boundedString(record.status, 32) ?? undefined
  });
}

function boundedCorePhase(value: unknown): ScanTimingSummaryCorePhase | null {
  const record = asRecord(value);
  const name = boundedString(record.name);
  if (!name) {
    return null;
  }
  return compactObject({
    at: boundedIsoString(record.at) ?? undefined,
    durationMs: boundedNumber(asRecord(record.detail).durationMs ?? record.durationMs) ?? undefined,
    elapsedMs: boundedNumber(record.elapsedMs) ?? undefined,
    name,
    status: boundedString(record.status, 32) ?? undefined
  });
}

function boundedModuleTiming(value: unknown): ScanTimingSummaryModuleTiming | null {
  const record = asRecord(value);
  const moduleName = boundedString(record.moduleName) ?? boundedString(record.moduleId);
  if (!moduleName) {
    return null;
  }
  const rawTimingBreakdown = asArray(record.timingBreakdown);
  const timingBreakdown = rawTimingBreakdown
    .slice(0, MAX_MODULE_TIMINGS)
    .flatMap((entry) => {
      const timing = asRecord(entry);
      const label = boundedString(timing.label);
      if (!label) {
        return [];
      }
      return [compactObject({
        detail: boundedString(timing.detail, MAX_DETAIL_LENGTH) ?? undefined,
        durationMs: boundedNumber(timing.durationMs) ?? undefined,
        label
      })];
    });
  return compactObject({
    durationMs: boundedNumber(record.durationMs) ?? undefined,
    moduleId: boundedString(record.moduleId) ?? undefined,
    moduleName,
    status: boundedString(record.status, 32) ?? undefined,
    timingBreakdown,
    timingRowsOmitted: Math.max(0, rawTimingBreakdown.length - MAX_MODULE_TIMINGS)
  });
}

function artifactRefKind(field: string | null, fileName: string) {
  if (field) {
    return field;
  }
  if (/LocalV2DagLambdaManifest\.json$/i.test(fileName)) {
    return "manifestUri";
  }
  if (/CanonicalEvidenceBundle\.json$/i.test(fileName)) {
    return "scanArtifactUri";
  }
  if (/V2ScanCorePhases\.json$/i.test(fileName)) {
    return "scanCorePhases";
  }
  if (/LambdaArtifactMirrorManifest\.json$/i.test(fileName)) {
    return "mirrorManifest";
  }
  return "artifact";
}

function artifactRefFromMirrorEntry(value: unknown): ScanTimingSummaryArtifactRef | null {
  const record = asRecord(value);
  const fileName = boundedString(record.fileName, 160);
  if (!fileName) {
    return null;
  }
  const field = boundedString(record.field, 80);
  return compactObject({
    fileName,
    kind: artifactRefKind(field, fileName),
    localPath: boundedString(record.localPath, MAX_URI_LENGTH) ?? undefined,
    sha256: boundedString(record.sha256, 96) ?? undefined,
    sizeBytes: boundedNumber(record.sizeBytes) ?? undefined,
    sourceUri: boundedString(record.sourceUri ?? record.uri, MAX_URI_LENGTH) ?? undefined
  });
}

function artifactRefsFromPointers(value: unknown): ScanTimingSummaryArtifactRef[] {
  return Object.entries(asRecord(value)).flatMap(([key, uri]) => {
    const sourceUri = boundedString(uri, MAX_URI_LENGTH);
    if (!sourceUri) {
      return [];
    }
    const fileName = sourceUri.split("/").pop()?.slice(0, 160) || key;
    return [compactObject({
      fileName,
      kind: key.slice(0, 80),
      sourceUri
    })];
  });
}

function uniqueArtifactRefs(refs: ScanTimingSummaryArtifactRef[]) {
  const seen = new Set<string>();
  const uniqueRefs: ScanTimingSummaryArtifactRef[] = [];
  for (const ref of refs) {
    const key = `${ref.kind}|${ref.fileName}|${ref.sourceUri ?? ""}|${ref.localPath ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    uniqueRefs.push(ref);
  }
  return uniqueRefs;
}

export function buildScanTimingSummary(input: BuildScanTimingSummaryInput): ScanTimingSummary {
  const lambdaPhaseTimingEntries = asArray(input.lambdaPhaseTimings)
    .flatMap((entry) => {
      const timing = boundedPhaseTiming(entry);
      return timing ? [timing] : [];
    });
  const scanCorePhaseEntries = asArray(asRecord(input.scanCorePhases).checkpoints)
    .flatMap((entry) => {
      const phase = boundedCorePhase(entry);
      return phase ? [phase] : [];
    });
  const rawModules = asArray(asRecord(input.canonicalEvidenceBundle).modulesRun);
  const moduleEntries = rawModules
    .slice(0, MAX_MODULES)
    .flatMap((entry) => {
      const moduleTiming = boundedModuleTiming(entry);
      return moduleTiming ? [moduleTiming] : [];
    });
  const moduleTimingRowsOmitted = moduleEntries.reduce((sum, moduleTiming) => sum + moduleTiming.timingRowsOmitted, 0);
  const mirrorRecord = asRecord(input.artifactMirror);
  const mirrorManifestRecord = asRecord(input.mirrorManifest);
  const mirrorArtifacts = [
    ...asArray(mirrorRecord.mirroredArtifacts),
    ...asArray(mirrorManifestRecord.mirroredArtifacts)
  ].flatMap((entry) => {
    const ref = artifactRefFromMirrorEntry(entry);
    return ref ? [ref] : [];
  });
  const artifactRefs = uniqueArtifactRefs([
    ...artifactRefsFromPointers(input.artifactPointers),
    ...mirrorArtifacts,
    ...(boundedString(mirrorRecord.manifestPath, MAX_URI_LENGTH)
      ? [compactObject({
          fileName: "LambdaArtifactMirrorManifest.json",
          kind: "mirrorManifest",
          localPath: boundedString(mirrorRecord.manifestPath, MAX_URI_LENGTH) ?? undefined
        })]
      : [])
  ].filter((ref) => ref.fileName && ref.kind));
  const retainedArtifactRefs = artifactRefs.slice(0, MAX_ARTIFACT_REFS);
  const handoffTiming = asRecord(input.handoffTiming);
  const truncation = {
    artifactRefsOmitted: Math.max(0, artifactRefs.length - MAX_ARTIFACT_REFS),
    lambdaPhaseTimingsOmitted: Math.max(0, lambdaPhaseTimingEntries.length - MAX_LAMBDA_PHASE_TIMINGS),
    moduleTimingRowsOmitted,
    modulesOmitted: Math.max(0, rawModules.length - MAX_MODULES),
    scanCorePhasesOmitted: Math.max(0, scanCorePhaseEntries.length - MAX_SCAN_CORE_PHASES)
  };
  return {
    artifactRefs: retainedArtifactRefs,
    createdAt: boundedIsoString(input.createdAt) ?? new Date().toISOString(),
    handoffTimings: compactObject({
      artifactMirrorDurationMs: boundedNumber(handoffTiming.artifactMirrorDurationMs),
      artifactMirroredAt: boundedIsoString(handoffTiming.artifactMirroredAt),
      lambdaCompletedAt: boundedIsoString(handoffTiming.lambdaCompletedAt) ?? boundedIsoString(input.lambdaCompletedAt),
      lambdaToWc01ResultRecordedMs: boundedNumber(handoffTiming.lambdaToWc01ResultRecordedMs),
      sqsApproximateReceiveCount: boundedNumber(handoffTiming.sqsApproximateReceiveCount),
      sqsConsumerReceivedAt: boundedIsoString(handoffTiming.sqsConsumerReceivedAt),
      sqsMessageId: boundedString(handoffTiming.sqsMessageId, 160),
      sqsQueueRegion: boundedString(handoffTiming.sqsQueueRegion, 64),
      sqsSentAt: boundedIsoString(handoffTiming.sqsSentAt),
      wc01ResultRecordedAt: boundedIsoString(handoffTiming.wc01ResultRecordedAt)
    }),
    lambdaPhaseTimings: lambdaPhaseTimingEntries.slice(0, MAX_LAMBDA_PHASE_TIMINGS),
    moduleTimings: moduleEntries,
    scanCorePhases: scanCorePhaseEntries.slice(0, MAX_SCAN_CORE_PHASES),
    schemaVersion: SCAN_TIMING_SUMMARY_SCHEMA_VERSION,
    truncated: Object.values(truncation).some((count) => count > 0),
    truncation
  };
}

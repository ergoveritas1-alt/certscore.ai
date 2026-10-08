import "server-only";
import { queryOne, withNonBlockingDatabaseLock } from "@website-signal-risk-scanner/db";

import { getAnonymousScanById, getScanById } from "./get-scan-by-id";
import { getLocalV2DagReportInput, materializeLocalV2DagScanDetail } from "./local-v2-dag-report";
import {
  persistScanReportProjection,
  getPersistedScanReportProjection,
  ScanReportProjectionNotReadyError,
  StaleScanReportProjectionSourceError
} from "./scan-report-projection";
import { isCurrentScanReportProjectionReady, SCAN_REPORT_PROJECTION_VERSION } from "./scan-report-projection-contract";
import {
  getCanonicalScanReportPublicationReadiness,
  getScanReportProjectionGeneration,
  isSameScanReportProjectionGeneration,
  SCAN_REPORT_PROJECTION_NON_SOURCE_EVENT_TYPES,
  type ScanReportProjectionGeneration
} from "./scan-report-projection-generation";
import { getPublicScanStatusProjection } from "./scan-status-projection";
import { withServerTiming } from "../performance/log-server-timing";

export type CanonicalScanReportPublicationResult = {
  eventCount: number | null;
  latestEventId: string | null;
  projectionVersion: string;
  reason: string;
  scanId: string;
  status: "finalizing" | "missing" | "ready";
};

const publicationPromises = new Map<string, Promise<CanonicalScanReportPublicationResult>>();
const STALE_SOURCE_MAX_ATTEMPTS = 4;
const STALE_SOURCE_RETRY_BASE_MS = 100;

function waitForStaleSourceRetry(attempt: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, STALE_SOURCE_RETRY_BASE_MS * 2 ** attempt);
  });
}

async function loadScan(input: { organizationId: string | null; scanId: string }) {
  return input.organizationId
    ? getScanById({ organizationId: input.organizationId, scanId: input.scanId })
    : getAnonymousScanById(input.scanId);
}

async function sourceGenerationIsCurrent(scanId: string, generation: ScanReportProjectionGeneration) {
  // Use the writer to avoid reusing a projection from a lagging read replica
  // when another process has already retained genuinely changed evidence.
  const current = await queryOne<{ event_count: number; latest_event_id: string | null }>(
    `select count(*)::int as event_count,
            (array_agg(id::text order by created_at desc, id desc))[1] as latest_event_id
       from public.scan_events
      where scan_id = $1::uuid and not (event_type = any($2::text[]))`,
    [scanId, [...SCAN_REPORT_PROJECTION_NON_SOURCE_EVENT_TYPES]],
  );
  return Boolean(current && isSameScanReportProjectionGeneration(generation, {
    eventCount: current.event_count, latestEventId: current.latest_event_id,
  }));
}

async function publishCanonicalScanReportProjectionUncached(input: {
  organizationId: string | null;
  scanId: string;
  forceRebuild?: boolean;
  artifactTransfer?: unknown;
}): Promise<CanonicalScanReportPublicationResult> {
  for (let attempt = 0; attempt < STALE_SOURCE_MAX_ATTEMPTS; attempt += 1) {
    const rawRecord = await withServerTiming("scan.report_publication.load_scan", () => loadScan(input), input);
    if (!rawRecord) {
      return {
        eventCount: null,
        latestEventId: null,
        projectionVersion: SCAN_REPORT_PROJECTION_VERSION,
        reason: "scan_not_found",
        scanId: input.scanId,
        status: "missing"
      };
    }
    const generation = getScanReportProjectionGeneration(rawRecord);
    const readiness = getCanonicalScanReportPublicationReadiness({
      findingsReady: rawRecord.signalEnrichmentWorkflow.findingsReady,
      mergedSignalsReady: rawRecord.signalEnrichmentWorkflow.mergedSignalsReady,
      projectionRequired: Boolean(getLocalV2DagReportInput(rawRecord)),
      scanStatus: rawRecord.scan.status
    });
    if (!readiness.ready) {
      return {
        ...generation,
        projectionVersion: SCAN_REPORT_PROJECTION_VERSION,
        reason: readiness.reason,
        scanId: input.scanId,
        status: "finalizing"
      };
    }

    // Scan reads can themselves retain a benchmark; independent writers may
    // also finish canonical inputs while loading. Do not spend a full projection
    // pass on a generation already known to be stale. The atomic persistence
    // guard remains authoritative for changes after this check.
    if (!await withServerTiming("scan.report_publication.source_check", () => sourceGenerationIsCurrent(input.scanId, generation), input)) {
      if (attempt + 1 >= STALE_SOURCE_MAX_ATTEMPTS) throw new StaleScanReportProjectionSourceError(input.scanId);
      console.warn(JSON.stringify({ event: "scan.report_projection.stale_source_retry", attempt: attempt + 1,
        phase: "before_materialization", scanId: input.scanId }));
      await waitForStaleSourceRetry(attempt);
      continue;
    }

    const persisted = input.forceRebuild || !isCurrentScanReportProjectionReady(rawRecord.snapshot)
      ? null : getPersistedScanReportProjection(rawRecord);
    if (persisted && isSameScanReportProjectionGeneration(
      generation, getScanReportProjectionGeneration(persisted)
    )) {
      return { ...generation, projectionVersion: SCAN_REPORT_PROJECTION_VERSION,
        reason: "already_published", scanId: input.scanId, status: "ready" };
    }
    const materializedRecord = await withServerTiming("scan.report_publication.materialize", () =>
      materializeLocalV2DagScanDetail(rawRecord, { requireBundle: false, artifactTransfer: input.artifactTransfer }), input);
    try {
      if (!await withServerTiming("scan.report_publication.source_check", () => sourceGenerationIsCurrent(input.scanId, generation), input)) {
        throw new StaleScanReportProjectionSourceError(input.scanId);
      }
      await persistScanReportProjection(materializedRecord, {
        snapshot: materializedRecord.snapshot,
        runtimeArtifacts: materializedRecord.runtimeArtifacts
      });
      return {
        ...generation,
        projectionVersion: SCAN_REPORT_PROJECTION_VERSION,
        reason: "published",
        scanId: input.scanId,
        status: "ready"
      };
    } catch (error) {
      if (error instanceof ScanReportProjectionNotReadyError) {
        return {
          ...generation,
          projectionVersion: SCAN_REPORT_PROJECTION_VERSION,
          reason: "canonical_findings_not_ready",
          scanId: input.scanId,
          status: "finalizing"
        };
      }
      if (error instanceof StaleScanReportProjectionSourceError && attempt + 1 < STALE_SOURCE_MAX_ATTEMPTS) {
        console.warn(JSON.stringify({
          attempt: attempt + 1,
          event: "scan.report_projection.stale_source_retry",
          scanId: input.scanId
        }));
        await waitForStaleSourceRetry(attempt);
        continue;
      }
      throw error;
    }
  }
  throw new StaleScanReportProjectionSourceError(input.scanId);
}

export function publishCanonicalScanReportProjection(input: {
  organizationId: string | null;
  scanId: string;
  forceRebuild?: boolean;
  artifactTransfer?: unknown;
}) {
  const key = `${input.organizationId ?? "anonymous"}:${input.scanId}:${input.forceRebuild === true}`;
  const existing = publicationPromises.get(key);
  if (existing) return existing;
  const pending = withNonBlockingDatabaseLock(
    `canonical-report-publication:${input.scanId}`,
    () => publishCanonicalScanReportProjectionUncached(input),
  ).then((result): CanonicalScanReportPublicationResult => result.acquired ? result.value : {
    eventCount: null, latestEventId: null, projectionVersion: SCAN_REPORT_PROJECTION_VERSION,
    reason: "publication_in_progress", scanId: input.scanId, status: "finalizing",
  }).finally(() => {
    publicationPromises.delete(key);
  });
  publicationPromises.set(key, pending);
  return pending;
}

export async function ensureCanonicalScanReportProjectionForReuse(input: {
  organizationId: string | null;
  scanId: string;
}) {
  const current = await getPublicScanStatusProjection(input.scanId);
  if (!current) {
    return { ready: false, reason: "scan_not_found" } as const;
  }
  if (!current.reportProjectionRequired || current.reportReady) {
    return { ready: true, reason: "already_ready" } as const;
  }

  const publication = await publishCanonicalScanReportProjection(input);
  if (publication.status !== "ready") {
    return { ready: false, reason: publication.reason } as const;
  }

  const refreshed = await getPublicScanStatusProjection(input.scanId);
  return refreshed?.reportReady
    ? { ready: true, reason: "published" } as const
    : { ready: false, reason: "projection_not_ready_after_publish" } as const;
}

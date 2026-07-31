import "server-only";

import { getAnonymousScanById, getScanById } from "./get-scan-by-id";
import { getLocalV2DagReportInput, materializeLocalV2DagScanDetail } from "./local-v2-dag-report";
import {
  persistScanReportProjection,
  ScanReportProjectionNotReadyError,
  StaleScanReportProjectionSourceError
} from "./scan-report-projection";
import { SCAN_REPORT_PROJECTION_VERSION } from "./scan-report-projection-contract";
import {
  getCanonicalScanReportPublicationReadiness,
  getScanReportProjectionGeneration
} from "./scan-report-projection-generation";

export type CanonicalScanReportPublicationResult = {
  eventCount: number | null;
  latestEventId: string | null;
  projectionVersion: string;
  reason: string;
  scanId: string;
  status: "finalizing" | "missing" | "ready";
};

const publicationPromises = new Map<string, Promise<CanonicalScanReportPublicationResult>>();

async function loadScan(input: { organizationId: string | null; scanId: string }) {
  return input.organizationId
    ? getScanById({ organizationId: input.organizationId, scanId: input.scanId })
    : getAnonymousScanById(input.scanId);
}

async function publishCanonicalScanReportProjectionUncached(input: {
  organizationId: string | null;
  scanId: string;
}): Promise<CanonicalScanReportPublicationResult> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const rawRecord = await loadScan(input);
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

    const materializedRecord = await materializeLocalV2DagScanDetail(rawRecord, { requireBundle: false });
    try {
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
      if (error instanceof StaleScanReportProjectionSourceError && attempt === 0) {
        console.warn(JSON.stringify({
          attempt: attempt + 1,
          event: "scan.report_projection.stale_source_retry",
          scanId: input.scanId
        }));
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
}) {
  const key = `${input.organizationId ?? "anonymous"}:${input.scanId}`;
  const existing = publicationPromises.get(key);
  if (existing) return existing;
  const pending = publishCanonicalScanReportProjectionUncached(input).finally(() => {
    publicationPromises.delete(key);
  });
  publicationPromises.set(key, pending);
  return pending;
}

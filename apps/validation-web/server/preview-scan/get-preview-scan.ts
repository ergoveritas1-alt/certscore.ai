import { buildAgencyMappings, buildRegulatoryRiskAssessment } from "@website-signal-risk-scanner/shared";
import { buildPreviewPayloadFromSnapshot } from "./build-preview-payload";
import { buildAgencyMappingSource } from "../../lib/scans/agency-mapping-source";
import { buildRegulatoryRiskSource } from "../../lib/scans/regulatory-risk-source";
import {
  getLatestPreviewScanEvent,
  getRecentPreviewScanEvents,
  getPreviewScanRecord,
  getPreviewScanSnapshot,
  serializePreviewScan
} from "./preview-scan-repository";

export async function getPreviewScan(scanId: string) {
  const record = await getPreviewScanRecord(scanId);

  if (!record || record.scan.scan_type !== "preview") {
    return null;
  }

  const [latestEvent, recentEvents] = await Promise.all([getLatestPreviewScanEvent(scanId), getRecentPreviewScanEvents(scanId)]);
  const response = serializePreviewScan({
    ...record,
    latestEvent,
    recentEvents
  });
  const snapshot = await getPreviewScanSnapshot(scanId);

  if (!snapshot) {
    return response;
  }

  const regulatoryRisk = buildRegulatoryRiskAssessment({
    source: buildRegulatoryRiskSource({
      snapshot: snapshot as unknown as Record<string, unknown>
    })
  });

  return {
    ...response,
    regulatoryRisk,
    agencyMappings: buildAgencyMappings(buildAgencyMappingSource(snapshot as unknown as Record<string, unknown>), regulatoryRisk),
    previewPayload: buildPreviewPayloadFromSnapshot({
      hostname: response.hostname,
      normalizedUrl: response.normalizedUrl,
      snapshot
    })
  };
}

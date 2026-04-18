import { buildAgencyMappings, buildRegulatoryRiskAssessment } from "@website-signal-risk-scanner/shared";
import { buildPreviewPayloadFromSnapshot, enrichPreviewPayloadWithFallbackEvidence } from "./build-preview-payload";
import { buildAgencyMappingSource } from "../../lib/scans/agency-mapping-source";
import { buildRegulatoryRiskSource } from "../../lib/scans/regulatory-risk-source";
import {
  getAllPreviewScanEvents,
  getLatestPreviewScanEvent,
  getRecentPreviewScanEvents,
  getPreviewScanRecord,
  getPreviewRuntimeArtifacts,
  getPreviewScanSnapshot,
  serializePreviewScan
} from "./preview-scan-repository";

function deriveObservedFinalUrl(events: Array<{ event_type: string; metadata_json: Record<string, unknown> | null }>) {
  for (const event of events) {
    const metadata = event.metadata_json ?? null;
    if (!metadata) {
      continue;
    }
    if (event.event_type === "runtime.browser_pass_diagnostic") {
      const currentUrl = typeof metadata.currentUrl === "string" ? metadata.currentUrl : null;
      if (currentUrl && !/^about:blank|^chrome-error:\/\//i.test(currentUrl)) {
        return currentUrl;
      }
      const finalUrl = typeof metadata.finalUrl === "string" ? metadata.finalUrl : null;
      if (finalUrl && !/^about:blank|^chrome-error:\/\//i.test(finalUrl)) {
        return finalUrl;
      }
    }
  }

  return null;
}

export async function getPreviewScan(scanId: string) {
  const record = await getPreviewScanRecord(scanId);

  if (!record || record.scan.scan_type !== "preview") {
    return null;
  }

  const [latestEvent, recentEvents, events, runtimeArtifacts] = await Promise.all([
    getLatestPreviewScanEvent(scanId),
    getRecentPreviewScanEvents(scanId),
    getAllPreviewScanEvents(scanId),
    getPreviewRuntimeArtifacts(scanId)
  ]);
  const response = serializePreviewScan({
    ...record,
    events,
    latestEvent,
    recentEvents,
    runtimeArtifacts
  });
  const snapshot = await getPreviewScanSnapshot(scanId);

  if (!snapshot) {
    return response;
  }

  const derivedFinalUrl = deriveObservedFinalUrl(events as Array<{ event_type: string; metadata_json: Record<string, unknown> | null }>);
  const snapshotWithDerivedRuntime = {
    ...(snapshot as unknown as Record<string, unknown>),
    homepage_fetch_status: snapshot.homepageFetchStatus,
    pages_scanned: snapshot.pagesScanned,
    partial_scan: snapshot.partialScan,
    registered_domain: snapshot.registeredDomain,
    final_url: derivedFinalUrl ?? (snapshot as unknown as Record<string, unknown>).finalUrl ?? null,
    finalUrl: derivedFinalUrl ?? (snapshot as unknown as Record<string, unknown>).finalUrl ?? null
  };

  const regulatoryRisk = buildRegulatoryRiskAssessment({
    source: buildRegulatoryRiskSource({
      snapshot: snapshotWithDerivedRuntime
    })
  });

  const previewPayload = enrichPreviewPayloadWithFallbackEvidence({
    payload: buildPreviewPayloadFromSnapshot({
      hostname: response.hostname,
      normalizedUrl: response.normalizedUrl,
      snapshot: {
        ...snapshot,
        finalUrl: derivedFinalUrl ?? snapshot.finalUrl
      }
    }),
    snapshot: {
      ...snapshot,
      finalUrl: derivedFinalUrl ?? snapshot.finalUrl
    },
    events: events as Array<{ event_type: string; metadata_json: Record<string, unknown> | null }>,
    liveEarlyResults: response.liveEarlyResults
  });

  return {
    ...response,
    regulatoryRisk,
    agencyMappings: buildAgencyMappings(buildAgencyMappingSource(snapshotWithDerivedRuntime), regulatoryRisk),
    previewPayload
  };
}

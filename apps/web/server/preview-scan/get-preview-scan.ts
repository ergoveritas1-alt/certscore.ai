import {
  buildAgencyMappings,
  buildRegulatoryRiskAssessment,
  type SignalPopulationSource,
  type SignalPopulationStatus,
  type SignalValueType
} from "@website-signal-risk-scanner/shared";
import { buildPreviewPayloadFromSnapshot, enrichPreviewPayloadWithFallbackEvidence } from "./build-preview-payload";
import { buildAgencyMappingSource } from "../../lib/scans/agency-mapping-source";
import { buildRegulatoryRiskSource } from "../../lib/scans/regulatory-risk-source";
import { buildMergedSignalRecords } from "../../lib/scans/merged-signals";
import {
  choosePreferredUrlscanSource,
  fetchUrlscanResult,
  isUrlscanResultThin,
  searchUrlscanCandidates
} from "./urlscan-fallback";
import {
  getAllPreviewScanEvents,
  getLatestPreviewScanEvent,
  getRecentPreviewScanEvents,
  getPreviewScanRecord,
  getPreviewRuntimeArtifacts,
  getPreviewScanSignals,
  getPreviewScanSnapshot,
  serializePreviewScan
} from "./preview-scan-repository";

function getUrlscanResultApiUrl(events: Array<{ event_type: string; metadata_json: Record<string, unknown> | null }>) {
  for (const event of [...events].reverse()) {
    if (event.event_type !== "runtime.build_phase_diagnostic") {
      continue;
    }

    const metadata = event.metadata_json ?? null;
    if (!metadata || metadata.phase !== "urlscan_preflight_lookup") {
      continue;
    }

    const resultApiUrl = typeof metadata.resultApiUrl === "string" ? metadata.resultApiUrl.trim() : null;
    if (resultApiUrl) {
      return resultApiUrl;
    }
  }

  return null;
}

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

function buildPreviewMergedSignals(rows: Awaited<ReturnType<typeof getPreviewScanSignals>>) {
  const scannerSignals = rows.map((row) => {
    const populationStatus: SignalPopulationStatus =
      row.population_status === "present" ||
      row.population_status === "missing" ||
      row.population_status === "conflicting" ||
      row.population_status === "insufficient"
        ? row.population_status
        : "present";
    const source: SignalPopulationSource =
      row.population_source === "nano" || row.population_source === "validation" ? row.population_source : "scanner";
    const valueType: SignalValueType =
      row.value_type === "boolean" ||
      row.value_type === "number" ||
      row.value_type === "text" ||
      row.value_type === "string_array"
        ? row.value_type
        : Array.isArray(row.signal_value_json)
          ? "string_array"
          : typeof row.signal_value_json === "boolean"
            ? "boolean"
            : typeof row.signal_value_json === "number"
              ? "number"
              : "text";

    return {
      confidence: typeof row.confidence === "number" ? row.confidence : null,
      evidenceRefs: Array.isArray(row.evidence_refs) ? row.evidence_refs.filter((value): value is string => typeof value === "string") : [],
      key: row.signal_key,
      label: row.signal_label,
      observedAt: row.observed_at,
      populationStatus,
      provenance: Array.isArray(row.provenance_json)
        ? row.provenance_json.filter(
            (
              value
            ): value is { detail: string; kind: "document" | "runtime" | "signal" | "validation" } =>
              Boolean(value) &&
              typeof value === "object" &&
              typeof (value as { detail?: unknown }).detail === "string" &&
              ((value as { kind?: unknown }).kind === "document" ||
                (value as { kind?: unknown }).kind === "runtime" ||
                (value as { kind?: unknown }).kind === "signal" ||
                (value as { kind?: unknown }).kind === "validation")
          )
        : [],
      reportSignalSource: row.population_source === "scanner" ? "snapshot_signal" as const : "document_semantic_signal" as const,
      source,
      value: row.signal_value_json,
      valueType
    };
  });

  return buildMergedSignalRecords({
    scannerSignals
  });
}

export async function getPreviewScan(scanId: string) {
  const record = await getPreviewScanRecord(scanId);

  if (!record || record.scan.scan_type !== "preview") {
    return null;
  }

  const [latestEvent, recentEvents, events, runtimeArtifacts, signalRows] = await Promise.all([
    getLatestPreviewScanEvent(scanId),
    getRecentPreviewScanEvents(scanId),
    getAllPreviewScanEvents(scanId),
    getPreviewRuntimeArtifacts(scanId),
    getPreviewScanSignals(scanId)
  ]);
  const mergedSignals = buildPreviewMergedSignals(signalRows);
  const response = serializePreviewScan({
    ...record,
    events,
    latestEvent,
    recentEvents,
    runtimeArtifacts
  });
  const snapshot = await getPreviewScanSnapshot(scanId);
  const urlscanResultApiUrl = getUrlscanResultApiUrl(events as Array<{ event_type: string; metadata_json: Record<string, unknown> | null }>);
  const derivedFinalUrl = deriveObservedFinalUrl(events as Array<{ event_type: string; metadata_json: Record<string, unknown> | null }>);
  const preferredUrlscanHostname = (() => {
    const candidates = [derivedFinalUrl, response.normalizedUrl, response.hostname]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
    for (const candidate of candidates) {
      try {
        return new URL(candidate).hostname.toLowerCase();
      } catch {
        if (!candidate.includes("://")) {
          return candidate.toLowerCase();
        }
      }
    }
    return null;
  })();
  const retainedUrlscanResult = await fetchUrlscanResult(urlscanResultApiUrl);
  const promotedUrlscanCandidates = retainedUrlscanResult && !isUrlscanResultThin(retainedUrlscanResult, preferredUrlscanHostname)
    ? []
    : await searchUrlscanCandidates({
        hostname: preferredUrlscanHostname,
        limit: 5
      });
  const selectedUrlscanSource = choosePreferredUrlscanSource({
    retained: urlscanResultApiUrl
      ? {
          resultApiUrl: urlscanResultApiUrl,
          reportUrl: urlscanResultApiUrl.replace("/api/v1/result/", "/result/"),
          result: retainedUrlscanResult
        }
      : null,
    candidates: promotedUrlscanCandidates,
    preferredHostname: preferredUrlscanHostname
  });
  const urlscanResult = selectedUrlscanSource?.result ?? retainedUrlscanResult;

  if (!snapshot) {
    return response;
  }

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
      snapshot: snapshotWithDerivedRuntime,
      runtimeArtifacts: runtimeArtifacts as Record<string, unknown> | null,
      hostname: response.hostname
    })
  });

  const previewPayload = enrichPreviewPayloadWithFallbackEvidence({
    payload: buildPreviewPayloadFromSnapshot({
      hostname: response.hostname,
      mergedSignals,
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
    runtimeArtifacts: runtimeArtifacts as Record<string, unknown> | null,
    liveEarlyResults: response.liveEarlyResults,
    urlscanResult,
    urlscanSource: selectedUrlscanSource
      ? {
          reportUrl: selectedUrlscanSource.reportUrl,
          resultApiUrl: selectedUrlscanSource.resultApiUrl
        }
      : undefined
  });

  return {
    ...response,
    regulatoryRisk,
    agencyMappings: buildAgencyMappings(buildAgencyMappingSource(snapshotWithDerivedRuntime), regulatoryRisk),
    previewPayload
  };
}

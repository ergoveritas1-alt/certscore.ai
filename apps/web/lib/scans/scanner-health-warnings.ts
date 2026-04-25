import type { PreviewScannerHealthWarning } from "@website-signal-risk-scanner/shared";

export type ScannerHealthEvent = {
  eventType: string;
  metadataJson: unknown;
};

function getMetadata(event: ScannerHealthEvent) {
  return event.eventType === "runtime.build_phase_diagnostic" &&
    event.metadataJson &&
    typeof event.metadataJson === "object" &&
    !Array.isArray(event.metadataJson)
    ? (event.metadataJson as Record<string, unknown>)
    : null;
}

function getString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function hasUrlscanMissingKey(metadata: Record<string, unknown>) {
  const phase = getString(metadata, "phase");
  if (!phase?.startsWith("urlscan_")) {
    return false;
  }

  return [
    getString(metadata, "status"),
    getString(metadata, "skipReason"),
    getString(metadata, "reason"),
    getString(metadata, "error")
  ].some((value) => value === "no_api_key");
}

export function deriveScannerHealthWarnings(events: ScannerHealthEvent[]): PreviewScannerHealthWarning[] {
  const missingUrlscanKeyPhases = new Set<string>();

  for (const event of events) {
    const metadata = getMetadata(event);
    if (!metadata || !hasUrlscanMissingKey(metadata)) {
      continue;
    }

    const phase = getString(metadata, "phase");
    if (phase) {
      missingUrlscanKeyPhases.add(phase);
    }
  }

  if (missingUrlscanKeyPhases.size === 0) {
    return [];
  }

  return [
    {
      code: "urlscan_api_key_missing",
      severity: "warning",
      title: "urlscan enrichment unavailable",
      message:
        "urlscan.io enrichment was skipped because the scanner runtime did not have a urlscan API key configured. CertScore still uses retained live-browser evidence and cached public urlscan lookups when available, but urlscan-backed cookie and request enrichment may be incomplete.",
      source: "urlscan",
      phases: [...missingUrlscanKeyPhases].sort()
    }
  ];
}

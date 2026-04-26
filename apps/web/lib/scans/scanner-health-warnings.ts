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

function publicSupplementalPhaseLabel(phase: string) {
  if (phase.includes("legal_fetch")) {
    return "supplemental_disclosure_fetch";
  }

  if (phase.includes("lookup")) {
    return "supplemental_runtime_lookup";
  }

  return "supplemental_runtime_enrichment";
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
      code: "supplemental_enrichment_key_missing",
      severity: "warning",
      title: "Supplemental enrichment unavailable",
      message:
        "Supplemental public runtime enrichment was skipped because the scanner runtime did not have the enrichment API key configured. CertScore still uses retained live-browser evidence and cached public runtime lookups when available, but supplemental cookie and request enrichment may be incomplete.",
      source: "supplemental_public_runtime_enrichment",
      phases: [...new Set([...missingUrlscanKeyPhases].map(publicSupplementalPhaseLabel))].sort()
    }
  ];
}

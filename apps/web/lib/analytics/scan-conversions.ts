"use client";

import { getContentContext } from "./content-context";
import { getStoredAnalyticsConsent, hasAnalyticsConsent } from "./consent";
import { pushDataLayerEvent, pushDataLayerEventBeforeNavigation, type ScanSource, type ScanTargetType } from "./data-layer";
import { consumeScanJourney, rememberScanSubmission, SCAN_CONVERSION_STORAGE_KEY } from "./scan-conversion-state";
import { extractScanIdFromPath } from "../product-analytics/contract";
import { trackProductEvent } from "../product-analytics/client";
import { recordCampaignCompletedDomain } from "../attribution/campaign-attribution";
import { AUTHENTIC_SAMPLE_REPORT_SCAN_ID } from "../marketing/sample-report";

function journeyStorage() {
  if (typeof window === "undefined") return null;
  try {
    if ((window.certscoreAnalyticsConsent ?? getStoredAnalyticsConsent()) === "denied") {
      window.sessionStorage.removeItem(SCAN_CONVERSION_STORAGE_KEY);
      return null;
    }
    return window.sessionStorage;
  } catch { return null; }
}

export async function trackAcceptedScan(input: {
  scanId?: string | null;
  reusedExistingScan?: boolean | null;
  source: ScanSource;
  targetType: ScanTargetType;
}) {
  const storage = journeyStorage();
  if (!storage || !input.scanId || input.scanId === AUTHENTIC_SAMPLE_REPORT_SCAN_ID || input.reusedExistingScan !== false) return;
  if (!rememberScanSubmission(storage, input.scanId, input.source, Date.now(), hasAnalyticsConsent() ? getContentContext(window.location.pathname) : undefined)) return;
  try {
    trackProductEvent({ eventName: "scan_started", category: "scan", feature: `scan:${input.source}`, outcome: "started", scanId: input.scanId });
    await pushDataLayerEventBeforeNavigation({ event: "scan_started", scan_source: input.source, scan_target_type: input.targetType, scan_status: "queued" });
  } catch { /* Measurement must never prevent navigation to an accepted scan. */ }
}

export function trackCompletedScan(scanId: string | undefined, domain?: string | null) {
  const storage = journeyStorage();
  if (!storage || !scanId || scanId === AUTHENTIC_SAMPLE_REPORT_SCAN_ID) return;
  if (extractScanIdFromPath(window.location.pathname) !== scanId) return;
  const journey = consumeScanJourney(storage, scanId);
  if (!journey) return;
  const { source, context } = journey;
  // Completion is tied to a submission, not a report view or a reused result.
  const scanSource = source === "header" ? "unknown" : source;
  try {
    trackProductEvent({ eventName: "scan_completed", category: "scan", feature: `scan:${scanSource}`, outcome: "success", scanId });
    pushDataLayerEvent({ ...context, event: "scan_completed", scan_source: scanSource, scan_status: "completed" });
    if (!domain || !hasAnalyticsConsent()) return;
    const ordinal = recordCampaignCompletedDomain(domain);
    if (ordinal === 1) pushDataLayerEvent({ ...context, event: "first_scan_completed", scan_source: scanSource });
    if (ordinal === 2) pushDataLayerEvent({ ...context, event: "second_distinct_domain_scanned", scan_source: scanSource });
  } catch { /* A telemetry failure must not disrupt report rendering. */ }
}

export function trackFullSiteCompletion(scanId: string, summary: {
  state: { scanId: string; status: string };
  counts: { active: number };
}, homepageUrl?: string) {
  if (summary.state.scanId !== scanId || summary.state.status !== "completed" || summary.counts.active !== 0) return;
  let domain: string | undefined;
  try { domain = new URL(homepageUrl ?? "").hostname; } catch { /* No domain milestone without a valid target. */ }
  trackCompletedScan(scanId, domain);
}

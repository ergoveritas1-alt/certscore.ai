"use server";

import { createAdminClient } from "@website-signal-risk-scanner/db";
import { SCAN_EVENT_TYPES } from "@website-signal-risk-scanner/shared";
import {
  LEGACY_CHANGE_EVENT_TYPES,
  isMissingComplianceChangeEventsTable,
  summarizeLegacyChangeEvents,
  type LegacyScanEventRow
} from "../changes/legacy-change-events";

export type OrganizationScanListItem = {
  id: string;
  domainActiveScanExists: boolean;
  domainHostname: string | null;
  domainId: string | null;
  domainLastScannedAt: string | null;
  certscoreOverall: number | null;
  regulatoryScore: number | null;
  privacyScore: number | null;
  consentScore: number | null;
  accessibilityScore: number | null;
  totalSignals: number | null;
  cookieBannerPresent: boolean | null;
  cmpVendorName: string | null;
  consentAuditCompleted: boolean | null;
  consentRejectInteractionSucceeded: boolean | null;
  consentRejectReducedTracking: boolean | null;
  consentRejectReducedThirdPartyCookies: boolean | null;
  addedCount: number;
  removedCount: number;
  changedCount: number;
  trackerDetectedCount: number;
  scanType: string;
  status: string;
  pagesRequested: number;
  pagesScanned: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

type ScanRow = {
  completed_at: string | null;
  created_at: string;
  domain_id: string | null;
  id: string;
  pages_requested: number;
  pages_scanned: number;
  scan_type: string;
  started_at: string | null;
  status: string;
};

type DomainRow = {
  hostname: string;
  id: string;
  last_scanned_at: string | null;
  latest_scan_id: string | null;
};

type LatestDomainScanRow = {
  id: string;
  status: string;
};

type DomainCompletedScanRow = {
  completed_at: string | null;
  domain_id: string | null;
};

type SnapshotRow = {
  accessibility_score: number | null;
  certscore_overall: number | null;
  cmp_vendor_name: string | null;
  consent_score: number | null;
  cookie_banner_present: boolean | null;
  privacy_score: number | null;
  regulatory_exposure_score: number | null;
  scan_id: string;
  total_signals: number;
};

type RuntimeArtifactRow = {
  consent_audit_completed: boolean | null;
  consent_reject_interaction_succeeded: boolean | null;
  consent_reject_reduced_third_party_cookies: boolean | null;
  consent_reject_reduced_tracking: boolean | null;
  scan_id: string;
};

type ChangeSummaryRow = {
  event_type: string;
  scan_id_current: string;
};

function isMissingLastScannedAtColumn(error: { message?: string } | null) {
  return Boolean(error?.message?.includes("last_scanned_at"));
}

export async function getOrganizationScans(organizationId: string, limit?: number) {
  const supabase = createAdminClient();
  let query = supabase
    .from("scans")
    .select("id, domain_id, scan_type, status, pages_requested, pages_scanned, created_at, started_at, completed_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (typeof limit === "number") {
    query = query.limit(limit);
  }

  const { data: scans, error } = await query;

  if (error) {
    throw new Error(`Failed to load organization scans: ${error.message}`);
  }

  const scanRows = (scans ?? []) as ScanRow[];
  const scanIds = scanRows.map((scan) => scan.id);
  const domainIds = [...new Set(scanRows.flatMap((scan) => (scan.domain_id ? [scan.domain_id] : [])))];

  const domainsWithLastScannedAtPromise = domainIds.length
    ? supabase
        .from("domains")
        .select("id, hostname, last_scanned_at, latest_scan_id")
        .eq("organization_id", organizationId)
        .in("id", domainIds)
    : Promise.resolve({ data: [] as DomainRow[], error: null });
  const domainsWithoutLastScannedAtPromise = domainIds.length
    ? supabase
        .from("domains")
        .select("id, hostname, latest_scan_id")
        .eq("organization_id", organizationId)
        .in("id", domainIds)
    : Promise.resolve({ data: [] as DomainRow[], error: null });

  const [{ data: domainsWithLastScannedAt, error: domainsError }, { data: snapshots }, { data: runtimeArtifacts }] = await Promise.all([
    domainsWithLastScannedAtPromise,
    scanIds.length
      ? supabase
          .from("scan_snapshots")
          .select(
            "scan_id, total_signals, certscore_overall, regulatory_exposure_score, privacy_score, consent_score, accessibility_score, cookie_banner_present, cmp_vendor_name"
          )
          .in("scan_id", scanIds)
      : Promise.resolve({ data: [] as SnapshotRow[] }),
    scanIds.length
      ? supabase
          .from("scan_runtime_artifacts")
          .select(
            "scan_id, consent_audit_completed, consent_reject_interaction_succeeded, consent_reject_reduced_tracking, consent_reject_reduced_third_party_cookies"
          )
          .in("scan_id", scanIds)
      : Promise.resolve({ data: [] as RuntimeArtifactRow[] })
  ]);
  let domains = domainsWithLastScannedAt;
  if (domainsError && isMissingLastScannedAtColumn(domainsError)) {
    const fallback = await domainsWithoutLastScannedAtPromise;
    domains = (fallback.data ?? []).map((domain) => ({
      ...domain,
      last_scanned_at: null
    }));
  } else if (domainsError) {
    throw new Error(`Failed to load organization scans: ${domainsError.message}`);
  }
  const { data: changeSummaries, error: changeSummariesError } = scanIds.length
    ? await supabase
        .from("compliance_change_events")
        .select("scan_id_current, event_type")
        .eq("organization_id", organizationId)
        .in("scan_id_current", scanIds)
    : { data: [] as ChangeSummaryRow[], error: null };

  const domainRows = (domains ?? []) as DomainRow[];
  const latestDomainScanIds = [...new Set(domainRows.flatMap((domain) => (domain.latest_scan_id ? [domain.latest_scan_id] : [])))];
  const { data: domainCompletedScans, error: domainCompletedScansError } = domainIds.length
    ? await supabase
        .from("scans")
        .select("domain_id, completed_at")
        .eq("organization_id", organizationId)
        .eq("status", "completed")
        .not("completed_at", "is", null)
        .in("domain_id", domainIds)
        .order("completed_at", { ascending: false })
    : { data: [] as DomainCompletedScanRow[], error: null };
  const { data: latestDomainScans, error: latestDomainScansError } = latestDomainScanIds.length
    ? await supabase.from("scans").select("id, status").in("id", latestDomainScanIds)
    : { data: [] as LatestDomainScanRow[], error: null };

  if (domainCompletedScansError) {
    throw new Error(`Failed to load organization scans: ${domainCompletedScansError.message}`);
  }

  if (latestDomainScansError) {
    throw new Error(`Failed to load organization scans: ${latestDomainScansError.message}`);
  }

  const domainMap = new Map(domainRows.map((domain) => [domain.id, domain]));
  const domainLastCompletedAtMap = new Map<string, string>();
  for (const scan of (domainCompletedScans ?? []) as DomainCompletedScanRow[]) {
    if (!scan.domain_id || !scan.completed_at || domainLastCompletedAtMap.has(scan.domain_id)) {
      continue;
    }

    domainLastCompletedAtMap.set(scan.domain_id, scan.completed_at);
  }
  const latestDomainScanMap = new Map(
    ((latestDomainScans ?? []) as LatestDomainScanRow[]).map((scan) => [scan.id, scan])
  );
  const snapshotMap = new Map(((snapshots ?? []) as SnapshotRow[]).map((snapshot) => [snapshot.scan_id, snapshot]));
  const runtimeArtifactMap = new Map(
    ((runtimeArtifacts ?? []) as RuntimeArtifactRow[]).map((artifact) => [artifact.scan_id, artifact])
  );
  const changeMap = new Map<
    string,
    {
      addedCount: number;
      removedCount: number;
      changedCount: number;
      trackerDetectedCount: number;
    }
  >();

  if (changeSummariesError) {
    if (!isMissingComplianceChangeEventsTable(changeSummariesError)) {
      throw new Error(`Failed to load organization scans: ${changeSummariesError.message}`);
    }

    const { data: legacyEvents, error: legacyEventsError } = await supabase
      .from("scan_events")
      .select("id, scan_id, event_type, message, metadata_json, created_at")
      .eq("organization_id", organizationId)
      .in("scan_id", scanIds)
      .in("event_type", [...LEGACY_CHANGE_EVENT_TYPES, SCAN_EVENT_TYPES.changesComputed])
      .order("created_at", { ascending: false });

    if (legacyEventsError) {
      throw new Error(`Failed to load organization scans: ${legacyEventsError.message}`);
    }

    for (const [scanId, summary] of summarizeLegacyChangeEvents((legacyEvents ?? []) as LegacyScanEventRow[])) {
      changeMap.set(scanId, {
        addedCount: summary.addedCount,
        removedCount: summary.removedCount,
        changedCount: summary.changedCount,
        trackerDetectedCount: summary.trackerDetectedCount
      });
    }
  } else {
    for (const event of (changeSummaries ?? []) as ChangeSummaryRow[]) {
      const bucket = changeMap.get(event.scan_id_current) ?? {
        addedCount: 0,
        removedCount: 0,
        changedCount: 0,
        trackerDetectedCount: 0
      };

      if (event.event_type === "tracker_vendor_added" || event.event_type === "session_replay_tracker_added") {
        bucket.trackerDetectedCount += 1;
        bucket.addedCount += 1;
      } else if (event.event_type.endsWith("_added") || event.event_type === "field_added") {
        bucket.addedCount += 1;
      } else if (event.event_type.endsWith("_removed") || event.event_type === "field_removed") {
        bucket.removedCount += 1;
      } else {
        bucket.changedCount += 1;
      }

      changeMap.set(event.scan_id_current, bucket);
    }
  }

  return scanRows.map((scan) => {
    const domain = scan.domain_id ? domainMap.get(scan.domain_id) ?? null : null;
    const latestDomainScan =
      domain?.latest_scan_id ? latestDomainScanMap.get(domain.latest_scan_id) ?? null : null;

    return {
        id: scan.id,
        domainActiveScanExists: latestDomainScan?.status === "queued" || latestDomainScan?.status === "running",
        domainHostname: domain?.hostname ?? null,
        domainId: scan.domain_id,
        domainLastScannedAt: (domain?.last_scanned_at ?? (scan.domain_id ? domainLastCompletedAtMap.get(scan.domain_id) : null)) ?? null,
        certscoreOverall: snapshotMap.get(scan.id)?.certscore_overall ?? null,
        regulatoryScore: snapshotMap.get(scan.id)?.regulatory_exposure_score ?? null,
        privacyScore: snapshotMap.get(scan.id)?.privacy_score ?? null,
        consentScore: snapshotMap.get(scan.id)?.consent_score ?? null,
        accessibilityScore: snapshotMap.get(scan.id)?.accessibility_score ?? null,
        totalSignals: snapshotMap.get(scan.id)?.total_signals ?? null,
        cookieBannerPresent: snapshotMap.get(scan.id)?.cookie_banner_present ?? null,
        cmpVendorName: snapshotMap.get(scan.id)?.cmp_vendor_name ?? null,
        consentAuditCompleted: runtimeArtifactMap.get(scan.id)?.consent_audit_completed ?? null,
        consentRejectInteractionSucceeded:
          runtimeArtifactMap.get(scan.id)?.consent_reject_interaction_succeeded ?? null,
        consentRejectReducedTracking: runtimeArtifactMap.get(scan.id)?.consent_reject_reduced_tracking ?? null,
        consentRejectReducedThirdPartyCookies:
          runtimeArtifactMap.get(scan.id)?.consent_reject_reduced_third_party_cookies ?? null,
        addedCount: changeMap.get(scan.id)?.addedCount ?? 0,
        removedCount: changeMap.get(scan.id)?.removedCount ?? 0,
        changedCount: changeMap.get(scan.id)?.changedCount ?? 0,
        trackerDetectedCount: changeMap.get(scan.id)?.trackerDetectedCount ?? 0,
        scanType: scan.scan_type,
        status: scan.status,
        pagesRequested: scan.pages_requested,
        pagesScanned: scan.pages_scanned,
        createdAt: scan.created_at,
        startedAt: scan.started_at,
        completedAt: scan.completed_at
    } satisfies OrganizationScanListItem;
  });
}

"use server";

import { createAdminClient } from "@website-signal-risk-scanner/db";
import { SCAN_EVENT_TYPES } from "@website-signal-risk-scanner/shared";
import {
  LEGACY_CHANGE_EVENT_TYPES,
  isMissingComplianceChangeEventsTable,
  summarizeLegacyChangeEvents,
  type LegacyScanEventRow
} from "../changes/legacy-change-events";

export type DomainHistoryItem = {
  completedAt: string | null;
  createdAt: string;
  id: string;
  totalSignals: number | null;
  addedCount: number;
  removedCount: number;
  changedCount: number;
  scanType: string;
  startedAt: string | null;
  status: string;
};

type ScanRow = {
  completed_at: string | null;
  created_at: string;
  id: string;
  scan_type: string;
  started_at: string | null;
  status: string;
};

type SnapshotRow = {
  scan_id: string;
  total_signals: number;
};

type ChangeSummaryRow = {
  event_type: string;
  scan_id_current: string;
};

export async function getDomainScanHistory(input: { domainId: string; organizationId: string }): Promise<DomainHistoryItem[]> {
  const supabase = createAdminClient();
  const { data: scans, error } = await supabase
    .from("scans")
    .select("id, scan_type, status, created_at, started_at, completed_at")
    .eq("organization_id", input.organizationId)
    .eq("domain_id", input.domainId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load domain scan history: ${error.message}`);
  }

  const scanRows = (scans ?? []) as ScanRow[];
  const scanIds = scanRows.map((scan) => scan.id);

  if (scanIds.length === 0) {
    return [];
  }

  const [{ data: snapshots }, { data: changeEvents, error: changeEventsError }] = await Promise.all([
    supabase.from("scan_snapshots").select("scan_id, total_signals").in("scan_id", scanIds),
    supabase
      .from("compliance_change_events")
      .select("scan_id_current, event_type")
      .eq("organization_id", input.organizationId)
      .eq("domain_id", input.domainId)
      .in("scan_id_current", scanIds)
  ]);

  const snapshotMap = new Map(((snapshots ?? []) as SnapshotRow[]).map((row) => [row.scan_id, row]));
  const changeMap = new Map<string, { addedCount: number; removedCount: number; changedCount: number }>();

  if (changeEventsError) {
    if (!isMissingComplianceChangeEventsTable(changeEventsError)) {
      throw new Error(`Failed to load domain scan history: ${changeEventsError.message}`);
    }

    const { data: legacyEvents, error: legacyEventsError } = await supabase
      .from("scan_events")
      .select("id, scan_id, event_type, message, metadata_json, created_at")
      .eq("organization_id", input.organizationId)
      .eq("domain_id", input.domainId)
      .in("scan_id", scanIds)
      .in("event_type", [...LEGACY_CHANGE_EVENT_TYPES, SCAN_EVENT_TYPES.changesComputed])
      .order("created_at", { ascending: false });

    if (legacyEventsError) {
      throw new Error(`Failed to load domain scan history: ${legacyEventsError.message}`);
    }

    for (const [scanId, summary] of summarizeLegacyChangeEvents((legacyEvents ?? []) as LegacyScanEventRow[])) {
      changeMap.set(scanId, {
        addedCount: summary.addedCount,
        removedCount: summary.removedCount,
        changedCount: summary.changedCount
      });
    }
  } else {
    for (const event of (changeEvents ?? []) as ChangeSummaryRow[]) {
      const bucket = changeMap.get(event.scan_id_current) ?? {
        addedCount: 0,
        removedCount: 0,
        changedCount: 0
      };

      if (event.event_type.endsWith("_added") || event.event_type === "field_added") {
        bucket.addedCount += 1;
      } else if (event.event_type.endsWith("_removed") || event.event_type === "field_removed") {
        bucket.removedCount += 1;
      } else {
        bucket.changedCount += 1;
      }

      changeMap.set(event.scan_id_current, bucket);
    }
  }

  return scanRows.map((scan) => ({
    id: scan.id,
    scanType: scan.scan_type,
    status: scan.status,
    createdAt: scan.created_at,
    startedAt: scan.started_at,
    completedAt: scan.completed_at,
    totalSignals: snapshotMap.get(scan.id)?.total_signals ?? null,
    addedCount: changeMap.get(scan.id)?.addedCount ?? 0,
    removedCount: changeMap.get(scan.id)?.removedCount ?? 0,
    changedCount: changeMap.get(scan.id)?.changedCount ?? 0
  }));
}

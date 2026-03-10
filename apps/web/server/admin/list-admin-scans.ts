"use server";

import { createAdminClient } from "@website-signal-risk-scanner/db";
import { requirePlatformAdminContext } from "./platform-admin";

export type AdminScanListItem = {
  certscoreOverall: number | null;
  completedAt: string | null;
  createdAt: string;
  domainHostname: string | null;
  domainId: string | null;
  organizationName: string | null;
  pagesScanned: number;
  scanId: string;
  scanType: string;
  status: string;
  totalSignals: number | null;
};

type ScanRow = {
  completed_at: string | null;
  created_at: string;
  domain_id: string | null;
  id: string;
  organization_id: string | null;
  pages_scanned: number;
  scan_type: string;
  status: string;
};

type DomainRow = {
  hostname: string;
  id: string;
};

type OrganizationRow = {
  id: string;
  name: string;
};

type SnapshotRow = {
  certscore_overall: number;
  scan_id: string;
  total_signals: number;
};

export async function listAdminScans(limit = 50): Promise<AdminScanListItem[]> {
  await requirePlatformAdminContext();
  const supabase = createAdminClient();
  const { data: scans, error } = await supabase
    .from("scans")
    .select("id, organization_id, domain_id, scan_type, status, created_at, completed_at, pages_scanned")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load scans: ${error.message}`);
  }

  const scanRows = (scans ?? []) as ScanRow[];
  const domainIds = [...new Set(scanRows.flatMap((scan) => (scan.domain_id ? [scan.domain_id] : [])))];
  const organizationIds = [...new Set(scanRows.flatMap((scan) => (scan.organization_id ? [scan.organization_id] : [])))];
  const scanIds = scanRows.map((scan) => scan.id);

  const [{ data: domains }, { data: organizations }, { data: snapshots }] = await Promise.all([
    domainIds.length ? supabase.from("domains").select("id, hostname").in("id", domainIds) : Promise.resolve({ data: [] as DomainRow[] }),
    organizationIds.length
      ? supabase.from("organizations").select("id, name").in("id", organizationIds)
      : Promise.resolve({ data: [] as OrganizationRow[] }),
    scanIds.length
      ? supabase.from("scan_snapshots").select("scan_id, total_signals, certscore_overall").in("scan_id", scanIds)
      : Promise.resolve({ data: [] as SnapshotRow[] })
  ]);

  const domainMap = new Map(((domains ?? []) as DomainRow[]).map((domain) => [domain.id, domain]));
  const organizationMap = new Map(((organizations ?? []) as OrganizationRow[]).map((organization) => [organization.id, organization]));
  const snapshotMap = new Map(((snapshots ?? []) as SnapshotRow[]).map((snapshot) => [snapshot.scan_id, snapshot]));

  return scanRows.map((scan) => ({
    scanId: scan.id,
    domainId: scan.domain_id,
    domainHostname: scan.domain_id ? domainMap.get(scan.domain_id)?.hostname ?? null : null,
    organizationName: scan.organization_id ? organizationMap.get(scan.organization_id)?.name ?? null : null,
    scanType: scan.scan_type,
    status: scan.status,
    createdAt: scan.created_at,
    completedAt: scan.completed_at,
    pagesScanned: scan.pages_scanned,
    totalSignals: snapshotMap.get(scan.id)?.total_signals ?? null,
    certscoreOverall: snapshotMap.get(scan.id)?.certscore_overall ?? null
  }));
}

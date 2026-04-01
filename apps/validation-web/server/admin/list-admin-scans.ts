"use server";

import { createAdminClient } from "@website-signal-risk-scanner/db";
import { requirePlatformAdminContext } from "./platform-admin";

export type AdminScanListItem = {
  blockedFlag: boolean | null;
  captchaFlag: boolean | null;
  certscoreOverall: number | null;
  completedAt: string | null;
  createdAt: string;
  domainHostname: string | null;
  domainId: string | null;
  findingCount: number | null;
  homepageFetchHttpStatus: number | null;
  organizationName: string | null;
  pagesScanned: number;
  robotsFetchHttpStatus: number | null;
  scanId: string;
  scanType: string;
  status: string;
  totalSignals: number | null;
};

export type AdminScanOverviewMetrics = {
  blockedOrCaptchaCount: number;
  http403Count: number;
  http429Count: number;
  totalScans: number;
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
  blocked_flag: boolean | null;
  captcha_flag: boolean | null;
  certscore_overall: number;
  homepage_fetch_http_status: number | null;
  report_finding_count: number | null;
  robots_fetch_http_status: number | null;
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
      ? supabase
          .from("scan_snapshots")
          .select(
            "scan_id, total_signals, certscore_overall, report_finding_count, homepage_fetch_http_status, robots_fetch_http_status, blocked_flag, captcha_flag"
          )
          .in("scan_id", scanIds)
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
    findingCount: snapshotMap.get(scan.id)?.report_finding_count ?? null,
    certscoreOverall: snapshotMap.get(scan.id)?.certscore_overall ?? null,
    homepageFetchHttpStatus: snapshotMap.get(scan.id)?.homepage_fetch_http_status ?? null,
    robotsFetchHttpStatus: snapshotMap.get(scan.id)?.robots_fetch_http_status ?? null,
    blockedFlag: snapshotMap.get(scan.id)?.blocked_flag ?? null,
    captchaFlag: snapshotMap.get(scan.id)?.captcha_flag ?? null
  }));
}

export async function getAdminScanOverviewMetrics(): Promise<AdminScanOverviewMetrics> {
  await requirePlatformAdminContext();
  const supabase = createAdminClient();

  const [
    { count: totalScans, error: totalScansError },
    { count: http403Count, error: http403Error },
    { count: http429Count, error: http429Error },
    { count: blockedOrCaptchaCount, error: blockedOrCaptchaError },
  ] = await Promise.all([
    supabase.from("scans").select("id", { count: "exact", head: true }),
    supabase
      .from("scan_snapshots")
      .select("scan_id", { count: "exact", head: true })
      .or("homepage_fetch_http_status.eq.403,robots_fetch_http_status.eq.403"),
    supabase
      .from("scan_snapshots")
      .select("scan_id", { count: "exact", head: true })
      .or("homepage_fetch_http_status.eq.429,robots_fetch_http_status.eq.429"),
    supabase
      .from("scan_snapshots")
      .select("scan_id", { count: "exact", head: true })
      .or("blocked_flag.eq.true,captcha_flag.eq.true"),
  ]);

  if (totalScansError) {
    throw new Error(`Failed to load scan count: ${totalScansError.message}`);
  }
  if (http403Error) {
    throw new Error(`Failed to load 403 scan count: ${http403Error.message}`);
  }
  if (http429Error) {
    throw new Error(`Failed to load 429 scan count: ${http429Error.message}`);
  }
  if (blockedOrCaptchaError) {
    throw new Error(`Failed to load blocked scan count: ${blockedOrCaptchaError.message}`);
  }

  return {
    totalScans: totalScans ?? 0,
    http403Count: http403Count ?? 0,
    http429Count: http429Count ?? 0,
    blockedOrCaptchaCount: blockedOrCaptchaCount ?? 0,
  };
}

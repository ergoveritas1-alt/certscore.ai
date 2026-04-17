"use server";

import { createDatabaseClient } from "@website-signal-risk-scanner/db";
import type { PlanCode, ScanFrequency } from "@website-signal-risk-scanner/shared";
import { getNextScheduledAt, getPlanDefinition, isScheduledScanDue } from "@website-signal-risk-scanner/shared";

export type DomainListItem = {
  activeScanExists: boolean;
  id: string;
  industryPrimaryId: string | null;
  industryPrimaryLabel: string | null;
  isDueForScheduledScan: boolean;
  lastCompletedScanAt: string | null;
  lastScannedAt: string | null;
  hostname: string;
  normalizedUrl: string;
  nextScheduledAt: string | null;
  latestScanId: string | null;
  latestScanStatus: string | null;
  latestScanCreatedAt: string | null;
  scanFrequency: ScanFrequency;
  createdAt: string;
  updatedAt: string;
};

type DomainRow = {
  created_at: string;
  hostname: string;
  id: string;
  industry_primary_id: string | null;
  last_scanned_at: string | null;
  latest_scan_id: string | null;
  normalized_url: string;
  scan_frequency: string | null;
  updated_at: string;
};

type ScanRow = {
  completed_at?: string | null;
  created_at: string;
  domain_id?: string;
  id: string;
  status: string;
};

type OrganizationRow = {
  id: string;
  plan: PlanCode;
};

type SettingsRow = {
  default_scan_frequency: string | null;
};

type IndustryRow = {
  id: string;
  label: string;
};

function isMissingLastScannedAtColumn(error: { message?: string } | null) {
  return Boolean(error?.message?.includes("last_scanned_at"));
}

function isMissingIndustrySchema(error: { message?: string } | null) {
  return Boolean(error?.message?.includes("industry_primary_id") || error?.message?.includes("relation \"public.industries\" does not exist"));
}

function isFrequency(value: string | null): value is ScanFrequency {
  return value === "manual" || value === "hourly" || value === "daily" || value === "weekly" || value === "monthly";
}

function resolveEffectiveFrequency(input: {
  domainFrequency: string | null;
  planFrequency: ScanFrequency;
  settingsFrequency: string | null;
}): ScanFrequency {
  if (isFrequency(input.domainFrequency)) {
    return input.domainFrequency;
  }

  if (isFrequency(input.settingsFrequency)) {
    return input.settingsFrequency;
  }

  return input.planFrequency;
}

export async function getOrganizationDomains(organizationId: string): Promise<DomainListItem[]> {
  const db = createDatabaseClient();
  const domainQueryWithLastScannedAt = db
    .from("domains")
    .select("id, hostname, normalized_url, industry_primary_id, last_scanned_at, latest_scan_id, scan_frequency, created_at, updated_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  const domainQueryWithoutLastScannedAt = db
    .from("domains")
    .select("id, hostname, normalized_url, industry_primary_id, latest_scan_id, scan_frequency, created_at, updated_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  const domainQueryLegacy = db
    .from("domains")
    .select("id, hostname, normalized_url, last_scanned_at, latest_scan_id, scan_frequency, created_at, updated_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  const domainQueryLegacyWithoutLastScannedAt = db
    .from("domains")
    .select("id, hostname, normalized_url, latest_scan_id, scan_frequency, created_at, updated_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  const [{ data: domainsWithLastScannedAt, error }, { data: organization }, { data: settings }] = await Promise.all([
    domainQueryWithLastScannedAt,
    db.from("organizations").select("id, plan").eq("id", organizationId).maybeSingle(),
    db.from("organization_settings").select("default_scan_frequency").eq("organization_id", organizationId).maybeSingle()
  ]);

  let domains = domainsWithLastScannedAt;
  if (error && isMissingLastScannedAtColumn(error)) {
    const fallback = await domainQueryWithoutLastScannedAt;
    domains = (fallback.data ?? []).map((domain) => ({
      ...domain,
      last_scanned_at: null
    }));
  } else if (error && isMissingIndustrySchema(error)) {
    const fallback = await domainQueryLegacy;

    if (fallback.error && isMissingLastScannedAtColumn(fallback.error)) {
      const legacyWithoutLastScannedAt = await domainQueryLegacyWithoutLastScannedAt;

      if (legacyWithoutLastScannedAt.error) {
        throw new Error(`Failed to load organization domains: ${legacyWithoutLastScannedAt.error.message}`);
      }

      domains = (legacyWithoutLastScannedAt.data ?? []).map((domain) => ({
        ...domain,
        industry_primary_id: null,
        last_scanned_at: null
      }));
    } else if (fallback.error) {
      throw new Error(`Failed to load organization domains: ${fallback.error.message}`);
    } else {
      domains = (fallback.data ?? []).map((domain) => ({
        ...domain,
        industry_primary_id: null
      }));
    }
  } else if (error) {
    throw new Error(`Failed to load organization domains: ${error.message}`);
  }

  const domainRows = (domains ?? []) as DomainRow[];
  const latestScanIds = domainRows.flatMap((domain) => (domain.latest_scan_id ? [domain.latest_scan_id] : []));
  let scanMap = new Map<string, ScanRow>();
  let scanHistoryMap = new Map<string, ScanRow[]>();
  let industryMap = new Map<string, string>();

  if (latestScanIds.length > 0) {
    const { data: scans, error: scansError } = await db
      .from("scans")
      .select("id, status, created_at")
      .in("id", latestScanIds);

    if (scansError) {
      throw new Error(`Failed to load latest scans: ${scansError.message}`);
    }

    scanMap = new Map((scans as ScanRow[] | null | undefined)?.map((scan) => [scan.id, scan]) ?? []);
  }

  if (domainRows.length > 0) {
    const industryIds = [...new Set(domainRows.flatMap((domain) => (domain.industry_primary_id ? [domain.industry_primary_id] : [])))];
    if (industryIds.length > 0) {
      const { data: industries, error: industriesError } = await db.from("industries").select("id, label").in("id", industryIds);

      if (industriesError && !isMissingIndustrySchema(industriesError)) {
        throw new Error(`Failed to load industries: ${industriesError.message}`);
      }

      industryMap = new Map(((industries ?? []) as IndustryRow[]).map((industry) => [industry.id, industry.label]));
    }

    const { data: scans, error: scansError } = await db
      .from("scans")
      .select("id, domain_id, status, created_at, completed_at")
      .eq("organization_id", organizationId)
      .in("scan_type", ["full", "scheduled"])
      .order("created_at", { ascending: false });

    if (scansError) {
      throw new Error(`Failed to load monitoring history: ${scansError.message}`);
    }

    for (const scan of (scans ?? []) as ScanRow[]) {
      if (!scan.domain_id) continue;
      const bucket = scanHistoryMap.get(scan.domain_id) ?? [];
      bucket.push(scan);
      scanHistoryMap.set(scan.domain_id, bucket);
    }
  }

  const organizationRow = organization as OrganizationRow | null;
  const settingsRow = settings as SettingsRow | null;
  const planFrequency: ScanFrequency = organizationRow ? getPlanDefinition(organizationRow.plan).scanFrequency : "manual";

  return domainRows.map((domain) => {
    const latestScan = domain.latest_scan_id ? scanMap.get(domain.latest_scan_id) ?? null : null;
    const history = scanHistoryMap.get(domain.id) ?? [];
    const lastCompletedScanAt = history.find((scan) => scan.status === "completed" && scan.completed_at)?.completed_at ?? null;
    const activeScanExists = history.some((scan) => scan.status === "queued" || scan.status === "running");
    const effectiveFrequency = resolveEffectiveFrequency({
      domainFrequency: domain.scan_frequency,
      settingsFrequency: settingsRow?.default_scan_frequency ?? null,
      planFrequency
    });

    return {
      activeScanExists,
      id: domain.id,
      industryPrimaryId: domain.industry_primary_id,
      industryPrimaryLabel: domain.industry_primary_id ? industryMap.get(domain.industry_primary_id) ?? null : null,
      isDueForScheduledScan:
        !activeScanExists &&
        isScheduledScanDue({
          frequency: effectiveFrequency,
          lastCompletedAt: lastCompletedScanAt
        }),
      lastCompletedScanAt,
      lastScannedAt: domain.last_scanned_at,
      hostname: domain.hostname,
      normalizedUrl: domain.normalized_url,
      nextScheduledAt: getNextScheduledAt({
        frequency: effectiveFrequency,
        lastCompletedAt: lastCompletedScanAt
      }),
      latestScanId: domain.latest_scan_id,
      latestScanStatus: latestScan?.status ?? null,
      latestScanCreatedAt: latestScan?.created_at ?? null,
      scanFrequency: effectiveFrequency,
      createdAt: domain.created_at,
      updatedAt: domain.updated_at
    };
  });
}

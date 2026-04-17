"use server";

import { createDatabaseClient } from "@website-signal-risk-scanner/db";
import type { PlanCode } from "@website-signal-risk-scanner/shared";

export type DomainIndustryRow = {
  id: string;
  label: string;
  slug: string;
};

export type DomainMonitoringRow = {
  id: string;
  scan_frequency: string | null;
};

export type DomainDetailRow = {
  created_at: string;
  hostname: string;
  id: string;
  industry_primary_id: string | null;
  last_scanned_at: string | null;
  latest_scan_id: string | null;
  max_pages_override: number | null;
  normalized_url: string;
  scan_frequency: string | null;
  updated_at: string;
};

export type OrganizationDomainRow = {
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

export type OrganizationDomainScanRow = {
  completed_at?: string | null;
  created_at: string;
  domain_id?: string;
  id: string;
  status: string;
};

export type DomainScanHistoryRow = {
  completed_at: string | null;
  created_at: string;
  id: string;
  pages_requested: number;
  pages_scanned: number;
  scan_type: string;
  started_at: string | null;
  status: string;
};

export type DomainOrganizationRow = {
  id: string;
  plan: PlanCode;
};

export type DomainSettingsRow = {
  default_scan_frequency: string | null;
};

function isMissingLastScannedAtColumn(error: { message?: string } | null) {
  return Boolean(error?.message?.includes("last_scanned_at"));
}

export function isMissingIndustrySchema(error: { message?: string } | null) {
  return Boolean(error?.message?.includes("industry_primary_id") || error?.message?.includes("relation \"public.industries\" does not exist"));
}

export async function listIndustryRows(): Promise<DomainIndustryRow[]> {
  const db = createDatabaseClient();
  const { data, error } = await db.from("industries").select("id, slug, label").order("sort_order", { ascending: true }).order("label", { ascending: true });

  if (error) {
    if (Boolean(error.message?.includes("relation \"public.industries\" does not exist"))) {
      return [];
    }

    throw new Error(`Failed to load industries: ${error.message}`);
  }

  return (data ?? []) as DomainIndustryRow[];
}

export async function updateDomainScanFrequency(input: {
  domainId: string;
  organizationId: string;
  scanFrequency: string;
}): Promise<void> {
  const db = createDatabaseClient();
  const { error } = await db
    .from("domains")
    .update({
      scan_frequency: input.scanFrequency
    })
    .eq("organization_id", input.organizationId)
    .eq("id", input.domainId);

  if (error) {
    throw new Error(`Could not update domain scan frequency: ${error.message}`);
  }
}

export async function loadDomainMonitoringDomain(input: {
  domainId: string;
  organizationId: string;
}): Promise<DomainMonitoringRow | null> {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("domains")
    .select("id, scan_frequency")
    .eq("organization_id", input.organizationId)
    .eq("id", input.domainId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load domain monitoring state: ${error.message}`);
  }

  return (data as DomainMonitoringRow | null) ?? null;
}

export async function loadDomainDetail(input: {
  domainId: string;
  organizationId: string;
}): Promise<DomainDetailRow | null> {
  const db = createDatabaseClient();
  const domainQueryWithLastScannedAt = db
    .from("domains")
    .select("id, hostname, normalized_url, industry_primary_id, last_scanned_at, latest_scan_id, scan_frequency, max_pages_override, created_at, updated_at")
    .eq("id", input.domainId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();
  const domainQueryWithoutLastScannedAt = db
    .from("domains")
    .select("id, hostname, normalized_url, industry_primary_id, latest_scan_id, scan_frequency, max_pages_override, created_at, updated_at")
    .eq("id", input.domainId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();
  const domainQueryLegacy = db
    .from("domains")
    .select("id, hostname, normalized_url, last_scanned_at, latest_scan_id, scan_frequency, max_pages_override, created_at, updated_at")
    .eq("id", input.domainId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();
  const domainQueryLegacyWithoutLastScannedAt = db
    .from("domains")
    .select("id, hostname, normalized_url, latest_scan_id, scan_frequency, max_pages_override, created_at, updated_at")
    .eq("id", input.domainId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();

  const { data: domainWithLastScannedAt, error } = await domainQueryWithLastScannedAt;

  if (error && isMissingLastScannedAtColumn(error)) {
    const fallback = await domainQueryWithoutLastScannedAt;

    if (fallback.error) {
      throw new Error(`Failed to load domain: ${fallback.error.message}`);
    }

    return fallback.data
      ? ({
          ...fallback.data,
          last_scanned_at: null
        } as DomainDetailRow)
      : null;
  }

  if (error && isMissingIndustrySchema(error)) {
    const fallback = await domainQueryLegacy;

    if (fallback.error && isMissingLastScannedAtColumn(fallback.error)) {
      const legacyWithoutLastScannedAt = await domainQueryLegacyWithoutLastScannedAt;

      if (legacyWithoutLastScannedAt.error) {
        throw new Error(`Failed to load domain: ${legacyWithoutLastScannedAt.error.message}`);
      }

      return legacyWithoutLastScannedAt.data
        ? ({
            ...legacyWithoutLastScannedAt.data,
            industry_primary_id: null,
            last_scanned_at: null
          } as DomainDetailRow)
        : null;
    }

    if (fallback.error) {
      throw new Error(`Failed to load domain: ${fallback.error.message}`);
    }

    return fallback.data
      ? ({
          ...fallback.data,
          industry_primary_id: null
        } as DomainDetailRow)
      : null;
  }

  if (error) {
    throw new Error(`Failed to load domain: ${error.message}`);
  }

  return (domainWithLastScannedAt as DomainDetailRow | null) ?? null;
}

export async function loadOrganizationDomains(organizationId: string): Promise<OrganizationDomainRow[]> {
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

  const { data: domainsWithLastScannedAt, error } = await domainQueryWithLastScannedAt;

  if (error && isMissingLastScannedAtColumn(error)) {
    const fallback = await domainQueryWithoutLastScannedAt;

    if (fallback.error) {
      throw new Error(`Failed to load organization domains: ${fallback.error.message}`);
    }

    return (fallback.data ?? []).map((domain) => ({
      ...domain,
      last_scanned_at: null
    })) as OrganizationDomainRow[];
  }

  if (error && isMissingIndustrySchema(error)) {
    const fallback = await domainQueryLegacy;

    if (fallback.error && isMissingLastScannedAtColumn(fallback.error)) {
      const legacyWithoutLastScannedAt = await domainQueryLegacyWithoutLastScannedAt;

      if (legacyWithoutLastScannedAt.error) {
        throw new Error(`Failed to load organization domains: ${legacyWithoutLastScannedAt.error.message}`);
      }

      return (legacyWithoutLastScannedAt.data ?? []).map((domain) => ({
        ...domain,
        industry_primary_id: null,
        last_scanned_at: null
      })) as OrganizationDomainRow[];
    }

    if (fallback.error) {
      throw new Error(`Failed to load organization domains: ${fallback.error.message}`);
    }

    return (fallback.data ?? []).map((domain) => ({
      ...domain,
      industry_primary_id: null
    })) as OrganizationDomainRow[];
  }

  if (error) {
    throw new Error(`Failed to load organization domains: ${error.message}`);
  }

  return (domainsWithLastScannedAt ?? []) as OrganizationDomainRow[];
}

export async function loadDomainOrganizationAndSettings(organizationId: string): Promise<{
  organization: DomainOrganizationRow | null;
  settings: DomainSettingsRow | null;
}> {
  const db = createDatabaseClient();
  const [{ data: organization, error: organizationError }, { data: settings, error: settingsError }] = await Promise.all([
    db.from("organizations").select("id, plan").eq("id", organizationId).maybeSingle(),
    db.from("organization_settings").select("default_scan_frequency").eq("organization_id", organizationId).maybeSingle()
  ]);

  if (organizationError) {
    throw new Error(`Failed to load organization domains organization: ${organizationError.message}`);
  }

  if (settingsError) {
    throw new Error(`Failed to load organization domains settings: ${settingsError.message}`);
  }

  return {
    organization: (organization as DomainOrganizationRow | null) ?? null,
    settings: (settings as DomainSettingsRow | null) ?? null
  };
}

export async function loadLatestOrganizationDomainScans(scanIds: string[]): Promise<Map<string, OrganizationDomainScanRow>> {
  if (!scanIds.length) {
    return new Map();
  }

  const db = createDatabaseClient();
  const { data, error } = await db.from("scans").select("id, status, created_at").in("id", scanIds);

  if (error) {
    throw new Error(`Failed to load latest scans: ${error.message}`);
  }

  return new Map(((data ?? []) as OrganizationDomainScanRow[]).map((scan) => [scan.id, scan]));
}

export async function loadIndustryLabels(industryIds: string[]): Promise<Map<string, string>> {
  if (!industryIds.length) {
    return new Map();
  }

  const db = createDatabaseClient();
  const { data, error } = await db.from("industries").select("id, label").in("id", industryIds);

  if (error && !isMissingIndustrySchema(error)) {
    throw new Error(`Failed to load industries: ${error.message}`);
  }

  return new Map(((data ?? []) as Array<Pick<DomainIndustryRow, "id" | "label">>).map((industry) => [industry.id, industry.label]));
}

export async function loadIndustryById(industryId: string): Promise<DomainIndustryRow | null> {
  const db = createDatabaseClient();
  const { data, error } = await db.from("industries").select("id, slug, label").eq("id", industryId).maybeSingle();

  if (error) {
    if (isMissingIndustrySchema(error)) {
      return null;
    }

    throw new Error(`Failed to load domain industry: ${error.message}`);
  }

  return (data as DomainIndustryRow | null) ?? null;
}

export async function loadDomainScanHistory(input: {
  domainId: string;
  organizationId: string;
}): Promise<DomainScanHistoryRow[]> {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("scans")
    .select("id, scan_type, status, pages_requested, pages_scanned, created_at, started_at, completed_at")
    .eq("organization_id", input.organizationId)
    .eq("domain_id", input.domainId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load domain scans: ${error.message}`);
  }

  return (data ?? []) as DomainScanHistoryRow[];
}

export async function loadOrganizationMonitoringHistory(
  organizationId: string
): Promise<Map<string, OrganizationDomainScanRow[]>> {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("scans")
    .select("id, domain_id, status, created_at, completed_at")
    .eq("organization_id", organizationId)
    .in("scan_type", ["full", "scheduled"])
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load monitoring history: ${error.message}`);
  }

  const history = new Map<string, OrganizationDomainScanRow[]>();
  for (const scan of (data ?? []) as OrganizationDomainScanRow[]) {
    if (!scan.domain_id) {
      continue;
    }

    const bucket = history.get(scan.domain_id) ?? [];
    bucket.push(scan);
    history.set(scan.domain_id, bucket);
  }

  return history;
}

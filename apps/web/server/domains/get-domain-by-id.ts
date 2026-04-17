"use server";

import { createAdminClient } from "@website-signal-risk-scanner/db";

export type DomainDetailRecord = {
  id: string;
  hostname: string;
  industryPrimaryId: string | null;
  industryPrimaryLabel: string | null;
  industryPrimarySlug: string | null;
  lastScannedAt: string | null;
  normalizedUrl: string;
  latestScanId: string | null;
  scanFrequency: string | null;
  maxPagesOverride: number | null;
  createdAt: string;
  updatedAt: string;
};

export type DomainScanHistoryItem = {
  id: string;
  scanType: string;
  status: string;
  pagesRequested: number;
  pagesScanned: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

type DomainRow = {
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

type IndustryRow = {
  id: string;
  label: string;
  slug: string;
};

type ScanRow = {
  completed_at: string | null;
  created_at: string;
  id: string;
  pages_requested: number;
  pages_scanned: number;
  scan_type: string;
  started_at: string | null;
  status: string;
};

function isMissingLastScannedAtColumn(error: { message?: string } | null) {
  return Boolean(error?.message?.includes("last_scanned_at"));
}

function isMissingIndustrySchema(error: { message?: string } | null) {
  return Boolean(error?.message?.includes("industry_primary_id") || error?.message?.includes("relation \"public.industries\" does not exist"));
}

export async function getDomainById(input: { domainId: string; organizationId: string }) {
  const db = createAdminClient();
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

  let domain = domainWithLastScannedAt;
  if (error && isMissingLastScannedAtColumn(error)) {
    const fallback = await domainQueryWithoutLastScannedAt;
    domain = fallback.data
      ? {
          ...fallback.data,
          last_scanned_at: null
        }
      : null;
  } else if (error && isMissingIndustrySchema(error)) {
    const fallback = await domainQueryLegacy;

    if (fallback.error && isMissingLastScannedAtColumn(fallback.error)) {
      const legacyWithoutLastScannedAt = await domainQueryLegacyWithoutLastScannedAt;
      if (legacyWithoutLastScannedAt.error) {
        throw new Error(`Failed to load domain: ${legacyWithoutLastScannedAt.error.message}`);
      }

      domain = legacyWithoutLastScannedAt.data
        ? {
            ...legacyWithoutLastScannedAt.data,
            industry_primary_id: null,
            last_scanned_at: null
          }
        : null;
    } else if (fallback.error) {
      throw new Error(`Failed to load domain: ${fallback.error.message}`);
    } else {
      domain = fallback.data
        ? {
            ...fallback.data,
            industry_primary_id: null
          }
        : null;
    }
  } else if (error) {
    throw new Error(`Failed to load domain: ${error.message}`);
  }

  if (!domain) {
    return null;
  }

  const { data: scans, error: scansError } = await db
    .from("scans")
    .select("id, scan_type, status, pages_requested, pages_scanned, created_at, started_at, completed_at")
    .eq("organization_id", input.organizationId)
    .eq("domain_id", input.domainId)
    .order("created_at", { ascending: false });

  if (scansError) {
    throw new Error(`Failed to load domain scans: ${scansError.message}`);
  }

  const domainRow = domain as DomainRow;
  let industry: IndustryRow | null = null;

  if (domainRow.industry_primary_id) {
    const { data: industryRow, error: industryError } = await db
      .from("industries")
      .select("id, slug, label")
      .eq("id", domainRow.industry_primary_id)
      .maybeSingle();

    if (industryError) {
      if (!isMissingIndustrySchema(industryError)) {
        throw new Error(`Failed to load domain industry: ${industryError.message}`);
      }
    } else {
      industry = (industryRow as IndustryRow | null) ?? null;
    }
  }

  return {
    domain: {
      id: domainRow.id,
      hostname: domainRow.hostname,
      industryPrimaryId: domainRow.industry_primary_id,
      industryPrimaryLabel: industry?.label ?? null,
      industryPrimarySlug: industry?.slug ?? null,
      lastScannedAt: domainRow.last_scanned_at,
      normalizedUrl: domainRow.normalized_url,
      latestScanId: domainRow.latest_scan_id,
      scanFrequency: domainRow.scan_frequency,
      maxPagesOverride: domainRow.max_pages_override,
      createdAt: domainRow.created_at,
      updatedAt: domainRow.updated_at
    } satisfies DomainDetailRecord,
    scans: ((scans ?? []) as ScanRow[]).map(
      (scan) =>
        ({
          id: scan.id,
          scanType: scan.scan_type,
          status: scan.status,
          pagesRequested: scan.pages_requested,
          pagesScanned: scan.pages_scanned,
          createdAt: scan.created_at,
          startedAt: scan.started_at,
          completedAt: scan.completed_at
        }) satisfies DomainScanHistoryItem
    )
  };
}

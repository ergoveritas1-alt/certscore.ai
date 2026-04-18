"use server";

import { query, queryOne } from "@website-signal-risk-scanner/db";
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

export type DomainIdRow = {
  id: string;
};

type ErrorLike = { message?: string } | null;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown database error.";
}

function toErrorLike(error: unknown): ErrorLike {
  return { message: getErrorMessage(error) };
}

function isMissingLastScannedAtColumn(error: ErrorLike) {
  return Boolean(error?.message?.includes("last_scanned_at"));
}

export function isMissingIndustrySchema(error: ErrorLike) {
  return Boolean(error?.message?.includes("industry_primary_id") || error?.message?.includes("relation \"public.industries\" does not exist"));
}

export async function listIndustryRows(): Promise<DomainIndustryRow[]> {
  try {
    const result = await query<DomainIndustryRow>(
      `select id, slug, label
         from industries
        order by sort_order asc, label asc`,
      [],
      { readOnly: true }
    );

    return result.rows;
  } catch (error) {
    if (Boolean(getErrorMessage(error).includes("relation \"public.industries\" does not exist"))) {
      return [];
    }

    throw new Error(`Failed to load industries: ${getErrorMessage(error)}`);
  }
}

export async function updateDomainScanFrequency(input: {
  domainId: string;
  organizationId: string;
  scanFrequency: string;
}): Promise<void> {
  try {
    await query(
      `update domains
          set scan_frequency = $1
        where organization_id = $2
          and id = $3`,
      [input.scanFrequency, input.organizationId, input.domainId]
    );
  } catch (error) {
    throw new Error(`Could not update domain scan frequency: ${getErrorMessage(error)}`);
  }
}

export async function loadDomainMonitoringDomain(input: {
  domainId: string;
  organizationId: string;
}): Promise<DomainMonitoringRow | null> {
  try {
    return await queryOne<DomainMonitoringRow>(
      `select id, scan_frequency
         from domains
        where organization_id = $1
          and id = $2`,
      [input.organizationId, input.domainId],
      { readOnly: true }
    );
  } catch (error) {
    throw new Error(`Failed to load domain monitoring state: ${getErrorMessage(error)}`);
  }
}

export async function loadDomainDetail(input: {
  domainId: string;
  organizationId: string;
}): Promise<DomainDetailRow | null> {
  try {
    return await queryOne<DomainDetailRow>(
      `select id, hostname, normalized_url, industry_primary_id, last_scanned_at, latest_scan_id,
              scan_frequency, max_pages_override, created_at, updated_at
         from domains
        where id = $1
          and organization_id = $2`,
      [input.domainId, input.organizationId],
      { readOnly: true }
    );
  } catch (error) {
    const primaryError = toErrorLike(error);

    if (isMissingLastScannedAtColumn(primaryError)) {
      try {
        const fallback = await queryOne<Omit<DomainDetailRow, "last_scanned_at">>(
          `select id, hostname, normalized_url, industry_primary_id, latest_scan_id,
                  scan_frequency, max_pages_override, created_at, updated_at
             from domains
            where id = $1
              and organization_id = $2`,
          [input.domainId, input.organizationId],
          { readOnly: true }
        );

        return fallback ? ({ ...fallback, last_scanned_at: null } as DomainDetailRow) : null;
      } catch (fallbackError) {
        throw new Error(`Failed to load domain: ${getErrorMessage(fallbackError)}`);
      }
    }

    if (isMissingIndustrySchema(primaryError)) {
      try {
        const fallback = await queryOne<Omit<DomainDetailRow, "industry_primary_id">>(
          `select id, hostname, normalized_url, last_scanned_at, latest_scan_id,
                  scan_frequency, max_pages_override, created_at, updated_at
             from domains
            where id = $1
              and organization_id = $2`,
          [input.domainId, input.organizationId],
          { readOnly: true }
        );

        return fallback ? ({ ...fallback, industry_primary_id: null } as DomainDetailRow) : null;
      } catch (fallbackError) {
        if (isMissingLastScannedAtColumn(toErrorLike(fallbackError))) {
          try {
            const legacyWithoutLastScannedAt = await queryOne<Omit<DomainDetailRow, "industry_primary_id" | "last_scanned_at">>(
              `select id, hostname, normalized_url, latest_scan_id,
                      scan_frequency, max_pages_override, created_at, updated_at
                 from domains
                where id = $1
                  and organization_id = $2`,
              [input.domainId, input.organizationId],
              { readOnly: true }
            );

            return legacyWithoutLastScannedAt
              ? ({
                  ...legacyWithoutLastScannedAt,
                  industry_primary_id: null,
                  last_scanned_at: null
                } as DomainDetailRow)
              : null;
          } catch (legacyError) {
            throw new Error(`Failed to load domain: ${getErrorMessage(legacyError)}`);
          }
        }

        throw new Error(`Failed to load domain: ${getErrorMessage(fallbackError)}`);
      }
    }

    throw new Error(`Failed to load domain: ${primaryError?.message ?? "Unknown database error."}`);
  }
}

export async function loadOrganizationDomains(organizationId: string): Promise<OrganizationDomainRow[]> {
  try {
    const result = await query<OrganizationDomainRow>(
      `select id, hostname, normalized_url, industry_primary_id, last_scanned_at, latest_scan_id,
              scan_frequency, created_at, updated_at
         from domains
        where organization_id = $1
        order by created_at desc`,
      [organizationId],
      { readOnly: true }
    );

    return result.rows;
  } catch (error) {
    const primaryError = toErrorLike(error);

    if (isMissingLastScannedAtColumn(primaryError)) {
      try {
        const fallback = await query<Omit<OrganizationDomainRow, "last_scanned_at">>(
          `select id, hostname, normalized_url, industry_primary_id, latest_scan_id,
                  scan_frequency, created_at, updated_at
             from domains
            where organization_id = $1
            order by created_at desc`,
          [organizationId],
          { readOnly: true }
        );

        return fallback.rows.map((domain) => ({ ...domain, last_scanned_at: null })) as OrganizationDomainRow[];
      } catch (fallbackError) {
        throw new Error(`Failed to load organization domains: ${getErrorMessage(fallbackError)}`);
      }
    }

    if (isMissingIndustrySchema(primaryError)) {
      try {
        const fallback = await query<Omit<OrganizationDomainRow, "industry_primary_id">>(
          `select id, hostname, normalized_url, last_scanned_at, latest_scan_id,
                  scan_frequency, created_at, updated_at
             from domains
            where organization_id = $1
            order by created_at desc`,
          [organizationId],
          { readOnly: true }
        );

        return fallback.rows.map((domain) => ({ ...domain, industry_primary_id: null })) as OrganizationDomainRow[];
      } catch (fallbackError) {
        if (isMissingLastScannedAtColumn(toErrorLike(fallbackError))) {
          try {
            const legacyWithoutLastScannedAt = await query<Omit<OrganizationDomainRow, "industry_primary_id" | "last_scanned_at">>(
              `select id, hostname, normalized_url, latest_scan_id,
                      scan_frequency, created_at, updated_at
                 from domains
                where organization_id = $1
                order by created_at desc`,
              [organizationId],
              { readOnly: true }
            );

            return legacyWithoutLastScannedAt.rows.map((domain) => ({
              ...domain,
              industry_primary_id: null,
              last_scanned_at: null
            })) as OrganizationDomainRow[];
          } catch (legacyError) {
            throw new Error(`Failed to load organization domains: ${getErrorMessage(legacyError)}`);
          }
        }

        throw new Error(`Failed to load organization domains: ${getErrorMessage(fallbackError)}`);
      }
    }

    throw new Error(`Failed to load organization domains: ${primaryError?.message ?? "Unknown database error."}`);
  }
}

export async function loadDomainOrganizationAndSettings(organizationId: string): Promise<{
  organization: DomainOrganizationRow | null;
  settings: DomainSettingsRow | null;
}> {
  try {
    const [organization, settings] = await Promise.all([
      queryOne<DomainOrganizationRow>(
        `select id, plan
           from organizations
          where id = $1`,
        [organizationId],
        { readOnly: true }
      ),
      queryOne<DomainSettingsRow>(
        `select default_scan_frequency
           from organization_settings
          where organization_id = $1`,
        [organizationId],
        { readOnly: true }
      )
    ]);

    return { organization, settings };
  } catch (error) {
    throw new Error(`Failed to load organization domains state: ${getErrorMessage(error)}`);
  }
}

export async function countOrganizationDomains(organizationId: string): Promise<number> {
  try {
    const result = await query<{ count: string }>(
      `select count(*)::text as count
         from domains
        where organization_id = $1`,
      [organizationId],
      { readOnly: true }
    );

    return Number(result.rows[0]?.count ?? "0");
  } catch (error) {
    throw new Error(`Could not verify domain limits: ${getErrorMessage(error)}`);
  }
}

export async function findOrganizationDomainByNormalizedUrl(input: {
  normalizedUrl: string;
  organizationId: string;
}): Promise<DomainIdRow | null> {
  try {
    return await queryOne<DomainIdRow>(
      `select id
         from domains
        where organization_id = $1
          and normalized_url = $2`,
      [input.organizationId, input.normalizedUrl],
      { readOnly: true }
    );
  } catch (error) {
    throw new Error(`Failed to load existing domain: ${getErrorMessage(error)}`);
  }
}

export async function createOrganizationDomain(input: {
  hostname: string;
  normalizedUrl: string;
  organizationId: string;
  scanFrequency: string;
}): Promise<DomainIdRow> {
  try {
    const row = await queryOne<DomainIdRow>(
      `insert into domains (organization_id, hostname, normalized_url, scan_frequency)
       values ($1, $2, $3, $4)
       returning id`,
      [input.organizationId, input.hostname, input.normalizedUrl, input.scanFrequency]
    );

    if (!row) {
      throw new Error("Unknown error");
    }

    return row;
  } catch (error) {
    throw new Error(`Could not add domain: ${getErrorMessage(error)}`);
  }
}

export async function updateDomainIndustry(input: {
  domainId: string;
  industryPrimaryId: string | null;
  organizationId: string;
}): Promise<void> {
  try {
    await query(
      `update domains
          set industry_primary_id = $1
        where organization_id = $2
          and id = $3`,
      [input.industryPrimaryId, input.organizationId, input.domainId]
    );
  } catch (error) {
    throw new Error(`Could not update domain industry: ${getErrorMessage(error)}`);
  }
}

export async function loadLatestOrganizationDomainScans(scanIds: string[]): Promise<Map<string, OrganizationDomainScanRow>> {
  if (!scanIds.length) {
    return new Map();
  }

  try {
    const result = await query<OrganizationDomainScanRow>(
      `select id, status, created_at
         from scans
        where id = any($1::uuid[])`,
      [scanIds],
      { readOnly: true }
    );

    return new Map(result.rows.map((scan) => [scan.id, scan]));
  } catch (error) {
    throw new Error(`Failed to load latest scans: ${getErrorMessage(error)}`);
  }
}

export async function loadIndustryLabels(industryIds: string[]): Promise<Map<string, string>> {
  if (!industryIds.length) {
    return new Map();
  }

  try {
    const result = await query<Pick<DomainIndustryRow, "id" | "label">>(
      `select id, label
         from industries
        where id = any($1::uuid[])`,
      [industryIds],
      { readOnly: true }
    );

    return new Map(result.rows.map((industry) => [industry.id, industry.label]));
  } catch (error) {
    if (!isMissingIndustrySchema(toErrorLike(error))) {
      throw new Error(`Failed to load industries: ${getErrorMessage(error)}`);
    }

    return new Map();
  }
}

export async function loadIndustryById(industryId: string): Promise<DomainIndustryRow | null> {
  try {
    return await queryOne<DomainIndustryRow>(
      `select id, slug, label
         from industries
        where id = $1`,
      [industryId],
      { readOnly: true }
    );
  } catch (error) {
    if (isMissingIndustrySchema(toErrorLike(error))) {
      return null;
    }

    throw new Error(`Failed to load domain industry: ${getErrorMessage(error)}`);
  }
}

export async function loadDomainScanHistory(input: {
  domainId: string;
  organizationId: string;
}): Promise<DomainScanHistoryRow[]> {
  try {
    const result = await query<DomainScanHistoryRow>(
      `select id, scan_type, status, pages_requested, pages_scanned, created_at, started_at, completed_at
         from scans
        where organization_id = $1
          and domain_id = $2
        order by created_at desc`,
      [input.organizationId, input.domainId],
      { readOnly: true }
    );

    return result.rows;
  } catch (error) {
    throw new Error(`Failed to load domain scans: ${getErrorMessage(error)}`);
  }
}

export async function loadOrganizationMonitoringHistory(
  organizationId: string
): Promise<Map<string, OrganizationDomainScanRow[]>> {
  let scans: OrganizationDomainScanRow[];
  try {
    const result = await query<OrganizationDomainScanRow>(
      `select id, domain_id, status, created_at, completed_at
         from scans
        where organization_id = $1
          and scan_type = any($2::text[])
        order by created_at desc`,
      [organizationId, ["full", "scheduled"]],
      { readOnly: true }
    );

    scans = result.rows;
  } catch (error) {
    throw new Error(`Failed to load monitoring history: ${getErrorMessage(error)}`);
  }

  const history = new Map<string, OrganizationDomainScanRow[]>();
  for (const scan of scans) {
    if (!scan.domain_id) {
      continue;
    }

    const bucket = history.get(scan.domain_id) ?? [];
    bucket.push(scan);
    history.set(scan.domain_id, bucket);
  }

  return history;
}

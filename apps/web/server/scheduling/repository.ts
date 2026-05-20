"use server";

import { query, queryOne } from "@website-signal-risk-scanner/db";
import type { PlanCode } from "@website-signal-risk-scanner/shared";

export type SchedulingOrganizationRow = {
  id: string;
  plan: PlanCode;
};

export type SchedulingScanRow = {
  completed_at: string | null;
  created_at: string;
  id: string;
  status: string;
};

export type ScheduledMonitoringDomainRow = {
  active_scan_exists: boolean;
  domain_id: string;
  hostname: string;
  last_completed_at: string | null;
  max_pages_override: number | null;
  normalized_url: string;
  organization_id: string;
  organization_plan: PlanCode;
  scan_frequency: string | null;
  settings_frequency: string | null;
};

export type ScheduledMonitoringCandidateFilter = {
  canaryDomain?: string | null;
  excludedOrganizationSlugs?: string[];
  limit?: number;
};

export async function loadSchedulingOrganization(organizationId: string): Promise<SchedulingOrganizationRow | null> {
  try {
    return await queryOne<SchedulingOrganizationRow>(
      `select id, plan
         from organizations
        where id = $1`,
      [organizationId],
      { readOnly: true }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    throw new Error(`Failed to load organization monitoring state: ${message}`);
  }
}

export async function loadDomainMonitoringScans(input: {
  domainId: string;
  organizationId: string;
}): Promise<SchedulingScanRow[]> {
  try {
    const result = await query<SchedulingScanRow>(
      `select id, status, completed_at, created_at
         from scans
        where organization_id = $1
          and domain_id = $2
          and scan_type = any($3::text[])
        order by created_at desc`,
      [input.organizationId, input.domainId, ["full", "scheduled"]],
      { readOnly: true }
    );

    return result.rows;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    throw new Error(`Failed to load monitoring scans: ${message}`);
  }
}

export async function loadScheduledMonitoringDomainCandidates(input: ScheduledMonitoringCandidateFilter = {}): Promise<ScheduledMonitoringDomainRow[]> {
  const normalizedLimit = Math.min(Math.max(input.limit ?? 50, 1), 250);
  const canaryDomain = normalizeOptionalHostname(input.canaryDomain);
  const excludedOrganizationSlugs = uniqueStrings(input.excludedOrganizationSlugs ?? []);

  try {
    const result = await query<ScheduledMonitoringDomainRow>(
      `
        with scan_state as (
          select
            scans.domain_id,
            bool_or(scans.status in ('queued', 'running')) as active_scan_exists,
            max(scans.completed_at) filter (where scans.status = 'completed') as last_completed_at
          from scans
          where scans.scan_type in ('full', 'scheduled')
          group by scans.domain_id
        )
        select
          domains.id as domain_id,
          domains.hostname,
          domains.normalized_url,
          domains.organization_id,
          domains.scan_frequency,
          domains.max_pages_override,
          organizations.plan as organization_plan,
          organization_settings.default_scan_frequency as settings_frequency,
          coalesce(scan_state.active_scan_exists, false) as active_scan_exists,
          scan_state.last_completed_at
        from domains
        join organizations on organizations.id = domains.organization_id
        left join organization_settings on organization_settings.organization_id = domains.organization_id
        left join scan_state on scan_state.domain_id = domains.id
        where coalesce(domains.scan_frequency, organization_settings.default_scan_frequency, '') <> 'manual'
          and (
            cardinality($2::text[]) = 0
            or organizations.slug <> all($2::text[])
          )
          and (
            $3::text is null
            or lower(domains.hostname) = $3
            or lower(regexp_replace(domains.hostname, '^www\\.', '')) = $3
            or lower(regexp_replace(domains.normalized_url, '^https?://', '')) = $3
            or lower(regexp_replace(domains.normalized_url, '^https?://www\\.', '')) = $3
          )
        order by coalesce(scan_state.last_completed_at, domains.created_at) asc
        limit $1
      `,
      [normalizedLimit, excludedOrganizationSlugs, canaryDomain],
      { readOnly: true }
    );

    return result.rows;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    throw new Error(`Failed to load scheduled monitoring candidates: ${message}`);
  }
}

function normalizeOptionalHostname(value: string | null | undefined) {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");

  return normalized && normalized.length > 0 ? normalized : null;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export async function insertScheduleWorkflowEvent(input: {
  domainId?: string | null;
  eventType: string;
  message: string;
  metadataJson?: Record<string, unknown> | null;
  organizationId?: string | null;
  scanId?: string | null;
}) {
  try {
    await query(
      `insert into scan_events (scan_id, domain_id, organization_id, event_type, message, metadata_json)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        input.scanId ?? null,
        input.domainId ?? null,
        input.organizationId ?? null,
        input.eventType,
        input.message,
        input.metadataJson ?? null
      ]
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    throw new Error(`Failed to log scheduled monitoring event: ${message}`);
  }
}

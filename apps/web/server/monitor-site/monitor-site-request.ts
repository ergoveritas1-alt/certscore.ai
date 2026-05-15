import "server-only";

import { query } from "@website-signal-risk-scanner/db";
import type { MonitorSiteRequestInput } from "./monitor-site-request-validation";

let ensureMonitorSiteRequestsTablePromise: Promise<void> | null = null;

function isUndefinedTableError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "42P01";
}

async function ensureMonitorSiteRequestsTable() {
  if (!ensureMonitorSiteRequestsTablePromise) {
    ensureMonitorSiteRequestsTablePromise = query(`
      create table if not exists public.monitor_site_requests (
        id uuid primary key default gen_random_uuid(),
        website text not null,
        normalized_hostname text not null,
        work_email text not null,
        full_name text,
        company text,
        monitoring_goal text not null default 'changes',
        notes text,
        source_page_url text,
        source_report_url text,
        status text not null default 'pending',
        metadata_json jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default timezone('utc', now()),
        updated_at timestamptz not null default timezone('utc', now()),
        constraint monitor_site_requests_work_email_normalized check (work_email = lower(btrim(work_email))),
        constraint monitor_site_requests_status_check check (status in ('pending', 'contacted', 'converted', 'closed')),
        constraint monitor_site_requests_monitoring_goal_check check (
          monitoring_goal in ('changes', 'pre-consent-tracking', 'cookies', 'accessibility', 'vendor-review')
        )
      );

      create index if not exists monitor_site_requests_status_created_at_idx
        on public.monitor_site_requests (status, created_at desc);

      create index if not exists monitor_site_requests_normalized_hostname_idx
        on public.monitor_site_requests (normalized_hostname);

      create index if not exists monitor_site_requests_work_email_idx
        on public.monitor_site_requests (work_email);

      drop trigger if exists set_monitor_site_requests_updated_at on public.monitor_site_requests;
      create trigger set_monitor_site_requests_updated_at
      before update on public.monitor_site_requests
      for each row execute function public.set_updated_at();
    `)
      .then(() => undefined)
      .catch((error) => {
        ensureMonitorSiteRequestsTablePromise = null;
        throw error;
      });
  }

  await ensureMonitorSiteRequestsTablePromise;
}

async function insertMonitorSiteRequest(input: MonitorSiteRequestInput & { normalizedHostname: string }) {
  const result = await query<{ id: string }>(
    `
      insert into monitor_site_requests (
        website,
        normalized_hostname,
        work_email,
        full_name,
        company,
        monitoring_goal,
        notes,
        source_page_url,
        source_report_url,
        metadata_json
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, '{}'::jsonb)
      returning id
    `,
    [
      input.website,
      input.normalizedHostname,
      input.workEmail,
      input.fullName,
      input.company,
      input.monitoringGoal,
      input.notes,
      input.sourcePageUrl,
      input.sourceReportUrl
    ]
  );

  return result.rows[0]?.id ?? null;
}

export async function createMonitorSiteRequest(input: MonitorSiteRequestInput & { normalizedHostname: string }) {
  try {
    return await insertMonitorSiteRequest(input);
  } catch (error) {
    if (!isUndefinedTableError(error)) {
      throw error;
    }
  }

  await ensureMonitorSiteRequestsTable();
  return insertMonitorSiteRequest(input);
}

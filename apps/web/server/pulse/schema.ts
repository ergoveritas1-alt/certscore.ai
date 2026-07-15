import { query } from "@website-signal-risk-scanner/db";

let ensurePulseTablesPromise: Promise<void> | null = null;

async function createPulseTables() {
  await query(`
    create table if not exists public.pulse_requests (
      id uuid primary key default gen_random_uuid(),
      public_id text not null unique,
      request_type text not null default 'pulse_scan',
      request_channel text not null default 'pulse_api',
      requested_url text,
      normalized_url text,
      normalized_domain text,
      requested_at timestamptz not null default now(),
      requested_by jsonb not null default '{}'::jsonb,
      request_context jsonb not null default '{}'::jsonb,
      status text not null default 'queued',
      phase text,
      job_id text not null unique,
      scan_id uuid references public.scans (id) on delete set null,
      result_pulse_url text,
      result_report_url text,
      api_version text not null,
      schema_version text not null,
      pulse_version text not null,
      projection_version text not null,
      resolution_mode text,
      throttle_reason text,
      retry_after_seconds integer,
      response_summary jsonb,
      error_code text,
      error_message text,
      completed_at timestamptz,
      elapsed_seconds integer,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists pulse_requests_normalized_domain_requested_at_idx
      on public.pulse_requests (normalized_domain, requested_at desc);

    create index if not exists pulse_requests_scan_id_idx
      on public.pulse_requests (scan_id);

    create index if not exists pulse_requests_status_requested_at_idx
      on public.pulse_requests (status, requested_at desc);

    create index if not exists pulse_requests_api_key_requested_at_idx
      on public.pulse_requests ((requested_by->>'apiKeyId'), requested_at desc)
      where requested_by ? 'apiKeyId';

    create index if not exists pulse_requests_account_requested_at_idx
      on public.pulse_requests ((requested_by->>'accountId'), requested_at desc)
      where requested_by ? 'accountId';

    create table if not exists public.anonymous_scan_daily_quotas (
      requester_key text not null,
      window_date date not null,
      scan_count integer not null default 0 check (scan_count >= 0),
      last_scan_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (requester_key, window_date)
    );

    create index if not exists anonymous_scan_daily_quotas_updated_at_idx
      on public.anonymous_scan_daily_quotas (updated_at desc);

    create table if not exists public.pulse_domain_throttles (
      normalized_domain text primary key,
      last_scan_created_at timestamptz not null default now(),
      expires_at timestamptz not null,
      last_pulse_request_id text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists public.pulse_feedback (
      id uuid primary key default gen_random_uuid(),
      pulse_request_id text not null references public.pulse_requests (public_id) on delete cascade,
      scan_id uuid references public.scans (id) on delete set null,
      normalized_domain text,
      rating text not null check (rating in ('useful', 'not_useful', 'unclear', 'incorrect', 'too_limited')),
      reason text check (reason is null or reason in ('incorrect_finding', 'missing_evidence', 'too_much_detail', 'not_enough_detail', 'coverage_limited', 'hard_to_understand', 'api_issue', 'other')),
      comment text,
      email text,
      ip_hash text,
      user_agent text,
      created_at timestamptz not null default now()
    );

    create index if not exists pulse_feedback_pulse_request_id_created_at_idx
      on public.pulse_feedback (pulse_request_id, created_at desc);

    create index if not exists pulse_feedback_normalized_domain_created_at_idx
      on public.pulse_feedback (normalized_domain, created_at desc);

    create table if not exists public.pulse_artifact_downloads (
      id uuid primary key default gen_random_uuid(),
      pulse_request_id text references public.pulse_requests (public_id) on delete set null,
      scan_id uuid references public.scans (id) on delete set null,
      normalized_domain text,
      artifact_type text not null check (artifact_type in ('summary_json', 'evidence_json')),
      route_name text,
      request_source text,
      request_channel text,
      response_status integer not null,
      byte_size integer,
      resolution_mode text,
      cached_or_reused boolean,
      requester_context jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );

    create index if not exists pulse_artifact_downloads_created_at_idx
      on public.pulse_artifact_downloads (created_at desc);

    create index if not exists pulse_artifact_downloads_artifact_created_at_idx
      on public.pulse_artifact_downloads (artifact_type, created_at desc);

    create index if not exists pulse_artifact_downloads_scan_created_at_idx
      on public.pulse_artifact_downloads (scan_id, created_at desc);

    create index if not exists pulse_artifact_downloads_domain_created_at_idx
      on public.pulse_artifact_downloads (normalized_domain, created_at desc);
  `);
}

export async function ensurePulseTables() {
  ensurePulseTablesPromise ??= createPulseTables().catch((error) => {
    ensurePulseTablesPromise = null;
    throw error;
  });

  return ensurePulseTablesPromise;
}

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
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists pulse_artifact_downloads_created_at_idx
  on public.pulse_artifact_downloads (created_at desc);

create index if not exists pulse_artifact_downloads_artifact_created_at_idx
  on public.pulse_artifact_downloads (artifact_type, created_at desc);

create index if not exists pulse_artifact_downloads_scan_created_at_idx
  on public.pulse_artifact_downloads (scan_id, created_at desc);

create index if not exists pulse_artifact_downloads_domain_created_at_idx
  on public.pulse_artifact_downloads (normalized_domain, created_at desc);

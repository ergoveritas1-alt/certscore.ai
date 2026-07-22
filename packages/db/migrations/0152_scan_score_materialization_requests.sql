create table if not exists public.scan_score_materialization_requests (
  scan_id uuid primary key references public.scans(id) on delete cascade,
  token_sha256 text not null,
  status text not null default 'pending',
  attempt_count integer not null default 1,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  last_error text,
  constraint scan_score_materialization_requests_token_check check (
    token_sha256 ~ '^[a-f0-9]{64}$'
  ),
  constraint scan_score_materialization_requests_status_check check (
    status in ('pending', 'completed')
  ),
  constraint scan_score_materialization_requests_attempt_count_check check (
    attempt_count between 1 and 1000000
  ),
  constraint scan_score_materialization_requests_error_length_check check (
    last_error is null or length(last_error) <= 500
  )
);

comment on table public.scan_score_materialization_requests is
  'Single-use, hashed handoff requests from the Lambda result producer to the canonical WC01 score materializer. No raw evidence or customer data is stored.';


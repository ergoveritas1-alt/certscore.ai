alter table public.scan_score_materialization_requests
  drop constraint if exists scan_score_materialization_requests_status_check;

alter table public.scan_score_materialization_requests
  add constraint scan_score_materialization_requests_status_check check (
    status in ('pending', 'completed', 'terminal_failure')
  );

comment on column public.scan_score_materialization_requests.status is
  'Materialization handoff state. terminal_failure records a non-retryable projection or contract failure without marking the report ready.';

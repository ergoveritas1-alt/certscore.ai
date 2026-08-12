alter table public.scan_score_materialization_requests
  add column if not exists first_failed_at timestamptz,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists next_attempt_at timestamptz;

update public.scan_score_materialization_requests
   set last_attempt_at = coalesce(last_attempt_at, requested_at),
       next_attempt_at = coalesce(next_attempt_at, requested_at),
       first_failed_at = case
         when status = 'pending' and last_error is not null
           then coalesce(first_failed_at, requested_at)
         else first_failed_at
       end
 where last_attempt_at is null
    or next_attempt_at is null
    or (status = 'pending' and last_error is not null and first_failed_at is null);

alter table public.scan_score_materialization_requests
  alter column next_attempt_at set default now(),
  alter column next_attempt_at set not null;

create index if not exists scan_score_materialization_requests_due_idx
  on public.scan_score_materialization_requests (next_attempt_at, requested_at, scan_id)
  where status = 'pending';

comment on column public.scan_score_materialization_requests.first_failed_at is
  'First retryable failure in the current materialization lifecycle; used to enforce a bounded retry window.';

comment on column public.scan_score_materialization_requests.last_attempt_at is
  'Most recent time the worker claimed this materialization request for an endpoint attempt.';

comment on column public.scan_score_materialization_requests.next_attempt_at is
  'Persisted not-before time for retry recovery. Immediate result handling does not poll this field.';

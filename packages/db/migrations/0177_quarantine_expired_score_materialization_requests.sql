update public.scan_score_materialization_requests
   set status = 'terminal_failure',
       first_failed_at = coalesce(first_failed_at, requested_at),
       completed_at = coalesce(completed_at, now()),
       next_attempt_at = now(),
       last_error = left(
         'retry_exhausted:' || coalesce(last_error, 'legacy_pending_request_expired'),
         500
       )
 where status = 'pending'
   and (
     attempt_count >= 24
     or coalesce(first_failed_at, requested_at) <= now() - interval '24 hours'
   );

comment on column public.scan_score_materialization_requests.completed_at is
  'Completion or terminal-quarantine time for the bounded score-materialization handoff lifecycle.';

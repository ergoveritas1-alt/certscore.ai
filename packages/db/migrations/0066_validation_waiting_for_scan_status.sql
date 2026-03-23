alter table public.validation_runs
  drop constraint if exists validation_runs_status_check;

alter table public.validation_runs
  add constraint validation_runs_status_check
  check (
    status in (
      'waiting_for_scan',
      'queued',
      'collecting',
      'ranking',
      'validating',
      'completed',
      'failed'
    )
  );

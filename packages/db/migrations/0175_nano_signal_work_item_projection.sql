create table if not exists public.nano_signal_work_items (
  scan_id uuid primary key references public.scans(id) on delete cascade,
  requested_at timestamptz not null,
  not_before timestamptz not null default now(),
  poll_count integer not null default 0 check (poll_count >= 0),
  recovered boolean not null default false,
  recovery_mode text,
  updated_at timestamptz not null default now()
);

create index if not exists nano_signal_work_items_due_idx
  on public.nano_signal_work_items (not_before asc, requested_at asc);

create or replace function public.sync_nano_signal_work_item_from_event()
returns trigger
language plpgsql
as $$
declare
  payload jsonb;
  recheck_at timestamptz;
  recheck_after_epoch_ms numeric;
  next_poll_count integer;
  next_recovery_mode text;
begin
  if new.event_type in (
    'signals.nano_doc_enrichment_completed',
    'signals.nano_doc_enrichment_failed'
  ) then
    delete from public.nano_signal_work_items
     where scan_id = new.scan_id
       and requested_at <= new.created_at;
    return new;
  end if;

  if new.event_type = 'signals.nano_doc_enrichment_requested' then
    if new.metadata_json->>'recheckAfterEpochMs' ~ '^\d+(\.\d+)?$' then
      recheck_after_epoch_ms := (new.metadata_json->>'recheckAfterEpochMs')::numeric;
      recheck_at := to_timestamp(recheck_after_epoch_ms / 1000.0);
    else
      recheck_at := now();
    end if;

    if new.metadata_json->>'pollCount' ~ '^\d+$' then
      next_poll_count := (new.metadata_json->>'pollCount')::integer;
    else
      next_poll_count := 0;
    end if;

    if new.metadata_json->>'recoveryMode' in (
      'browser_extension_signal_reprojection',
      'completed_scan_backfill',
      'missing_unified_projection'
    ) then
      next_recovery_mode := new.metadata_json->>'recoveryMode';
    else
      next_recovery_mode := null;
    end if;

    insert into public.nano_signal_work_items (
      scan_id,
      requested_at,
      not_before,
      poll_count,
      recovered,
      recovery_mode,
      updated_at
    ) values (
      new.scan_id,
      new.created_at,
      recheck_at,
      next_poll_count,
      false,
      next_recovery_mode,
      now()
    )
    on conflict (scan_id) do update
      set requested_at = excluded.requested_at,
          not_before = excluded.not_before,
          poll_count = excluded.poll_count,
          recovered = excluded.recovered,
          recovery_mode = excluded.recovery_mode,
          updated_at = now()
      where nano_signal_work_items.requested_at <= excluded.requested_at;
  else
    insert into public.nano_signal_work_items (
      scan_id,
      requested_at,
      not_before,
      poll_count,
      recovered,
      recovery_mode,
      updated_at
    ) values (
      new.scan_id,
      new.created_at,
      now(),
      0,
      true,
      'browser_extension_signal_reprojection',
      now()
    )
    on conflict (scan_id) do update
      set requested_at = excluded.requested_at,
          not_before = now(),
          poll_count = 0,
          recovered = true,
          recovery_mode = excluded.recovery_mode,
          updated_at = now()
      where nano_signal_work_items.requested_at <= excluded.requested_at;
  end if;

  payload := jsonb_build_object('scanId', new.scan_id);
  if recheck_after_epoch_ms is not null then
    payload := payload || jsonb_build_object('notBeforeEpochMs', recheck_after_epoch_ms);
  end if;
  perform pg_notify('certscore_nano_signal_work', payload::text);
  return new;
end;
$$;

drop trigger if exists scan_events_notify_nano_signal_worker on public.scan_events;
create trigger scan_events_notify_nano_signal_worker
after insert on public.scan_events
for each row
when (
  new.scan_id is not null
  and new.event_type in (
    'signals.nano_doc_enrichment_requested',
    'signals.nano_doc_enrichment_completed',
    'signals.nano_doc_enrichment_failed',
    'browser_extension.observed_signals_ingested'
  )
)
execute function public.sync_nano_signal_work_item_from_event();

create or replace function public.notify_nano_signal_worker_from_scan_status()
returns trigger
language plpgsql
as $$
begin
  update public.nano_signal_work_items
     set not_before = now(), updated_at = now()
   where scan_id = new.id;

  if not found and not exists (
    select 1
      from public.scan_events terminal
     where terminal.scan_id = new.id
       and terminal.event_type in (
         'signals.nano_doc_enrichment_completed',
         'signals.nano_doc_enrichment_failed'
       )
  ) then
    insert into public.nano_signal_work_items (
      scan_id,
      requested_at,
      not_before,
      poll_count,
      recovered,
      recovery_mode,
      updated_at
    ) values (
      new.id,
      coalesce(new.completed_at, now()),
      now(),
      0,
      true,
      'completed_scan_backfill',
      now()
    )
    on conflict (scan_id) do update
      set not_before = now(), updated_at = now();
  end if;

  perform pg_notify(
    'certscore_nano_signal_work',
    jsonb_build_object('scanId', new.id)::text
  );
  return new;
end;
$$;

create or replace function public.notify_nano_signal_worker_from_policy_enrichment()
returns trigger
language plpgsql
as $$
begin
  update public.nano_signal_work_items
     set not_before = now(), updated_at = now()
   where scan_id = new.scan_id;

  if found then
    perform pg_notify(
      'certscore_nano_signal_work',
      jsonb_build_object('scanId', new.scan_id)::text
    );
  end if;
  return new;
end;
$$;

with latest_requested as (
  select distinct on (events.scan_id)
    events.scan_id,
    events.created_at as requested_at,
    events.metadata_json,
    scans.status
  from public.scan_events events
  join public.scans scans on scans.id = events.scan_id
  where events.event_type = 'signals.nano_doc_enrichment_requested'
    and events.scan_id is not null
    and events.created_at >= now() - interval '24 hours'
  order by events.scan_id, events.created_at desc
)
insert into public.nano_signal_work_items (
  scan_id,
  requested_at,
  not_before,
  poll_count,
  recovered,
  recovery_mode,
  updated_at
)
select
  latest.scan_id,
  latest.requested_at,
  case
    when latest.status in ('completed', 'failed') then now()
    when exists (
      select 1 from public.policy_enrichment policy
       where policy.scan_id = latest.scan_id
    ) then now()
    when latest.metadata_json->>'recheckAfterEpochMs' ~ '^\d+(\.\d+)?$'
      then to_timestamp((latest.metadata_json->>'recheckAfterEpochMs')::numeric / 1000.0)
    else now()
  end,
  case
    when latest.metadata_json->>'pollCount' ~ '^\d+$'
      then (latest.metadata_json->>'pollCount')::integer
    else 0
  end,
  false,
  case
    when latest.metadata_json->>'recoveryMode' in (
      'browser_extension_signal_reprojection',
      'completed_scan_backfill',
      'missing_unified_projection'
    ) then latest.metadata_json->>'recoveryMode'
    else null
  end,
  now()
from latest_requested latest
where not exists (
  select 1
    from public.scan_events terminal
   where terminal.scan_id = latest.scan_id
     and terminal.event_type in (
       'signals.nano_doc_enrichment_completed',
       'signals.nano_doc_enrichment_failed'
     )
     and terminal.created_at >= latest.requested_at
)
on conflict (scan_id) do nothing;

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
       and requested_at <= new.created_at
       and (
         recovery_mode is distinct from 'policy_projection_reprojection'
         or new.metadata_json->>'recoveryMode' = 'policy_projection_reprojection'
       );
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
      'missing_unified_projection',
      'policy_projection_reprojection'
    ) then
      next_recovery_mode := new.metadata_json->>'recoveryMode';
    else
      next_recovery_mode := null;
    end if;
  elsif new.event_type = 'v2_policy_evidence.received' then
    recheck_at := now();
    next_poll_count := 0;
    next_recovery_mode := 'policy_projection_reprojection';
  else
    recheck_at := now();
    next_poll_count := 0;
    next_recovery_mode := 'browser_extension_signal_reprojection';
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
    new.event_type <> 'signals.nano_doc_enrichment_requested',
    next_recovery_mode,
    now()
  )
  on conflict (scan_id) do update
    set requested_at = case
          when public.nano_signal_work_items.recovery_mode = 'policy_projection_reprojection'
           and excluded.recovery_mode is distinct from 'policy_projection_reprojection'
            then public.nano_signal_work_items.requested_at
          else excluded.requested_at
        end,
        not_before = case
          when public.nano_signal_work_items.recovery_mode = 'policy_projection_reprojection'
           and excluded.recovery_mode is distinct from 'policy_projection_reprojection'
            then public.nano_signal_work_items.not_before
          else excluded.not_before
        end,
        poll_count = case
          when public.nano_signal_work_items.recovery_mode = 'policy_projection_reprojection'
           and excluded.recovery_mode is distinct from 'policy_projection_reprojection'
            then public.nano_signal_work_items.poll_count
          else excluded.poll_count
        end,
        recovered = case
          when public.nano_signal_work_items.recovery_mode = 'policy_projection_reprojection'
           and excluded.recovery_mode is distinct from 'policy_projection_reprojection'
            then public.nano_signal_work_items.recovered
          else excluded.recovered
        end,
        recovery_mode = case
          when public.nano_signal_work_items.recovery_mode = 'policy_projection_reprojection'
           and excluded.recovery_mode is distinct from 'policy_projection_reprojection'
            then public.nano_signal_work_items.recovery_mode
          else excluded.recovery_mode
        end,
        updated_at = now()
    where public.nano_signal_work_items.requested_at <= excluded.requested_at
       or public.nano_signal_work_items.recovery_mode = 'policy_projection_reprojection';

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
    'browser_extension.observed_signals_ingested',
    'v2_policy_evidence.received'
  )
)
execute function public.sync_nano_signal_work_item_from_event();

comment on function public.sync_nano_signal_work_item_from_event() is
  'Projects canonical signal work from durable evidence events. Verified early policy evidence schedules a full normalized-concern, concern-policy, unified-finding, and report reprojection without a display fallback.';

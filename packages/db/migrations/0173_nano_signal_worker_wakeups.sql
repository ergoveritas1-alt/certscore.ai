create or replace function public.notify_nano_signal_worker_from_event()
returns trigger
language plpgsql
as $$
declare
  payload jsonb;
  recheck_after_epoch_ms numeric;
begin
  payload := jsonb_build_object('scanId', new.scan_id);

  if new.event_type = 'signals.nano_doc_enrichment_requested'
     and new.metadata_json->>'recheckAfterEpochMs' ~ '^\d+(\.\d+)?$' then
    recheck_after_epoch_ms := (new.metadata_json->>'recheckAfterEpochMs')::numeric;
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
    'browser_extension.observed_signals_ingested'
  )
)
execute function public.notify_nano_signal_worker_from_event();

create or replace function public.notify_nano_signal_worker_from_scan_status()
returns trigger
language plpgsql
as $$
begin
  perform pg_notify(
    'certscore_nano_signal_work',
    jsonb_build_object('scanId', new.id)::text
  );
  return new;
end;
$$;

drop trigger if exists scans_notify_nano_signal_worker on public.scans;
create trigger scans_notify_nano_signal_worker
after update of status on public.scans
for each row
when (
  old.status is distinct from new.status
  and new.status in ('completed', 'failed')
)
execute function public.notify_nano_signal_worker_from_scan_status();

create or replace function public.notify_nano_signal_worker_from_policy_enrichment()
returns trigger
language plpgsql
as $$
begin
  perform pg_notify(
    'certscore_nano_signal_work',
    jsonb_build_object('scanId', new.scan_id)::text
  );
  return new;
end;
$$;

drop trigger if exists policy_enrichment_notify_nano_signal_worker on public.policy_enrichment;
create trigger policy_enrichment_notify_nano_signal_worker
after insert on public.policy_enrichment
for each row
when (new.scan_id is not null)
execute function public.notify_nano_signal_worker_from_policy_enrichment();

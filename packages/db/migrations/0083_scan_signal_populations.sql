alter table if exists public.scan_signals
  add column if not exists population_source text not null default 'scanner',
  add column if not exists confidence double precision,
  add column if not exists population_status text not null default 'present',
  add column if not exists evidence_refs text[] not null default '{}'::text[],
  add column if not exists provenance_json jsonb not null default '[]'::jsonb,
  add column if not exists observed_at timestamptz;

update public.scan_signals
set population_source = 'scanner'
where population_source is null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'scan_signals_scan_id_signal_key_key'
      and conrelid = 'public.scan_signals'::regclass
  ) then
    alter table public.scan_signals
      drop constraint scan_signals_scan_id_signal_key_key;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'scan_signals_scan_id_signal_key_source_key'
      and conrelid = 'public.scan_signals'::regclass
  ) then
    alter table public.scan_signals
      add constraint scan_signals_scan_id_signal_key_source_key unique (scan_id, signal_key, population_source);
  end if;
end $$;

create index if not exists scan_signals_scan_id_population_source_idx
  on public.scan_signals (scan_id, population_source);

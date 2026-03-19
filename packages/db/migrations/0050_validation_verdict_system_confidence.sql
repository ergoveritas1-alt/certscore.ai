alter table public.validation_verdicts
  add column if not exists system_confidence_score real,
  add column if not exists system_confidence_band text,
  add column if not exists system_confidence_explanation text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'validation_verdicts_system_confidence_band_check'
  ) then
    alter table public.validation_verdicts
      add constraint validation_verdicts_system_confidence_band_check
      check (system_confidence_band in ('very_high', 'high', 'moderate', 'low', 'very_low'));
  end if;
end $$;

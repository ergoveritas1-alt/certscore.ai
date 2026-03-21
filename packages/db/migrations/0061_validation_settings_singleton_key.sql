alter table public.validation_settings
  add column if not exists singleton_key text;

update public.validation_settings
set singleton_key = 'default'
where singleton_key is null;

alter table public.validation_settings
  alter column singleton_key set not null;

create unique index if not exists validation_settings_singleton_key_idx
  on public.validation_settings (singleton_key);

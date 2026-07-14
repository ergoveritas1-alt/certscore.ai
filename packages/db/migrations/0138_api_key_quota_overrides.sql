alter table public.integration_api_keys
  add column if not exists hourly_limit integer not null default 60,
  add column if not exists daily_limit integer not null default 500;

alter table public.integration_api_keys
  drop constraint if exists integration_api_keys_hourly_limit_check,
  drop constraint if exists integration_api_keys_daily_limit_check;

alter table public.integration_api_keys
  add constraint integration_api_keys_hourly_limit_check check (hourly_limit > 0),
  add constraint integration_api_keys_daily_limit_check check (daily_limit > 0);

update public.integration_api_keys
   set hourly_limit = 100,
       daily_limit = 2000
 where token_prefix = 'cs_live_Rdregiyx';

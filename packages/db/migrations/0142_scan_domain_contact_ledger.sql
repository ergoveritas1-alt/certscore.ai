create table if not exists public.scan_domain_contacts (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid unique references public.scans (id) on delete cascade,
  calibration_run_key text,
  normalized_domain text not null,
  contact_at timestamptz not null,
  source text not null,
  scan_status text not null,
  no_go boolean not null default false,
  no_go_reason_codes text[] not null default '{}'::text[],
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists scan_domain_contacts_calibration_run_domain_idx
  on public.scan_domain_contacts (calibration_run_key, normalized_domain)
  where calibration_run_key is not null;

create index if not exists scan_domain_contacts_domain_contact_idx
  on public.scan_domain_contacts (normalized_domain, contact_at desc);

create table if not exists public.scan_domain_contact_ledger (
  normalized_domain text primary key,
  last_contact_at timestamptz not null,
  last_scan_id uuid references public.scans (id) on delete set null,
  last_source text not null,
  last_outcome text not null,
  last_no_go_reason_codes text[] not null default '{}'::text[],
  total_contact_count bigint not null default 0,
  consecutive_no_go_count integer not null default 0,
  cooldown_until timestamptz not null,
  automatic_state text not null default 'cooldown'
    check (automatic_state in ('eligible', 'cooldown', 'blocked', 'do_not_calibrate')),
  manual_state text
    check (manual_state is null or manual_state in ('eligible', 'cooldown', 'blocked', 'do_not_calibrate')),
  manual_note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists scan_domain_contact_ledger_state_cooldown_idx
  on public.scan_domain_contact_ledger ((coalesce(manual_state, automatic_state)), cooldown_until);

create or replace function public.normalize_scan_contact_domain(value text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(lower(trim(trailing '.' from trim(value))), '^www\.', ''), '')
$$;

create or replace function public.refresh_scan_domain_contact_ledger(target_domain text)
returns void
language plpgsql
as $$
declare
  normalized_target text := public.normalize_scan_contact_domain(target_domain);
  latest_contact public.scan_domain_contacts%rowtype;
  contact_count bigint;
  consecutive_no_go integer;
begin
  if normalized_target is null then
    return;
  end if;

  select *
    into latest_contact
    from public.scan_domain_contacts
   where normalized_domain = normalized_target
   order by contact_at desc, created_at desc, id desc
   limit 1;

  if not found then
    delete from public.scan_domain_contact_ledger where normalized_domain = normalized_target;
    return;
  end if;

  select count(*)
    into contact_count
    from public.scan_domain_contacts
   where normalized_domain = normalized_target;

  with ordered as (
    select
      no_go,
      count(*) filter (where not no_go) over (
        order by contact_at desc, created_at desc, id desc
        rows between unbounded preceding and current row
      ) as non_no_go_seen
    from public.scan_domain_contacts
    where normalized_domain = normalized_target
  )
  select count(*) filter (where no_go and non_no_go_seen = 0)::integer
    into consecutive_no_go
    from ordered;

  insert into public.scan_domain_contact_ledger (
    normalized_domain,
    last_contact_at,
    last_scan_id,
    last_source,
    last_outcome,
    last_no_go_reason_codes,
    total_contact_count,
    consecutive_no_go_count,
    cooldown_until,
    automatic_state
  )
  values (
    normalized_target,
    latest_contact.contact_at,
    latest_contact.scan_id,
    latest_contact.source,
    case when latest_contact.no_go then 'no_go' else latest_contact.scan_status end,
    latest_contact.no_go_reason_codes,
    contact_count,
    consecutive_no_go,
    latest_contact.contact_at + interval '28 days',
    case
      when consecutive_no_go >= 2 then 'do_not_calibrate'
      when latest_contact.no_go then 'blocked'
      else 'cooldown'
    end
  )
  on conflict (normalized_domain) do update
    set last_contact_at = excluded.last_contact_at,
        last_scan_id = excluded.last_scan_id,
        last_source = excluded.last_source,
        last_outcome = excluded.last_outcome,
        last_no_go_reason_codes = excluded.last_no_go_reason_codes,
        total_contact_count = excluded.total_contact_count,
        consecutive_no_go_count = excluded.consecutive_no_go_count,
        cooldown_until = excluded.cooldown_until,
        automatic_state = excluded.automatic_state,
        updated_at = timezone('utc', now());
end
$$;

create or replace function public.capture_scan_domain_contact()
returns trigger
language plpgsql
as $$
declare
  target_domain text;
  target_source text;
begin
  select public.normalize_scan_contact_domain(d.hostname)
    into target_domain
    from public.domains d
   where d.id = new.domain_id;

  if target_domain is null then
    return new;
  end if;

  target_source := coalesce(
    nullif(new.scan_config_json #>> '{provenance,source}', ''),
    nullif(new.scan_config_json #>> '{request,channel}', ''),
    nullif(new.scan_config_json ->> 'source', ''),
    nullif(new.queue_origin, ''),
    new.scan_type,
    'unknown'
  );

  insert into public.scan_domain_contacts (
    scan_id,
    normalized_domain,
    contact_at,
    source,
    scan_status
  )
  values (
    new.id,
    target_domain,
    coalesce(new.started_at, new.created_at, timezone('utc', now())),
    target_source,
    new.status
  )
  on conflict (scan_id) do update
    set normalized_domain = excluded.normalized_domain,
        contact_at = least(public.scan_domain_contacts.contact_at, excluded.contact_at),
        source = excluded.source,
        scan_status = excluded.scan_status,
        updated_at = timezone('utc', now());

  perform public.refresh_scan_domain_contact_ledger(target_domain);
  return new;
end
$$;

create or replace function public.capture_scan_domain_no_go()
returns trigger
language plpgsql
as $$
declare
  target_domain text;
  is_no_go boolean;
  reasons text[];
begin
  select c.normalized_domain
    into target_domain
    from public.scan_domain_contacts c
   where c.scan_id = new.scan_id;

  if target_domain is null then
    return new;
  end if;

  is_no_go := coalesce(new.blocked_flag, false)
    or coalesce(new.captcha_flag, false)
    or coalesce(new.scan_outcome, '') = 'no_go'
    or coalesce(new.scan_outcome, '') like 'reachability_blocked%'
    or coalesce(new.stop_reason_code, '') in (
      'captcha',
      'captcha_or_challenge',
      'homepage_blocked',
      'access_denied_or_forbidden_page',
      'rate_limited'
    );

  reasons := array_remove(array[
    nullif(new.stop_reason_code, ''),
    nullif(new.scan_outcome, ''),
    case when coalesce(new.captcha_flag, false) then 'captcha' end,
    case when coalesce(new.blocked_flag, false) then 'blocked' end
  ], null);

  update public.scan_domain_contacts
     set no_go = is_no_go,
         no_go_reason_codes = case when is_no_go then reasons else '{}'::text[] end,
         updated_at = timezone('utc', now())
   where scan_id = new.scan_id;

  perform public.refresh_scan_domain_contact_ledger(target_domain);
  return new;
end
$$;

drop trigger if exists capture_scan_domain_contact_insert on public.scans;
create trigger capture_scan_domain_contact_insert
after insert on public.scans
for each row
execute function public.capture_scan_domain_contact();

drop trigger if exists capture_scan_domain_contact_update on public.scans;
create trigger capture_scan_domain_contact_update
after update of status, started_at on public.scans
for each row
when (old.status is distinct from new.status or old.started_at is distinct from new.started_at)
execute function public.capture_scan_domain_contact();

drop trigger if exists capture_scan_domain_no_go_insert on public.scan_snapshots;
create trigger capture_scan_domain_no_go_insert
after insert on public.scan_snapshots
for each row
execute function public.capture_scan_domain_no_go();

drop trigger if exists capture_scan_domain_no_go_update on public.scan_snapshots;
create trigger capture_scan_domain_no_go_update
after update of blocked_flag, captcha_flag, scan_outcome, stop_reason_code on public.scan_snapshots
for each row
execute function public.capture_scan_domain_no_go();

insert into public.scan_domain_contacts (
  scan_id,
  normalized_domain,
  contact_at,
  source,
  scan_status
)
select
  s.id,
  public.normalize_scan_contact_domain(d.hostname),
  coalesce(s.started_at, s.created_at),
  coalesce(
    nullif(s.scan_config_json #>> '{provenance,source}', ''),
    nullif(s.scan_config_json #>> '{request,channel}', ''),
    nullif(s.scan_config_json ->> 'source', ''),
    nullif(s.queue_origin, ''),
    s.scan_type,
    'unknown'
  ),
  s.status
from public.scans s
join public.domains d on d.id = s.domain_id
where public.normalize_scan_contact_domain(d.hostname) is not null
on conflict (scan_id) do nothing;

update public.scan_domain_contacts contacts
   set no_go = true,
       no_go_reason_codes = array_remove(array[
         nullif(snapshot.stop_reason_code, ''),
         nullif(snapshot.scan_outcome, ''),
         case when coalesce(snapshot.captcha_flag, false) then 'captcha' end,
         case when coalesce(snapshot.blocked_flag, false) then 'blocked' end
       ], null),
       updated_at = timezone('utc', now())
  from public.scan_snapshots snapshot
 where snapshot.scan_id = contacts.scan_id
   and (
     coalesce(snapshot.blocked_flag, false)
     or coalesce(snapshot.captcha_flag, false)
     or coalesce(snapshot.scan_outcome, '') = 'no_go'
     or coalesce(snapshot.scan_outcome, '') like 'reachability_blocked%'
     or coalesce(snapshot.stop_reason_code, '') in (
       'captcha',
       'captcha_or_challenge',
       'homepage_blocked',
       'access_denied_or_forbidden_page',
       'rate_limited'
     )
   );

do $$
declare
  domain_row record;
begin
  for domain_row in select distinct normalized_domain from public.scan_domain_contacts loop
    perform public.refresh_scan_domain_contact_ledger(domain_row.normalized_domain);
  end loop;
end
$$;

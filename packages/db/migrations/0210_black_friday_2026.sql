-- Private campaign data. Application and outbox commits are atomic; no Stripe writes.
create table promotion_campaigns (
  id text primary key, capacity integer not null check (capacity = 10),
  starts_at timestamptz not null, ends_at timestamptz not null
);
insert into promotion_campaigns values ('black-friday-2026',10,'2026-11-10T08:00:00Z','2026-12-03T08:00:00Z');
create table promotion_applications (
  id uuid primary key default gen_random_uuid(), campaign_id text not null references promotion_campaigns,
  request_id uuid not null unique, email text not null, business_domain text not null,
  full_name text not null, company text not null, details jsonb not null,
  attribution jsonb not null default '{}', terms_version text not null,
  marketing_opt_in boolean not null default false, submitted_at timestamptz not null default now(),
  status text not null default 'submitted' check(status in ('submitted','under_review','approved','rejected','invited','activated','expired')),
  notes text not null default '', business_group text, allocation integer check(allocation between 1 and 10),
  approved_at timestamptz, rejected_at timestamptz, activation_deadline timestamptz,
  invite_version integer not null default 1, activated_at timestamptz, entitlement_end timestamptz,
  user_id uuid references users, organization_id uuid references organizations,
  unique(campaign_id,email), unique(campaign_id,business_domain), unique(campaign_id,allocation),
  unique(campaign_id,business_group), unique(campaign_id,organization_id),
  check ((allocation is null) = (approved_at is null)),
  check (activated_at is null or (allocation is not null and organization_id is not null and entitlement_end > activated_at))
);
create table promotion_audit_log (
  id bigint generated always as identity primary key, application_id uuid not null references promotion_applications,
  actor_id uuid references users, action text not null, created_at timestamptz not null default now(), details jsonb not null default '{}'
);
create table promotion_events (
  application_id uuid not null references promotion_applications,
  event text not null check(event in ('bf26_form_submit','bf26_approved','bf26_rejected','bf26_invite_sent','bf26_activated','bf26_first_scan','bf26_paid_conversion')),
  occurred_at timestamptz not null default now(), primary key(application_id,event)
);
create table promotion_email_outbox (
  id uuid primary key default gen_random_uuid(), application_id uuid not null references promotion_applications,
  kind text not null check(kind in ('owner','received','invitation','rejected','activated','expiring')),
  revision integer not null default 1, status text not null default 'pending' check(status in ('pending','sending','sent','failed','uncertain')),
  attempts integer not null default 0, available_at timestamptz not null default now(), lease_until timestamptz,
  sent_at timestamptz, last_error text, unique(application_id,kind,revision)
);
create index promotion_outbox_pending on promotion_email_outbox(available_at) where status in ('pending','failed');
create table promotion_aggregate_events (
  day date not null, event text not null check(event in ('bf26_landing_view','bf26_form_start')),
  source text not null, count bigint not null default 0, primary key(day,event,source)
);
-- Short lived transport deduplication and keyed abuse counters; never visitor identities.
create table promotion_request_receipts (id uuid primary key, event text not null, expires_at timestamptz not null);
create index promotion_receipts_expiry on promotion_request_receipts(expires_at);
create table promotion_rate_limits (key text primary key, window_start timestamptz not null, count integer not null);
create table promotion_usage (
  application_id uuid not null references promotion_applications, period_index integer not null check(period_index between 0 and 2),
  pages integer not null check(pages between 0 and 1000), primary key(application_id,period_index)
);

-- UTC calendar anniversaries, clipped at month-end; always measured from original start.
create function promotion_month(start_at timestamptz, months integer) returns timestamptz
language sql immutable as $$ select ((start_at at time zone 'UTC') + make_interval(months => months)) at time zone 'UTC' $$;
create function promotion_active(org uuid, at_time timestamptz default now()) returns boolean
language sql stable as $$
  select exists(select 1 from promotion_applications a join organizations o on o.id=a.organization_id
   where a.organization_id=org and a.activated_at<=at_time and a.entitlement_end>at_time
     and o.plan='free' and coalesce(o.stripe_subscription_status,'') not in ('active','trialing','past_due','incomplete','unpaid','paused'))
$$;
create function promotion_effective_plan(org uuid, base_plan text) returns text
language sql stable as $$ select case when promotion_active(org) then 'pro' else base_plan end $$;

-- Enforce pages atomically at the existing scan insertion boundary, including scheduled scans.
-- Original paid plans and anonymous scans do not enter this lane.
create function promotion_scan_guard() returns trigger language plpgsql as $$
declare a promotion_applications; p integer; total integer; reserved_pages integer;
begin
  if new.organization_id is null or new.scan_type not in ('full','scheduled') then return new; end if;
  select * into a from promotion_applications where organization_id=new.organization_id and activated_at is not null for update;
  if not found then return new; end if;
  if exists(select 1 from organizations where id=new.organization_id and plan <> 'free') then return new; end if;
  if not promotion_active(new.organization_id) then raise exception 'Promotional Pro access has ended. Choose a paid plan to continue.'; end if;
  p := case when now() >= promotion_month(a.activated_at,2) then 2 when now() >= promotion_month(a.activated_at,1) then 1 else 0 end;
  -- Ordinary v2 scans are one starting-page scan. pages_requested is a legacy
  -- plan/reuse ceiling, not the number of dispatched page scans. Only an explicit
  -- resource crawl reserves its separately validated multi-page budget.
  reserved_pages := 1;
  if new.scan_config_json->>'fullSite' = 'true' then
    if coalesce(new.scan_config_json#>>'{crawlOptions,maxPages}','') !~ '^[0-9]{1,4}$' then raise exception 'Missing promotional crawl page budget.'; end if;
    reserved_pages := greatest(reserved_pages,(new.scan_config_json#>>'{crawlOptions,maxPages}')::integer);
  end if;
  if reserved_pages>1000 then raise exception 'Promotional page allowance exceeded.'; end if;
  insert into promotion_usage values(a.id,p,reserved_pages)
    on conflict(application_id,period_index) do update set pages=promotion_usage.pages+excluded.pages
    where promotion_usage.pages+excluded.pages<=1000 returning pages into total;
  if not found then raise exception 'You have reached the 1,000-page promotional allowance for this entitlement period.'; end if;
  return new;
end $$;
create trigger promotion_scan_quota before insert on scans for each row execute function promotion_scan_guard();
create function promotion_first_scan() returns trigger language plpgsql as $$
begin
  if new.status='completed' and old.status is distinct from new.status then
    insert into promotion_events(application_id,event,occurred_at)
      select id,'bf26_first_scan',coalesce(new.completed_at,now()) from promotion_applications
      where organization_id=new.organization_id and activated_at<=new.created_at and entitlement_end>new.created_at
      on conflict do nothing;
  end if;
  return new;
end $$;
create trigger promotion_scan_completed after update of status on scans for each row execute function promotion_first_scan();
create function promotion_paid_conversion() returns trigger language plpgsql as $$
begin
  if new.plan in ('individual','pro','team') and new.stripe_subscription_status='active'
     and new.stripe_subscription_id is not null and new.stripe_payment_status='paid' then
    insert into promotion_events(application_id,event)
      select id,'bf26_paid_conversion' from promotion_applications where organization_id=new.id and activated_at is not null
      on conflict do nothing;
  end if;
  return new;
end $$;
create trigger promotion_subscription_paid after update on organizations for each row execute function promotion_paid_conversion();

-- Service-role SQL only; do not expose applicants, email or tokens to public table APIs.
alter table promotion_campaigns enable row level security;
alter table promotion_applications enable row level security;
alter table promotion_audit_log enable row level security;
alter table promotion_events enable row level security;
alter table promotion_email_outbox enable row level security;
alter table promotion_aggregate_events enable row level security;
alter table promotion_request_receipts enable row level security;
alter table promotion_rate_limits enable row level security;
alter table promotion_usage enable row level security;

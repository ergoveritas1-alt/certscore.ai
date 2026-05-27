alter table public.organizations
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_subscription_status text,
  add column if not exists stripe_price_id text,
  add column if not exists plan_current_period_end timestamptz;

create unique index if not exists organizations_stripe_customer_id_idx
  on public.organizations (stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists organizations_stripe_subscription_id_idx
  on public.organizations (stripe_subscription_id)
  where stripe_subscription_id is not null;

create table if not exists public.billing_event_queue (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  payload_json jsonb not null,
  status text not null default 'queued',
  attempts integer not null default 0,
  last_error text,
  processed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists billing_event_queue_status_created_at_idx
  on public.billing_event_queue (status, created_at asc);

drop trigger if exists set_billing_event_queue_updated_at on public.billing_event_queue;
create trigger set_billing_event_queue_updated_at
before update on public.billing_event_queue
for each row
execute function public.set_updated_at();

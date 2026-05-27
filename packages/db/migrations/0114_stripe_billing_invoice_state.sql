alter table public.organizations
  add column if not exists plan_current_period_start timestamptz,
  add column if not exists stripe_payment_status text,
  add column if not exists stripe_latest_invoice_id text;

alter table public.billing_event_queue
  add column if not exists processed_kind text;

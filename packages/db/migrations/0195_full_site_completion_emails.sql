-- New crawls only: do not retrospectively email historical scan owners.
create table if not exists full_site_completion_emails (
  scan_id uuid primary key references full_site_crawls(scan_id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','dispatching','sending','sent','failed','uncertain')),
  attempts integer not null default 0,
  token_hash text,
  lease_until timestamptz,
  available_at timestamptz not null default now(),
  sent_at timestamptz,
  message_id text,
  last_error text
);
create index if not exists full_site_completion_emails_pending on full_site_completion_emails(available_at) where status in ('pending','dispatching','sending');

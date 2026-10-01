-- Disposable read projections only; canonical evidence and scoring remain elsewhere.
-- 128 slots * 512 KiB bounds live compressed payloads to 64 MiB globally.
create table if not exists full_site_report_cache (
  slot smallint primary key check (slot >= 0 and slot < 128),
  scan_id uuid not null references full_site_crawls(scan_id) on delete cascade,
  source_key text not null,
  payload bytea not null check (octet_length(payload) <= 524288),
  payload_sha256 text not null,
  created_at timestamptz not null default now()
);
create index if not exists full_site_report_cache_scan on full_site_report_cache(scan_id);

alter table public.scan_tracker_vendors
  add column if not exists collection_endpoint_type text not null default 'unknown';

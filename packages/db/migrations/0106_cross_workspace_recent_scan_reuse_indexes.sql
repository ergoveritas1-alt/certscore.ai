create index if not exists scans_recent_completed_reuse_idx
  on public.scans (completed_at desc, created_at desc)
  where status = 'completed'
    and completed_at is not null;

create index if not exists domains_lower_hostname_idx
  on public.domains (lower(hostname));

create index if not exists domains_lower_normalized_url_idx
  on public.domains (lower(normalized_url));

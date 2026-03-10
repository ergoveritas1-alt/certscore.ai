create index if not exists domains_client_id_idx
  on public.domains (client_id);

create index if not exists scans_domain_status_type_idx
  on public.scans (domain_id, status, scan_type, created_at desc);

create index if not exists scan_pages_scan_id_status_idx
  on public.scan_pages (scan_id, status);

create index if not exists findings_scan_id_category_idx
  on public.findings (scan_id, category);

create index if not exists findings_scan_id_rule_key_idx
  on public.findings (scan_id, rule_key);

create index if not exists reports_domain_latest_idx
  on public.reports (domain_id, is_latest, created_at desc);

create index if not exists score_breakdowns_scan_category_points_idx
  on public.score_breakdowns (scan_id, category, adjusted_points desc);

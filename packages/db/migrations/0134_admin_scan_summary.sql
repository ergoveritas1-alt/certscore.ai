alter table public.scan_snapshots
  add column if not exists admin_summary_generated_at timestamptz,
  add column if not exists admin_industry_label text,
  add column if not exists top_finding_count integer;

update public.scan_snapshots
   set admin_summary_generated_at = null
 where admin_summary_generated_at is not null
   and (admin_industry_label is null or site_language_primary is null);

alter table public.scan_snapshots
  add column if not exists robots_txt_hash text,
  add column if not exists robots_crawl_delay_ms integer,
  add column if not exists robots_rules_loaded boolean,
  add column if not exists robots_group_count integer,
  add column if not exists robots_directive_count integer,
  add column if not exists robots_has_allow_rules boolean,
  add column if not exists robots_has_disallow_rules boolean;

update public.scan_snapshots
set
  robots_txt_hash = null,
  robots_crawl_delay_ms = null,
  robots_rules_loaded = null,
  robots_group_count = null,
  robots_directive_count = null,
  robots_has_allow_rules = null,
  robots_has_disallow_rules = null;

alter table public.scan_snapshots
  drop column if exists robots_txt_artifact_bucket,
  drop column if exists robots_txt_artifact_path,
  drop column if exists robots_txt_body;

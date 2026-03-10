alter table public.scan_snapshots
  add column if not exists robots_txt_url text,
  add column if not exists robots_txt_body text,
  add column if not exists robots_txt_fetched_at timestamptz,
  add column if not exists robots_txt_artifact_bucket text,
  add column if not exists robots_txt_artifact_path text;

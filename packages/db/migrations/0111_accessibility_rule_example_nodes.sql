alter table if exists public.scan_accessibility_rule_examples
  add column if not exists representative_nodes jsonb not null default '[]'::jsonb;

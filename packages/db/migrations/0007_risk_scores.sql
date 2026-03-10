create table if not exists public.risk_scores (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null unique references public.scans (id) on delete cascade,
  overall_score integer not null,
  accessibility_score integer not null,
  privacy_score integer not null,
  legal_score integer not null,
  exposure_band text not null,
  score_version text not null,
  weights_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.score_breakdowns (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans (id) on delete cascade,
  category text not null,
  rule_key text not null,
  raw_points integer not null,
  adjusted_points integer not null,
  notes text,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists risk_scores_scan_id_idx
  on public.risk_scores (scan_id);

create index if not exists score_breakdowns_scan_id_idx
  on public.score_breakdowns (scan_id);

create index if not exists score_breakdowns_category_idx
  on public.score_breakdowns (category);

create index if not exists score_breakdowns_rule_key_idx
  on public.score_breakdowns (rule_key);

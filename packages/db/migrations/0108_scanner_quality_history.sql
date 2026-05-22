create table if not exists scanner_quality_windows (
  id uuid primary key default gen_random_uuid(),
  batch_id text not null,
  start_row integer,
  end_row integer,
  egress_id text not null,
  egress_provider text,
  completed_count integer not null default 0,
  failed_count integer not null default 0,
  rejected_count integer not null default 0,
  findings_per_completed numeric,
  zero_finding_count integer not null default 0,
  zero_finding_rate numeric,
  pages_scanned integer not null default 0,
  access_posture_counts jsonb not null default '{}'::jsonb,
  label_counts jsonb not null default '{}'::jsonb,
  scanner_task_counts jsonb not null default '{}'::jsonb,
  scanner_slot_counts jsonb not null default '{}'::jsonb,
  metrics_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (batch_id, egress_id)
);

create index if not exists scanner_quality_windows_egress_created_idx
  on scanner_quality_windows (egress_id, created_at desc);

create index if not exists scanner_quality_windows_batch_idx
  on scanner_quality_windows (batch_id);

create table if not exists scanner_quality_warning_events (
  id uuid primary key default gen_random_uuid(),
  batch_id text not null,
  egress_id text not null,
  egress_provider text,
  warning_code text not null,
  severity text not null,
  warning_id text,
  dedupe_key text not null,
  comparison_tier text not null default 'no_baseline',
  explanation text not null,
  observed_metrics jsonb not null default '{}'::jsonb,
  baseline_metrics jsonb,
  notification_status text not null default 'disabled',
  notification_eligible_at timestamptz,
  notification_last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (dedupe_key, batch_id)
);

create index if not exists scanner_quality_warning_events_created_idx
  on scanner_quality_warning_events (created_at desc);

create index if not exists scanner_quality_warning_events_dedupe_idx
  on scanner_quality_warning_events (dedupe_key, created_at desc);

create index if not exists scanner_quality_warning_events_egress_idx
  on scanner_quality_warning_events (egress_id, created_at desc);

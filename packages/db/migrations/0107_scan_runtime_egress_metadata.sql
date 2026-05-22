alter table public.scans
  add column if not exists scanner_task_arn text,
  add column if not exists scanner_task_definition_arn text,
  add column if not exists scanner_task_revision text,
  add column if not exists scanner_slot integer,
  add column if not exists scanner_region text,
  add column if not exists egress_id text,
  add column if not exists egress_provider text,
  add column if not exists observed_outbound_ip text;

create index if not exists scans_egress_completed_at_idx
  on public.scans (egress_id, completed_at desc)
  where completed_at is not null;

create index if not exists scans_scanner_slot_completed_at_idx
  on public.scans (scanner_task_arn, scanner_slot, completed_at desc)
  where completed_at is not null;


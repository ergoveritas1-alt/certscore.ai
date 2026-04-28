alter table public.scan_signal_hits
  add column if not exists matched_text text,
  add column if not exists matched_snippet text;

alter table if exists public.scanner_egress_risk_state
  alter column launch_jitter_min_ms set default 0,
  alter column launch_jitter_max_ms set default 3000;

update public.scanner_egress_risk_state
set
  launch_jitter_min_ms = 0,
  launch_jitter_max_ms = 3000,
  updated_at = timezone('utc', now())
where high_block_risk_mode is not true
  and (
    launch_jitter_min_ms is distinct from 0
    or launch_jitter_max_ms is distinct from 3000
  );

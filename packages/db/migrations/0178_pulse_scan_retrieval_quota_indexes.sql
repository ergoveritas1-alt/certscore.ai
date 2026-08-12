create table if not exists public.pulse_read_events (
  id bigserial primary key,
  principal text not null,
  target text not null,
  profile text not null check (profile in ('terminal', 'status')),
  route text not null,
  units smallint not null check (units between 1 and 8),
  requested_at timestamptz not null default now()
);

create index if not exists pulse_read_events_principal_requested_at_idx
  on public.pulse_read_events (principal, profile, requested_at desc);

create index if not exists pulse_read_events_target_requested_at_idx
  on public.pulse_read_events (target, profile, requested_at desc);

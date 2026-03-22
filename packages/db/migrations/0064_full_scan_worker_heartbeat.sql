create table if not exists public.worker_heartbeats (
  worker_type text primary key,
  last_heartbeat_at timestamptz,
  started_at timestamptz,
  host text,
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists set_worker_heartbeats_updated_at on public.worker_heartbeats;
create trigger set_worker_heartbeats_updated_at
before update on public.worker_heartbeats
for each row execute function public.set_updated_at();

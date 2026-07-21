create table if not exists public.tranco_rank_snapshots (
  list_id text primary key,
  source_url text not null,
  snapshot_date date,
  row_count integer not null default 0 check (row_count between 0 and 1000000),
  imported_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.tranco_rankings (
  list_id text not null references public.tranco_rank_snapshots (list_id) on delete cascade,
  hostname text not null,
  tranco_rank integer not null check (tranco_rank between 1 and 1000000),
  primary key (list_id, hostname),
  unique (list_id, tranco_rank)
);

create index if not exists tranco_rankings_hostname_idx
  on public.tranco_rankings (hostname, list_id);

create table if not exists public.tranco_rank_settings (
  singleton boolean primary key default true check (singleton),
  active_list_id text references public.tranco_rank_snapshots (list_id) on delete restrict,
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.tranco_rank_settings (singleton)
values (true)
on conflict (singleton) do nothing;


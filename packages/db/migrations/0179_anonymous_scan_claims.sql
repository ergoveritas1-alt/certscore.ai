alter table public.scans
  add column if not exists claimed_by_user_id uuid references public.users (id) on delete set null,
  add column if not exists claimed_at timestamptz;

create index if not exists scans_claimed_by_user_id_idx
  on public.scans (claimed_by_user_id)
  where claimed_by_user_id is not null;

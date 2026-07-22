create table if not exists public.score_shadow_collection_pairs (
  pair_key text primary key check (pair_key ~ '^sha256:[a-f0-9]{64}$'),
  model_version text not null check (char_length(model_version) between 1 and 120),
  comparison_group_key text not null check (comparison_group_key ~ '^sha256:[a-f0-9]{64}$'),
  comparison_target_key text not null check (comparison_target_key ~ '^sha256:[a-f0-9]{64}$'),
  state text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  withdrawn_at timestamptz,
  constraint score_shadow_collection_pairs_state_check check (
    (state = 'active' and withdrawn_at is null)
    or (state = 'withdrawn' and withdrawn_at is not null)
  ),
  unique (pair_key, model_version)
);

create table if not exists public.score_shadow_collection_pair_members (
  pair_key text not null,
  model_version text not null check (char_length(model_version) between 1 and 120),
  scan_id uuid not null references public.scans (id) on delete restrict,
  source_family text not null check (source_family in ('lambda', 'browser_extension')),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (pair_key, source_family),
  unique (pair_key, scan_id),
  unique (scan_id, model_version),
  foreign key (pair_key, model_version)
    references public.score_shadow_collection_pairs (pair_key, model_version)
    on delete restrict
);

create index if not exists score_shadow_collection_pairs_monitor_idx
  on public.score_shadow_collection_pairs (model_version, state, created_at desc);

comment on table public.score_shadow_collection_pairs is
  'Immutable bounded identifiers for deliberately coordinated score-source comparisons; contains no URL, domain, browser geography, or evidence payload.';

comment on table public.score_shadow_collection_pair_members is
  'Exactly one Lambda and one browser-extension member per deliberate pair; source membership does not imply evidence equivalence.';

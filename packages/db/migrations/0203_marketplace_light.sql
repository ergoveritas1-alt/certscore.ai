-- Free Marketplace Light credentials are intentionally separate from workspace keys.
create table if not exists marketplace_light_licenses (
  license_arn text primary key,
  product_code text not null,
  buyer_account_id text not null check (buyer_account_id ~ '^[0-9]{12}$'),
  owner_user_id text,
  agreement_id text,
  status text not null default 'pending' check (status in ('pending', 'active', 'inactive', 'revoked')),
  expires_at timestamptz,
  event_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists marketplace_light_license_owner on marketplace_light_licenses(owner_user_id);

create table if not exists marketplace_light_claims (
  token_hash text primary key,
  license_arn text not null references marketplace_light_licenses(license_arn),
  expires_at timestamptz not null,
  consumed_at timestamptz
);
create index if not exists marketplace_light_claim_expiry on marketplace_light_claims(expires_at);

-- One current key per license bounds storage and makes rotation atomic.
create table if not exists marketplace_light_keys (
  license_arn text primary key references marketplace_light_licenses(license_arn),
  token_hash text not null unique,
  token_prefix text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

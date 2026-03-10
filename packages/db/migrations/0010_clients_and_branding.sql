create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  external_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists clients_org_name_unique
  on public.clients (organization_id, lower(name));

create index if not exists clients_organization_id_idx
  on public.clients (organization_id);

create table if not exists public.organization_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  brand_name text,
  brand_logo_path text,
  brand_primary_color text,
  default_scan_frequency text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists organization_settings_organization_id_idx
  on public.organization_settings (organization_id);

alter table public.domains
  drop constraint if exists domains_client_id_fkey;

alter table public.domains
  add constraint domains_client_id_fkey
  foreign key (client_id)
  references public.clients(id)
  on delete set null;

drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at
before update on public.clients
for each row execute procedure public.set_updated_at();

drop trigger if exists organization_settings_set_updated_at on public.organization_settings;
create trigger organization_settings_set_updated_at
before update on public.organization_settings
for each row execute procedure public.set_updated_at();

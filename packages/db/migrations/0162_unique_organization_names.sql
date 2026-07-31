create unique index if not exists organizations_name_unique_idx
  on public.organizations (lower(btrim(name)));

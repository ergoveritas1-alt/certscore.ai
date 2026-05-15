alter table public.scans
  add column if not exists queue_priority integer not null default 50,
  add column if not exists queue_origin text not null default 'user';

update public.scans
set
  queue_priority = case
    when scan_type = 'preview' then 0
    when scan_type = 'scheduled' then 20
    when scan_config_json->>'source' like 'prod-manifest-%-load-test-%' then 90
    else 10
  end,
  queue_origin = case
    when scan_type = 'preview' then 'preview'
    when scan_type = 'scheduled' then 'scheduled'
    when scan_config_json->>'source' like 'prod-manifest-%-load-test-%' then 'production_load_test'
    else 'user'
  end
where scan_type in ('preview', 'full', 'scheduled')
  and (
    queue_priority is distinct from case
      when scan_type = 'preview' then 0
      when scan_type = 'scheduled' then 20
      when scan_config_json->>'source' like 'prod-manifest-%-load-test-%' then 90
      else 10
    end
    or queue_origin is distinct from case
      when scan_type = 'preview' then 'preview'
      when scan_type = 'scheduled' then 'scheduled'
      when scan_config_json->>'source' like 'prod-manifest-%-load-test-%' then 'production_load_test'
      else 'user'
    end
  );

create index if not exists scans_queue_claim_priority_idx
  on public.scans (status, queue_priority, created_at asc)
  include (id, scan_type, domain_id)
  where scan_type in ('preview', 'full', 'scheduled');

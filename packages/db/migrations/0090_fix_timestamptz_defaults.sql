create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  column_record record;
  normalized_default text;
begin
  for column_record in
    select table_name, column_name, column_default
      from information_schema.columns
     where table_schema = 'public'
       and data_type = 'timestamp with time zone'
       and column_default is not null
  loop
    normalized_default := lower(replace(column_record.column_default, ' ', ''));

    if normalized_default in (
      'timezone(''utc''::text,now())',
      'timezone(''utc'',now())'
    ) then
      execute format(
        'alter table public.%I alter column %I set default now()',
        column_record.table_name,
        column_record.column_name
      );
    end if;
  end loop;
end
$$;

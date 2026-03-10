update public.plan_limits
set max_pages_per_scan = case plan_code
  when 'free' then 3
  when 'pro' then 20
  when 'team' then 50
  else max_pages_per_scan
end
where plan_code in ('free', 'pro', 'team');

update public.plan_limits
set max_pages_per_scan = case plan_code
  when 'free' then 10
  when 'pro' then 80
  when 'team' then 100
  else max_pages_per_scan
end
where plan_code in ('free', 'pro', 'team');

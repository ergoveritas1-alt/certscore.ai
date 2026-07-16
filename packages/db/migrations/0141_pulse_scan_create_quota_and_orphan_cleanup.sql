-- Count only actual new-scan creation work against integration API quotas.
-- Existing recent-result reuse and read requests remain available at no scan-create cost.
update public.pulse_requests
   set request_context = request_context || jsonb_build_object('quotaClass', 'scan_create'),
       updated_at = now()
 where request_context->>'mode' = 'url'
   and scan_id is not null
   and coalesce(resolution_mode, '') not in (
     'reused_existing_scan',
     'returned_stale_while_refreshing'
   )
   and coalesce(request_context->>'quotaClass', '') <> 'scan_create';

-- Historical requests rejected before a scan was created must not remain queued forever.
update public.pulse_requests
   set status = 'failed',
       phase = 'failed',
       resolution_mode = 'orphaned_before_scan_creation',
       error_code = 'orphaned_before_scan_creation',
       error_message = 'The request ended before a scan was created. Submit a new request if a fresh result is still needed.',
       completed_at = coalesce(completed_at, now()),
       elapsed_seconds = greatest(0, extract(epoch from (now() - requested_at))::int),
       updated_at = now()
 where status in ('queued', 'running')
   and scan_id is null
   and requested_at < now() - interval '5 minutes';

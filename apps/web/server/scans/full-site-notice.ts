import "server-only";
import { fullSiteInternalEnabled, queryOne } from "@website-signal-risk-scanner/db";
import type { FullSiteScanNoticeData } from "../../components/dashboard/full-site-scan-notice";

export async function loadFullSiteNotice(scanId: unknown, organizationId: string, userId: string) {
  if (!fullSiteInternalEnabled() || typeof scanId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(scanId)) return null;
  // Only the requesting user in this workspace sees the email confirmation.
  return queryOne<FullSiteScanNoticeData>(
    `select c.scan_id as "scanId", d.hostname, c.status, s.status as "homepageStatus", s.error_message as "errorMessage",
       c.region, c.started_at as "startedAt", c.requested_json as limits,
       coalesce((select jsonb_agg(row_to_json(previous)) from (
         select older.id as "scanId", older.created_at as "startedAt",
           case when exists(select 1 from full_site_crawls prior where prior.scan_id=older.id) then 'Full-site report' else 'Homepage report' end as label
         from scans older where older.domain_id=s.domain_id and older.organization_id=s.organization_id
           and older.created_at<s.created_at and older.status='completed'
           and not exists(select 1 from full_site_crawls unfinished where unfinished.scan_id=older.id and unfinished.status<>'completed')
         order by older.created_at desc limit 3
       ) previous), '[]'::jsonb) as "earlierResults"
     from full_site_crawls c join scans s on s.id=c.scan_id join domains d on d.id=s.domain_id
     where c.scan_id=$1 and s.organization_id=$2 and c.authorized_user_id=$3`,
    [scanId, organizationId, userId],
  );
}

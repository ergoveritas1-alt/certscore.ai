import { fullSiteProgressSql } from "./full-site-progress";
import "server-only";
import { fullSiteInternalEnabled, queryOne } from "@website-signal-risk-scanner/db";
import type { FullSiteScanNoticeData } from "../../components/dashboard/full-site-scan-notice";

export async function loadFullSiteNotice(scanId: unknown, organizationId: string, userId: string) {
  if (!fullSiteInternalEnabled() || typeof scanId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(scanId)) return null;
  // Only the requesting user in this workspace sees the email confirmation.
  return queryOne<FullSiteScanNoticeData>(
    `select c.scan_id as "scanId", d.hostname, c.status, s.status as "homepageStatus", coalesce(c.stop_reason,s.error_message) as "errorMessage",
       (select ${fullSiteProgressSql} from full_site_pages p where p.scan_id=c.scan_id) as progress,
       case when c.policy_json->>'localExecution'='true' then 'Local' else c.region end as region, c.started_at as "startedAt", c.requested_json as limits
     from full_site_crawls c join scans s on s.id=c.scan_id join domains d on d.id=s.domain_id
     where c.scan_id=$1 and s.organization_id=$2 and c.authorized_user_id=$3`,
    [scanId, organizationId, userId],
  );
}

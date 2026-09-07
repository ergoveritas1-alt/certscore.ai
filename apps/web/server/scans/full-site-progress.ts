import "server-only";
import { fullSiteInternalEnabled, queryOne } from "@website-signal-risk-scanner/db";
import type { z } from "zod";
import type { fullSiteProgressResponseSchema } from "../../lib/scans/full-site-progress";

// Indexed scan_id lookup; no retained evidence, report projection, or history reads.
export const fullSiteProgressSql = `jsonb_build_object(
  'completed', count(*) filter (where p.status='completed'),
  'partial', count(*) filter (where p.status='partial'),
  'failed', count(*) filter (where p.scheduled and p.status in ('failed','cancelled')),
  'active', count(*) filter (where p.status in ('active','dispatching')),
  'discovered', count(*) filter (where p.scheduled or p.status='queued'),
  'averageSeconds', avg(greatest(0,extract(epoch from (p.completed_at-p.started_at)))) filter (where p.status in ('completed','partial') and p.started_at is not null),
  'discoveryComplete', c.discovery_complete,
  'elapsedSeconds', greatest(0, extract(epoch from (coalesce(c.completed_at,now())-c.started_at))),
  'concurrency', c.effective_concurrency, 'waitSeconds', c.effective_wait_seconds
)`;
export async function loadFullSiteProgress(scanId: string, organizationId: string, userId: string) {
  if (!fullSiteInternalEnabled()) return null;
  return queryOne<z.infer<typeof fullSiteProgressResponseSchema>>(
    `select c.scan_id as "scanId", c.status, s.status as "homepageStatus", s.error_message as "errorMessage",
      (select ${fullSiteProgressSql} from full_site_pages p where p.scan_id=c.scan_id) as progress
     from full_site_crawls c join scans s on s.id=c.scan_id
     where c.scan_id=$1 and s.organization_id=$2 and c.authorized_user_id=$3`, [scanId, organizationId, userId]);
}

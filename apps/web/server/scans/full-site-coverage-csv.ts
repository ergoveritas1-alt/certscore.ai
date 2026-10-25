import "server-only";
import { query } from "@website-signal-risk-scanner/db";
import { renderFullSiteCoverageCsv, type CoverageCsvPage } from "../../lib/scans/full-site-coverage-csv";

export async function loadFullSiteCoverageCsv(scanId: string) {
  // One metadata-only snapshot includes all discovered rows, regardless of report filters or pagination.
  // Do not load occurrence inventories, evidence artifacts, findings, or score materializations here.
  const pages = await query<CoverageCsvPage>(`
    select p.id,p.target_url,p.final_url,p.source,p.status,p.limitation,p.attempt_count,
      (p.compact_json is not null and p.compact_json <> 'null'::jsonb) as has_capture,
      p.compact_json->>'status' as capture_status,
      p.compact_json->>'httpStatus' as http_status,
      p.compact_json->>'failureKind' as failure_kind,
      p.compact_json->'limitations' as capture_limitations,
      coalesce(p.compact_json->>'startedAt',p.started_at::text) as started_at,
      coalesce(p.compact_json->>'completedAt',p.completed_at::text) as completed_at,
      c.status as crawl_status,c.stop_reason
    from full_site_pages p join full_site_crawls c on c.scan_id=p.scan_id
    where p.scan_id=$1 order by p.created_at,p.id`, [scanId]);
  return renderFullSiteCoverageCsv(scanId, pages.rows);
}

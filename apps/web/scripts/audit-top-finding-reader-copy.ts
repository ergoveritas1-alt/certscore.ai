import { closePools, query } from "@website-signal-risk-scanner/db";
import { buildSitePriorityReview } from "../lib/scans/full-site-priority-review";
import { topFindingReaderSummary } from "../lib/scans/top-finding-reader-summary";
import type { GdprEprivacyCoverageChecklistItem } from "../lib/scans/gdpr-eprivacy-coverage-checklist";
import type { UnifiedFindingDisplayPacket } from "../lib/scans/unified-findings";

type CanonicalProjection = {
  checklistRows?: GdprEprivacyCoverageChecklistItem[];
  globalUnifiedFindings?: UnifiedFindingDisplayPacket[];
  ownerUnifiedFindingIds?: string[];
  topFindingIds?: string[];
};

type AuditRow = {
  source: "starting_page" | "stored_sitewide";
  scanId: string;
  completedAt: string;
  id: string;
  title: string;
  status: string;
  summary: string;
  readerSummary: string;
};

function numericArg(flag: string, fallback: number) {
  const index = process.argv.indexOf(flag);
  const value = index >= 0 ? Number(process.argv[index + 1]) : fallback;
  return Number.isInteger(value) && value > 0 ? Math.min(value, 1000) : fallback;
}

async function main() {
  const limit = numericArg("--limit", 350);
  const rows = await query<{
    scan_id: string;
    completed_at: Date;
    canonical: CanonicalProjection;
  }>(`select s.id as scan_id, s.completed_at,
      p.report_projection_payload #> $1 as canonical
    from scans s join scan_snapshots p on p.scan_id = s.id
    where s.status = $2 and s.scan_type = $3
      and p.report_projection_payload #> $1 is not null
    order by s.completed_at desc limit $4`,
  [["canonicalReportProjection"], "completed", "full", limit], { readOnly: true });

  const findings: AuditRow[] = [];
  const unmatched: Array<{ scanId: string; findingIds: string[]; currentProjectedIds: string[] }> = [];
  for (const row of rows.rows) {
    const canonical = row.canonical;
    if (!Array.isArray(canonical?.checklistRows) || !Array.isArray(canonical?.topFindingIds)) continue;
    const ownerIds = new Set(canonical.ownerUnifiedFindingIds ?? []);
    const ownerFindings = (canonical.globalUnifiedFindings ?? []).filter(finding => ownerIds.has(finding.unifiedFindingId));
    const page = { id: row.scan_id, url: "", homepage: true, findingIds: canonical.topFindingIds.map(id => id.replace(/^regulatory_gap__gdpr_eprivacy__/, "")) };
    const projected = buildSitePriorityReview(canonical.checklistRows, [page], [], ownerFindings);
    const projectedById = new Map(projected.map(finding => [finding.id, finding]));
    const missing = canonical.topFindingIds.filter(id => !projectedById.has(id));
    if (missing.length) unmatched.push({ scanId: row.scan_id, findingIds: missing, currentProjectedIds: projected.map(finding => finding.id) });
    for (const id of canonical.topFindingIds) {
      const finding = projectedById.get(id);
      if (!finding) continue;
      findings.push({
        source: "starting_page",
        scanId: row.scan_id, completedAt: row.completed_at.toISOString(), id,
        title: finding.title, status: finding.status, summary: finding.summary,
        readerSummary: topFindingReaderSummary(finding),
      });
    }
  }

  // Stored full-site scores are already the exact priority-card projection.
  // Read them separately to cover grouped and additional-page finding types.
  const sitewide = await query<{
    scan_id: string;
    completed_at: Date;
    priorities: Array<{ id: string; title: string; status: string; summary: string }>;
  }>(`select scan_id, completed_at, policy_json #> $1 as priorities
      from full_site_crawls
      where policy_json #> $1 is not null
      order by completed_at desc limit $2`,
  [["fullSiteScore", "score", "priorityReview"], limit], { readOnly: true });
  for (const row of sitewide.rows) {
    if (!Array.isArray(row.priorities)) continue;
    for (const finding of row.priorities) {
      findings.push({
        source: "stored_sitewide",
        scanId: row.scan_id, completedAt: row.completed_at.toISOString(),
        id: finding.id, title: finding.title, status: finding.status,
        summary: finding.summary, readerSummary: topFindingReaderSummary(finding),
      });
    }
  }

  process.stdout.write(`${JSON.stringify({
    sampledScans: rows.rows.length,
    sampledSitewideScores: sitewide.rows.length,
    scanCountWithFindings: new Set(findings.map(finding => finding.scanId)).size,
    findingCount: findings.length,
    startingPageFindingCount: findings.filter(finding => finding.source === "starting_page").length,
    sitewideFindingCount: findings.filter(finding => finding.source === "stored_sitewide").length,
    distinctFindingIds: new Set(findings.map(finding => finding.id)).size,
    unmatched,
    findings,
  }, null, 2)}\n`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await closePools();
});

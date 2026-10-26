import { randomUUID } from "node:crypto";
import { queryOne, withNonBlockingDatabaseLock } from "@website-signal-risk-scanner/db";
import { AUTHENTIC_SAMPLE_REPORT_TARGET_URL } from "../../lib/marketing/sample-report";
import type { SampleScanFrom } from "../../lib/marketing/homepage-location";
import { getPlanLimits } from "../plans/get-plan-limits";
import { createAnonymousFullScan } from "./create-anonymous-full-scan";
import { normalizeLocalV2DagRunViaLambda, shouldUseLocalhostFullScanQueue } from "./local-v2-dag-scan-config";
import { getRecentScanReuseEligibility } from "./recent-scan-reuse";
import { getScanRequesterIpContext } from "./requester-ip-context";
import { resolveSampleReportScan, type SampleReportAttempt } from "./sample-report-resolution";

export async function openVisitorSampleReport(input: {
  scanFrom: SampleScanFrom;
  headers: Headers;
  scheduleBackgroundTask: (task: () => Promise<void>) => void;
}) {
  const limits = await getPlanLimits("free");
  const target = new URL(AUTHENTIC_SAMPLE_REPORT_TARGET_URL);
  const requesterIpContext = getScanRequesterIpContext(input.headers);
  return resolveSampleReportScan(input.scanFrom, {
    withRegionLock: (scanFrom, run) => withNonBlockingDatabaseLock(`sample-report:${scanFrom}`, run),
    findRecent: async (scanFrom, now) => {
      const result = await getRecentScanReuseEligibility({
        minPagesRequested: limits.maxPagesPerScan,
        normalizedDomain: target.hostname,
        normalizedUrl: target.href,
        now,
        organizationId: null,
        readFromWriter: true,
        requireExactUrl: true,
        scanFrom,
        windowHours: 24,
      });
      return result.eligible ? { id: result.candidate.id } : null;
    },
    findAttempt: (scanFrom, now) => queryOne<SampleReportAttempt>(
      `select s.id, s.status, s.created_at as "createdAt"
         from scans s
         join domains d on d.id = s.domain_id
        where s.organization_id is null and d.organization_id is null
          and d.hostname = $1
          and s.scan_config_json->>'normalizedUrl' = $2
          and s.scan_config_json->>'scanFrom' = $3
          and coalesce(s.scan_type, 'full') = 'full'
          and s.pages_requested >= $4
          and s.created_at > $5::timestamptz - interval '24 hours'
          and (s.status in ('queued', 'running', 'processing')
               or s.scan_config_json->>'source' = 'sample-report')
        order by s.created_at desc
        limit 1`,
      [target.hostname, target.href, scanFrom, limits.maxPagesPerScan, now.toISOString()],
      // The lock and in-flight lookup must observe the writer, including a scan
      // accepted by another ECS instance before its replica catches up.
      { readOnly: false },
    ),
    createFresh: async scanFrom => {
      const created = await createAnonymousFullScan({
        // Reuse was checked inside the region lock. Never repair an old report
        // or repeat a stale replica lookup while creating the new sample.
        bypassRecentScanReuse: true,
        clientRequestId: `sample-report:${scanFrom}:${randomUUID()}`,
        hostname: target.hostname,
        localV2DagScanProfile: "standard",
        localV2DagRunViaLambda: shouldUseLocalhostFullScanQueue(process.env)
          ? false : normalizeLocalV2DagRunViaLambda(undefined, process.env, scanFrom),
        normalizedUrl: target.href,
        provenance: {
          host: input.headers.get("host"),
          originIp: requesterIpContext.ipHash,
          source: "sample-report",
          userAgent: input.headers.get("user-agent")?.slice(0, 240) ?? null,
        },
        requesterIpContext,
        scanFrom,
        scheduleBackgroundTask: input.scheduleBackgroundTask,
      });
      return { id: created.scan.id };
    },
  });
}

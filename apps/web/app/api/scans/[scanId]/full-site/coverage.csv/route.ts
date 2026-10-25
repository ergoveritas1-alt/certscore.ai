import { gzip } from "node:zlib";
import { promisify } from "node:util";
import { loadFullSiteCrawl } from "@website-signal-risk-scanner/db";
import { readFullSiteOptions } from "../../../../../../server/scans/full-site-options";
import { getPublicScanStatusProjection } from "../../../../../../server/scans/scan-status-projection";
import { enforceApiV2ScanReadThrottle } from "../../../../../../server/pulse/api-v2-read-throttle";
import { runtimeGraphQuotaRequest } from "../../../../../../server/scans/runtime-evidence-graph-access";
import { loadFullSiteCoverageCsv } from "../../../../../../server/scans/full-site-coverage-csv";

export const dynamic = "force-dynamic";
const compress = promisify(gzip);

export async function GET(request: Request, context: { params: Promise<{ scanId: string }> }) {
  // Match the full-site report's browser-session, rollout, report-availability and read-quota gates.
  if (!(await readFullSiteOptions()).allowed) return new Response(null, { status: 404 });
  const { scanId } = await context.params;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(scanId))
    return new Response(null, { status: 400 });
  const crawl = await loadFullSiteCrawl(scanId);
  const throttled = await enforceApiV2ScanReadThrottle({
    request: runtimeGraphQuotaRequest(request), requestId: crypto.randomUUID(), scanId,
    route: "full-site-coverage-csv", profile: "terminal", detail: "summary",
  });
  if (throttled) return throttled;
  if (!crawl || !(await getPublicScanStatusProjection(scanId))) return new Response(null, { status: 404 });
  const csv = await loadFullSiteCoverageCsv(scanId);
  const gzipAccepted = (request.headers.get("accept-encoding") ?? "").split(",").some(value => {
    const [encoding, ...parameters] = value.trim().split(";");
    return encoding?.toLowerCase() === "gzip" && !parameters.some(parameter => /^\s*q=0(?:\.0*)?\s*$/i.test(parameter));
  });
  return new Response(gzipAccepted ? new Uint8Array(await compress(csv)) : csv, { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="certscore-covered-pages-${scanId}.csv"`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Vary": "Accept-Encoding",
    ...(gzipAccepted ? { "Content-Encoding": "gzip" } : {}),
  } });
}

import { NextResponse } from "next/server";
import { getPublicScanStatusProjection } from "../../../../../server/scans/scan-status-projection";
import { enforceApiV2ScanReadThrottle } from "../../../../../server/pulse/api-v2-read-throttle";
import { runtimeGraphQuotaRequest } from "../../../../../server/scans/runtime-evidence-graph-access";
import { loadFullSiteReport } from "../../../../../server/scans/full-site-report";
import { loadFullSiteCrawl } from "@website-signal-risk-scanner/db";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { params: Promise<{ scanId: string }> },
) {
  const { scanId } = await context.params;
  if (!/^[a-f0-9-]{36}$/i.test(scanId))
    return new Response(null, { status: 400 });
  const params = new URL(request.url).searchParams;
  const crawl = await loadFullSiteCrawl(scanId);
  const running =
    crawl && ["waiting_homepage", "running"].includes(crawl.status);
  const throttled = await enforceApiV2ScanReadThrottle({
    request: runtimeGraphQuotaRequest(request),
    requestId: crypto.randomUUID(),
    scanId,
    route: "full-site-inventory",
    profile: running ? "status" : "terminal",
    detail: params.has("detailPage") ? "evidence" : "summary",
  });
  if (throttled) return throttled;
  // Public report URLs already allow these scans to be viewed/shared; creation roles do not change report permissions.
  if (!(await getPublicScanStatusProjection(scanId)))
    return new Response(null, { status: 404 });
  const report = await loadFullSiteReport(scanId, params);
  return NextResponse.json(report, {
    status: report ? 200 : 404,
    headers: { "Cache-Control": "private, no-store" },
  });
}

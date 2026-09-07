import { getCurrentUser, getDashboardContext } from "../../../../../../server/auth";
import { loadFullSiteProgress } from "../../../../../../server/scans/full-site-progress";
import { enforceApiV2ScanReadThrottle } from "../../../../../../server/pulse/api-v2-read-throttle";
import { runtimeGraphQuotaRequest } from "../../../../../../server/scans/runtime-evidence-graph-access";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{scanId: string}> }) {
  const { scanId } = await context.params;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(scanId)) return new Response(null, {status:400});
  const user = await getCurrentUser();
  if (!user) return new Response(null, {status:401});
  const { organization } = await getDashboardContext();
  if (!organization) return new Response(null, {status:404});
  const throttled = await enforceApiV2ScanReadThrottle({request: runtimeGraphQuotaRequest(request), requestId:crypto.randomUUID(), scanId, route:"full-site-progress", profile:"status", detail:"summary"});
  if (throttled) return throttled;
  const progress = await loadFullSiteProgress(scanId, organization.id, user.id);
  return Response.json(progress, {status: progress ? 200 : 404, headers:{"Cache-Control":"private, no-store"}});
}

import { getCurrentUser } from "../../../../../server/auth";
import { isPlatformAdminEmail } from "../../../../../server/admin/platform-admin";
import { findOrganizationMembershipByUserId } from "../../../../../server/users/repository";
import { enforceApiV2ScanReadThrottle } from "../../../../../server/pulse/api-v2-read-throttle";
import { loadAnonymousPersistedScanReportProjection, loadPersistedScanReportProjection } from "../../../../../server/scans/scan-report-projection";
import { getOrganizationScanStatusProjection } from "../../../../../server/scans/scan-status-projection";
import { handleRuntimeGraphRead } from "../../../../../server/scans/runtime-evidence-graph-read";
import { hydrateRuntimeGraphForRead } from "../../../../../server/scans/runtime-evidence-graph-storage";
import { loadAuthorizedRuntimeGraphReport, runtimeGraphQuotaRequest } from "../../../../../server/scans/runtime-evidence-graph-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ scanId: string }> }) {
  const { scanId } = await context.params;
  return handleRuntimeGraphRead(request, scanId, {
    // Evidence-detail weight comes from the existing canonical policy, never a new numeric limit.
    throttle: (request, scanId) => enforceApiV2ScanReadThrottle({ request: runtimeGraphQuotaRequest(request), scanId, requestId: crypto.randomUUID(), route: "runtime-evidence-graph", profile: "terminal", detail: "evidence" }),
    loadAuthorized: id => loadAuthorizedRuntimeGraphReport(id, {
      anonymous: scanId => loadAnonymousPersistedScanReportProjection({ scanId }),
      user: getCurrentUser,
      admin: isPlatformAdminEmail,
      membership: findOrganizationMembershipByUserId,
      status: (organizationId, scanId) => getOrganizationScanStatusProjection({ organizationId, scanId }),
      report: loadPersistedScanReportProjection,
    }),
    hydrate: hydrateRuntimeGraphForRead,
  });
}

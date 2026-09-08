import { cancelFullSiteCrawl } from "@website-signal-risk-scanner/db";
import { getCurrentUser, getDashboardContext } from "../../../../../../server/auth";
import { handleFullSiteStop } from "../../../../../../server/scans/full-site-stop";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ scanId: string }> }) {
  return handleFullSiteStop(request, (await context.params).scanId, {
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "",
    currentUser: getCurrentUser,
    organization: async () => (await getDashboardContext()).organization ?? null,
    cancel: cancelFullSiteCrawl,
  });
}

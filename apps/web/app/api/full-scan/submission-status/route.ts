import { NextResponse } from "next/server";
import { getCurrentUser, getDashboardContext } from "../../../../server/auth";
import { isBetterAuthConfigurationError } from "../../../../server/better-auth/env";
import { findScanByClientRequestId } from "../../../../server/scans/client-request";
import { validRequestId } from "./request-id";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const requestId = new URL(request.url).searchParams.get("requestId");
  if (!validRequestId(requestId)) {
    return NextResponse.json({ code: "invalid_request_id", error: "Invalid scan submission request." }, {
      headers: { "Cache-Control": "no-store" },
      status: 400
    });
  }

  let organizationId: string | null = null;
  try {
    const user = await getCurrentUser();
    organizationId = user ? (await getDashboardContext()).organization.id : null;
  } catch (error) {
    if (!isBetterAuthConfigurationError(error)) throw error;
  }

  const scan = await findScanByClientRequestId(requestId);
  if (!scan || (scan.organization_id !== null && scan.organization_id !== organizationId)) {
    return NextResponse.json({ code: "submission_not_found", error: "The scan submission was not accepted." }, {
      headers: { "Cache-Control": "no-store" },
      status: 404
    });
  }

  return NextResponse.json({
    queuedCount: 1,
    recoveredSubmission: true,
    reusedExistingScan: false,
    scanId: scan.id,
    scanUrl: scan.organization_id ? `/app/scans/${scan.id}` : `/scan/${scan.id}`
  }, {
    headers: { "Cache-Control": "no-store" },
    status: 200
  });
}

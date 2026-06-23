import { NextResponse } from "next/server";
import { bootstrapAppUserSession } from "../../../../server/bootstrap-user";
import { getCurrentUser } from "../../../../server/auth";
import {
  getAnonymousOpsScanStatus,
  getOrganizationOpsScanStatus
} from "../../../../server/scans/ops-status";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ScanStatusRouteContext = {
  params: Promise<{
    scanId: string;
  }>;
};

export async function GET(request: Request, context: ScanStatusRouteContext) {
  const { scanId } = await context.params;
  const url = new URL(request.url);
  const includeFindingsParam = url.searchParams.get("includeFindings");
  const includeFindings =
    includeFindingsParam === null ? true : /^(?:1|true)$/i.test(includeFindingsParam);

  if (!/^[0-9a-f-]{32,36}$/i.test(scanId)) {
    return NextResponse.json(
      {
        code: "invalid_scan_id",
        error: "Invalid scan id."
      },
      { status: 400 }
    );
  }

  let status = await getAnonymousOpsScanStatus({ includeFindings, scanId });
  let organizationId: string | null = null;
  let viewerEmail: string | null = null;

  if (!status) {
    const user = await getCurrentUser();

    if (user) {
      const { organization } = await bootstrapAppUserSession(user);
      organizationId = organization.id;
      viewerEmail = user.email;
      status = await getOrganizationOpsScanStatus({
        includeFindings,
        organizationId: organization.id,
        scanId,
        viewerEmail: user.email
      });
    }
  }

  if (!status) {
    return NextResponse.json(
      {
        code: "scan_not_found",
        error: "Scan not found."
      },
      { status: 404 }
    );
  }

  return NextResponse.json(status, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

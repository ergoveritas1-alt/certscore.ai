import { NextResponse } from "next/server";
import {
  authorizeBrowserObservedSignalIngest,
  getBrowserScanRawEvidenceForWs01
} from "../../../../../server/browser-scans/repository";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ browserScanId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const authorization = authorizeBrowserObservedSignalIngest(request);
  if (!authorization.ok) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const { browserScanId } = await context.params;
  const result = await getBrowserScanRawEvidenceForWs01({ browserScanId });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.rawEvidence, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

import { NextResponse } from "next/server";
import {
  authorizeBrowserObservedSignalIngest,
  ingestBrowserScanObservedSignals
} from "../../../../../server/browser-scans/repository";
import { browserScanObservedSignalPackageSchema } from "../../../../../server/browser-scans/schema";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ browserScanId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const authorization = authorizeBrowserObservedSignalIngest(request);
  if (!authorization.ok) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const { browserScanId } = await context.params;
  const payload = await request.json();
  const parsed = browserScanObservedSignalPackageSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      {
        error: issue?.message ?? "Invalid BX01 observed signal package.",
        path: issue?.path.join(".") ?? null
      },
      { status: 400 }
    );
  }

  const result = await ingestBrowserScanObservedSignals({
    browserScanId,
    signalPackage: parsed.data
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(
    {
      browserScanId,
      canonicalScanId: result.canonicalScanId,
      signalCount: result.signalCount,
      status: "observed_signals_ingested"
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

import { NextResponse } from "next/server";
import { getBetterAuthSessionUser } from "../../../../../server/better-auth/session";
import {
  authorizeBrowserScanWrite,
  completeBrowserScanSession,
  getBrowserScanTokenFromRequest
} from "../../../../../server/browser-scans/repository";
import { browserScanCompleteSchema } from "../../../../../server/browser-scans/schema";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ browserScanId: string }>;
};

function getBrowserScanReportUrl(input: {
  anonymous: boolean;
  browserScanId: string;
  canonicalScanId: string | null;
}) {
  if (input.canonicalScanId) {
    return input.anonymous ? `/scan/${input.canonicalScanId}` : `/app/scans/${input.canonicalScanId}`;
  }

  return input.anonymous ? `/browser-scans/${input.browserScanId}` : `/app/browser-scans/${input.browserScanId}`;
}

export async function POST(request: Request, context: RouteContext) {
  const { browserScanId } = await context.params;
  const [user, payload] = await Promise.all([getBetterAuthSessionUser(), request.json()]);
  const authorization = await authorizeBrowserScanWrite({
    browserScanId,
    requestToken: getBrowserScanTokenFromRequest(request),
    user
  });

  if (!authorization.ok) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const parsed = browserScanCompleteSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid browser scan completion payload." },
      { status: 400 }
    );
  }

  const completed = await completeBrowserScanSession({
    browserScanId,
    durationMs: parsed.data.durationMs,
    summary: parsed.data.summary,
    user
  });

  return NextResponse.json(
    {
      browserScanId,
      canonicalScanId: completed.canonicalScanId,
      reportUrl: getBrowserScanReportUrl({
        anonymous: authorization.session.user_id === null,
        browserScanId,
        canonicalScanId: completed.canonicalScanId
      }),
      status: "complete"
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

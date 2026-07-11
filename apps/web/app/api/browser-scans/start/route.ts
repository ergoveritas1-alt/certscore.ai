import { NextResponse } from "next/server";
import { bootstrapAppUserSession } from "../../../../server/bootstrap-user";
import { getBetterAuthSessionUser } from "../../../../server/better-auth/session";
import { createBrowserScanSession } from "../../../../server/browser-scans/repository";
import { browserScanStartSchema } from "../../../../server/browser-scans/schema";

export const dynamic = "force-dynamic";

function getBrowserScanReportUrl(browserScanId: string, _anonymous: boolean) {
  return `/browser-scans/${browserScanId}`;
}

export async function POST(request: Request) {
  const sessionUser = await getBetterAuthSessionUser();

  const parsed = browserScanStartSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid browser scan request." },
      { status: 400 }
    );
  }

  try {
    const user = sessionUser ? (await bootstrapAppUserSession(sessionUser)).user : null;

    const session = await createBrowserScanSession({
      targetUrl: parsed.data.targetUrl,
      user
    });

    return NextResponse.json(
      {
        ...session,
        anonymous: !user,
        reportUrl: getBrowserScanReportUrl(session.browserScanId, !user),
        scanWindowMs: parsed.data.scanWindowMs ?? 15000,
        uploadUrl: `/api/browser-scans/${session.browserScanId}/events`
      },
      {
        headers: { "Cache-Control": "no-store" },
        status: 201
      }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Browser scan could not be started." },
      { status: 400 }
    );
  }
}

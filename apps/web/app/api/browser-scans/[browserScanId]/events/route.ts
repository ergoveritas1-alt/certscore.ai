import { NextResponse } from "next/server";
import { getBetterAuthSessionUser } from "../../../../../server/better-auth/session";
import {
  authorizeBrowserScanWrite,
  getBrowserScanTokenFromRequest,
  insertBrowserScanEvents
} from "../../../../../server/browser-scans/repository";
import { browserScanEventsUploadSchema } from "../../../../../server/browser-scans/schema";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ browserScanId: string }>;
};

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

  const parsed = browserScanEventsUploadSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      {
        error: issue?.message ?? "Invalid browser scan events.",
        path: issue?.path.join(".") ?? null
      },
      { status: 400 }
    );
  }

  const inserted = await insertBrowserScanEvents(browserScanId, parsed.data.events);
  if (!inserted) return NextResponse.json({ error: "Browser scan session is already complete." }, { status: 409 });
  return NextResponse.json({ accepted: parsed.data.events.length }, { headers: { "Cache-Control": "no-store" } });
}

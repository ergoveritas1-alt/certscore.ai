import { NextResponse } from "next/server";
import { getBetterAuthSessionUser } from "../../../../../server/better-auth/session";
import {
  authorizeBrowserScanWrite,
  getBrowserScanTokenFromRequest,
  insertBrowserScanArtifact
} from "../../../../../server/browser-scans/repository";
import { browserScanArtifactSchema } from "../../../../../server/browser-scans/schema";

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

  const parsed = browserScanArtifactSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid browser scan artifact." },
      { status: 400 }
    );
  }

  await insertBrowserScanArtifact({
    artifactJson: parsed.data.artifactJson,
    artifactType: parsed.data.artifactType,
    browserScanId,
    contentType: parsed.data.contentType
  });

  return NextResponse.json({ accepted: true }, { headers: { "Cache-Control": "no-store" } });
}

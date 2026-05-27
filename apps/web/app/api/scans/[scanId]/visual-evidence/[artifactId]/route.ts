import { NextResponse } from "next/server";
import { getVisualEvidenceArtifacts } from "../../../../../../lib/scans/visual-evidence";
import { getCurrentUser } from "../../../../../../server/auth";
import { bootstrapAppUserSession } from "../../../../../../server/bootstrap-user";
import { getScanById } from "../../../../../../server/scans/get-scan-by-id";
import { createSignedStorageUrl } from "../../../../../../server/storage/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    artifactId: string;
    scanId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const [{ artifactId, scanId }, user] = await Promise.all([context.params, getCurrentUser()]);
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { organization } = await bootstrapAppUserSession(user);
  const scanRecord = await getScanById({
    organizationId: organization.id,
    scanId,
    viewerEmail: user.email
  });

  if (!scanRecord) {
    return NextResponse.json({ error: "Scan not found." }, { status: 404 });
  }

  const artifact = getVisualEvidenceArtifacts(scanRecord.runtimeArtifacts).find((candidate) => candidate.id === decodeURIComponent(artifactId));
  if (!artifact || artifact.status !== "available" || !artifact.key) {
    return NextResponse.json({ error: "Visual evidence is unavailable." }, { status: 404 });
  }

  const signedUrl = await createSignedStorageUrl(artifact.key, 300);
  return NextResponse.redirect(signedUrl, {
    headers: {
      "Cache-Control": "private, no-store"
    }
  });
}

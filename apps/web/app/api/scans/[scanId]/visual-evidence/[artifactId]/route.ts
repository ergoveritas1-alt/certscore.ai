import { NextResponse } from "next/server";
import { getVisualEvidenceArtifacts } from "../../../../../../lib/scans/visual-evidence";
import { getPublicScanById } from "../../../../../../server/scans/get-scan-by-id";
import {
  getLocalV2DagReportInput,
  resolveLocalV2DagVisualEvidencePointer
} from "../../../../../../server/scans/local-v2-dag-report";
import { resolveVisualEvidenceDelivery } from "../../../../../../server/scans/visual-evidence-object";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    artifactId: string;
    scanId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { artifactId, scanId } = await context.params;
  const scanRecord = await getPublicScanById(scanId);

  if (!scanRecord) {
    return NextResponse.json({ error: "Scan not found." }, { status: 404 });
  }

  const decodedArtifactId = decodeURIComponent(artifactId);
  const storedArtifact = getVisualEvidenceArtifacts(scanRecord.runtimeArtifacts)
    .find((candidate) => candidate.id === decodedArtifactId) ?? null;
  const artifact = storedArtifact ?? (getLocalV2DagReportInput(scanRecord)
    ? await resolveLocalV2DagVisualEvidencePointer(scanRecord, decodedArtifactId)
    : null);
  if (!artifact || artifact.status !== "available" || !artifact.key) {
    return NextResponse.json({ error: "Visual evidence is unavailable." }, { status: 404 });
  }

  const delivery = await resolveVisualEvidenceDelivery({
    bucket: artifact.bucket,
    contentType: artifact.mimeType,
    key: artifact.key
  });
  if (!delivery) {
    return NextResponse.json({ error: "Visual evidence is unavailable." }, { status: 404 });
  }
  if (delivery.kind === "redirect") {
    return NextResponse.redirect(delivery.url, {
      headers: { "Cache-Control": "private, no-store" }
    });
  }
  const { object } = delivery;
  return new NextResponse(new Blob([Uint8Array.from(object.body)], { type: object.contentType }), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": object.contentType,
      "X-Content-Type-Options": "nosniff"
    }
  });
}

import { NextResponse } from "next/server";
import {
  getPublicOpsScanStatus
} from "../../../../server/scans/ops-status";
import {
  buildLightweightScanStatusResponse,
  getPublicScanStatusProjection,
  type ScanStatusProjection
} from "../../../../server/scans/scan-status-projection";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ScanStatusRouteContext = {
  params: Promise<{
    scanId: string;
  }>;
};

async function materializeCompletedScoreAssessment(projection: ScanStatusProjection) {
  if (projection.status !== "completed" || !projection.reportReady) return;
  try {
    const { persistCompletedLegacyGdprEprivacyAssessment } = await import(
      "../../../../server/scans/score-assessment-lifecycle"
    );
    const result = await persistCompletedLegacyGdprEprivacyAssessment({
      organizationId: projection.organizationId,
      scanId: projection.id,
      scoredAt: projection.completedAt
    });
    console.info(JSON.stringify({
      event: "scan.score_assessment.lifecycle",
      inserted: result.inserted,
      reason: result.reason,
      scanId: projection.id,
      scoreVersion: "gdpr-eprivacy-evidence.legacy-v1",
      postureInserted: "postureInserted" in result ? result.postureInserted : false,
      postureReason: "postureReason" in result ? result.postureReason : null,
      shadowInserted: "shadowInserted" in result ? result.shadowInserted : false,
      shadowModelVersion: "shadowModelVersion" in result ? result.shadowModelVersion : null,
      shadowReason: "shadowReason" in result ? result.shadowReason : null
    }));
  } catch (error) {
    console.error("[score-assessment] status-finalization persistence failed", {
      error: error instanceof Error ? error.message : String(error),
      scanId: projection.id,
      scoreVersion: "gdpr-eprivacy-evidence.legacy-v1"
    });
  }
}

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

  const projection = await getPublicScanStatusProjection(scanId);
  if (!projection) {
    return NextResponse.json(
      { code: "scan_not_found", error: "Scan not found." },
      { status: 404 }
    );
  }

  await materializeCompletedScoreAssessment(projection);

  if (!includeFindings) {
    console.info(JSON.stringify({
      event: "scan.progress_status_request",
      scanId,
      status: projection.status
    }));
    return NextResponse.json(buildLightweightScanStatusResponse(projection), {
      headers: { "Cache-Control": "no-store" }
    });
  }

  const status = await getPublicOpsScanStatus({ includeFindings: true, scanId });

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

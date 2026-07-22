import { NextResponse } from "next/server";
import {
  authorizeScoreMaterializationRequest,
  completeScoreMaterializationRequest,
  recordScoreMaterializationRequestError
} from "../../../../server/scans/score-materialization-request-repository";
import { persistCompletedLegacyGdprEprivacyAssessment } from "../../../../server/scans/score-assessment-lifecycle";
import { materializeAdminScanSummary } from "../../../../server/admin/admin-scan-summary";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function complete(result: {
  reason: string;
  shadowModelVersion?: string | null;
  shadowReason?: string | null;
}) {
  return (result.reason === "inserted" || result.reason === "already_persisted") &&
    (result.shadowReason === "inserted" || result.shadowReason === "already_persisted") &&
    Boolean(result.shadowModelVersion);
}

export async function POST(request: Request) {
  let scanId: string | null = null;
  try {
    const body = await request.json() as { scanId?: unknown; token?: unknown };
    scanId = typeof body.scanId === "string" ? body.scanId : null;
    const token = typeof body.token === "string" ? body.token : null;
    if (!scanId || !/^[0-9a-f-]{36}$/i.test(scanId) || !token || !/^[A-Za-z0-9_-]{40,80}$/.test(token)) {
      return NextResponse.json({ error: "Invalid materialization request." }, { status: 400 });
    }
    const authorization = await authorizeScoreMaterializationRequest({ scanId, token });
    if (!authorization) {
      return NextResponse.json({ error: "Materialization request is not authorized." }, { status: 401 });
    }
    const result = await persistCompletedLegacyGdprEprivacyAssessment({
      organizationId: authorization.organizationId,
      scanId
    });
    if (!complete(result)) {
      throw new Error(
        `Score persistence incomplete (legacy=${result.reason}, shadow=${"shadowReason" in result ? result.shadowReason : "missing"}).`
      );
    }
    const adminSummary = await materializeAdminScanSummary(scanId, authorization.organizationId);
    if (!adminSummary) {
      throw new Error("Admin scan summary persistence was incomplete.");
    }
    await completeScoreMaterializationRequest(scanId);
    return NextResponse.json({
      complete: true,
      legacyReason: result.reason,
      shadowModelVersion: "shadowModelVersion" in result ? result.shadowModelVersion : null,
      shadowReason: "shadowReason" in result ? result.shadowReason : null
    });
  } catch (error) {
    if (scanId && /^[0-9a-f-]{36}$/i.test(scanId)) {
      await recordScoreMaterializationRequestError(scanId, error).catch(() => undefined);
    }
    console.error("[score-assessment] completion materialization failed", {
      error: error instanceof Error ? error.message : String(error),
      scanId
    });
    return NextResponse.json({ error: "Score materialization failed." }, { status: 503 });
  }
}

import { NextResponse } from "next/server";
import {
  authorizeScoreMaterializationRequest,
  completeScoreMaterializationRequest,
  failScoreMaterializationRequest,
  recordScoreMaterializationRequestError
} from "../../../../server/scans/score-materialization-request-repository";
import { persistCompletedLegacyGdprEprivacyAssessment } from "../../../../server/scans/score-assessment-lifecycle";
import { persistAdminScanSummaryForRecord } from "../../../../server/admin/admin-scan-summary";
import { getAnonymousScanById, getScanById } from "../../../../server/scans/get-scan-by-id";
import { materializeLocalV2DagScanDetail } from "../../../../server/scans/local-v2-dag-report";
import { classifyScoreMaterializationFailure } from "../../../../server/scans/score-materialization-failure";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function complete(result: {
  reason: string;
}) {
  return result.reason === "inserted" || result.reason === "already_persisted";
}

async function timedMaterializationPhase<T>(
  scanId: string,
  phase: "scan_materialization" | "score_persistence",
  operation: () => Promise<T>,
) {
  const startedAt = Date.now();
  try {
    const result = await operation();
    console.info("[scan-materialization] phase completed", {
      durationMs: Date.now() - startedAt,
      phase,
      scanId,
    });
    return result;
  } catch (error) {
    console.error("[scan-materialization] phase failed", {
      durationMs: Date.now() - startedAt,
      errorName: error instanceof Error ? error.name : "UnknownError",
      phase,
      scanId,
    });
    throw error;
  }
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
    const authorizedScanId = scanId;
    const authorization = await authorizeScoreMaterializationRequest({ scanId: authorizedScanId, token });
    if (!authorization) {
      return NextResponse.json({ error: "Materialization request is not authorized." }, { status: 401 });
    }
    const rawRecord = authorization.organizationId
      ? await getScanById({ organizationId: authorization.organizationId, scanId: authorizedScanId })
      : await getAnonymousScanById(authorizedScanId);
    if (!rawRecord) {
      throw new Error("Completed scan record was not available for materialization.");
    }
    const scanRecord = await timedMaterializationPhase(authorizedScanId, "scan_materialization", () =>
      materializeLocalV2DagScanDetail(rawRecord)
    );
    const result = await timedMaterializationPhase(authorizedScanId, "score_persistence", () =>
      persistCompletedLegacyGdprEprivacyAssessment({
        organizationId: authorization.organizationId,
        scanId: authorizedScanId,
        scanRecord,
      })
    );
    if (!complete(result)) {
      throw new Error(`Score persistence incomplete (legacy=${result.reason}).`);
    }
    const adminSummary = await persistAdminScanSummaryForRecord(scanRecord, {
      runtimeArtifacts: rawRecord.runtimeArtifacts,
      snapshot: rawRecord.snapshot,
    });
    if (!adminSummary) {
      throw new Error("Admin scan summary persistence was incomplete.");
    }
    await completeScoreMaterializationRequest(authorizedScanId);
    return NextResponse.json({
      complete: true,
      legacyReason: result.reason
    });
  } catch (error) {
    const disposition = classifyScoreMaterializationFailure(error);
    if (scanId && /^[0-9a-f-]{36}$/i.test(scanId)) {
      if (disposition.retryable) {
        await recordScoreMaterializationRequestError(scanId, disposition.diagnostic).catch(() => undefined);
      } else {
        await failScoreMaterializationRequest(scanId, disposition.diagnostic).catch(() => undefined);
      }
    }
    console.error("[score-assessment] completion materialization failed", {
      code: disposition.code,
      errorName: error instanceof Error ? error.name : "UnknownError",
      retryable: disposition.retryable,
      scanId
    });
    return NextResponse.json({
      code: disposition.code,
      error: "Score materialization failed.",
      retryable: disposition.retryable,
    }, { status: disposition.retryable ? 503 : 422 });
  }
}

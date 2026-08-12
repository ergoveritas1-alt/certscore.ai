import { NextResponse } from "next/server";
import {
  authorizeScoreMaterializationRequest,
  completeScoreMaterializationRequest,
  failScoreMaterializationRequest,
  recordScoreMaterializationRequestError
} from "../../../../server/scans/score-materialization-request-repository";
import { persistCompletedLegacyGdprEprivacyAssessment } from "../../../../server/scans/score-assessment-lifecycle";
import { persistAdminScanSummaryForPublishedRecord } from "../../../../server/admin/admin-scan-summary";
import { getAnonymousScanById, getScanById } from "../../../../server/scans/get-scan-by-id";
import { materializeLocalV2DagScanDetail } from "../../../../server/scans/local-v2-dag-report";
import {
  loadPersistedScanReportProjection,
  persistScanReportProjection,
} from "../../../../server/scans/scan-report-projection";
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
  phase: "projection_verification" | "report_projection" | "scan_materialization" | "score_persistence",
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
      errorMessage: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
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
    const body = await request.json() as { mode?: unknown; scanId?: unknown; token?: unknown };
    scanId = typeof body.scanId === "string" ? body.scanId : null;
    const token = typeof body.token === "string" ? body.token : null;
    const mode = body.mode === "publish_report" || body.mode === "finalize"
      ? body.mode
      : "publish_and_finalize";
    if (!scanId || !/^[0-9a-f-]{36}$/i.test(scanId) || !token || !/^[A-Za-z0-9_-]{40,80}$/.test(token)) {
      return NextResponse.json({ error: "Invalid materialization request." }, { status: 400 });
    }
    const authorizedScanId = scanId;
    const authorization = await authorizeScoreMaterializationRequest({ scanId: authorizedScanId, token });
    if (!authorization) {
      return NextResponse.json({ error: "Materialization request is not authorized." }, { status: 401 });
    }
    let canonicalScanRecord = mode === "finalize"
      ? await timedMaterializationPhase(
        authorizedScanId,
        "projection_verification",
        () => loadPersistedScanReportProjection({
          organizationId: authorization.organizationId,
          scanId: authorizedScanId,
        })
      )
      : null;
    if (mode !== "finalize") {
      const rawRecord = authorization.organizationId
        ? await getScanById({ organizationId: authorization.organizationId, scanId: authorizedScanId })
        : await getAnonymousScanById(authorizedScanId);
      if (!rawRecord) {
        throw new Error("Completed scan record was not available for materialization.");
      }
      const scanRecord = await timedMaterializationPhase(authorizedScanId, "scan_materialization", () =>
        materializeLocalV2DagScanDetail(rawRecord)
      );
      // Report publication is the customer-visible readiness boundary. Keep
      // it canonical and verified, then yield the HTTP request before trailing
      // Admin and legacy-score persistence so status polling is not starved.
      await timedMaterializationPhase(authorizedScanId, "report_projection", () =>
        persistScanReportProjection(scanRecord, {
          runtimeArtifacts: scanRecord.runtimeArtifacts,
          snapshot: scanRecord.snapshot,
        })
      );
      canonicalScanRecord = await timedMaterializationPhase(
        authorizedScanId,
        "projection_verification",
        () => loadPersistedScanReportProjection({
          organizationId: authorization.organizationId,
          scanId: authorizedScanId,
        })
      );
    }
    if (!canonicalScanRecord) {
      throw new Error("Canonical report projection could not be verified after publication.");
    }
    if (mode === "publish_report") {
      return NextResponse.json({
        complete: false,
        reportReady: true,
      });
    }
    // Trailing persistence consumes the verified canonical projection. It may
    // finish after the report becomes visible, but the SQS result remains
    // leased until both writes are durably acknowledged.
    const adminSummary = await persistAdminScanSummaryForPublishedRecord(canonicalScanRecord);
    if (!adminSummary) {
      throw new Error("Admin scan summary persistence was incomplete.");
    }
    const result = await timedMaterializationPhase(authorizedScanId, "score_persistence", () =>
      persistCompletedLegacyGdprEprivacyAssessment({
        organizationId: authorization.organizationId,
        scanId: authorizedScanId,
        scanRecord: canonicalScanRecord,
      })
    );
    if (!complete(result)) {
      throw new Error(`Score persistence incomplete (legacy=${result.reason}).`);
    }
    await completeScoreMaterializationRequest(authorizedScanId);
    return NextResponse.json({
      complete: true,
      legacyReason: result.reason
    });
  } catch (error) {
    const disposition = classifyScoreMaterializationFailure(error);
    let retryable = disposition.retryable;
    let retryAfterSeconds = disposition.retryAfterSeconds;
    let code: string = disposition.code;
    if (scanId && /^[0-9a-f-]{36}$/i.test(scanId)) {
      if (disposition.retryable) {
        const schedule = await recordScoreMaterializationRequestError(scanId, disposition.diagnostic)
          .catch(() => null);
        if (schedule) {
          retryable = schedule.retryable;
          retryAfterSeconds = schedule.retryAfterSeconds;
          if (!schedule.retryable) code = "retry_exhausted";
        }
      } else {
        await failScoreMaterializationRequest(scanId, disposition.diagnostic).catch(() => undefined);
      }
    }
    console.error("[score-assessment] completion materialization failed", {
      code,
      diagnostic: disposition.diagnostic,
      errorName: error instanceof Error ? error.name : "UnknownError",
      retryAfterSeconds: retryAfterSeconds ?? null,
      retryable,
      scanId
    });
    return NextResponse.json({
      code,
      error: "Score materialization failed.",
      retryAfterSeconds,
      retryable,
    }, { status: retryable ? 503 : 422 });
  }
}

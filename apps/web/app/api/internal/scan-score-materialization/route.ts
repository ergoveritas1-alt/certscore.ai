import { REPORT_ARTIFACT_TRANSFER_MAX_REQUEST_BYTES } from "../../../../../../packages/shared/src/report-artifact-transfer";
import { NextResponse } from "next/server";
import {
  authorizeScoreMaterializationRequest,
  completeScoreMaterializationRequest,
  failScoreMaterializationRequest,
  recordScoreMaterializationRequestError
} from "../../../../server/scans/score-materialization-request-repository";
import { persistCompletedLegacyGdprEprivacyAssessment } from "../../../../server/scans/score-assessment-lifecycle";
import { persistAdminScanSummaryForPublishedRecord } from "../../../../server/admin/admin-scan-summary";
import { loadPersistedScanReportProjection } from "../../../../server/scans/scan-report-projection";
import { publishCanonicalScanReportProjection } from "../../../../server/scans/canonical-scan-report-publisher";
import { classifyScoreMaterializationFailure, serializeScoreMaterializationFailure } from "../../../../server/scans/score-materialization-failure";

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
      diagnostic: serializeScoreMaterializationFailure(classifyScoreMaterializationFailure(error)),
      errorName: error instanceof Error ? error.name : "UnknownError",
      phase,
      scanId,
    });
    throw new Error(`Score lifecycle ${phase.replaceAll("_", "-")} failed.`, {cause:error});
  }
}

export async function POST(request: Request) {
  let scanId: string | null = null;
  let authorizedRequest: {scanId:string;token:string} | null = null;
  try {
    // Bound even unauthenticated bodies before decoding compressed hints.
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > REPORT_ARTIFACT_TRANSFER_MAX_REQUEST_BYTES) {
            await reader.cancel();
            return NextResponse.json({ error: "Materialization request is too large." }, { status: 413 });
          }
          chunks.push(chunk.value);
        }
      } finally { reader.releaseLock(); }
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
      mode?: unknown; scanId?: unknown; token?: unknown; artifactTransfer?: unknown;
    };
    scanId = typeof body.scanId === "string" ? body.scanId : null;
    const token = typeof body.token === "string" ? body.token : null;
    const mode = body.mode === "publish_report" || body.mode === "finalize" || body.mode === "publish_and_finalize"
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
    authorizedRequest = {scanId:authorizedScanId,token};
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
      // Report publication is the customer-visible readiness boundary. Keep
      // it canonical and verified, then yield the HTTP request before trailing
      // Admin and legacy-score persistence so status polling is not starved.
      const publication = await timedMaterializationPhase(authorizedScanId, "report_projection", () =>
        publishCanonicalScanReportProjection({
          organizationId: authorization.organizationId,
          scanId: authorizedScanId,
          artifactTransfer: body.artifactTransfer,
          publicationTrigger: "authorized_worker",
        })
      );
      if (publication.status === "finalizing") {
        // Reuse the worker's existing bounded retry. Contention is not a failed
        // materialization attempt and must not reset its durable request.
        return NextResponse.json({
          code: "materialization_not_ready", retryAfterSeconds: 1, retryable: true,
          reportReady: false,
        }, { status: 503, headers: { "Retry-After": "1" } });
      }
      if (publication.status !== "ready") {
        throw new Error("Completed scan record was not available for materialization.");
      }
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
    const diagnostic = serializeScoreMaterializationFailure(disposition);
    let retryable = disposition.retryable;
    let retryAfterSeconds = disposition.retryAfterSeconds;
    let code: string = disposition.code;
    if (!authorizedRequest && !retryable) {
      retryable = true;
      retryAfterSeconds = 1;
      code = "failure_persistence_unavailable";
    }
    if (authorizedRequest) {
      if (disposition.retryable) {
        const schedule = await recordScoreMaterializationRequestError(authorizedRequest.scanId, diagnostic)
          .catch(() => null);
        if (schedule) {
          retryable = schedule.retryable;
          retryAfterSeconds = schedule.retryAfterSeconds;
          if (!schedule.retryable) code = "retry_exhausted";
        }
      } else {
        try {
          await failScoreMaterializationRequest(authorizedRequest.scanId, diagnostic, authorizedRequest.token);
          console.error(JSON.stringify({event:"scan.report_publication.blocked",scanId:authorizedRequest.scanId,
            code:disposition.code,diagnostic,retryable:false}));
        } catch {
          // A terminal acknowledgement is valid only after the durable state
          // transition. Recovery must remain possible if that write fails.
          retryable = true;
          retryAfterSeconds = 1;
          code = "failure_persistence_unavailable";
        }
      }
    }
    console.error("[score-assessment] completion materialization failed", {
      code,
      diagnostic,
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
    }, { status: retryable ? 503 : 422,
      ...(retryable && retryAfterSeconds ? {headers:{"Retry-After":String(retryAfterSeconds)}} : {}),
    });
  }
}

import { after, NextResponse } from "next/server";
import {
  createDomainRequestSchema,
  normalizeScanFrom,
  parseDomainBatchInput,
  type ScanFrom
} from "@website-signal-risk-scanner/shared";
import { getCurrentUser } from "../../../server/auth";
import { isBetterAuthConfigurationError } from "../../../server/better-auth/env";
import { checkDomainDns, isDomainDnsPreflightError } from "../../../server/domains/domain-dns";
import { createOrQueueDomainScan } from "../../../server/domains/create-domain";
import { createAnonymousFullScan } from "../../../server/scans/create-anonymous-full-scan";
import {
  type LocalV2DagLambdaDebugOverrides,
  normalizeLocalV2DagRunViaLambda,
  normalizeLocalV2DagScanProfile,
  shouldUseLocalhostFullScanQueue
} from "../../../server/scans/local-v2-dag-scan-config";
import {
  restrictLocalV2RunViaLambdaForUser,
  restrictScanFromForUser
} from "../../../server/scans/restricted-scan-options";
import { createPreviewScan } from "../../../server/preview-scan/create-preview-scan";
import { getFullScanQueueErrorCode } from "./full-scan-errors";
import { shouldBypassDnsValidationForProductionLoadTest } from "./load-test-intake";
import { findScanByClientRequestId } from "../../../server/scans/client-request";
import { isAnonymousScanQuotaError } from "../../../server/pulse/anonymous-scan-quota";
import { getScanRequesterIpContext } from "../../../server/scans/requester-ip-context";
import { normalizeCampaignAttribution } from "../../../lib/attribution/campaign-attribution";
import { addAnonymousScanClaimCookie } from "../../../server/scans/anonymous-scan-claims";

function isPublicFullScanAvailabilityError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return /DATABASE_URL|Invalid environment configuration|Scanner health check failed|residential geo scanner configuration/i.test(message);
}

function getScanRequestContext(request: Request) {
  const headers = request.headers;
  const source = headers.get("x-certscore-scan-source")?.trim() || "api-full-scan";
  const requesterIpContext = getScanRequesterIpContext(headers);
  const githubRunId = headers.get("x-github-run-id")?.trim() || null;
  const githubWorkflow = headers.get("x-github-workflow")?.trim() || null;
  const githubActor = headers.get("x-github-actor")?.trim() || null;
  const githubSha = headers.get("x-github-sha")?.trim() || null;

  return {
    provenance: {
      githubActor,
      githubRunId,
      githubSha,
      githubWorkflow,
      host: headers.get("host")?.trim() || null,
      originIp: requesterIpContext.ipHash,
      source,
      userAgent: headers.get("user-agent")?.slice(0, 240) || null
    },
    requesterIpContext
  };
}

function parseForceNewScan(value: unknown) {
  return value === true || value === "true" || value === "1";
}

function normalizePublicScanFrom(value: unknown): ScanFrom {
  return normalizeScanFrom(value);
}

function parseLocalV2DagLambdaDebugOverrides(value: unknown): LocalV2DagLambdaDebugOverrides | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const overrides: LocalV2DagLambdaDebugOverrides = {};
  const scenarioResourceMode = record.scenarioResourceMode;
  if (scenarioResourceMode === "normal" || scenarioResourceMode === "lean" || scenarioResourceMode === "cmp_safe") {
    overrides.scenarioResourceMode = scenarioResourceMode;
  }
  if (record.strongEvidenceMode === "webmd") {
    overrides.strongEvidenceMode = "webmd";
  }
  const actionFinalSettleMs = boundedDebugInteger(record.actionFinalSettleMs, 350, 10_000);
  if (actionFinalSettleMs !== null) {
    overrides.actionFinalSettleMs = actionFinalSettleMs;
  }
  const actionSearchDeadlineMs = boundedDebugInteger(record.actionSearchDeadlineMs, 1_000, 20_000);
  if (actionSearchDeadlineMs !== null) {
    overrides.actionSearchDeadlineMs = actionSearchDeadlineMs;
  }
  const consentFlowDeadlineMs = boundedDebugInteger(record.consentFlowDeadlineMs, 10_000, 90_000);
  if (consentFlowDeadlineMs !== null) {
    overrides.consentFlowDeadlineMs = consentFlowDeadlineMs;
  }
  const lateConsentGateMs = boundedDebugInteger(record.lateConsentGateMs, 3_000, 10_000);
  if (lateConsentGateMs !== null) {
    overrides.lateConsentGateMs = lateConsentGateMs;
  }
  const preActionObservationMs = boundedDebugInteger(record.preActionObservationMs, 0, 12_000);
  if (preActionObservationMs !== null) {
    overrides.preActionObservationMs = preActionObservationMs;
  }
  const scenarioConcurrency = boundedDebugInteger(record.scenarioConcurrency, 1, 4);
  if (scenarioConcurrency !== null) {
    overrides.scenarioConcurrency = scenarioConcurrency;
  }
  return Object.keys(overrides).length > 0 ? overrides : null;
}

function boundedDebugInteger(value: unknown, min: number, max: number): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.trunc(parsed))) : null;
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const campaignAttribution = normalizeCampaignAttribution(payload?.campaignAttribution);
    const forceNewScan = parseForceNewScan(payload?.forceNewScan);
    const localV2DagScanProfile = normalizeLocalV2DagScanProfile(payload?.localV2ScanProfile ?? payload?.v2ScanProfile);
    const scanFrom = normalizePublicScanFrom(payload?.scanFrom ?? payload?.geo);
    const requestedLocalV2DagRunViaLambda = normalizeLocalV2DagRunViaLambda(
      payload?.localV2RunViaLambda ?? payload?.localV2DagRunViaLambda ?? payload?.v2RunViaLambda,
      process.env,
      scanFrom
    );
    const localV2DagRunViaLambda = shouldUseLocalhostFullScanQueue(process.env)
      ? false
      : requestedLocalV2DagRunViaLambda;
    const localV2DagLambdaDebugOverrides = parseLocalV2DagLambdaDebugOverrides(
      payload?.localV2DagLambdaDebugOverrides ?? payload?.v2LambdaDebugOverrides
    );
    const { provenance, requesterIpContext } = getScanRequestContext(request);
    const rawDomain = typeof payload?.domain === "string" ? payload.domain : "";
    const parsedBatch = parseDomainBatchInput(rawDomain);

    if (parsedBatch.valid.length === 0) {
      const singleResult = createDomainRequestSchema.safeParse(payload);
      return NextResponse.json(
        {
          code: "invalid_domain",
          error:
            singleResult.success
              ? "Invalid full scan request."
              : singleResult.error.issues[0]?.message ?? "Invalid full scan request."
        },
        { status: 400 }
      );
    }

    const intakeDomains = parsedBatch.valid;
    const shouldBypassDnsValidation = shouldBypassDnsValidationForProductionLoadTest(provenance);

    if (!shouldBypassDnsValidation) {
      const dnsStatuses = await Promise.all(
        intakeDomains.map(async (item) => ({
          domain: item.domain,
          status: await checkDomainDns(item.hostname)
        }))
      );
      const failedDnsStatus = dnsStatuses.find((item) => !item.status.exists);

      if (failedDnsStatus) {
        return NextResponse.json(
          {
            code: "domain_not_found",
            error:
              intakeDomains.length === 1
                ? failedDnsStatus.status.reason
                : `${failedDnsStatus.domain}: ${failedDnsStatus.status.reason}`
          },
          { status: 400 }
        );
      }
    }

    let user = null;

    try {
      user = await getCurrentUser();
    } catch (error) {
      if (!isBetterAuthConfigurationError(error)) {
        throw error;
      }

      console.error("[full-scan] better auth configuration unavailable; using anonymous scan flow", {
        error: error instanceof Error ? error.message : String(error)
      });
    }

    if (!user) {
      const firstDomain = intakeDomains[0];
      const publicScanFrom = restrictScanFromForUser({
        canUseRestrictedScanOptions: false,
        scanFrom
      });
      const publicLocalV2DagRunViaLambda = restrictLocalV2RunViaLambdaForUser({
        canUseRestrictedScanOptions: false,
        localV2DagRunViaLambda
      });

      if (!firstDomain) {
        return NextResponse.json(
          {
            error: "Invalid full scan request."
          },
          { status: 400 }
        );
      }

      const clientRequestId = typeof payload?.requestId === "string" ? payload.requestId : null;
      const anonymousProvenance = provenance.source === "homepage"
        ? { ...provenance, source: "homepage-anonymous" }
        : provenance;
      const existingClientScan = await findScanByClientRequestId(clientRequestId);
      if (existingClientScan) {
        return NextResponse.json(
          {
            queuedCount: 1,
            reusedExistingScan: false,
            scanId: existingClientScan.id,
            scanUrl: `/scan/${existingClientScan.id}`
          },
          { headers: { "Cache-Control": "no-store" }, status: 202 }
        );
      }

      const anonymousScan = await createAnonymousFullScan({
        bypassRecentScanReuse: forceNewScan,
        clientRequestId,
        hostname: firstDomain.hostname,
        localV2DagLambdaDebugOverrides,
        localV2DagScanProfile,
        localV2DagRunViaLambda: publicLocalV2DagRunViaLambda,
        normalizedUrl: firstDomain.normalizedUrl,
        provenance: anonymousProvenance,
        requesterIpContext,
        scheduleBackgroundTask: (task) => after(task),
        scanFrom: publicScanFrom,
        campaignAttribution
      }).catch(async (error) => {
        const message = error instanceof Error ? error.message : String(error);

        if (!/healthy scanner service heartbeat/i.test(message)) {
          throw error;
        }

        const preview = await createPreviewScan({
          hostname: firstDomain.hostname,
          localV2DagScanProfile,
          localV2DagRunViaLambda: publicLocalV2DagRunViaLambda,
          normalizedUrl: firstDomain.normalizedUrl,
          scanFrom: publicScanFrom
        });

        return {
          code: "preview_fallback" as const,
          mode: "preview" as const,
          scan: preview.scan
        };
      });

      const response = NextResponse.json(
        {
          queuedCount: 1,
          reusedExistingScan: "reusedExistingScan" in anonymousScan ? anonymousScan.reusedExistingScan : false,
          scanId: anonymousScan.scan.id,
          scanUrl:
            "mode" in anonymousScan && anonymousScan.mode === "preview"
              ? `/scan/${anonymousScan.scan.id}`
              : `/scan/${anonymousScan.scan.id}`,
          warning:
            "mode" in anonymousScan && anonymousScan.mode === "preview"
              ? {
                  code: "scanner_heartbeat_degraded",
                  message: "Full scan queue health was degraded, so a preview scan was started instead."
                }
              : null
        },
        {
          headers: {
            "Cache-Control": "no-store"
          },
          status: "reusedExistingScan" in anonymousScan && anonymousScan.reusedExistingScan ? 200 : 202
        }
      );
      if ("mode" in anonymousScan && anonymousScan.mode !== "preview") {
        await addAnonymousScanClaimCookie(response, anonymousScan.scan.id);
      }
      return response;
    }

    const clientRequestId = typeof payload?.requestId === "string" ? payload.requestId : null;
    const existingAuthenticatedScan = await findScanByClientRequestId(clientRequestId);
    if (existingAuthenticatedScan) {
      return NextResponse.json(
        {
          queuedCount: 1,
          reusedExistingScan: false,
          scanId: existingAuthenticatedScan.id,
          scanUrl: `/app/scans/${existingAuthenticatedScan.id}`
        },
        { headers: { "Cache-Control": "no-store" }, status: 202 }
      );
    }

    const scans = await Promise.all(
      intakeDomains.map((item) =>
        createOrQueueDomainScan({
          allowExistingDomainRescan: true,
          bypassRecentScanReuse: forceNewScan,
          clientRequestId,
          domain: item.normalizedUrl,
          localV2DagScanProfile,
          localV2DagRunViaLambda,
          provenance,
          requesterIpContext,
          scheduleBackgroundTask: (task) => after(task),
          scanFrom,
          campaignAttribution
        })
      )
    );
    // Once a scan ID exists, the request was accepted and must never be
    // reported as rejected-before-queueing. A later dispatch or bookkeeping
    // error belongs to that scan's status/report flow.
    const queuedScans = scans.filter((scan) => Boolean(scan.scanId));

    if (queuedScans.length === 0) {
      const error = scans.find((scan) => scan.error)?.error ?? "The full scan could not be started.";

      return NextResponse.json(
        {
          code: getFullScanQueueErrorCode(error),
          error
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        queuedCount: queuedScans.length,
        reusedExistingScan: queuedScans.length === 1 ? Boolean(queuedScans[0]?.reusedExistingScan) : false,
        scanId: queuedScans[0]?.scanId ?? null,
        scanUrl: queuedScans.length === 1 ? `/app/scans/${queuedScans[0]?.scanId}` : "/app/scans"
      },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: queuedScans.length === 1 && queuedScans[0]?.reusedExistingScan ? 200 : 202
      }
    );
  } catch (error) {
    if (isDomainDnsPreflightError(error)) {
      return NextResponse.json(
        { code: error.code, error: error.message },
        {
          headers: {
            "Cache-Control": "no-store",
            ...(error.retryAfterSeconds ? { "Retry-After": String(error.retryAfterSeconds) } : {})
          },
          status: error.retryable ? 503 : 400
        }
      );
    }
    if (isAnonymousScanQuotaError(error)) {
      return NextResponse.json(
        {
          code: error.code,
          creationRateLimit: {
            kind: error.window === "concurrent" ? "concurrency" : "new_scan",
            limit: error.limit,
            remaining: 0,
            scope: error.scope,
            used: error.used ?? error.limit,
            windowId: error.window,
            windowSeconds: error.windowSeconds
          },
          error: error.message,
          retryAfterSeconds: error.retryAfterSeconds
        },
        {
          headers: {
            "Cache-Control": "no-store",
            "X-CertScore-RateLimit-Limit": String(error.limit),
            "X-CertScore-RateLimit-Scope": error.scope,
            "X-CertScore-RateLimit-Window": error.window,
            "Retry-After": String(error.retryAfterSeconds)
          },
          status: 429
        }
      );
    }

    if (isBetterAuthConfigurationError(error) || isPublicFullScanAvailabilityError(error)) {
      console.error("[full-scan] public full scan unavailable during request", {
        error: error instanceof Error ? error.message : String(error)
      });

      return NextResponse.json(
        {
          code: "scan_queue_unavailable",
          error: "The full scan could not be started right now. Please try again."
        },
        {
          status: 503
        }
      );
    }

    return NextResponse.json(
      {
        code: "full_scan_server_error",
        error: error instanceof Error ? error.message : "Full scan could not be created."
      },
      {
        status: 500
      }
    );
  }
}

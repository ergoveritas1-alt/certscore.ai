import { NextResponse } from "next/server";
import { createDomainRequestSchema, normalizeScanFrom, parseDomainBatchInput } from "@website-signal-risk-scanner/shared";
import { getCurrentUser } from "../../../server/auth";
import { isBetterAuthConfigurationError } from "../../../server/better-auth/env";
import { checkDomainDns } from "../../../server/domains/domain-dns";
import { createOrQueueDomainScan } from "../../../server/domains/create-domain";
import { createAnonymousFullScan } from "../../../server/scans/create-anonymous-full-scan";
import {
  normalizeLocalV2DagRunViaLambda,
  normalizeLocalV2DagScanProfile
} from "../../../server/scans/local-v2-dag-scan-config";
import { createPreviewScan } from "../../../server/preview-scan/create-preview-scan";
import { getFullScanQueueErrorCode } from "./full-scan-errors";
import { shouldBypassDnsValidationForProductionLoadTest } from "./load-test-intake";

function isPublicFullScanAvailabilityError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return /DATABASE_URL|Invalid environment configuration|Scanner health check failed|residential geo scanner configuration/i.test(message);
}

function getFirstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

function getScanRequestProvenance(request: Request) {
  const headers = request.headers;
  const source = headers.get("x-certscore-scan-source")?.trim() || "api-full-scan";
  const originIp =
    getFirstHeaderValue(headers.get("cf-connecting-ip")) ??
    getFirstHeaderValue(headers.get("x-forwarded-for")) ??
    getFirstHeaderValue(headers.get("x-real-ip"));
  const githubRunId = headers.get("x-github-run-id")?.trim() || null;
  const githubWorkflow = headers.get("x-github-workflow")?.trim() || null;
  const githubActor = headers.get("x-github-actor")?.trim() || null;
  const githubSha = headers.get("x-github-sha")?.trim() || null;

  return {
    githubActor,
    githubRunId,
    githubSha,
    githubWorkflow,
    host: headers.get("host")?.trim() || null,
    originIp,
    source,
    userAgent: headers.get("user-agent")?.slice(0, 240) || null
  };
}

function parseForceNewScan(value: unknown) {
  return value === true || value === "true" || value === "1";
}

function parseCaliforniaPrivacyConfig(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const config = value as Record<string, unknown>;
  const exercisePrivacyChoicePath =
    config.exercisePrivacyChoicePath === true ||
    config.exercisePrivacyChoicePath === "true" ||
    config.exercisePrivacyChoicePath === "1";
  const forceGpcVerification =
    config.forceGpcVerification === true ||
    config.forceGpcVerification === "true" ||
    config.forceGpcVerification === "1" ||
    exercisePrivacyChoicePath;

  return exercisePrivacyChoicePath || forceGpcVerification
    ? {
        ...(exercisePrivacyChoicePath ? { exercisePrivacyChoicePath: true } : {}),
        ...(forceGpcVerification ? { forceGpcVerification: true } : {})
      }
    : null;
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const californiaPrivacy = parseCaliforniaPrivacyConfig(payload?.californiaPrivacy);
    const forceNewScan = parseForceNewScan(payload?.forceNewScan);
    const localV2DagScanProfile = normalizeLocalV2DagScanProfile(payload?.localV2ScanProfile ?? payload?.v2ScanProfile);
    const localV2DagRunViaLambda = normalizeLocalV2DagRunViaLambda(
      payload?.localV2RunViaLambda ?? payload?.localV2DagRunViaLambda ?? payload?.v2RunViaLambda
    );
    const scanFrom = normalizeScanFrom(payload?.scanFrom ?? payload?.geo);
    const provenance = getScanRequestProvenance(request);
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

      if (!firstDomain) {
        return NextResponse.json(
          {
            error: "Invalid full scan request."
          },
          { status: 400 }
        );
      }

      const anonymousScan = await createAnonymousFullScan({
        bypassRecentScanReuse: forceNewScan,
        californiaPrivacy,
        hostname: firstDomain.hostname,
        localV2DagScanProfile,
        localV2DagRunViaLambda,
        normalizedUrl: firstDomain.normalizedUrl,
        provenance,
        scanFrom
      }).catch(async (error) => {
        const message = error instanceof Error ? error.message : String(error);

        if (!/healthy scanner service heartbeat/i.test(message)) {
          throw error;
        }

        const preview = await createPreviewScan({
          hostname: firstDomain.hostname,
          localV2DagScanProfile,
          localV2DagRunViaLambda,
          normalizedUrl: firstDomain.normalizedUrl
        });

        return {
          code: "preview_fallback" as const,
          mode: "preview" as const,
          scan: preview.scan
        };
      });

      return NextResponse.json(
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
    }

    const scans = await Promise.all(
      intakeDomains.map((item) =>
        createOrQueueDomainScan({
          allowExistingDomainRescan: true,
          bypassRecentScanReuse: forceNewScan,
          californiaPrivacy,
          domain: item.normalizedUrl,
          localV2DagScanProfile,
          localV2DagRunViaLambda,
          provenance,
          scanFrom
        })
      )
    );
    const queuedScans = scans.filter((scan) => !scan.error && scan.scanId);

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

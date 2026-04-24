import { NextResponse } from "next/server";
import { createDomainRequestSchema, parseDomainBatchInput } from "@website-signal-risk-scanner/shared";
import { getCurrentUser } from "../../../server/auth";
import { isBetterAuthConfigurationError } from "../../../server/better-auth/env";
import { createOrQueueDomainScan } from "../../../server/domains/create-domain";
import { createAnonymousFullScan } from "../../../server/scans/create-anonymous-full-scan";
import { createPreviewScan } from "../../../server/preview-scan/create-preview-scan";

function isPublicFullScanAvailabilityError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return /DATABASE_URL|Invalid environment configuration|Scanner health check failed/i.test(message);
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

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const provenance = getScanRequestProvenance(request);
    const rawDomain = typeof payload?.domain === "string" ? payload.domain : "";
    const parsedBatch = parseDomainBatchInput(rawDomain);

    if (parsedBatch.valid.length === 0) {
      const singleResult = createDomainRequestSchema.safeParse(payload);
      return NextResponse.json(
        {
          error:
            singleResult.success
              ? "Invalid full scan request."
              : singleResult.error.issues[0]?.message ?? "Invalid full scan request."
        },
        { status: 400 }
      );
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
      const firstDomain = parsedBatch.valid[0];

      if (!firstDomain) {
        return NextResponse.json(
          {
            error: "Invalid full scan request."
          },
          { status: 400 }
        );
      }

      const anonymousScan = await createAnonymousFullScan({
        hostname: firstDomain.hostname,
        normalizedUrl: firstDomain.normalizedUrl,
        provenance
      }).catch(async (error) => {
        const message = error instanceof Error ? error.message : String(error);

        if (!/healthy scanner service heartbeat/i.test(message)) {
          throw error;
        }

        const preview = await createPreviewScan({
          hostname: firstDomain.hostname,
          normalizedUrl: firstDomain.normalizedUrl
        });

        return {
          mode: "preview" as const,
          scan: preview.scan
        };
      });

      return NextResponse.json(
        {
          queuedCount: 1,
          scanId: anonymousScan.scan.id,
          scanUrl:
            "mode" in anonymousScan && anonymousScan.mode === "preview"
              ? `/preview/${anonymousScan.scan.id}`
              : `/scan/${anonymousScan.scan.id}`
        },
        {
          headers: {
            "Cache-Control": "no-store"
          },
          status: 202
        }
      );
    }

    const scans = await Promise.all(
      parsedBatch.valid.map((item) =>
        createOrQueueDomainScan({
          allowExistingDomainRescan: true,
          domain: item.domain,
          provenance
        })
      )
    );
    const queuedScans = scans.filter((scan) => !scan.error && scan.scanId);

    if (queuedScans.length === 0) {
      return NextResponse.json(
        {
          error: scans.find((scan) => scan.error)?.error ?? "The full scan could not be started."
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        queuedCount: queuedScans.length,
        scanId: queuedScans[0]?.scanId ?? null,
        scanUrl: queuedScans.length === 1 ? `/app/scans/${queuedScans[0]?.scanId}` : "/app/scans"
      },
      {
        headers: {
          "Cache-Control": "no-store"
        },
        status: 202
      }
    );
  } catch (error) {
    if (isBetterAuthConfigurationError(error) || isPublicFullScanAvailabilityError(error)) {
      console.error("[full-scan] public full scan unavailable during request", {
        error: error instanceof Error ? error.message : String(error)
      });

      return NextResponse.json(
        {
          error: "The full scan could not be started right now. Please try again."
        },
        {
          status: 503
        }
      );
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Full scan could not be created."
      },
      {
        status: 500
      }
    );
  }
}

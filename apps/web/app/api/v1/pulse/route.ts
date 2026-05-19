import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { absoluteUrl } from "../../../../lib/seo";
import { buildPulseError } from "../../../../lib/pulse/error";
import { renderPulseMarkdown } from "../../../../lib/pulse/markdown";
import { buildPulseProjection } from "../../../../lib/pulse/projection";
import {
  getPulseRequesterContext,
  normalizePulseUrl,
  parsePulseDetail,
  parsePulseFormat,
  parsePulseFreshness,
  parsePulseWaitSeconds
} from "../../../../lib/pulse/request";
import { buildPulseStatus } from "../../../../lib/pulse/status";
import { checkDomainDns } from "../../../../server/domains/domain-dns";
import { createAnonymousFullScan } from "../../../../server/scans/create-anonymous-full-scan";
import { getAnonymousScanById } from "../../../../server/scans/get-scan-by-id";
import {
  claimPulseDomainScanCreation,
  createPulseRequest,
  findLatestCompletedAnonymousScanForDomain,
  getPulseRequestByJobId,
  updatePulseRequestCompleted,
  updatePulseRequestQueued,
  updatePulseRequestRateLimited
} from "../../../../server/pulse/repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SCAN_ID_PATTERN = /^[0-9a-f-]{32,36}$/i;

function etagFor(scanId: string, detail: string, format: string) {
  return `"pulse-v1-scan-${scanId}-${detail}-${format}"`;
}

function completedResponse(pulse: any, format: "json" | "markdown") {
  const scanId = pulse.scan?.scanId ?? pulse.links?.scanJsonUrl?.split("scanId=")[1] ?? "unknown";
  if (format === "markdown") {
    return new NextResponse(renderPulseMarkdown(pulse), {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
        "Content-Type": "text/markdown; charset=utf-8",
        ETag: etagFor(scanId, pulse.meta.detail, "md")
      }
    });
  }
  return NextResponse.json(pulse, {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "Content-Type": "application/json; charset=utf-8",
      ETag: etagFor(scanId, pulse.meta.detail, "json")
    }
  });
}

function pulseJson(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), {
    ...init,
    headers
  });
}

async function waitForCompletedScan(scanId: string, waitSeconds: number) {
  const deadline = Date.now() + waitSeconds * 1000;
  while (Date.now() < deadline) {
    const scanRecord = await getAnonymousScanById(scanId).catch(() => null);
    if (scanRecord?.scan.status === "completed") {
      return scanRecord;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return null;
}

async function buildAndLogCompletedPulse(input: {
  detail: "tiny" | "standard" | "full";
  format: "json" | "markdown";
  freshness: "latest" | "refresh";
  pulseRequestId: string;
  requestedUrl: string | null;
  resolutionMode: string;
  scanRecord: NonNullable<Awaited<ReturnType<typeof getAnonymousScanById>>>;
  waitSeconds: number;
  refresh?: Record<string, unknown> | null;
}) {
  const pulse = buildPulseProjection({
    detail: input.detail,
    format: input.format,
    freshnessMode: input.freshness,
    pulseRequestId: input.pulseRequestId,
    requestedUrl: input.requestedUrl,
    resolutionMode: input.resolutionMode,
    scanRecord: input.scanRecord,
    waitSeconds: input.waitSeconds
  });
  if (input.refresh && typeof pulse === "object") {
    (pulse as Record<string, unknown>).refresh = input.refresh;
  }
  await updatePulseRequestCompleted({
    pulseRequestId: input.pulseRequestId,
    scanId: input.scanRecord.scan.id,
    resultPulseUrl: absoluteUrl(`/api/v1/pulse?scanId=${input.scanRecord.scan.id}`),
    resultReportUrl: absoluteUrl(`/scan/${input.scanRecord.scan.id}`),
    resolutionMode: input.resolutionMode,
    responseSummary: {
      score: pulse.summary?.score ?? null,
      riskLevel: pulse.summary?.riskLevel ?? null,
      topFindingIds: Array.isArray(pulse.topFindings) ? pulse.topFindings.map((finding: any) => finding.id).slice(0, 10) : [],
      coverageStatus: pulse.coverage?.status ?? null
    }
  }).catch((error) => console.error("[pulse] request completion update failed", error));
  return completedResponse(pulse, input.format);
}

export async function GET(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  const url = new URL(request.url);
  const format = parsePulseFormat(url.searchParams.get("format"));
  const detail = parsePulseDetail(url.searchParams.get("detail"));
  const freshness = parsePulseFreshness(url.searchParams.get("freshness"));
  const waitSeconds = parsePulseWaitSeconds(url.searchParams.get("wait"));
  const requester = getPulseRequesterContext(request);
  const contextBase = { ...requester, format, detail, freshness, waitSeconds };
  const scanId = url.searchParams.get("scanId")?.trim() || null;
  const jobId = url.searchParams.get("jobId")?.trim() || null;
  const rawUrl = url.searchParams.get("url")?.trim() || null;

  try {
    if (scanId) {
      if (!SCAN_ID_PATTERN.test(scanId)) {
        return pulseJson(buildPulseError({ code: "invalid_url", message: "Invalid scan ID.", detail, format }), { status: 400 });
      }
      const { publicId } = await createPulseRequest({
        context: { ...contextBase, mode: "scanId" },
        requestedUrl: null,
        resolutionMode: "reused_existing_scan",
        scanId,
        status: "completed"
      });
      const scanRecord = await getAnonymousScanById(scanId);
      if (!scanRecord || scanRecord.scan.status !== "completed") {
        return pulseJson(buildPulseError({ code: "not_found", message: "Scan not found or not eligible for public Pulse.", detail, format }), { status: 404 });
      }
      return buildAndLogCompletedPulse({
        detail,
        format,
        freshness,
        pulseRequestId: publicId,
        requestedUrl: scanRecord.scan.domainHostname ? `https://${scanRecord.scan.domainHostname}` : null,
        resolutionMode: "reused_existing_scan",
        scanRecord,
        waitSeconds
      });
    }

    if (jobId) {
      const pulseRequest = await getPulseRequestByJobId(jobId);
      if (!pulseRequest) {
        return pulseJson(buildPulseError({ code: "not_found", message: "Pulse job not found.", detail, format }), { status: 404 });
      }
      if (pulseRequest.scan_id) {
        const scanRecord = await getAnonymousScanById(pulseRequest.scan_id).catch(() => null);
        if (scanRecord?.scan.status === "completed") {
          return buildAndLogCompletedPulse({
            detail,
            format,
            freshness,
            pulseRequestId: pulseRequest.public_id,
            requestedUrl: pulseRequest.requested_url,
            resolutionMode: pulseRequest.resolution_mode ?? "reused_existing_scan",
            scanRecord,
            waitSeconds
          });
        }
      }
      const status = buildPulseStatus({
        jobId: pulseRequest.job_id,
        domain: pulseRequest.normalized_domain,
        status: pulseRequest.status,
        phase: pulseRequest.phase,
        createdAt: pulseRequest.created_at,
        completedAt: pulseRequest.completed_at,
        lastUpdatedAt: pulseRequest.updated_at,
        scanId: pulseRequest.scan_id,
        resultUrl: pulseRequest.result_pulse_url,
        reportUrl: pulseRequest.result_report_url,
        retryAfterSeconds: pulseRequest.retry_after_seconds
      });
      return pulseJson(status, { headers: { "Cache-Control": "no-store" }, status: pulseRequest.status === "completed" ? 200 : 202 });
    }

    if (!rawUrl) {
      return pulseJson(
        buildPulseError({ code: "invalid_url", message: "Provide url, scanId, or jobId.", detail, format }),
        { status: 400 }
      );
    }

    const normalized = normalizePulseUrl(rawUrl);
    if (!normalized.ok) {
      return pulseJson(buildPulseError({ code: "invalid_url", message: normalized.message, url: rawUrl, detail, format }), { status: 400 });
    }

    const { publicId, jobId: createdJobId } = await createPulseRequest({
      context: { ...contextBase, mode: "url" },
      normalizedDomain: normalized.normalizedDomain,
      normalizedUrl: normalized.normalizedUrl,
      requestedUrl: rawUrl,
      resolutionMode: "created_new_scan",
      status: "queued"
    });
    const latestScan = await findLatestCompletedAnonymousScanForDomain(normalized.normalizedDomain);
    const latestScanRecord = latestScan ? await getAnonymousScanById(latestScan.id).catch(() => null) : null;

    if (latestScanRecord && freshness === "latest") {
      return buildAndLogCompletedPulse({
        detail,
        format,
        freshness,
        pulseRequestId: publicId,
        requestedUrl: rawUrl,
        resolutionMode: "reused_existing_scan",
        scanRecord: latestScanRecord,
        waitSeconds
      });
    }

    const throttle = await claimPulseDomainScanCreation({
      normalizedDomain: normalized.normalizedDomain,
      pulseRequestId: publicId
    });
    if (!throttle.allowed) {
      await updatePulseRequestRateLimited({ pulseRequestId: publicId, retryAfterSeconds: throttle.retryAfterSeconds, scanId: latestScan?.id ?? null });
      if (latestScanRecord) {
        return buildAndLogCompletedPulse({
          detail,
          format,
          freshness,
          pulseRequestId: publicId,
          requestedUrl: rawUrl,
          resolutionMode: "returned_stale_while_refreshing",
          scanRecord: latestScanRecord,
          waitSeconds,
          refresh: {
            requested: freshness === "refresh",
            performed: false,
            reason: "domain_throttle",
            retryAfterSeconds: throttle.retryAfterSeconds
          }
        });
      }
      return pulseJson(
        buildPulseError({
          code: "pulse_throttled",
          message: "A Pulse scan for this domain was requested recently. Try again in a few minutes.",
          retryAfterSeconds: throttle.retryAfterSeconds,
          url: rawUrl,
          detail,
          format
        }),
        {
          headers: { "Cache-Control": "no-store", "Retry-After": String(throttle.retryAfterSeconds) },
          status: 429
        }
      );
    }

    const dnsStatus = await checkDomainDns(normalized.normalizedDomain);
    if (!dnsStatus.exists) {
      return pulseJson(buildPulseError({ code: "invalid_url", message: dnsStatus.reason, url: rawUrl, detail, format }), { status: 400 });
    }

    const queued = await createAnonymousFullScan({
      hostname: normalized.normalizedDomain,
      normalizedUrl: normalized.normalizedUrl,
      provenance: {
        source: "pulse_api",
        host: request.headers.get("host"),
        userAgent: requester.userAgent,
        originIp: requester.ipHash
      }
    });
    await updatePulseRequestQueued({
      pulseRequestId: publicId,
      scanId: queued.scan.id,
      resultPulseUrl: absoluteUrl(`/api/v1/pulse?scanId=${queued.scan.id}`),
      resultReportUrl: absoluteUrl(`/scan/${queued.scan.id}`)
    });

    if (waitSeconds > 0) {
      const completed = await waitForCompletedScan(queued.scan.id, waitSeconds);
      if (completed) {
        return buildAndLogCompletedPulse({
          detail,
          format,
          freshness,
          pulseRequestId: publicId,
          requestedUrl: rawUrl,
          resolutionMode: "queued_new_scan",
          scanRecord: completed,
          waitSeconds
        });
      }
    }

    const status = buildPulseStatus({
      jobId: createdJobId,
      domain: normalized.normalizedDomain,
      status: "queued",
      phase: "queued",
      createdAt: new Date().toISOString(),
      scanId: queued.scan.id,
      resultUrl: absoluteUrl(`/api/v1/pulse?scanId=${queued.scan.id}`),
      reportUrl: absoluteUrl(`/scan/${queued.scan.id}`)
    });
    return pulseJson(
      {
        ...status,
        statusUrl: absoluteUrl(`/api/v1/pulse/status/${createdJobId}`),
        nextCheckUrl: absoluteUrl(`/api/v1/pulse?jobId=${createdJobId}`),
        lastKnownPulse: latestScanRecord ? absoluteUrl(`/api/v1/pulse?scanId=${latestScanRecord.scan.id}`) : null
      },
      { headers: { "Cache-Control": "no-store" }, status: 202 }
    );
  } catch (error) {
    console.error("[pulse] request failed", { requestId, error });
    return pulseJson(
      buildPulseError({
        code: "internal_error",
        message: "Pulse is temporarily unavailable. Try again later.",
        url: rawUrl,
        detail,
        format
      }),
      { headers: { "Cache-Control": "no-store", "Retry-After": "60" }, status: 503 }
    );
  }
}

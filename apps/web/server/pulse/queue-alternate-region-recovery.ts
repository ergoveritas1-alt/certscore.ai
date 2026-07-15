import { projectExternalScanNoGo, normalizeScanFrom } from "@website-signal-risk-scanner/shared";
import type { ScanDetailResponse } from "../scans/get-scan-by-id";
import { createAnonymousFullScan } from "../scans/create-anonymous-full-scan";
import {
  claimPulseAlternateRegionFallback,
  markPulseAlternateRegionFallbackFailed,
  updatePulseRequestQueued
} from "./repository";
import {
  ALTERNATE_REGION_FALLBACK_FROM,
  hasAlternateRegionRecoveryAttempt,
  planAlternateRegionRecovery
} from "./alternate-region-recovery";
import { PULSE_MIN_REUSABLE_PAGES_REQUESTED, PULSE_SCAN_COVERAGE_PLAN_CODE } from "../../lib/pulse/scan-coverage";
import { absoluteUrl } from "../../lib/seo";

export type AlternateRegionRecoveryContext = {
  alternateRegionAttempted: true;
  fallbackScanFrom: typeof ALTERNATE_REGION_FALLBACK_FROM;
  noGoReason: string;
  primaryScanFrom: string;
  primaryScanId: string;
  claimedAt: string;
};

export async function queueAlternateRegionRecovery(input: {
  normalizedUrl: string;
  primaryScanRecord: ScanDetailResponse;
  provenance?: {
    host?: string | null;
    originIp?: string | null;
    source?: string | null;
    userAgent?: string | null;
  };
  pulseRequestId: string;
  requestContext?: Record<string, unknown> | null;
}) {
  const noGo = projectExternalScanNoGo(input.primaryScanRecord.runtimeArtifacts);
  const primaryScanFrom = normalizeScanFrom(input.primaryScanRecord.scan.scanConfigJson?.scanFrom ?? input.primaryScanRecord.scan.scanFromValue);
  const plan = planAlternateRegionRecovery({
    fallbackAlreadyAttempted: hasAlternateRegionRecoveryAttempt(input.requestContext),
    noGoReason: noGo?.noGo.reasonCode,
    primaryScanFrom
  });
  if (!plan) {
    return { context: null, queued: false as const, scanId: null };
  }

  const claimed = await claimPulseAlternateRegionFallback({
    fallbackScanFrom: plan.to,
    noGoReason: plan.reasonCode,
    primaryScanFrom: plan.from,
    primaryScanId: input.primaryScanRecord.scan.id,
    pulseRequestId: input.pulseRequestId
  });
  if (!claimed) {
    return { context: null, queued: false as const, scanId: null };
  }

  const hostname = input.primaryScanRecord.scan.domainHostname;
  if (!hostname) {
    await markPulseAlternateRegionFallbackFailed({
      errorMessage: "The primary scan did not retain a hostname for alternate-region recovery.",
      primaryScanId: input.primaryScanRecord.scan.id,
      pulseRequestId: input.pulseRequestId,
      resultPulseUrl: null,
      resultReportUrl: null
    });
    return { context: null, queued: false as const, scanId: null };
  }

  const recoveryContext: AlternateRegionRecoveryContext = {
    alternateRegionAttempted: true,
    fallbackScanFrom: plan.to,
    noGoReason: plan.reasonCode,
    primaryScanFrom: plan.from,
    primaryScanId: input.primaryScanRecord.scan.id,
    claimedAt: new Date().toISOString()
  };

  try {
    const queued = await createAnonymousFullScan({
      bypassRecentScanReuse: true,
      coveragePlanCode: PULSE_SCAN_COVERAGE_PLAN_CODE,
      hostname,
      minimumReusablePagesRequested: PULSE_MIN_REUSABLE_PAGES_REQUESTED,
      normalizedUrl: input.normalizedUrl,
      provenance: input.provenance,
      localV2DagRunViaLambda: true,
      scanFrom: plan.to
    });
    const scanId = queued.scan.id;
    await updatePulseRequestQueued({
      pulseRequestId: input.pulseRequestId,
      scanId,
      resultPulseUrl: absoluteUrl(`/api/v1/pulse?scanId=${scanId}`),
      resultReportUrl: absoluteUrl(`/scan/${scanId}`),
      resolutionMode: "alternate_region_fallback_queued"
    });
    return { context: recoveryContext, queued: true as const, scanId };
  } catch (error) {
    await markPulseAlternateRegionFallbackFailed({
      errorMessage: error instanceof Error ? error.message : String(error),
      primaryScanId: input.primaryScanRecord.scan.id,
      pulseRequestId: input.pulseRequestId,
      resultPulseUrl: absoluteUrl(`/api/v1/pulse?scanId=${input.primaryScanRecord.scan.id}`),
      resultReportUrl: absoluteUrl(`/scan/${input.primaryScanRecord.scan.id}`)
    }).catch((markError) => {
      console.error("[pulse] alternate-region fallback failure state update failed", {
        error: markError instanceof Error ? markError.message : String(markError),
        pulseRequestId: input.pulseRequestId
      });
    });
    console.error("[pulse] alternate-region fallback queue failed", {
      error: error instanceof Error ? error.message : String(error),
      primaryScanId: input.primaryScanRecord.scan.id,
      pulseRequestId: input.pulseRequestId
    });
    return { context: null, queued: false as const, scanId: null };
  }
}

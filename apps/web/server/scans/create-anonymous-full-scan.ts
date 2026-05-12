import { FULL_SCAN_EVENT_TYPES, SCAN_EVENT_TYPES } from "@website-signal-risk-scanner/shared";
import { getPlanLimits } from "../plans/get-plan-limits";
import { getFullScanQueueAvailability } from "../queue/full-scan-queue";
import { enqueueNanoSignalEnrichmentJob } from "../queue/validation-queue";
import { ensureValidationRunForManualScan } from "../validation/repository";
import { findOrCreateAnonymousPreviewDomain } from "../preview-scan/preview-scan-repository";
import { setPreviewDomainLatestScan } from "../preview-scan/db";
import { createQueuedFullScan, insertQueuedFullScanEvent, loadPriorScanAccelerationCandidate } from "./repository";
import { buildQueuedFullScanConfig } from "./full-scan-config";

type ScanQueueProvenance = {
  githubActor?: string | null;
  githubRunId?: string | null;
  githubSha?: string | null;
  githubWorkflow?: string | null;
  host?: string | null;
  originIp?: string | null;
  source?: string | null;
  userAgent?: string | null;
};

export async function createAnonymousFullScan(input: { hostname: string; normalizedUrl: string; provenance?: ScanQueueProvenance }) {
  const fullScanQueueAvailability = await getFullScanQueueAvailability({
    allowDegradedScanner: process.env.FULL_SCAN_QUEUE_ALLOW_DEGRADED_HEARTBEAT === "true"
  });

  if (!fullScanQueueAvailability.enabled) {
    throw new Error(fullScanQueueAvailability.reason ?? "Full scan queue is unavailable.");
  }

  const planLimits = await getPlanLimits("free");
  const domain = await findOrCreateAnonymousPreviewDomain(input.hostname, input.normalizedUrl);
  const pagesRequested = planLimits.maxPagesPerScan;
  const priorScanAcceleration = await loadPriorScanAccelerationCandidate({
    domainId: domain.id,
    normalizedUrl: domain.normalized_url,
    organizationId: null
  }).catch((error) => {
    console.error("[web] anonymous prior scan acceleration lookup failed", {
      error: error instanceof Error ? error.message : String(error),
      domainId: domain.id
    });
    return null;
  });
  const scanConfig = buildQueuedFullScanConfig({
    hostname: input.hostname,
    maxPages: pagesRequested,
    normalizedUrl: input.normalizedUrl,
    priorScanAcceleration,
    profile: planLimits.scanProfile,
    source: "marketing-anonymous-full-scan"
  });

  const scan = await createQueuedFullScan({
    domainId: domain.id,
    organizationId: null,
    pagesRequested,
    scanConfigJson: scanConfig,
    submittedByUserId: null
  });

  await insertQueuedFullScanEvent({
    domainId: domain.id,
    eventType: SCAN_EVENT_TYPES.priorScanAccelerationEvaluated,
    message: priorScanAcceleration
      ? "Prior scan acceleration metadata attached as non-evidence hints."
      : "No eligible prior scan acceleration metadata found.",
    metadataJson: {
      crawlSeedHintCount: priorScanAcceleration?.crawlSeedHints.length ?? 0,
      crawlSeedHintTypes: priorScanAcceleration?.priorScan.crawlSeedHintTypes ?? [],
      found: Boolean(priorScanAcceleration),
      priorScanSelectionReason: priorScanAcceleration?.priorScan.priorScanSelectionReason ?? null,
      priorScanSelectionScore: priorScanAcceleration?.priorScan.priorScanSelectionScore ?? null,
      selectedDocumentSourceCount: priorScanAcceleration?.selectedDocumentSources.length ?? 0,
      selectedHighYieldPageCount: priorScanAcceleration?.selectedHighYieldPages.length ?? 0,
      sourceScanId: priorScanAcceleration?.priorScan.sourceScanId ?? null
    },
    organizationId: null,
    scanId: scan.id
  });

  await insertQueuedFullScanEvent({
    domainId: domain.id,
    eventType: FULL_SCAN_EVENT_TYPES.queued,
    message: "Scan queued and awaiting scanner pickup.",
    metadataJson: {
      pagesRequested,
      profile: planLimits.scanProfile,
      queueAvailabilityReason: fullScanQueueAvailability.reason,
      source: input.provenance?.source ?? scanConfig.source,
      originIp: input.provenance?.originIp ?? null,
      githubRunId: input.provenance?.githubRunId ?? null,
      githubWorkflow: input.provenance?.githubWorkflow ?? null,
      provenance: input.provenance ?? null
    },
    organizationId: null,
    scanId: scan.id
  });

  await setPreviewDomainLatestScan(domain.id, scan.id);

  await enqueueNanoSignalEnrichmentJob(scan.id).catch((error) => {
    console.error("[web] anonymous nano signal enrichment handoff failed", {
      error: error instanceof Error ? error.message : String(error),
      scanId: scan.id
    });
  });

  await ensureValidationRunForManualScan({
    domainId: domain.id,
    hostname: domain.hostname,
    normalizedUrl: domain.normalized_url,
    organizationId: null,
    scanId: scan.id,
    submittedByUserId: null
  }).catch((error) => {
    console.error("[web] anonymous validation handoff failed", {
      error: error instanceof Error ? error.message : String(error),
      scanId: scan.id
    });
  });

  return {
    domain,
    scan
  };
}

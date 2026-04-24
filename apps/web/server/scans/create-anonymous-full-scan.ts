import { FULL_SCAN_EVENT_TYPES } from "@website-signal-risk-scanner/shared";
import { getPlanLimits } from "../plans/get-plan-limits";
import { getFullScanQueueAvailability } from "../queue/full-scan-queue";
import { enqueueNanoSignalEnrichmentJob } from "../queue/validation-queue";
import { ensureValidationRunForManualScan } from "../validation/repository";
import { findOrCreateAnonymousPreviewDomain } from "../preview-scan/preview-scan-repository";
import { setPreviewDomainLatestScan } from "../preview-scan/db";
import { createQueuedFullScan, insertQueuedFullScanEvent } from "./repository";

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
  const fullScanQueueAvailability = await getFullScanQueueAvailability();

  if (!fullScanQueueAvailability.enabled) {
    throw new Error(fullScanQueueAvailability.reason ?? "Full scan queue is unavailable.");
  }

  const planLimits = await getPlanLimits("free");
  const domain = await findOrCreateAnonymousPreviewDomain(input.hostname, input.normalizedUrl);
  const pagesRequested = planLimits.maxPagesPerScan;
  const scanConfig = {
    freshBrowserRequired: true,
    hostname: input.hostname,
    maxRequestedTier: "tier5_full_scan",
    normalizedUrl: input.normalizedUrl,
    post403Policy: {
      maxHomepageRetriesAfter403: 0,
      maxPassiveVerificationFetchesAfter403: 4,
      passiveOnlyAfter403: true,
      stopOnHomepage403: true,
      verifiedSurfaceTargetsAfter403: ["privacy_policy", "terms_of_service", "cookie_policy", "contact_page"]
    },
    processor: "queued-full-scan-v1",
    profile: planLimits.scanProfile,
    maxPages: pagesRequested,
    source: "marketing-anonymous-full-scan"
  };

  const scan = await createQueuedFullScan({
    domainId: domain.id,
    organizationId: null,
    pagesRequested,
    scanConfigJson: scanConfig,
    submittedByUserId: null
  });

  await insertQueuedFullScanEvent({
    domainId: domain.id,
    eventType: FULL_SCAN_EVENT_TYPES.queued,
    message: "Scan queued and awaiting scanner pickup.",
    metadataJson: {
      pagesRequested,
      profile: planLimits.scanProfile,
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

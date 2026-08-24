import { Suspense } from "react";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { PendingScanStartedEvent } from "../../../../components/analytics/data-layer-events";
import { DomainScanForm } from "../../../../components/marketing/domain-scan-form";
import { SharedScanDetailView } from "../../../../components/scans/shared-scan-detail-view";
import { buildScanReportUnifiedFindings } from "../../../../components/scans/shared-scan-detail-view";
import { ScanStatusAutoRefresh } from "../../../../components/scans/scan-status-auto-refresh";
import { PendingScanDetailView } from "../../../../components/scans/pending-scan-detail-view";
import { ScanProgressReportVisible } from "../../../../components/scans/scan-progress-report-visible";
import { ScanReportLoadingCard } from "../../../../components/scans/scan-report-loading-card";
import { ScanReportRescanTransition } from "../../../../components/scans/scan-report-rescan-transition";
import { ShareReportActions } from "../../../../components/scans/share-report-actions";
import { ReportDownloadActions } from "../../../../components/scans/report-download-actions";
import {
  hasPendingBrowserExtensionNormalization,
  hasPendingPostCompletionFindingWork,
  shouldBackfillReportFindingCount
} from "../../../../lib/scans/scan-auto-refresh";
import { getHomepageScreenshotState, getVisualEvidenceArtifacts } from "../../../../lib/scans/visual-evidence";
import { isPlatformAdminEmail } from "../../../../server/admin/platform-admin";
import { getDashboardContext } from "../../../../server/auth";
import { BoundedPromiseCache } from "../../../../server/performance/bounded-promise-cache";
import { withServerTiming } from "../../../../server/performance/log-server-timing";
import { getPublicScanById, getScanById } from "../../../../server/scans/get-scan-by-id";
import { loadPersistedScanReportProjection } from "../../../../server/scans/scan-report-projection";
import { persistReportFindingCount } from "../../../../server/scans/persist-report-finding-count";
import {
  getPublicScanStatusProjection,
  getOrganizationScanStatusProjection,
  isCompletedScanStatus,
  isPendingScanStatus
} from "../../../../server/scans/scan-status-projection";
import type { ScanStatusProjection } from "../../../../server/scans/scan-status-projection";
import { canUseRestrictedScanOptions } from "../../../../server/scans/restricted-scan-options";
import { getOrganizationSettings } from "../../../../server/settings/get-organization-settings";

type ScanDetailPageProps = {
  params: Promise<{
    scanId: string;
  }>;
  searchParams?: Promise<{
    recentScanReused?: string;
  }>;
};

const RECENT_SCAN_REUSED_MESSAGE =
  "Recently scanned. Select Fresh re-scan to run a new scan.";

const COMPLETED_SCAN_DETAIL_CACHE_TTL_MS = 15_000;
const COMPLETED_SCAN_DETAIL_CACHE_MAX_ENTRIES = 8;
const completedScanDetailCache = new BoundedPromiseCache<
  string,
  Awaited<ReturnType<typeof getPublicScanById>>
>({
  maxEntries: COMPLETED_SCAN_DETAIL_CACHE_MAX_ENTRIES,
  ttlMs: COMPLETED_SCAN_DETAIL_CACHE_TTL_MS
});

function getCachedCompletedScanById(scanId: string) {
  return completedScanDetailCache.getOrCreate(scanId, () =>
    withServerTiming("app.scan_detail.record_cache_miss", () => getPublicScanById(scanId))
  );
}

function ScanDetailLoadingState({ statusProjection }: { statusProjection: ScanStatusProjection }) {
  return (
    <div className="space-y-7" aria-busy="true" aria-live="polite">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">CertScore.ai scan</p>
        <h1 className="mt-2 flex min-w-0 max-w-full items-baseline gap-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
          <span className="shrink-0">Scan:</span>
          <span
            className="min-w-0 truncate"
            title={statusProjection.pageUrl?.trim() || statusProjection.domainHostname?.trim() || "website"}
          >
            {statusProjection.pageUrl?.trim() || statusProjection.domainHostname?.trim() || "website"}
          </span>
        </h1>
        <p className="mt-2 text-sm text-slate-500">Your scan is complete. Loading the latest report details.</p>
      </div>
      <div className="flex min-h-[48vh] items-center justify-center rounded-2xl border border-sky-100 bg-sky-50/60 px-6 py-10">
        <ScanReportLoadingCard
          description="We’re loading the latest scan results, including cookies, trackers, and privacy findings."
          title="Loading your report"
        />
      </div>
    </div>
  );
}

export default async function ScanDetailPage({ params, searchParams }: ScanDetailPageProps) {
  const [{ scanId }, { membership, organization, user }] = await Promise.all([
    params,
    withServerTiming("app.scan_detail.context", () => getDashboardContext())
  ]);
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const recentScanReused = resolvedSearchParams.recentScanReused === "1";
  const isPlatformAdmin = isPlatformAdminEmail(user.email);
  const statusProjection = await withServerTiming("app.scan_detail.status_projection", () =>
    isPlatformAdmin ? getPublicScanStatusProjection(scanId) : getOrganizationScanStatusProjection({ organizationId: organization.id, scanId })
  );
  if (!statusProjection) {
    notFound();
  }
  const waitingForReportProjection =
    isCompletedScanStatus(statusProjection.status) &&
    statusProjection.reportProjectionRequired &&
    !statusProjection.reportReady;
  if (isPendingScanStatus(statusProjection.status) || waitingForReportProjection) {
    return (
      <>
        <PendingScanStartedEvent />
        <PendingScanDetailView
          createdAt={statusProjection.createdAt}
          domainHostname={statusProjection.domainHostname}
          pageUrl={statusProjection.pageUrl}
          pendingPostCompletionWork={waitingForReportProjection}
          profile={statusProjection.profile}
          scanId={statusProjection.id}
          startedAt={statusProjection.startedAt}
          status={waitingForReportProjection ? "processing" : statusProjection.status}
        />
      </>
    );
  }
  return (
    <>
      <PendingScanStartedEvent />
      <Suspense fallback={<ScanDetailLoadingState statusProjection={statusProjection} />}>
        <ScanDetailReportContent
          isPlatformAdmin={isPlatformAdmin}
          membership={membership}
          organization={organization}
          recentScanReused={recentScanReused}
          scanId={scanId}
          statusProjection={statusProjection}
          user={user}
        />
      </Suspense>
    </>
  );
}

async function ScanDetailReportContent({
  isPlatformAdmin,
  membership,
  organization,
  recentScanReused,
  scanId,
  statusProjection,
  user
}: {
  isPlatformAdmin: boolean;
  membership: Awaited<ReturnType<typeof getDashboardContext>>["membership"];
  organization: Awaited<ReturnType<typeof getDashboardContext>>["organization"];
  recentScanReused: boolean;
  scanId: string;
  statusProjection: ScanStatusProjection;
  user: Awaited<ReturnType<typeof getDashboardContext>>["user"];
}) {
  const canUseShortCompletedRecordCache =
    statusProjection.status === "completed" &&
    !statusProjection.reportProjectionRequired;
  const [localPersistedReportProjection, organizationSettings] = await Promise.all([
    statusProjection.reportReady
      ? withServerTiming("app.scan_detail.persisted_projection", () =>
          loadPersistedScanReportProjection({
            generation: statusProjection.reportGeneration,
            organizationId: isPlatformAdmin ? null : organization.id,
            scanId
          })
        )
      : Promise.resolve(null),
    getOrganizationSettings(organization.id)
  ]);
  if (
    isCompletedScanStatus(statusProjection.status) &&
    statusProjection.reportProjectionRequired &&
    !localPersistedReportProjection
  ) {
    return (
      <PendingScanDetailView
        createdAt={statusProjection.createdAt}
        domainHostname={statusProjection.domainHostname}
        pageUrl={statusProjection.pageUrl}
        pendingPostCompletionWork
        profile={statusProjection.profile}
        scanId={statusProjection.id}
        startedAt={statusProjection.startedAt}
        status="processing"
      />
    );
  }
  const scanRecord = localPersistedReportProjection ??
    await withServerTiming("app.scan_detail.record", () =>
      // The lightweight status lookup above has already established viewer
      // access; only stable completed records use this shared short cache.
      canUseShortCompletedRecordCache
        ? getCachedCompletedScanById(scanId)
        : isPlatformAdmin
          ? getPublicScanById(scanId)
          : getScanById({ organizationId: organization.id, scanId, viewerEmail: user.email })
    );

  if (!scanRecord) {
    notFound();
  }

  const displayScanRecord = scanRecord;
  const pendingBrowserExtensionNormalization = hasPendingBrowserExtensionNormalization({
    events: scanRecord.events,
    scanType: scanRecord.scan.scanType,
    status: scanRecord.scan.status
  });

  const persistedSnapshot = scanRecord.snapshot;
  if (shouldBackfillReportFindingCount({
    hasPersistedSnapshot: Boolean(persistedSnapshot),
    reportFindingCount: persistedSnapshot?.report_finding_count,
    scanType: displayScanRecord.scan.scanType
  })) {
    after(async () => {
      const reportFindingCount = await withServerTiming("app.scan_detail.backfill_finding_count", async () =>
        buildScanReportUnifiedFindings(displayScanRecord).length
      );
      await persistReportFindingCount({
        count: reportFindingCount,
        scanId: displayScanRecord.scan.id
      });
    });
  }
  const pendingPostCompletionWork = hasPendingPostCompletionFindingWork({
    reportFindingsDerived: true,
    signalEnrichmentWorkflow: scanRecord.signalEnrichmentWorkflow,
    status: scanRecord.scan.status
  });

  const scanDomainLabel = displayScanRecord.scan.domainHostname?.trim() || "Scanned website";
  const allowRestrictedScanOptions = canUseRestrictedScanOptions({
    membershipRole: membership.role,
    userEmail: user.email
  });
  const visualEvidenceArtifacts = getVisualEvidenceArtifacts(displayScanRecord.runtimeArtifacts).sort((left, right) => {
    const leftPriority = left.captureStep === "initial_load" ? 0 : 1;
    const rightPriority = right.captureStep === "initial_load" ? 0 : 1;
    return leftPriority - rightPriority;
  });
  const visualEvidenceArtifact =
    visualEvidenceArtifacts.find((artifact) => artifact.status === "available" && artifact.key) ?? null;
  const visualEvidenceHref = visualEvidenceArtifact
    ? `/api/scans/${scanRecord.scan.id}/visual-evidence/${encodeURIComponent(visualEvidenceArtifact.id)}`
    : null;
  const homepageScreenshotState = getHomepageScreenshotState(displayScanRecord.runtimeArtifacts);

  return (
    <ScanReportRescanTransition>
      <ScanProgressReportVisible scanId={displayScanRecord.scan.id} />
      <SharedScanDetailView
        analyticsScanSource="dashboard"
        autoRefresh={
          <ScanStatusAutoRefresh
            pendingBrowserExtensionNormalization={pendingBrowserExtensionNormalization}
            pendingPostCompletionWork={pendingPostCompletionWork}
            reloadOnTerminal={false}
            scanId={displayScanRecord.scan.id}
            silent={statusProjection.reportProjectionRequired}
            status={displayScanRecord.scan.status}
          />
        }
        createdAtInfoTip={recentScanReused ? RECENT_SCAN_REUSED_MESSAGE : null}
        headerActions={
          displayScanRecord.scan.status === "completed" ? (
            <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <ShareReportActions
                  domainLabel={scanDomainLabel}
                  scanId={displayScanRecord.scan.id}
                  visualEvidenceHref={visualEvidenceHref}
                  visualEvidenceWithheldReason={homepageScreenshotState?.status === "withheld" ? homepageScreenshotState.reason : null}
                />
                <ReportDownloadActions scanId={displayScanRecord.scan.id} />
              </div>
              <div className="w-full lg:ml-auto lg:max-w-[calc(16rem+20ch)]">
                <DomainScanForm
                  allowLocalExtensionScan
                  allowRestrictedScanOptions={allowRestrictedScanOptions}
                buttonLabel="Scan"
                compact
                defaultScanFrom={organizationSettings?.defaultScanFrom ?? "eu_ie"}
                inputLabel="Scan another website"
                inputPlaceholder="Enter another site"
                key={displayScanRecord.scan.id}
                mode="full"
                scanSource="dashboard"
              />
              </div>
            </div>
          ) : null
        }
        headerActionsPlacement="belowTitle"
        localV2DagInFlightProgress={null}
        reportGeneration={statusProjection.reportGeneration}
        scanRecord={displayScanRecord}
        canViewReviewLenses={isPlatformAdmin || membership.role === "admin"}
        signalSnapshotVisibility={{
          showFingerprinting: organizationSettings?.showSignalSnapshotFingerprinting ?? true,
          showReviewLenses: organizationSettings?.showSignalSnapshotReviewLenses ?? true,
          showScanInterruption: organizationSettings?.showSignalSnapshotScanInterruption ?? true
        }}
        showBrowserExtensionRecovery
        viewerAccessRole={membership.role}
      />
    </ScanReportRescanTransition>
  );
}

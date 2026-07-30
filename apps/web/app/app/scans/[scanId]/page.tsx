import { Suspense } from "react";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { PendingScanStartedEvent } from "../../../../components/analytics/data-layer-events";
import { DomainScanForm } from "../../../../components/marketing/domain-scan-form";
import { SharedScanDetailView } from "../../../../components/scans/shared-scan-detail-view";
import { buildScanReportUnifiedFindings } from "../../../../components/scans/shared-scan-detail-view";
import { ScanStatusAutoRefresh } from "../../../../components/scans/scan-status-auto-refresh";
import { LocalV2DagScanProgressCard } from "../../../../components/scans/scan-submit-progress";
import { PendingScanDetailView } from "../../../../components/scans/pending-scan-detail-view";
import { ScanProgressReportVisible } from "../../../../components/scans/scan-progress-report-visible";
import { ScanReportLoadingCard } from "../../../../components/scans/scan-report-loading-card";
import { ShareReportActions } from "../../../../components/scans/share-report-actions";
import {
  hasPendingBrowserExtensionNormalization,
  hasPendingPostCompletionFindingWork,
  shouldBackfillReportFindingCount
} from "../../../../lib/scans/scan-auto-refresh";
import { getVisualEvidenceArtifacts } from "../../../../lib/scans/visual-evidence";
import { isPlatformAdminEmail } from "../../../../server/admin/platform-admin";
import { getDashboardContext } from "../../../../server/auth";
import { BoundedPromiseCache } from "../../../../server/performance/bounded-promise-cache";
import { withServerTiming } from "../../../../server/performance/log-server-timing";
import { getPublicScanById, getScanById } from "../../../../server/scans/get-scan-by-id";
import {
  getLocalV2DagReportInput,
  materializeLocalV2DagScanDetail
} from "../../../../server/scans/local-v2-dag-report";
import {
  getPersistedScanReportProjection,
  loadPersistedScanReportProjection,
  persistScanReportProjection
} from "../../../../server/scans/scan-report-projection";
import { persistReportFindingCount } from "../../../../server/scans/persist-report-finding-count";
import {
  getPublicScanStatusProjection,
  getOrganizationScanStatusProjection,
  hasReportProjectionGraceElapsed,
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
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
          Scan: {statusProjection.domainHostname?.trim() || "website"}
        </h1>
        <p className="mt-2 text-sm text-slate-500">The scan is complete. Preparing its retained evidence and review.</p>
      </div>
      {statusProjection.reportReady ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_60px_-32px_rgba(15,23,42,0.18)]">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">Exec Summary</p>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
              Report generated
            </span>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-5 py-4">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Overall score</p>
              <div className="mt-3 h-10 w-28 animate-pulse rounded-lg bg-slate-200" aria-hidden="true" />
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-5 py-4">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">Findings to review</p>
              <div className="mt-3 h-10 w-16 animate-pulse rounded-lg bg-slate-200" aria-hidden="true" />
            </div>
          </div>
          <div className="mt-5 flex items-center gap-3 rounded-2xl border border-sky-100 bg-sky-50/60 px-4 py-3">
            <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-sky-500" aria-hidden="true" />
            <p className="text-sm text-slate-600">
              Loading detailed cookies, trackers, retained evidence, and privacy review.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex min-h-[48vh] items-center justify-center rounded-2xl border border-sky-100 bg-sky-50/60 px-6 py-10">
          <ScanReportLoadingCard
            description="Loading the evidence summary, cookies and trackers, and privacy review."
            title="Building the report view"
          />
        </div>
      )}
    </div>
  );
}

function canViewCapturedImage(input: { isPlatformAdmin: boolean; role: string | null | undefined }) {
  return input.isPlatformAdmin || input.role === "admin" || input.role === "advanced";
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
    statusProjection.status === "completed" &&
    !statusProjection.reportReady &&
    !hasReportProjectionGraceElapsed(statusProjection);
  if (isPendingScanStatus(statusProjection.status) || waitingForReportProjection) {
    return (
      <>
        <PendingScanStartedEvent />
        <PendingScanDetailView
          createdAt={statusProjection.createdAt}
          domainHostname={statusProjection.domainHostname}
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
  const completedAtMs = statusProjection.completedAt ? Date.parse(statusProjection.completedAt) : Number.NaN;
  const completedLongEnoughForShortCache =
    Number.isFinite(completedAtMs) && Date.now() - completedAtMs >= 60_000;
  const canUseShortCompletedRecordCache =
    statusProjection.status === "completed" &&
    (statusProjection.reportReady || completedLongEnoughForShortCache);
  const [localPersistedReportProjection, organizationSettings] = await Promise.all([
    statusProjection.reportReady
      ? withServerTiming("app.scan_detail.persisted_projection", () =>
          loadPersistedScanReportProjection({
            organizationId: isPlatformAdmin ? null : organization.id,
            scanId
          })
        )
      : Promise.resolve(null),
    getOrganizationSettings(organization.id)
  ]);
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

  const localV2DagReportInput = getLocalV2DagReportInput(scanRecord);
  const persistedReportProjection =
    localPersistedReportProjection ?? getPersistedScanReportProjection(scanRecord);
  const persistedReportProjectionReady = Boolean(persistedReportProjection);
  const displayScanRecord =
    localV2DagReportInput && scanRecord.scan.status === "completed"
      ? persistedReportProjection ??
        await withServerTiming("app.scan_detail.local_v2_report", () => materializeLocalV2DagScanDetail(scanRecord))
      : scanRecord;

  // Invalid, stale, oversized, or missing projections fail closed to canonical
  // retained-evidence materialization and are repaired after this response.
  if (!persistedReportProjectionReady && displayScanRecord.scan.status === "completed") {
    after(async () => {
      await persistScanReportProjection(displayScanRecord, {
        snapshot: displayScanRecord.snapshot,
        runtimeArtifacts: displayScanRecord.runtimeArtifacts
      }).catch((error) => {
        console.error("Failed to refresh completed scan report projection", error);
      });
    });
  }
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
  const canUseAdvancedReportActions = isPlatformAdmin || membership.role === "admin" || membership.role === "advanced";
  const allowRestrictedScanOptions = canUseRestrictedScanOptions({
    membershipRole: membership.role,
    userEmail: user.email
  });
  const visualEvidenceArtifacts = canViewCapturedImage({ isPlatformAdmin, role: membership.role })
    ? getVisualEvidenceArtifacts(displayScanRecord.runtimeArtifacts).sort((left, right) => {
        const leftPriority = left.captureStep === "initial_load" ? 0 : 1;
        const rightPriority = right.captureStep === "initial_load" ? 0 : 1;
        return leftPriority - rightPriority;
      })
    : [];
  const visualEvidenceArtifact =
    visualEvidenceArtifacts.find((artifact) => artifact.status === "available" && artifact.key) ?? null;
  const visualEvidenceHref = visualEvidenceArtifact
    ? `/api/scans/${scanRecord.scan.id}/visual-evidence/${encodeURIComponent(visualEvidenceArtifact.id)}`
    : null;

  return (
    <>
      <ScanProgressReportVisible scanId={displayScanRecord.scan.id} />
      <SharedScanDetailView
        analyticsScanSource="dashboard"
        autoRefresh={
          <ScanStatusAutoRefresh
            pendingBrowserExtensionNormalization={pendingBrowserExtensionNormalization}
            pendingPostCompletionWork={pendingPostCompletionWork}
            reloadOnTerminal={false}
            scanId={displayScanRecord.scan.id}
            silent={Boolean(localV2DagReportInput)}
            status={displayScanRecord.scan.status}
          />
        }
        createdAtInfoTip={recentScanReused ? RECENT_SCAN_REUSED_MESSAGE : null}
        headerActions={
          displayScanRecord.scan.status === "completed" ? (
            <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <ShareReportActions
                domainLabel={scanDomainLabel}
                scanId={displayScanRecord.scan.id}
                showMonitorSite={canUseAdvancedReportActions}
                visualEvidenceHref={visualEvidenceHref}
              />
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
        localV2DagInFlightProgress={
          localV2DagReportInput && (scanRecord.scan.status === "queued" || scanRecord.scan.status === "running" || scanRecord.scan.status === "processing") ? (
            <LocalV2DagScanProgressCard
              createdAt={scanRecord.scan.createdAt}
              profileValue={localV2DagReportInput.profile}
              startedAt={scanRecord.scan.startedAt}
            />
          ) : null
        }
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
    </>
  );
}

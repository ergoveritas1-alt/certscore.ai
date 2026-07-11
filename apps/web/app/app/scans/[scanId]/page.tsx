import { notFound } from "next/navigation";
import { PendingScanStartedEvent } from "../../../../components/analytics/data-layer-events";
import { DomainScanForm } from "../../../../components/marketing/domain-scan-form";
import { SharedScanDetailView } from "../../../../components/scans/shared-scan-detail-view";
import { buildScanReportUnifiedFindings } from "../../../../components/scans/shared-scan-detail-view";
import { ScanStatusAutoRefresh } from "../../../../components/scans/scan-status-auto-refresh";
import { LocalV2DagScanProgressCard } from "../../../../components/scans/scan-submit-progress";
import { PendingScanDetailView } from "../../../../components/scans/pending-scan-detail-view";
import { ScanProgressReportVisible } from "../../../../components/scans/scan-progress-report-visible";
import { ShareReportActions } from "../../../../components/scans/share-report-actions";
import {
  hasPendingBrowserExtensionNormalization,
  hasPendingPostCompletionFindingWork
} from "../../../../lib/scans/scan-auto-refresh";
import { getVisualEvidenceArtifacts } from "../../../../lib/scans/visual-evidence";
import { isPlatformAdminEmail } from "../../../../server/admin/platform-admin";
import { persistAdminScanSummaryForRecord } from "../../../../server/admin/admin-scan-summary";
import { getDashboardContext } from "../../../../server/auth";
import { withServerTiming } from "../../../../server/performance/log-server-timing";
import { getScanById } from "../../../../server/scans/get-scan-by-id";
import {
  getLocalV2DagReportInput,
  materializeLocalV2DagScanDetail
} from "../../../../server/scans/local-v2-dag-report";
import { persistReportFindingCount } from "../../../../server/scans/persist-report-finding-count";
import {
  getOrganizationScanStatusProjection,
  isPendingScanStatus
} from "../../../../server/scans/scan-status-projection";
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
  const statusProjection = await withServerTiming("app.scan_detail.status_projection", () =>
    getOrganizationScanStatusProjection({ organizationId: organization.id, scanId })
  );
  if (!statusProjection) {
    notFound();
  }
  if (isPendingScanStatus(statusProjection.status)) {
    return (
      <>
        <PendingScanStartedEvent />
        <PendingScanDetailView
          createdAt={statusProjection.createdAt}
          domainHostname={statusProjection.domainHostname}
          profile={statusProjection.profile}
          scanId={statusProjection.id}
          startedAt={statusProjection.startedAt}
          status={statusProjection.status}
        />
      </>
    );
  }
  let [scanRecord, organizationSettings] = await Promise.all([
    withServerTiming("app.scan_detail.record", () =>
      getScanById({
        organizationId: organization.id,
        scanId,
        viewerEmail: user.email
      })
    ),
    getOrganizationSettings(organization.id)
  ]);

  if (!scanRecord) {
    notFound();
  }

  const localV2DagReportInput = getLocalV2DagReportInput(scanRecord);
  const displayScanRecord =
    localV2DagReportInput && scanRecord.scan.status === "completed"
      ? await withServerTiming("app.scan_detail.local_v2_report", () => materializeLocalV2DagScanDetail(scanRecord))
      : scanRecord;
  if (displayScanRecord.scan.status === "completed") {
    await withServerTiming("app.scan_detail.persist_canonical_summary", () =>
      persistAdminScanSummaryForRecord(displayScanRecord)
    );
  }

  const pendingBrowserExtensionNormalization = hasPendingBrowserExtensionNormalization({
    events: scanRecord.events,
    scanType: scanRecord.scan.scanType,
    status: scanRecord.scan.status
  });

  if (typeof displayScanRecord.snapshot?.report_finding_count !== "number" || displayScanRecord.scan.scanType === "browser_extension") {
    const reportFindingCount = await withServerTiming("app.scan_detail.backfill_finding_count", async () =>
      buildScanReportUnifiedFindings(displayScanRecord).length
    );
    await persistReportFindingCount({
      count: reportFindingCount,
      scanId: displayScanRecord.scan.id
    });
  }
  const pendingPostCompletionWork = hasPendingPostCompletionFindingWork({
    reportFindingsDerived: true,
    signalEnrichmentWorkflow: scanRecord.signalEnrichmentWorkflow,
    status: scanRecord.scan.status
  });

  const scanDomainLabel = displayScanRecord.scan.domainHostname?.trim() || "Scanned website";
  const isPlatformAdmin = isPlatformAdminEmail(user.email);
  const canUseAdvancedReportActions = isPlatformAdmin || membership.role === "admin" || membership.role === "advanced";
  const canUseLocalExtensionScan = isPlatformAdmin;
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
      <PendingScanStartedEvent />
      <ScanProgressReportVisible scanId={displayScanRecord.scan.id} />
      <SharedScanDetailView
        analyticsScanSource="dashboard"
        autoRefresh={
          <ScanStatusAutoRefresh
            pendingBrowserExtensionNormalization={pendingBrowserExtensionNormalization}
            pendingPostCompletionWork={pendingPostCompletionWork}
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
                  allowLocalExtensionScan={canUseLocalExtensionScan}
                  allowRestrictedScanOptions={allowRestrictedScanOptions}
                  buttonLabel="Scan"
                  compact
                  defaultScanFrom={organizationSettings?.defaultScanFrom ?? "eu_ie"}
                  inputLabel="Scan another website"
                  inputPlaceholder="Enter another site"
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
        viewerAccessRole={membership.role}
      />
    </>
  );
}

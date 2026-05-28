import { notFound } from "next/navigation";
import { PendingScanStartedEvent } from "../../../../components/analytics/data-layer-events";
import { DomainScanForm } from "../../../../components/marketing/domain-scan-form";
import { SharedScanDetailView } from "../../../../components/scans/shared-scan-detail-view";
import { buildScanReportUnifiedFindings } from "../../../../components/scans/shared-scan-detail-view";
import { ScanStatusAutoRefresh } from "../../../../components/scans/scan-status-auto-refresh";
import { ShareReportActions } from "../../../../components/scans/share-report-actions";
import { hasPendingPostCompletionFindingWork } from "../../../../lib/scans/scan-auto-refresh";
import { getVisualEvidenceArtifacts } from "../../../../lib/scans/visual-evidence";
import { isPlatformAdminEmail } from "../../../../server/admin/platform-admin";
import { getDashboardContext } from "../../../../server/auth";
import { withServerTiming } from "../../../../server/performance/log-server-timing";
import { getScanById } from "../../../../server/scans/get-scan-by-id";
import { persistReportFindingCount } from "../../../../server/scans/persist-report-finding-count";

type ScanDetailPageProps = {
  params: Promise<{
    scanId: string;
  }>;
  searchParams?: Promise<{
    recentScanReused?: string;
  }>;
};

const RECENT_SCAN_REUSED_MESSAGE =
  "CertScore found a completed scan for this website from the past 24 hours, so this request opened the existing report instead of starting a duplicate scan.";

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
  const scanRecord = await withServerTiming("app.scan_detail.record", () =>
    getScanById({
      organizationId: organization.id,
      scanId,
      viewerEmail: user.email
    })
  );

  if (!scanRecord) {
    notFound();
  }

  if (typeof scanRecord.snapshot?.report_finding_count !== "number") {
    const reportFindingCount = await withServerTiming("app.scan_detail.backfill_finding_count", async () =>
      buildScanReportUnifiedFindings(scanRecord).length
    );
    await persistReportFindingCount({
      count: reportFindingCount,
      scanId: scanRecord.scan.id
    });
  }
  const pendingPostCompletionWork = hasPendingPostCompletionFindingWork({
    reportFindingsDerived: true,
    signalEnrichmentWorkflow: scanRecord.signalEnrichmentWorkflow,
    status: scanRecord.scan.status
  });

  const scanDomainLabel = scanRecord.scan.domainHostname?.trim() || "Scanned website";
  const isPlatformAdmin = isPlatformAdminEmail(user.email);
  const visualEvidenceArtifacts = canViewCapturedImage({ isPlatformAdmin, role: membership.role })
    ? getVisualEvidenceArtifacts(scanRecord.runtimeArtifacts)
        .filter((artifact) => artifact.status === "available" && artifact.key)
        .sort((left, right) => {
          const leftPriority = left.captureStep === "initial_load" ? 0 : 1;
          const rightPriority = right.captureStep === "initial_load" ? 0 : 1;
          return leftPriority - rightPriority;
        })
    : [];
  const visualEvidenceArtifact = visualEvidenceArtifacts[0] ?? null;
  const visualEvidenceHref = visualEvidenceArtifact
    ? `/api/scans/${scanRecord.scan.id}/visual-evidence/${encodeURIComponent(visualEvidenceArtifact.id)}`
    : null;

  return (
    <>
      <PendingScanStartedEvent />
      <SharedScanDetailView
        analyticsScanSource="dashboard"
        autoRefresh={
          <ScanStatusAutoRefresh
            pendingPostCompletionWork={pendingPostCompletionWork}
            status={scanRecord.scan.status}
          />
        }
        createdAtInfoTip={recentScanReused ? RECENT_SCAN_REUSED_MESSAGE : null}
        headerActions={
          scanRecord.scan.status === "completed" ? (
            <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <ShareReportActions
                domainLabel={scanDomainLabel}
                scanId={scanRecord.scan.id}
                visualEvidenceHref={visualEvidenceHref}
              />
              <div className="w-full lg:ml-auto lg:max-w-[16rem]">
                <DomainScanForm
                  buttonLabel="Scan"
                  compact
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
        scanRecord={scanRecord}
        viewerAccessRole={membership.role}
      />
    </>
  );
}

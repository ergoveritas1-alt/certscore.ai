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
  const [{ scanId }, { membership, organization, user }] = await Promise.all([params, getDashboardContext()]);
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const recentScanReused = resolvedSearchParams.recentScanReused === "1";
  const scanRecord = await getScanById({
    organizationId: organization.id,
    scanId,
    viewerEmail: user.email
  });

  if (!scanRecord) {
    notFound();
  }

  if (typeof scanRecord.snapshot?.report_finding_count !== "number") {
    const reportFindingCount = buildScanReportUnifiedFindings(scanRecord).length;
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
          const leftPriority = left.captureStep === "consent_surface_pre_interaction" ? 0 : 1;
          const rightPriority = right.captureStep === "consent_surface_pre_interaction" ? 0 : 1;
          return leftPriority - rightPriority;
        })
    : [];
  const visualEvidenceLinks = visualEvidenceArtifacts.map((artifact) => ({
    captureStep: artifact.captureStep,
    href: `/api/scans/${scanRecord.scan.id}/visual-evidence/${encodeURIComponent(artifact.id)}`,
    id: artifact.id
  }));

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
                visualEvidenceLinks={visualEvidenceLinks}
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

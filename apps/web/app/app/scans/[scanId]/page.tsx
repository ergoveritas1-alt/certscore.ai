import { notFound } from "next/navigation";
import { SharedScanDetailView } from "../../../../components/scans/shared-scan-detail-view";
import { buildScanReportUnifiedFindings } from "../../../../components/scans/shared-scan-detail-view";
import { ScanStatusAutoRefresh } from "../../../../components/scans/scan-status-auto-refresh";
import { hasPendingPostCompletionFindingWork } from "../../../../lib/scans/scan-auto-refresh";
import { ScanViewActions } from "../../../../components/scans/scan-view-actions";
import { getRescanAvailability } from "../../../../lib/scans/rescan-policy";
import { getDashboardContext } from "../../../../server/auth";
import { getScanById } from "../../../../server/scans/get-scan-by-id";
import { persistReportFindingCount } from "../../../../server/scans/persist-report-finding-count";

function formatDateTime(value: string | null) {
  if (!value) {
    return "This domain cannot be re-scanned yet.";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short"
  }).format(new Date(value));
}

function formatRescanCooldownMessage(value: string | null, planCode: string) {
  if (!value) {
    return "This domain cannot be re-scanned yet.";
  }

  return `Next re-scan available ${formatDateTime(value)} for this ${
    planCode === "free" ? "Free" : planCode === "pro" ? "Pro" : "Ultra"
  } plan domain.`;
}

type ScanDetailPageProps = {
  params: Promise<{
    scanId: string;
  }>;
};

export default async function ScanDetailPage({ params }: ScanDetailPageProps) {
  const [{ scanId }, { organization, user }] = await Promise.all([params, getDashboardContext()]);
  const scanRecord = await getScanById({
    organizationId: organization.id,
    scanId,
    viewerEmail: user.email
  });

  if (!scanRecord) {
    notFound();
  }

  const reportFindingCount = buildScanReportUnifiedFindings(scanRecord).length;
  await persistReportFindingCount({
    count: reportFindingCount,
    scanId: scanRecord.scan.id
  });
  const pendingPostCompletionWork = hasPendingPostCompletionFindingWork({
    signalEnrichmentWorkflow: scanRecord.signalEnrichmentWorkflow,
    status: scanRecord.scan.status
  });

  const canRescan = scanRecord.scan.status === "completed" && Boolean(scanRecord.scan.domainId);
  const rescanAvailability = canRescan
    ? getRescanAvailability({
        activeScanExists: false,
        lastScannedAt: scanRecord.scan.createdAt,
        planCode: organization.plan
      })
    : null;
  const rescanCooldownMessage =
    canRescan && rescanAvailability
      ? rescanAvailability.reason
        ? rescanAvailability.reason
        : !rescanAvailability.allowed
          ? formatRescanCooldownMessage(rescanAvailability.nextAllowedAt, organization.plan)
          : null
      : null;

  return (
    <SharedScanDetailView
      autoRefresh={
        <ScanStatusAutoRefresh
          pendingPostCompletionWork={pendingPostCompletionWork}
          status={scanRecord.scan.status}
        />
      }
      headerActions={
        <ScanViewActions
          alternateHref={`/app/scans/${scanRecord.scan.id}/json`}
          alternateLabel="json-view"
          canRescan={canRescan && Boolean(scanRecord.scan.domainId) && Boolean(rescanAvailability)}
          cooldownMessage={rescanCooldownMessage}
          domainId={scanRecord.scan.domainId}
          rescanDisabled={Boolean(rescanAvailability && !rescanAvailability.allowed)}
        />
      }
      scanRecord={scanRecord}
    />
  );
}

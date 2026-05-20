import { notFound } from "next/navigation";
import { PendingScanStartedEvent } from "../../../../components/analytics/data-layer-events";
import { SharedScanDetailView } from "../../../../components/scans/shared-scan-detail-view";
import { buildScanReportUnifiedFindings } from "../../../../components/scans/shared-scan-detail-view";
import { ScanStatusAutoRefresh } from "../../../../components/scans/scan-status-auto-refresh";
import { hasPendingPostCompletionFindingWork } from "../../../../lib/scans/scan-auto-refresh";
import { ScanViewActions } from "../../../../components/scans/scan-view-actions";
import { getLaunchScanThrottleCopy } from "../../../../lib/launch-mode";
import { getRescanAvailability } from "../../../../lib/scans/rescan-policy";
import { getDashboardContext } from "../../../../server/auth";
import { getScanById } from "../../../../server/scans/get-scan-by-id";
import { persistReportFindingCount } from "../../../../server/scans/persist-report-finding-count";
import { isScanWithinReuseWindow } from "../../../../server/scans/recent-scan-reuse";

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
  void planCode;

  if (!value) {
    return getLaunchScanThrottleCopy();
  }

  return getLaunchScanThrottleCopy(formatDateTime(value));
}

type ScanDetailPageProps = {
  params: Promise<{
    scanId: string;
  }>;
  searchParams?: Promise<{
    recentScanReused?: string;
  }>;
};

function RecentScanReuseNotice() {
  return (
    <section className="rounded-[1.2rem] border border-sky-200 bg-sky-50 px-5 py-4 text-sm leading-6 text-slate-700">
      <p className="font-semibold text-slate-950">Recent scan reused</p>
      <p className="mt-1">
        CertScore found a completed scan for this website from the past 24 hours, so this request opened the existing report instead of
        starting a duplicate scan.
      </p>
    </section>
  );
}

export default async function ScanDetailPage({ params, searchParams }: ScanDetailPageProps) {
  const [{ scanId }, { organization, user }] = await Promise.all([params, getDashboardContext()]);
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

  const reportFindingCount = buildScanReportUnifiedFindings(scanRecord).length;
  await persistReportFindingCount({
    count: reportFindingCount,
    scanId: scanRecord.scan.id
  });
  const pendingPostCompletionWork = hasPendingPostCompletionFindingWork({
    reportFindingsDerived: true,
    signalEnrichmentWorkflow: scanRecord.signalEnrichmentWorkflow,
    status: scanRecord.scan.status
  });

  const canRescan = scanRecord.scan.status === "completed" && Boolean(scanRecord.scan.domainId);
  const recentScanActivityAt = scanRecord.scan.completedAt ?? scanRecord.scan.startedAt ?? scanRecord.scan.createdAt;
  const scanIsWithinReuseWindow = isScanWithinReuseWindow({
    completedAt: recentScanActivityAt
  });
  const rescanAvailability = canRescan
    ? getRescanAvailability({
        activeScanExists: false,
        lastScannedAt: scanRecord.scan.createdAt,
        planCode: organization.plan
      })
    : null;
  const showRescan = canRescan && !scanIsWithinReuseWindow && Boolean(scanRecord.scan.domainId) && Boolean(rescanAvailability);
  const rescanCooldownMessage =
    showRescan && rescanAvailability
      ? rescanAvailability.reason
        ? rescanAvailability.reason
        : !rescanAvailability.allowed
          ? formatRescanCooldownMessage(rescanAvailability.nextAllowedAt, organization.plan)
          : null
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
        headerActions={
          <ScanViewActions
            alternateHref={canRescan ? `/app/scans/${scanRecord.scan.id}/json` : null}
            alternateLabel={canRescan ? "json-view" : null}
            canRescan={showRescan}
            cooldownMessage={rescanCooldownMessage}
            domainId={scanRecord.scan.domainId}
            rescanDisabled={Boolean(rescanAvailability && !rescanAvailability.allowed)}
          />
        }
        previewNotice={recentScanReused ? <RecentScanReuseNotice /> : null}
        scanRecord={scanRecord}
      />
    </>
  );
}

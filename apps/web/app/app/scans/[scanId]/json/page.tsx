import { Badge } from "@website-signal-risk-scanner/ui";
import { notFound } from "next/navigation";
import type { PlanCode } from "@website-signal-risk-scanner/shared";
import { buildScanReportUnifiedFindings } from "../../../../../components/scans/shared-scan-detail-view";
import { ScanFindingsPane } from "../../../../../components/scans/scan-findings-pane";
import { ScanViewActions } from "../../../../../components/scans/scan-view-actions";
import { ScanStatusAutoRefresh } from "../../../../../components/scans/scan-status-auto-refresh";
import {
  hasPendingBrowserExtensionNormalization,
  hasPendingPostCompletionFindingWork
} from "../../../../../lib/scans/scan-auto-refresh";
import { getAdminScanThrottleMs, getScanThrottleCopy } from "../../../../../lib/scan-access";
import { getRescanAvailability } from "../../../../../lib/scans/rescan-policy";
import { isPlatformAdminEmail } from "../../../../../server/admin/platform-admin";
import { getDashboardContext } from "../../../../../server/auth";
import { getScanById } from "../../../../../server/scans/get-scan-by-id";
import { persistReportFindingCount } from "../../../../../server/scans/persist-report-finding-count";
import { isScanWithinReuseWindow } from "../../../../../server/scans/recent-scan-reuse";
import { canUseRestrictedScanOptions } from "../../../../../server/scans/restricted-scan-options";
import { getOrganizationSettings } from "../../../../../server/settings/get-organization-settings";
import { mapUnifiedPacketsForJsonView } from "./findings";

type ScanJsonPageProps = {
  params: Promise<{
    scanId: string;
  }>;
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short"
  }).format(new Date(value));
}

function formatStatus(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatRescanCooldownMessage(value: string | null, planCode: PlanCode) {
  void planCode;

  if (!value) {
    return getScanThrottleCopy();
  }

  return getScanThrottleCopy(formatDateTime(value));
}

export default async function ScanJsonPage({ params }: ScanJsonPageProps) {
  const [{ scanId }, { membership, organization, user }] = await Promise.all([params, getDashboardContext()]);
  const adminRescanCooldownMs = isPlatformAdminEmail(user.email) ? getAdminScanThrottleMs() : undefined;
  const allowRestrictedScanOptions = canUseRestrictedScanOptions({
    membershipRole: membership.role,
    userEmail: user.email
  });
  const [scanRecord, organizationSettings] = await Promise.all([
    getScanById({
      organizationId: organization.id,
      scanId,
      viewerEmail: user.email
    }),
    getOrganizationSettings(organization.id)
  ]);

  if (!scanRecord) {
    notFound();
  }

  const canRescan = scanRecord.scan.status === "completed" && Boolean(scanRecord.scan.domainId);
  const recentScanActivityAt = scanRecord.scan.completedAt ?? scanRecord.scan.startedAt ?? scanRecord.scan.createdAt;
  const scanIsWithinReuseWindow = isScanWithinReuseWindow({
    completedAt: recentScanActivityAt
  });
  const rescanAvailability = canRescan
    ? getRescanAvailability({
        activeScanExists: false,
        lastScannedAt: scanRecord.scan.createdAt,
        planCode: organization.plan,
        rescanCooldownMs: adminRescanCooldownMs
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

  const allFindings = mapUnifiedPacketsForJsonView({
    domainHostname: scanRecord.scan.domainHostname,
    packets: buildScanReportUnifiedFindings(scanRecord)
  });
  await persistReportFindingCount({
    count: allFindings.length,
    scanId: scanRecord.scan.id
  });
  const pendingPostCompletionWork = hasPendingPostCompletionFindingWork({
    reportFindingsDerived: true,
    signalEnrichmentWorkflow: scanRecord.signalEnrichmentWorkflow,
    status: scanRecord.scan.status
  });
  const pendingBrowserExtensionNormalization = hasPendingBrowserExtensionNormalization({
    events: scanRecord.events,
    scanType: scanRecord.scan.scanType,
    status: scanRecord.scan.status
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <Badge tone={scanRecord.scan.status === "completed" ? "success" : "warning"}>
            {formatStatus(scanRecord.scan.status)}
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight">{scanRecord.scan.domainHostname ?? "Unknown website"}</h1>
          <p className="font-mono text-xs text-slate-500">scan_id {scanRecord.scan.id}</p>
          <p className="text-sm text-slate-500">
            Scan created {formatDateTime(scanRecord.scan.createdAt)} · Started {formatDateTime(scanRecord.scan.startedAt)} · Completed{" "}
            {formatDateTime(scanRecord.scan.completedAt)}
          </p>
          <ScanStatusAutoRefresh
            pendingBrowserExtensionNormalization={pendingBrowserExtensionNormalization}
            pendingPostCompletionWork={pendingPostCompletionWork}
            scanId={scanRecord.scan.id}
            status={scanRecord.scan.status}
          />
        </div>
        <ScanViewActions
          allowRestrictedScanOptions={allowRestrictedScanOptions}
          alternateHref={`/app/scans/${scanRecord.scan.id}`}
          alternateLabel="report-view"
          canRescan={showRescan}
          cooldownMessage={rescanCooldownMessage}
          defaultScanFrom={organizationSettings?.defaultScanFrom ?? "eu_ie"}
          domainId={scanRecord.scan.domainId}
          rescanDisabled={Boolean(rescanAvailability && !rescanAvailability.allowed)}
        />
      </div>

      <ScanFindingsPane
        title={`All findings (${allFindings.length})`}
        description="Unified findings for this scan, using the same surfaced and audit-only finding pipeline as the report view."
        findings={allFindings}
      />
    </div>
  );
}

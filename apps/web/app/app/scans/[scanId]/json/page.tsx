import { Badge } from "@website-signal-risk-scanner/ui";
import { notFound } from "next/navigation";
import type { PlanCode } from "@website-signal-risk-scanner/shared";
import { buildScanReportUnifiedFindings } from "../../../../../components/scans/shared-scan-detail-view";
import { ScanFindingsPane } from "../../../../../components/scans/scan-findings-pane";
import { ScanViewActions } from "../../../../../components/scans/scan-view-actions";
import { ScanStatusAutoRefresh } from "../../../../../components/scans/scan-status-auto-refresh";
import { getRescanAvailability } from "../../../../../lib/scans/rescan-policy";
import { getDashboardContext } from "../../../../../server/auth";
import { getScanById } from "../../../../../server/scans/get-scan-by-id";
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
  if (!value) {
    return "This domain cannot be re-scanned yet.";
  }

  return `Next re-scan available ${formatDateTime(value)} for this ${
    planCode === "free" ? "Free" : planCode === "pro" ? "Pro" : "Ultra"
  } plan domain.`;
}

export default async function ScanJsonPage({ params }: ScanJsonPageProps) {
  const [{ scanId }, { organization, user }] = await Promise.all([params, getDashboardContext()]);
  const scanRecord = await getScanById({
    organizationId: organization.id,
    scanId,
    viewerEmail: user.email
  });

  if (!scanRecord) {
    notFound();
  }

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

  const allFindings = mapUnifiedPacketsForJsonView({
    domainHostname: scanRecord.scan.domainHostname,
    packets: buildScanReportUnifiedFindings(scanRecord).filter((packet) => packet.presentationDecision.status === "surface")
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
          <ScanStatusAutoRefresh status={scanRecord.scan.status} />
        </div>
        <ScanViewActions
          alternateHref={`/app/scans/${scanRecord.scan.id}`}
          alternateLabel="report-view"
          canRescan={canRescan && Boolean(scanRecord.scan.domainId) && Boolean(rescanAvailability)}
          cooldownMessage={rescanCooldownMessage}
          domainId={scanRecord.scan.domainId}
          rescanDisabled={Boolean(rescanAvailability && !rescanAvailability.allowed)}
        />
      </div>

      <ScanFindingsPane
        title={`All findings (${allFindings.length})`}
        description="Surfaced findings for this scan, using the same unified finding pipeline as the report view."
        findings={allFindings}
      />
    </div>
  );
}

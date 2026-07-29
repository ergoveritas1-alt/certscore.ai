import { ScanReportLoadingCard } from "./scan-report-loading-card";
import { ScanStatusAutoRefresh } from "./scan-status-auto-refresh";

export function PendingScanDetailView({
  domainHostname,
  pendingPostCompletionWork = false,
  scanId,
  status,
}: {
  createdAt: string;
  domainHostname: string | null;
  pendingPostCompletionWork?: boolean;
  profile: string;
  scanId: string;
  startedAt: string | null;
  status: string;
}) {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">CertScore.ai scan</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
          Scan: {domainHostname?.trim() || "website"}
        </h1>
      </div>
      <ScanReportLoadingCard
        description="The scan is complete. We’re organizing the evidence into your report now, and it will open automatically when it’s ready."
        title="Finishing your report"
      />
      <ScanStatusAutoRefresh
        pendingPostCompletionWork={pendingPostCompletionWork}
        scanId={scanId}
        silent
        status={status}
      />
    </div>
  );
}

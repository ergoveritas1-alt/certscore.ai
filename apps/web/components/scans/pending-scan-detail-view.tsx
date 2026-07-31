import React from "react";
import { ScanReportLoadingCard } from "./scan-report-loading-card";
import { ScanStatusAutoRefresh } from "./scan-status-auto-refresh";
import { LocalV2DagScanProgressCard } from "./scan-submit-progress";

export function PendingScanDetailView({
  createdAt,
  domainHostname,
  pendingPostCompletionWork = false,
  profile,
  scanId,
  startedAt,
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
      {pendingPostCompletionWork ? (
        <ScanReportLoadingCard
          description="The scan is complete. We’re organizing the evidence into your report now, and it will open automatically when it’s ready."
          title="Finishing your report"
        />
      ) : (
        <LocalV2DagScanProgressCard
          createdAt={createdAt}
          profileValue={profile}
          startedAt={startedAt}
        />
      )}
      <ScanStatusAutoRefresh
        pendingPostCompletionWork={pendingPostCompletionWork}
        scanId={scanId}
        silent
        status={status}
      />
    </div>
  );
}

import { LocalV2DagScanProgressCard } from "./scan-submit-progress";
import { ScanStatusAutoRefresh } from "./scan-status-auto-refresh";

export function PendingScanDetailView({
  createdAt,
  domainHostname,
  profile,
  scanId,
  startedAt,
  status,
}: {
  createdAt: string;
  domainHostname: string | null;
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
      <LocalV2DagScanProgressCard
        createdAt={createdAt}
        profileValue={profile}
        startedAt={startedAt}
      />
      <ScanStatusAutoRefresh scanId={scanId} silent status={status} />
    </div>
  );
}

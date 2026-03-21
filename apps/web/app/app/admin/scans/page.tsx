import Link from "next/link";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { PendingButtonLink } from "../../../../components/ui/pending-link";
import { listAdminScans } from "../../../../server/admin/list-admin-scans";
import { AdminScansAutoRefresh } from "./admin-scans-auto-refresh";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

export default async function AdminScansPage() {
  const scans = await listAdminScans(100);
  const hasActiveScans = scans.some((scan) => scan.status === "queued" || scan.status === "running");

  return (
    <Card className="border-slate-200 bg-white">
      <CardHeader>
        <CardTitle>Scan Admin</CardTitle>
      </CardHeader>
      <CardContent>
        <AdminScansAutoRefresh hasActiveScans={hasActiveScans} />
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="pb-3 pr-4 font-medium">Workspace</th>
                <th className="pb-3 pr-4 font-medium">Domain</th>
                <th className="pb-3 pr-4 font-medium">Scan</th>
                <th className="pb-3 pr-4 font-medium">Snapshot</th>
                <th className="pb-3 pr-4 font-medium">Completed</th>
                <th className="pb-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {scans.map((scan) => (
                <tr key={scan.scanId}>
                  <td className="py-4 pr-4 text-slate-700">{scan.organizationName ?? "Unknown workspace"}</td>
                  <td className="py-4 pr-4 text-slate-700">{scan.domainHostname ?? "Unknown domain"}</td>
                  <td className="py-4 pr-4 text-slate-700">
                    <p>{scan.scanType}</p>
                    <p>{scan.status}</p>
                    <p>{scan.pagesScanned} pages</p>
                  </td>
                  <td className="py-4 pr-4 text-slate-700">
                    <p>Signals {scan.totalSignals ?? 0}</p>
                    <p>CertScore.ai {scan.certscoreOverall ?? "n/a"}</p>
                  </td>
                  <td className="py-4 pr-4 text-slate-700">{formatDateTime(scan.completedAt)}</td>
                  <td className="py-4">
                    <PendingButtonLink href={`/app/admin/scans/${scan.scanId}`} idleContent="Inspect snapshot" pendingContent="Opening..." size="sm" variant="secondary" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

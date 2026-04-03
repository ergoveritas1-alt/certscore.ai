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

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export default async function AdminScansPage() {
  const scans = await listAdminScans(100);
  const hasActiveScans = scans.some((scan) => scan.status === "queued" || scan.status === "running");
  const completedCount = scans.filter((scan) => scan.status === "completed").length;
  const findingsCount = scans.reduce((sum, scan) => sum + (scan.findingCount ?? 0), 0);
  const signalsCount = scans.reduce((sum, scan) => sum + (scan.totalSignals ?? 0), 0);

  return (
    <div className="space-y-8">
      <AdminScansAutoRefresh hasActiveScans={hasActiveScans} />
      <section
        className={cx(
          "relative overflow-hidden rounded-[2rem] border border-slate-200/80 bg-gradient-to-br p-6 shadow-[0_24px_80px_-36px_rgba(15,23,42,0.35)] md:p-7",
          hasActiveScans ? "from-sky-100 via-white to-cyan-100" : "from-slate-100 via-white to-slate-50"
        )}
      >
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(15,23,42,0.12),transparent_52%)]" />
        <div className="relative grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cx(
                  "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
                  hasActiveScans ? "border-sky-200 bg-sky-50 text-sky-800" : "border-slate-200 bg-slate-50 text-slate-700"
                )}
              >
                Scan admin
              </span>
              {hasActiveScans ? (
                <span className="rounded-full border border-sky-200 bg-sky-50/90 px-3 py-1 text-xs font-medium text-sky-800">
                  Active scans live
                </span>
              ) : null}
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950 md:text-[2.1rem]">Admin scan history</h1>
              <p className="max-w-3xl text-sm leading-6 text-slate-600 md:text-[15px]">
                Inspect recent scans across workspaces, compare snapshot volume, and jump directly into raw scan details.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            {[
              { label: "Visible scans", value: scans.length },
              { label: "Completed", value: completedCount },
              { label: "Signals retained", value: signalsCount },
              { label: "Findings retained", value: findingsCount }
            ].map((tile) => (
              <div
                key={tile.label}
                className="rounded-[1.4rem] border border-slate-200/80 bg-white/78 p-4 shadow-[0_16px_40px_-28px_rgba(15,23,42,0.35)] backdrop-blur"
              >
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{tile.label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{tile.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Card className="overflow-hidden border-slate-200/80 bg-white/90 shadow-[0_18px_55px_-32px_rgba(15,23,42,0.28)]">
        <CardHeader>
          <CardTitle>Latest scans</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 lg:grid-cols-2">
            {scans.map((scan) => (
              <div
                key={scan.scanId}
                className="rounded-[1.35rem] border border-slate-200/80 bg-slate-50/55 p-4 shadow-[0_12px_40px_-28px_rgba(15,23,42,0.3)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="font-semibold tracking-tight text-slate-950">{scan.domainHostname ?? "Unknown domain"}</p>
                    <p className="text-sm text-slate-600">{scan.organizationName ?? "Unknown workspace"}</p>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-700">
                    {scan.status}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Scan</p>
                    <p className="mt-1 text-sm text-slate-800">{scan.scanType}</p>
                    <p className="text-xs text-slate-500">{scan.pagesScanned} pages</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Snapshot</p>
                    <p className="mt-1 text-sm text-slate-800">Signals {scan.totalSignals ?? 0}</p>
                    <p className="text-xs text-slate-500">Findings {scan.findingCount ?? 0}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Completed</p>
                    <p className="mt-1 text-sm text-slate-800">{formatDateTime(scan.completedAt)}</p>
                  </div>
                </div>
                <div className="mt-4">
                  <PendingButtonLink
                    href={`/app/admin/scans/${scan.scanId}`}
                    idleContent="Inspect snapshot"
                    pendingContent="Opening..."
                    size="sm"
                    variant="secondary"
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

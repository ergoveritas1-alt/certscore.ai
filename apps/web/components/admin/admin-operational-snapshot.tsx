import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import {
  ADMIN_OPERATIONAL_METRIC_DEFINITIONS,
  ADMIN_OPERATIONAL_SNAPSHOT_PERIODS,
  type AdminOperationalMetricDefinition,
  type AdminOperationalSnapshotHealth,
  type AdminOperationalSnapshotPeriod,
} from "../../lib/admin/admin-operational-snapshot";

type SnapshotMetric = {
  anomaly?: "good" | "warning" | "critical" | null;
  comparison?: string | null;
  definition?: AdminOperationalMetricDefinition;
  detail: string;
  href?: string | null;
  label: string;
  value: string;
};

type SnapshotRate = {
  anomaly?: "good" | "warning" | "critical" | null;
  href?: string | null;
  label: string;
  value: string;
};

type SnapshotTrend = {
  className?: string;
  key: string;
  label: string;
  title: string;
  value: number;
};

type SnapshotBreakdown = {
  detail: string;
  href?: string | null;
  label: string;
  value: string;
};

function anomalyClass(anomaly: SnapshotMetric["anomaly"] | SnapshotRate["anomaly"]) {
  if (anomaly === "critical") return "bg-rose-50 text-rose-800 ring-1 ring-inset ring-rose-100";
  if (anomaly === "warning") return "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-100";
  if (anomaly === "good") return "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-100";
  return "bg-slate-50 text-slate-950";
}

function linkedContent(key: string, href: string | null | undefined, className: string, children: ReactNode) {
  return href ? <Link className={`${className} transition hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-sky-200`} href={href} key={key} prefetch={false}>{children}</Link> : <div className={className} key={key}>{children}</div>;
}

export function AdminOperationalSnapshot({
  ariaLabel,
  basePath,
  breakdown,
  breakdownColumns = "sm:grid-cols-2 xl:grid-cols-4",
  health,
  metrics,
  period,
  rates,
  searchParams,
  subtitle,
  trend,
  trendTotal,
}: {
  ariaLabel: string;
  basePath: string;
  breakdown: SnapshotBreakdown[];
  breakdownColumns?: string;
  health: AdminOperationalSnapshotHealth;
  metrics: SnapshotMetric[];
  period: AdminOperationalSnapshotPeriod;
  rates: SnapshotRate[];
  searchParams: Record<string, string | null | undefined>;
  subtitle: string;
  trend: SnapshotTrend[];
  trendTotal: string;
}) {
  const maxTrend = Math.max(1, ...trend.map((bucket) => bucket.value));
  const healthClass = health.status === "current" ? "text-emerald-700" : health.status === "delayed" ? "text-amber-700" : "text-slate-400";

  return (
    <Card className="overflow-hidden border-slate-200 bg-white">
      <CardHeader className="border-b border-slate-100 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Operational snapshot</CardTitle>
            <p className="mt-0.5 text-xs text-slate-500">{subtitle} · Pacific time · <span className={healthClass}>{health.label}</span></p>
          </div>
          <form action={basePath} className="flex items-center gap-2" method="get">
            {Object.entries(searchParams).map(([key, value]) => key === "page" || key === "period" || key === "snapshot" || !value ? null : <input key={key} name={key} type="hidden" value={value} />)}
            <label className="sr-only" htmlFor={`${ariaLabel}-snapshot-period`}>Snapshot period</label>
            <select aria-label="Snapshot period" className="h-9 rounded-full border border-slate-300 bg-white px-3 text-sm text-slate-700" defaultValue={period} id={`${ariaLabel}-snapshot-period`} name="snapshot">
              {ADMIN_OPERATIONAL_SNAPSHOT_PERIODS.map((value) => <option key={value} value={value}>{value === "1h" ? "Last hour" : value === "24h" ? "Last 24 hours" : value === "7d" ? "Last 7 days" : value === "30d" ? "Last 30 days" : "Last year"}</option>)}
            </select>
            <button className="app-raised-button inline-flex h-9 items-center rounded-full px-3 text-sm font-semibold text-slate-700" type="submit">Apply</button>
          </form>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid grid-cols-3 gap-px bg-slate-100 sm:grid-cols-6">
          {metrics.map((metric) => linkedContent(metric.label, metric.href, "min-w-0 bg-white px-3 py-2.5", <div title={metric.definition ? ADMIN_OPERATIONAL_METRIC_DEFINITIONS[metric.definition] : undefined}><p className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500">{metric.label}</p><div className="mt-0.5 flex min-w-0 items-baseline gap-1.5"><p className="truncate text-lg font-semibold text-slate-950">{metric.value}</p>{metric.comparison ? <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold ${anomalyClass(metric.anomaly)}`} title="Change from the previous matching period">{metric.comparison}</span> : null}</div><p className="truncate text-[10px] text-slate-400">{metric.detail}</p></div>))}
        </div>
        <div className="grid gap-4 border-t border-slate-100 p-3 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2"><p className="text-xs font-semibold text-slate-700">{trendTotal} activity</p><p className="text-[10px] text-slate-400">{trend[0]?.label ?? "Start"} — {trend.at(-1)?.label ?? "Now"} · Pacific time</p></div>
            <div aria-label={ariaLabel} className="flex h-14 items-end gap-1" role="img">
              {trend.map((bucket) => <div aria-hidden="true" className={`min-w-0 flex-1 rounded-t transition ${bucket.className ?? "bg-sky-500 hover:bg-sky-600"}`} key={bucket.key} style={{ height: `${Math.max(bucket.value > 0 ? 4 : 1, (bucket.value / maxTrend) * 56)}px` }} title={bucket.title} />)}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {rates.map((rate) => linkedContent(rate.label, rate.href, `rounded-lg px-2 py-1.5 ${anomalyClass(rate.anomaly)}`, <div><p className="truncate text-[10px] text-slate-500">{rate.label}</p><p className="mt-0.5 text-sm font-semibold">{rate.value}</p></div>))}
          </div>
        </div>
        <div className={`grid gap-px border-t border-slate-100 bg-slate-100 ${breakdownColumns}`}>
          {breakdown.map((item) => linkedContent(item.label, item.href, "flex items-center justify-between gap-3 bg-white px-3 py-2.5", <div className="contents"><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-900">{item.label}</p><p className="truncate text-[10px] text-slate-500">{item.detail}</p></div><p className="shrink-0 text-lg font-semibold text-slate-950">{item.value}</p></div>))}
        </div>
      </CardContent>
    </Card>
  );
}

import type { ReactNode } from "react";
import { InfoTip } from "./info-tip";
import { METRIC_GRID_CLASS, SummaryMetricTile } from "./report-primitives";
import { ScanReportDisclosureIcon } from "./scan-report-disclosure-icon";

type SummaryMetric = {
  label: string;
  value: ReactNode;
  tooltip?: ReactNode;
};

type SummaryBadge = {
  label: ReactNode;
  tone?: "neutral" | "warning";
  tooltip?: ReactNode;
};

type ReportExecutiveSummaryProps = {
  title?: ReactNode;
  titleTooltip?: ReactNode;
  intro?: ReactNode;
  metrics: SummaryMetric[];
  badges?: SummaryBadge[];
  statusCallout?: {
    title: ReactNode;
    details: string[];
    tone: "danger" | "success" | "warning";
  } | null;
};

function getCalloutClassName(tone: "danger" | "success" | "warning") {
  if (tone === "danger") {
    return "rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950";
  }

  if (tone === "success") {
    return "rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950";
  }

  return "rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950";
}

function getCalloutListClassName(tone: "danger" | "success" | "warning") {
  if (tone === "danger") {
    return "mt-2 space-y-1 text-rose-900";
  }

  if (tone === "success") {
    return "mt-2 space-y-1 text-emerald-900";
  }

  return "mt-2 space-y-1 text-amber-900";
}

function getBadgeClassName(tone: "neutral" | "warning" = "neutral") {
  if (tone === "warning") {
    return "flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-amber-800";
  }

  return "flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-slate-700";
}

export function ReportExecutiveSummary({
  title = "Executive summary",
  titleTooltip,
  intro,
  metrics,
  badges = [],
  statusCallout = null
}: ReportExecutiveSummaryProps) {
  return (
    <div className="grid gap-4">
      {statusCallout ? (
        <details className={`${getCalloutClassName(statusCallout.tone)} group/callout`}>
          <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold marker:hidden [&::-webkit-details-marker]:hidden transition-colors hover:bg-slate-100/70">
            <ScanReportDisclosureIcon className="group-open/callout:rotate-90 opacity-70" />
            <span>{statusCallout.title}</span>
          </summary>
          <ul className={getCalloutListClassName(statusCallout.tone)}>
            {statusCallout.details.map((detail) => (
              <li key={detail}>• {detail}</li>
            ))}
          </ul>
          {badges.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {badges.map((badge) => (
                <div key={String(badge.label)} className={getBadgeClassName(badge.tone)}>
                  <span>{badge.label}</span>
                  {badge.tooltip ? <InfoTip align="start" text={badge.tooltip} /> : null}
                </div>
              ))}
            </div>
          ) : null}
        </details>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <p className="text-base font-semibold text-slate-900">{title}</p>
              {titleTooltip ? <InfoTip align="start" text={titleTooltip} /> : null}
            </div>
            {intro ? <p className="text-sm text-slate-500">{intro}</p> : null}
          </div>

          <div className={METRIC_GRID_CLASS}>
            {metrics.map((metric) => (
              <SummaryMetricTile
                key={String(metric.label)}
                label={String(metric.label)}
                tooltip={metric.tooltip}
                value={metric.value}
              />
            ))}
          </div>

          {badges.length > 0 && !statusCallout ? (
            <div className="flex flex-wrap gap-2">
              {badges.map((badge) => (
                <div key={String(badge.label)} className={getBadgeClassName(badge.tone)}>
                  <span>{badge.label}</span>
                  {badge.tooltip ? <InfoTip align="start" text={badge.tooltip} /> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

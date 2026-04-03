import type { ReactNode } from "react";
import { CollapsibleSectionCard } from "./collapsible-section-card";
import { InfoTip } from "./info-tip";

export const METRIC_GRID_CLASS = "grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4";
export const METRIC_CARD_CLASS =
  "rounded-2xl border border-slate-200/80 bg-white/85 px-4 py-3.5 shadow-[0_10px_30px_-18px_rgba(15,23,42,0.35)] backdrop-blur";
export const METRIC_CARD_VALUE_CLASS = "mt-2 text-base font-semibold tracking-tight text-slate-950";
export const EMPHASIS_METRIC_CARD_CLASS =
  "rounded-2xl border border-amber-200/80 bg-amber-50/85 px-4 py-3.5 shadow-[0_10px_30px_-18px_rgba(180,83,9,0.28)] backdrop-blur";
export const EMPHASIS_METRIC_CARD_VALUE_CLASS = "mt-2 text-base font-semibold tracking-tight text-amber-950";

type SectionSubsectionProps = {
  title: string;
  intro?: string;
  tooltip?: string;
  children: ReactNode;
  defaultOpen?: boolean;
};

export function SectionSubsection(input: SectionSubsectionProps) {
  return (
    <CollapsibleSectionCard
      title={
        <span className="flex items-center gap-1.5">
          <span>{input.title}</span>
          {input.tooltip ? <InfoTip text={input.tooltip} /> : null}
        </span>
      }
      subtitle={input.intro}
      defaultOpen={input.defaultOpen ?? true}
      contentClassName="space-y-4"
    >
      {input.children}
    </CollapsibleSectionCard>
  );
}

type StaticSubsectionProps = {
  title: string;
  intro?: string;
  tooltip?: string;
  children: ReactNode;
};

export function StaticSubsection(input: StaticSubsectionProps) {
  return (
    <div className="space-y-4 rounded-[1.5rem] border border-slate-200/80 bg-white/80 p-5 shadow-[0_14px_40px_-24px_rgba(15,23,42,0.3)] backdrop-blur">
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-slate-900">{input.title}</p>
          {input.tooltip ? <InfoTip text={input.tooltip} /> : null}
        </div>
        {input.intro ? <p className="text-sm text-slate-600">{input.intro}</p> : null}
      </div>
      {input.children}
    </div>
  );
}

type PrimaryPillarGroupProps = {
  title: string;
  children: ReactNode;
};

export function PrimaryPillarGroup(input: PrimaryPillarGroupProps) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-1.5">
        <h2 className="text-lg font-semibold tracking-tight text-slate-950">{input.title}</h2>
      </div>
      <div className="space-y-4">{input.children}</div>
    </section>
  );
}

type SummaryMetricTileProps = {
  href?: string;
  label: string;
  showValueText?: boolean;
  value: ReactNode;
  tooltip?: ReactNode;
  className?: string;
  valueClassName?: string;
};

export function SummaryMetricTile({
  href,
  label,
  showValueText = true,
  value,
  tooltip,
  className,
  valueClassName
}: SummaryMetricTileProps) {
  const rating =
    typeof value === "string" && value.endsWith("/5")
      ? Number.parseFloat(value.replace("/5", ""))
      : null;
  const ratingBucket = rating === null || Number.isNaN(rating) ? null : Math.max(0, Math.min(5, rating));
  const segmentToneClass =
    ratingBucket === null
      ? "bg-slate-200"
      : ratingBucket <= 2
        ? "bg-rose-300"
        : ratingBucket <= 3.5
          ? "bg-amber-300"
          : "bg-emerald-300";
  const cardToneClass =
    ratingBucket === null
      ? ""
      : ratingBucket <= 2
        ? "border-rose-200 bg-rose-50/70"
        : ratingBucket <= 3.5
          ? "border-amber-200 bg-amber-50/70"
          : "border-emerald-200 bg-emerald-50/70";
  const tileClassName = className ?? `${METRIC_CARD_CLASS} ${cardToneClass}`.trim();
  const content = (
    <>
      <div className="flex items-center gap-1.5">
        <p className="line-clamp-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
        {tooltip ? <InfoTip align="start" text={tooltip} /> : null}
      </div>
      {showValueText ? <p className={valueClassName ?? METRIC_CARD_VALUE_CLASS}>{value}</p> : null}
      {ratingBucket !== null ? (
        <div className={`${showValueText ? "mt-2" : "mt-1"} flex items-center gap-1`}>
          {Array.from({ length: 5 }, (_, index) => {
            const segmentFill = Math.max(0, Math.min(1, ratingBucket - index));
            return (
              <span
                key={`${label}-segment-${index}`}
                className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200/80"
              >
                <span
                  className={`absolute inset-y-0 left-0 rounded-full ${segmentToneClass}`}
                  style={{ width: `${segmentFill * 100}%` }}
                />
              </span>
            );
          })}
        </div>
      ) : null}
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        className={`${tileClassName} block transition-[transform,border-color,background-color,box-shadow] duration-150 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white hover:shadow-[0_18px_45px_-24px_rgba(15,23,42,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40`}
      >
        {content}
      </a>
    );
  }

  return <div className={tileClassName}>{content}</div>;
}

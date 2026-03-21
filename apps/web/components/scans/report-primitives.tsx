import type { ReactNode } from "react";
import { CollapsibleSectionCard } from "./collapsible-section-card";
import { InfoTip } from "./info-tip";

export const METRIC_GRID_CLASS = "grid gap-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4";
export const METRIC_CARD_CLASS = "rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2.5";
export const METRIC_CARD_VALUE_CLASS = "mt-1 text-sm font-semibold text-slate-950";
export const EMPHASIS_METRIC_CARD_CLASS = "rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2.5";
export const EMPHASIS_METRIC_CARD_VALUE_CLASS = "mt-1 text-sm font-semibold text-amber-950";

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
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
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
        <h2 className="text-lg font-semibold text-slate-950">{input.title}</h2>
      </div>
      <div className="space-y-4">{input.children}</div>
    </section>
  );
}

type SummaryMetricTileProps = {
  label: string;
  value: ReactNode;
  tooltip?: ReactNode;
  className?: string;
  valueClassName?: string;
};

export function SummaryMetricTile({ label, value, tooltip, className, valueClassName }: SummaryMetricTileProps) {
  return (
    <div className={className ?? METRIC_CARD_CLASS}>
      <div className="flex items-center gap-1.5">
        <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
        {tooltip ? <InfoTip align="start" text={tooltip} /> : null}
      </div>
      <p className={valueClassName ?? METRIC_CARD_VALUE_CLASS}>{value}</p>
    </div>
  );
}

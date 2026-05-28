import type { AgencyMapping } from "@website-signal-risk-scanner/shared";
import { CollapsibleSectionCard } from "./collapsible-section-card";
import { InfoTip } from "./info-tip";
import { ScanReportDisclosureIcon } from "./scan-report-disclosure-icon";

function getMappedFlagsLabel(count: number) {
  return `${count} mapped ${count === 1 ? "flag" : "flags"}`;
}

function getCategoryLabel(category: AgencyMapping["category"]) {
  if (category === "consumer_protection") {
    return "Consumer protection";
  }

  if (category === "accessibility") {
    return "Accessibility";
  }

  if (category === "privacy") {
    return "Privacy";
  }

  return "Mixed relevance";
}

type RegulatoryRelevanceSectionProps = {
  mappings: AgencyMapping[];
  embedded?: boolean;
};

function RegulatoryRelevanceContent({ mappings }: { mappings: AgencyMapping[] }) {
  if (mappings.length === 0) {
    return (
      <div className="space-y-3 text-sm text-slate-600">
        <p>Observed flags did not surface a strong agency-specific pattern in this scan. This is signal context, not a legal conclusion.</p>
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4">
          <p className="font-medium text-slate-700">No strong agency-specific relevance surfaced from the current scan.</p>
          <p className="mt-1">Privacy, accessibility, and transparency signals can still be reviewed in the sections below.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm text-slate-600">
        Observed flags in this scan are grouped by the regulators and oversight domains they most closely relate to. This is signal context, not a legal determination.
      </p>

      <div className="space-y-4">
        {mappings.map((mapping) => (
          <details key={mapping.agencyKey} className="group/agency rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <summary className="flex cursor-pointer list-none items-start gap-3 marker:hidden [&::-webkit-details-marker]:hidden transition-colors hover:bg-slate-100/70">
              <ScanReportDisclosureIcon className="mt-0.5 group-open/agency:rotate-90" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">{mapping.agencyLabel}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {getCategoryLabel(mapping.category)} · {getMappedFlagsLabel(mapping.triggeredSignals.length)}
                </p>
              </div>
            </summary>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="px-1 py-1">
                <div>
                  <p>{mapping.rationale}</p>
                </div>
              </div>
              {mapping.contributingSubscores.length > 0 ? (
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="font-medium text-slate-800">Contributing subscores</p>
                    <InfoTip text="These are 0 to 100 risk-oriented subscores. Lower is better; higher values mean more regulator-relevant concerns surfaced in that category." />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {mapping.contributingSubscores.map((subscore) => (
                      <span key={`${mapping.agencyKey}-${subscore.key}`} className="rounded-full bg-white px-3 py-1 text-xs text-slate-700 ring-1 ring-slate-200">
                        {subscore.label} {subscore.score}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              <div>
                <p className="font-medium text-slate-800">Flags driving this mapping</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {mapping.triggeredSignals.map((signal) => (
                    <span key={`${mapping.agencyKey}-${signal.key}`} className="rounded-full bg-white px-3 py-1 text-xs text-slate-700 ring-1 ring-slate-200">
                      {signal.label}
                    </span>
                  ))}
                </div>
              </div>
              {mapping.topAgencyRiskDrivers.length > 0 ? (
                <div>
                  <p className="font-medium text-slate-800">Top agency drivers</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {mapping.topAgencyRiskDrivers.map((driver) => (
                      <span key={`${mapping.agencyKey}-${driver}`} className="rounded-full bg-white px-3 py-1 text-xs text-slate-700 ring-1 ring-slate-200">
                        {driver}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

export function RegulatoryRelevanceSection({ mappings, embedded = false }: RegulatoryRelevanceSectionProps) {
  if (embedded) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-slate-900">Regulatory crosswalk</p>
          <InfoTip text="Groups observed flags by the regulators or oversight domains they most closely relate to. This is a contextual overlay, not the primary category system and not a legal determination." />
        </div>
        <RegulatoryRelevanceContent mappings={mappings} />
      </div>
    );
  }

  return (
    <CollapsibleSectionCard
      title={
        <span className="flex items-center gap-1.5">
          <span>Regulatory crosswalk</span>
          <InfoTip text="Groups observed flags by the regulators or oversight domains they most closely relate to. This is a contextual overlay, not the primary category system and not a legal determination." />
        </span>
      }
      defaultOpen
      contentClassName="space-y-6"
    >
      <RegulatoryRelevanceContent mappings={mappings} />
    </CollapsibleSectionCard>
  );
}

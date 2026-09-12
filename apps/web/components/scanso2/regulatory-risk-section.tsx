import type { AgencyMapping, RegulatoryRiskAssessment } from "@website-signal-risk-scanner/shared";
import { CollapsibleSectionCard } from "./collapsible-section-card";
import { InfoTip } from "./info-tip";
import { RegulatoryRelevanceSection } from "./regulatory-relevance-section";

function scoreTone(level: RegulatoryRiskAssessment["riskLevel"]) {
  if (level === "high") {
    return "bg-slate-900 text-white";
  }
  if (level === "moderate") {
    return "bg-amber-100 text-amber-800";
  }
  return "bg-emerald-100 text-emerald-800";
}

export function RegulatoryRiskSection(input: {
  risk: RegulatoryRiskAssessment | null;
  agencyMappings: AgencyMapping[];
}) {
  if (!input.risk) {
    return null;
  }
  const subscores = [
    ["Privacy", input.risk.privacyEnforcementRiskScore],
    ["Consent", input.risk.consentEnforcementRiskScore],
    ["Consumer Protection", input.risk.consumerProtectionRiskScore],
    ["Accessibility", input.risk.accessibilityEnforcementRiskScore],
    ["Data Exposure", input.risk.dataExposureRiskScore]
  ] as const;
  return (
    <CollapsibleSectionCard
      title={
        <span className="flex items-center gap-1.5">
          <span>Regulatory overlay</span>
          <InfoTip text="This overlay maps observed website signals to regulator-relevant risk lenses and agency context. It is a secondary interpretation layer, not the primary taxonomy for the raw scan data." />
        </span>
      }
      defaultOpen
      contentClassName="space-y-6"
    >
        <div className="grid gap-2 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2.5">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Overall risk</p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-950">{input.risk.overallScore}</p>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.14em] ${scoreTone(input.risk.riskLevel)}`}>
                {input.risk.riskLevel} risk
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-600">Confidence {Math.round(input.risk.confidence * 100)}%</p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
            {subscores.map(([label, score]) => (
              <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2.5">
                <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">{score}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="font-medium text-slate-900">Top risk drivers</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {input.risk.topRiskDrivers.map((driver) => (
                <span key={driver.key} className="rounded-full bg-white px-3 py-1 text-xs text-slate-700 ring-1 ring-slate-200">
                  {driver.label}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="font-medium text-slate-900">Top mitigating controls</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {input.risk.topMitigatingControls.length > 0 ? (
                input.risk.topMitigatingControls.map((driver) => (
                  <span key={driver.key} className="rounded-full bg-white px-3 py-1 text-xs text-slate-700 ring-1 ring-slate-200">
                    {driver.label}
                  </span>
                ))
              ) : (
                <span className="text-sm text-slate-500">No strong mitigating controls surfaced from the current scan.</span>
              )}
            </div>
          </div>
        </div>
        <RegulatoryRelevanceSection mappings={input.agencyMappings} embedded />
    </CollapsibleSectionCard>
  );
}

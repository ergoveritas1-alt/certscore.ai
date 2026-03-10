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

function getSubscoreHelpText(label: string) {
  if (label === "Privacy") {
    return "A weighted privacy-risk subscore for privacy-rights, notice, and data-handling concerns. Higher means more privacy-related risk indicators surfaced in the scan.";
  }

  if (label === "Consent") {
    return "A weighted consent-risk subscore for consent controls, cookie handling, and pre-consent tracking behavior. Higher means more consent-related gaps surfaced in the scan.";
  }

  if (label === "Consumer Protection") {
    return "A weighted consumer-protection risk subscore for disclosures, marketing practices, refund or cancellation clarity, and policy-to-behavior consistency. Higher means more consumer-protection concerns surfaced in the scan.";
  }

  if (label === "Accessibility") {
    return "A weighted accessibility-risk subscore for automated accessibility issues and related public-facing accessibility signals. Higher means more accessibility-related barriers surfaced in the scan.";
  }

  return "A weighted data-exposure risk subscore for tracker footprint and related third-party data-flow indicators. Higher means more data-exposure concerns surfaced in the scan.";
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
          <span>Regulatory</span>
          <InfoTip text="Weighted regulator-relevant scoring and agency mapping derived from the scan’s privacy, consent, disclosure, accessibility, and data-exposure signals." />
        </span>
      }
      defaultOpen
      contentClassName="space-y-6"
    >
        <p className="max-w-3xl text-sm text-slate-600">
          These signals represent automated analysis of website behavior and disclosures. They do not constitute legal advice.
        </p>

        <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="flex items-center gap-1.5">
              <p className="text-sm text-slate-500">Overall risk</p>
              <InfoTip text="A weighted regulatory risk score from 0 to 100. Higher means more regulator-relevant risk indicators surfaced overall." />
            </div>
            <div className="mt-2 flex items-end justify-between gap-4">
              <p className="text-4xl font-semibold text-slate-950">{input.risk.overallScore}</p>
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${scoreTone(input.risk.riskLevel)}`}>
                {input.risk.riskLevel} risk
              </span>
            </div>
            <p className="mt-3 text-sm text-slate-600">Confidence {Math.round(input.risk.confidence * 100)}%</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {subscores.map(([label, score]) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
                  <span className="group/tooltip relative inline-flex">
                    <span className="inline-flex h-[11px] w-[11px] items-center justify-center rounded-full border border-slate-300 text-[7px] font-semibold leading-none text-slate-500">
                      i
                    </span>
                    <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-56 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] normal-case tracking-normal text-slate-600 shadow-lg group-hover/tooltip:block">
                      {getSubscoreHelpText(label)}
                    </span>
                  </span>
                </div>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{score}</p>
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

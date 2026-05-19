import React from "react";
import type { CertScoreFinding } from "../../lib/scans/finding-registry";
import {
  getPublicReportConfidenceDefinition,
  getPublicReportFindingDisplayForCertFinding
} from "../../lib/scans/public-report-finding-display";
import { EvidencePreview } from "./evidence-preview";
import { InfoTip } from "./info-tip";

function getSeverityClasses(severity: CertScoreFinding["severity"]) {
  switch (severity) {
    case "critical":
      return "border-rose-200 bg-rose-50/80 text-rose-900";
    case "high":
      return "border-amber-200 bg-amber-50/80 text-amber-900";
    case "medium":
      return "border-sky-200 bg-sky-50/80 text-sky-900";
    default:
      return "border-slate-200 bg-slate-50/80 text-slate-800";
  }
}

function getBadgeCopy(finding: CertScoreFinding) {
  const directness =
    finding.directVsInferred === "direct"
      ? "Observed directly"
      : finding.directVsInferred === "mixed"
        ? "Mixed evidence"
        : "Inferred from pattern";

  const confidence =
    finding.confidence === "strong"
      ? "Strong evidence"
      : finding.confidence === "good"
        ? "Good evidence"
        : "Review evidence";

  return { directness, confidence };
}

export function FindingCard({ finding }: { finding: CertScoreFinding }) {
  const badgeCopy = getBadgeCopy(finding);
  const display = getPublicReportFindingDisplayForCertFinding(finding);

  return (
    <details className="group rounded-[1.55rem] border border-slate-200/80 bg-white/92 p-5 shadow-[0_16px_44px_-26px_rgba(15,23,42,0.24)] transition-[box-shadow,border-color] hover:border-slate-300/80 hover:shadow-[0_20px_50px_-30px_rgba(15,23,42,0.28)]">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 marker:hidden [&::-webkit-details-marker]:hidden">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${getSeverityClasses(display.criticality)}`}>
              {display.criticality}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-700">
              {badgeCopy.confidence}
              <InfoTip
                align="start"
                placement="bottom"
                text={getPublicReportConfidenceDefinition({
                  confidence: finding.confidence,
                  findingId: finding.id,
                  section: finding.section
                })}
              />
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-700">
              {badgeCopy.directness}
            </span>
          </div>
          <div className="space-y-1.5">
            <h3 className="text-lg font-semibold tracking-tight text-slate-950">{display.title}</h3>
            <p className="max-w-3xl text-sm leading-6 text-slate-700">{finding.shortSummary}</p>
          </div>
        </div>
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 transition-transform group-open:rotate-45">
          +
        </span>
      </summary>

      <div className="mt-5 space-y-5 border-t border-slate-100 pt-4">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Why it matters</p>
          <p className="text-sm leading-6 text-slate-700">{finding.whyItMatters}</p>
        </div>

        <EvidencePreview items={finding.evidencePreview} />

        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Review and remediation starting points</p>
          <p className="text-sm leading-6 text-slate-700">{display.remediation}</p>
        </div>
      </div>
    </details>
  );
}

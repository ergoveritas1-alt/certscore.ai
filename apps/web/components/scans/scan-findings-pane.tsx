"use client";

import { useState } from "react";
import { EvidenceJsonBlock } from "./evidence-json-block";

type FindingRow = {
  evidenceJson: string;
  id: string;
  pageLabel: string;
  ruleSummary: string;
  summaryJson: string;
  title: string;
};

type ScanFindingsPaneProps = {
  description?: string;
  emptyMessage?: string;
  findings: FindingRow[];
  title?: string;
};

function buildClipboardText(findings: FindingRow[]) {
  return findings
    .map((finding, index) =>
      [
        `${index + 1}. ${finding.title}`,
        `URL: ${finding.pageLabel}`,
        `Meta: ${finding.ruleSummary}`,
        "Summary:",
        finding.summaryJson,
        "Evidence:",
        finding.evidenceJson
      ].join("\n")
    )
    .join("\n\n");
}

export function ScanFindingsPane({
  description = "Focused findings-only debug view in a single pane.",
  emptyMessage = "No surfaced findings are currently attached to this scan.",
  findings,
  title = "Surfaced findings"
}: ScanFindingsPaneProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(buildClipboardText(findings));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
        <div>
          <p className="text-sm font-medium text-slate-900">{title}</p>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 shadow-sm hover:border-slate-400 hover:text-slate-950"
          aria-label="Copy surfaced findings"
          title={copied ? "Copied" : "Copy findings"}
        >
          {copied ? (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="9" width="10" height="10" rx="2" />
              <path d="M5 15V5a2 2 0 0 1 2-2h10" />
            </svg>
          )}
        </button>
      </div>

      <div className="max-h-[70vh] overflow-auto px-5 py-5">
        <div className="space-y-5">
          {findings.map((finding, index) => (
            <div key={finding.id} className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5">
              <div className="space-y-2">
                <div className="space-y-1">
                  <p className="font-semibold text-slate-950">{index + 1}. {finding.title}</p>
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{finding.ruleSummary}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">URL</p>
                  <p className="break-all text-sm text-slate-700">{finding.pageLabel}</p>
                </div>
                <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-2xl bg-white p-3 text-xs text-slate-600">
                  {finding.summaryJson}
                </pre>
                <EvidenceJsonBlock
                  payload={finding.evidenceJson}
                  className="relative max-w-full overflow-hidden rounded-2xl bg-slate-950"
                  preClassName="max-w-full overflow-x-auto whitespace-pre-wrap break-words p-3 pr-12 text-xs leading-5 text-slate-100"
                />
              </div>
            </div>
          ))}
          {findings.length === 0 ? <p className="text-sm text-slate-500">{emptyMessage}</p> : null}
        </div>
      </div>
    </div>
  );
}

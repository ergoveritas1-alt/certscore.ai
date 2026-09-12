import React from "react";
import { sanitizePublicReportEvidenceText } from "../../lib/scans/compact-evidence-json";

type EvidencePreviewProps = {
  items: string[];
  label?: string;
};

export function EvidencePreview({ items, label = "Evidence observed" }: EvidencePreviewProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const safeItem = sanitizePublicReportEvidenceText(item);
          return (
          <span key={item} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">
            {safeItem}
          </span>
          );
        })}
      </div>
    </div>
  );
}

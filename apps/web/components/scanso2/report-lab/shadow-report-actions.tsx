"use client";

import { useState } from "react";

type ShadowReportActionsProps = {
  reportUrl: string;
  scanId: string;
  siteLabel: string;
  fullSite?: boolean;
};

const menuItemClass =
  "flex w-full items-center justify-between gap-4 rounded-md px-3 py-2.5 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500";

export function ShadowReportShareMenu({ reportUrl, scanId, siteLabel, fullSite = false }: ShadowReportActionsProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const emailSubject = `CertScore scan report for ${siteLabel}`;
  const emailBody = `Review the CertScore scan report for ${siteLabel}:\n\n${reportUrl}`;

  async function copyReportLink() {
    try {
      await navigator.clipboard.writeText(new URL(reportUrl, window.location.origin).toString());
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2200);
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <details className="group/share relative">
      <summary
        aria-label="Share report"
        className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 text-xs font-semibold text-zinc-950 hover:border-zinc-500 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 [&::-webkit-details-marker]:hidden"
      >
        <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
          <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M5 10.5v7.75A1.75 1.75 0 0 0 6.75 20h10.5A1.75 1.75 0 0 0 19 18.25V10.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
        Share
      </summary>
      <div className="absolute right-0 top-full z-40 mt-2 w-64 rounded-lg border border-zinc-200 bg-white p-2 shadow-xl">
        <button className={menuItemClass} onClick={() => void copyReportLink()} type="button">
          <span>{copyState === "copied" ? "Link copied" : copyState === "failed" ? "Copy unavailable" : "Share report link"}</span>
          <span aria-hidden="true" className="text-zinc-400">↗</span>
        </button>
        <a
          className={menuItemClass}
          href={`mailto:?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`}
        >
          <span>Email report</span>
          <span aria-hidden="true" className="text-zinc-400">@</span>
        </a>
        <a
          className={menuItemClass}
          download
          href={`/api/scans/${encodeURIComponent(scanId)}/report-export?format=pdf${fullSite ? "&scope=full-site" : ""}`}
        >
          <span>{fullSite ? "Download full-site PDF" : "Download PDF report"}</span>
          <span aria-hidden="true" className="text-zinc-400">↓</span>
        </a>
        <a
          className={menuItemClass}
          download
          href={`/api/scans/${encodeURIComponent(scanId)}/report-export?format=json${fullSite ? "&scope=full-site" : ""}`}
        >
          <span>{fullSite ? "Download full-site JSON" : "Download JSON report"}</span>
          <span aria-hidden="true" className="font-mono text-xs text-zinc-400">{'{}'}</span>
        </a>
      </div>
    </details>
  );
}

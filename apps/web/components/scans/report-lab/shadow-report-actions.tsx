"use client";

import { useState } from "react";

type ShadowReportActionsProps = {
  reportUrl: string;
  scanId: string;
  siteLabel: string;
};

const menuItemClass =
  "flex w-full items-center justify-between gap-4 rounded-md px-3 py-2.5 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500";

export function ShadowReportShareMenu({ reportUrl, scanId, siteLabel }: ShadowReportActionsProps) {
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
      <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md bg-zinc-950 px-2.5 text-xs font-semibold text-white hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 [&::-webkit-details-marker]:hidden">
        Share / export
        <span aria-hidden="true" className="text-zinc-400 transition group-open/share:rotate-180">⌄</span>
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
          href={`/api/scans/${encodeURIComponent(scanId)}/report-export?format=pdf`}
        >
          <span>Download PDF report</span>
          <span aria-hidden="true" className="text-zinc-400">↓</span>
        </a>
        <a
          className={menuItemClass}
          download
          href={`/api/scans/${encodeURIComponent(scanId)}/report-export?format=json`}
        >
          <span>Download JSON report</span>
          <span aria-hidden="true" className="font-mono text-xs text-zinc-400">{'{}'}</span>
        </a>
      </div>
    </details>
  );
}

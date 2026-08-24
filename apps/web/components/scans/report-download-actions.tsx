import React from "react";

type ReportDownloadActionsProps = { scanId: string };

const iconLinkClass =
  "scan-report-button group relative inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-700 hover:text-slate-950";

function IconTooltip({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
      {label}
    </span>
  );
}

function PdfIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path d="M7 3.8h7l3 3v13.4H7z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
      <path d="M14 3.8v3h3M9.3 11.2h5.4M9.3 14h5.4M9.3 16.8h3.6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  );
}

function JsonDownloadIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path d="M9 5.5C7 5.5 7 7 7 8.5v1.2c0 1-.7 1.8-1.7 1.8 1 0 1.7.8 1.7 1.8v1.2C7 16 7 17.5 9 17.5M15 5.5c2 0 2 1.5 2 3v1.2c0 1 .7 1.8 1.7 1.8-1 0-1.7.8-1.7 1.8v1.2c0 1.5 0 3-2 3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
      <path d="M12 8.5v6M9.8 12.3 12 14.5l2.2-2.2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  );
}

export function ReportDownloadActions({ scanId }: ReportDownloadActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Download report">
      <a
        aria-label="Download report (PDF)"
        className={iconLinkClass}
        download
        href={`/api/scans/${scanId}/report-export?format=pdf`}
        title="Download report (PDF)"
      >
        <PdfIcon />
        <IconTooltip label="Download report (PDF)" />
      </a>
      <a
        aria-label="Download JSON report"
        className={iconLinkClass}
        download
        href={`/api/scans/${scanId}/report-export?format=json`}
        title="Download JSON report"
      >
        <JsonDownloadIcon />
        <IconTooltip label="Download JSON" />
      </a>
    </div>
  );
}

import React from "react";
import { ReportPdfDownloadLink } from "../scans/report-pdf-download-link";

import { ReportDocumentDownloadLink } from "../scans/report-document-download-link";

type ReportDownloadActionsProps = { scanId: string; canExportPdf?: boolean };

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

function WordDownloadIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path d="M6 3h8l4 4v14H6zM14 3v4h4M8.5 11l1.5 6 2-4 2 4 1.5-6" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function ReportDownloadActions({ scanId, canExportPdf = false }: ReportDownloadActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Download report">
      {canExportPdf ? <ReportPdfDownloadLink
        aria-label="Download report (PDF)"
        className={iconLinkClass}
        download
        href={`/api/scans/${scanId}/report-export?format=pdf`}
        title="Download report (PDF)"
      >
        <PdfIcon />
        <IconTooltip label="Download report (PDF)" />
      </ReportPdfDownloadLink> : null}
      <ReportDocumentDownloadLink
        aria-label="Download Word report (DOCX)"
        className={iconLinkClass}
        download
        href={`/api/scans/${scanId}/report-export?format=docx`}
        title="Download Word report (DOCX)"
      >
        <WordDownloadIcon />
        <IconTooltip label="Download Word (DOCX)" />
      </ReportDocumentDownloadLink>
    </div>
  );
}

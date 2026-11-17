"use client";

import { authorizeCurrentReportShare, openAuthorizedReportShareMenu, followAuthorizedReportShareLink } from "../report-share-access";

import { createContext, useContext, useId, useRef, useState, type ReactNode } from "react";
import { ReportPdfDownloadLink } from "../report-pdf-download-link";
import { safeAuthReturnPath } from "../../../lib/auth-return-path";

const ReportPdfAccess = createContext(false);
export function useReportPdfAccess() { return useContext(ReportPdfAccess); }
export function ReportPdfAccessProvider({ allowed, children }: { allowed: boolean; children: ReactNode }) {
  return <ReportPdfAccess.Provider value={allowed}>{children}</ReportPdfAccess.Provider>;
}

const GuestShareAccess = createContext<boolean | null>(null);
export function ReportGuestShareProvider({ allowCreateAccount, children }: { allowCreateAccount: boolean; children: ReactNode }) {
  return <GuestShareAccess.Provider value={allowCreateAccount}>{children}</GuestShareAccess.Provider>;
}

import { ReportDocumentDownloadLink } from "../report-document-download-link";

type ShadowReportActionsProps = {
  reportUrl: string;
  scanId: string;
  siteLabel: string;
  fullSite?: boolean;
};

const menuItemClass =
  "flex w-full items-center justify-between gap-4 rounded-md px-3 py-2.5 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500";
const shareTriggerClass =
  "inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 text-xs font-semibold text-zinc-950 hover:border-zinc-500 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 [&::-webkit-details-marker]:hidden";

function ShareIcon() {
  return <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
    <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M5 10.5v7.75A1.75 1.75 0 0 0 6.75 20h10.5A1.75 1.75 0 0 0 19 18.25V10.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
  </svg>;
}

function GuestSharePrompt({ reportUrl, allowCreateAccount }: { reportUrl: string; allowCreateAccount: boolean }) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [returnPath, setReturnPath] = useState(() => safeAuthReturnPath(reportUrl.split("#")[0]));
  const signIn = new URLSearchParams({ next: `${returnPath}#top`, intent: "share_report" });
  const signUp = new URLSearchParams(signIn);
  signUp.set("mode", "create_account");

  function showPrompt() {
    const { pathname, search } = window.location;
    setReturnPath(safeAuthReturnPath(`${pathname}${search}`));
    dialog.current?.showModal();
  }

  return <>
    <button ref={trigger} type="button" aria-label="Share report" aria-haspopup="dialog" className={shareTriggerClass} onClick={showPrompt}>
      <ShareIcon /> Share
    </button>
    <dialog
      ref={dialog}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      onClose={() => trigger.current?.focus()}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 text-slate-950 shadow-2xl backdrop:bg-slate-950/45 sm:p-7"
    >
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-800"><ShareIcon /></span>
      <h2 id={`${id}-title`} className="mt-4 text-xl font-semibold tracking-tight">Sign in to share this report</h2>
      <p id={`${id}-description`} className="mt-2 text-sm leading-6 text-slate-600">
        {allowCreateAccount ? "Sign in or create an account" : "Sign in"} to copy a link, email the report, or download a copy. You’ll be able to view and share this report once signed in.
      </p>
      <div className="mt-5 flex flex-wrap gap-2.5">
        <a href={`/login?${signIn}`} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600">Sign in</a>
        {allowCreateAccount && <a href={`/login?${signUp}`} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600">Create account</a>}
      </div>
      <button type="button" onClick={() => dialog.current?.close()} className="mt-2 min-h-11 rounded px-1 text-sm font-medium text-slate-700 underline underline-offset-4 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600">Keep reading</button>
    </dialog>
  </>;
}

export function ShadowReportShareMenu({ reportUrl, scanId, siteLabel, fullSite = false }: ShadowReportActionsProps) {
  const guestShare = useContext(GuestShareAccess);
  const canExportPdf = useContext(ReportPdfAccess);
  const requestedFocus = new URL(reportUrl, "https://certscore.ai").searchParams.get("reviewFocus");
  const focusQuery = requestedFocus === "gdpr_eprivacy" || requestedFocus === "ccpa_cpra" ? `&reviewFocus=${requestedFocus}` : "";
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const pdfHref = `/api/scans/${encodeURIComponent(scanId)}/report-export?format=pdf&reviewFocus=gdpr_eprivacy${fullSite ? "&scope=full-site" : ""}`;
  const emailSubject = `CertScore.ai scan report for ${siteLabel}`;
  const emailBody = `Review the CertScore.ai scan report for ${siteLabel}:\n\n${new URL(reportUrl, "https://certscore.ai").toString()}${canExportPdf ? `\n\nDownload the PDF with your workspace header (sign-in and workspace access required):\n${new URL(pdfHref, "https://certscore.ai").toString()}` : ""}`;

  async function copyReportLink() {
    await authorizeCurrentReportShare();
    try {
      await navigator.clipboard.writeText(new URL(reportUrl, window.location.origin).toString());
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2200);
    } catch {
      setCopyState("failed");
    }
  }

  if (guestShare !== null) return <GuestSharePrompt reportUrl={reportUrl} allowCreateAccount={guestShare} />;

  return (
    <details className="group/share relative">
      <summary
        onClick={openAuthorizedReportShareMenu}
        aria-label="Share report"
        className={shareTriggerClass}
      >
        <ShareIcon />
        Share
      </summary>
      <div className="absolute right-0 top-full z-40 mt-2 w-64 rounded-lg border border-zinc-200 bg-white p-2 shadow-xl">
        <button className={menuItemClass} onClick={() => void copyReportLink()} type="button">
          <span>{copyState === "copied" ? "Link copied" : copyState === "failed" ? "Copy unavailable" : "Share report link"}</span>
          <span aria-hidden="true" className="text-zinc-400">↗</span>
        </button>
        <a
          className={menuItemClass}
          onClick={followAuthorizedReportShareLink}
          href={`mailto:?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`}
        >
          <span>Email report</span>
          <span aria-hidden="true" className="text-zinc-400">@</span>
        </a>
        {canExportPdf ? <ReportPdfDownloadLink
          className={menuItemClass}
          download
          href={pdfHref}
        >
          <span>{fullSite ? "Download full-site PDF" : "Download PDF report"}</span>
          <span aria-hidden="true" className="text-zinc-400">↓</span>
        </ReportPdfDownloadLink> : null}
        <ReportDocumentDownloadLink
          className={menuItemClass}
          download
          href={`/api/scans/${encodeURIComponent(scanId)}/report-export?format=docx${focusQuery}${fullSite ? "&scope=full-site" : ""}`}
        >
          <span>{fullSite ? "Download full-site Word (DOCX)" : "Download Word report (DOCX)"}</span>
          <span aria-hidden="true" className="font-mono text-xs text-zinc-400">DOCX</span>
        </ReportDocumentDownloadLink>
      </div>
    </details>
  );
}

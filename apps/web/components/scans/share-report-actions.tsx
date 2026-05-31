"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { sendReportEmailAction, type SendReportEmailActionState } from "../../server/scans/email-report";

type ShareReportActionsProps = {
  domainLabel: string;
  scanId: string;
  visualEvidenceHref?: string | null;
};

const initialSendReportEmailActionState: SendReportEmailActionState = {
  error: null,
  success: null
};

function actionClassName(tone: "primary" | "secondary" = "secondary") {
  const base =
    "inline-flex min-h-9 items-center justify-center rounded-full px-3 text-xs font-semibold shadow-sm transition";

  if (tone === "primary") {
    return `${base} border-0 bg-[linear-gradient(135deg,#0f8bd7_0%,#1ea7e1_62%,#67c7f0_100%)] text-white hover:brightness-[1.04]`;
  }

  return `${base} border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:text-slate-950`;
}

function iconActionClassName(tone: "primary" | "secondary" = "secondary") {
  const base =
    "group relative inline-flex h-10 w-10 items-center justify-center rounded-full text-sm shadow-sm transition focus:outline-none focus:ring-2 focus:ring-sky-200 focus:ring-offset-2";

  if (tone === "primary") {
    return `${base} border-0 bg-[linear-gradient(135deg,#0f8bd7_0%,#1ea7e1_62%,#67c7f0_100%)] text-white hover:brightness-[1.04]`;
  }

  return `${base} border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:text-slate-950`;
}

function IconTooltip({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
      {label}
    </span>
  );
}

function ShareIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24">
      <path
        d="M8.5 13.5 15.5 17M15.5 7 8.5 10.5M7 14.5a3 3 0 1 1 0-6 3 3 0 0 1 0 6ZM17 8.5a3 3 0 1 1 0-6 3 3 0 0 1 0 6ZM17 21.5a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24">
      <rect x="4" y="6" width="16" height="12" rx="2.4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="m5.5 8 6.5 5 6.5-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24">
      <path d="M6 18h12M8 18v-5a4 4 0 0 1 8 0v5M10 20.2a2.4 2.4 0 0 0 4 0" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M6.5 10.5a6 6 0 0 1 11 0M4.5 8a9 9 0 0 1 15 0" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" opacity="0.65" />
    </svg>
  );
}

function VisualEvidenceIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24">
      <path d="M3.5 12s3.2-5.5 8.5-5.5S20.5 12 20.5 12s-3.2 5.5-8.5 5.5S3.5 12 3.5 12Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function ShareReportActions({
  domainLabel,
  scanId,
  visualEvidenceHref = null
}: ShareReportActionsProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [currentUrl, setCurrentUrl] = useState("");
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [emailState, emailAction, isEmailPending] = useActionState(
    sendReportEmailAction,
    initialSendReportEmailActionState
  );
  const monitorHref = useMemo(() => {
    const params = new URLSearchParams({ website: domainLabel });
    if (currentUrl) {
      params.set("reportUrl", currentUrl);
      params.set("source", currentUrl);
    }
    return `/monitor-site?${params.toString()}`;
  }, [currentUrl, domainLabel]);
  useEffect(() => {
    setCurrentUrl(window.location.href);
  }, []);

  useEffect(() => {
    if (emailState.success) {
      setIsEmailDialogOpen(false);
    }
  }, [emailState.success]);

  async function copyValue(value: string) {
    try {
      if (!value || !navigator.clipboard) {
        setCopyState("failed");
        return;
      }
      await navigator.clipboard.writeText(value);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2400);
    } catch {
      setCopyState("failed");
    }
  }

  async function copyReportUrl() {
    await copyValue(currentUrl);
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-label={copyState === "copied" ? "Report URL copied" : "Copy link to report"}
          className={iconActionClassName("primary")}
          data-analytics-cta-type="share"
          data-analytics-event="report_cta_clicked"
          onClick={copyReportUrl}
          title="Copy link to report"
        >
          <ShareIcon />
          <IconTooltip label={copyState === "copied" ? "Report URL copied" : "Copy link to report"} />
        </button>
        <button
          type="button"
          aria-label="Email report"
          className={iconActionClassName()}
          data-analytics-cta-type="email"
          data-analytics-event="report_cta_clicked"
          onClick={() => setIsEmailDialogOpen(true)}
          title="Email report"
        >
          <EmailIcon />
          <IconTooltip label={emailState.success ? "Sent" : "Email report"} />
        </button>
        <Link
          aria-label="Monitor this site"
          className={iconActionClassName()}
          data-analytics-cta-type="monitor"
          data-analytics-event="report_cta_clicked"
          href={monitorHref}
          title="Monitor this site"
        >
          <MonitorIcon />
          <IconTooltip label="Monitor this site" />
        </Link>
        {visualEvidenceHref ? (
          <a
            aria-label="View captured image"
            className={iconActionClassName()}
            data-analytics-cta-type="visual-evidence"
            data-analytics-event="report_cta_clicked"
            href={visualEvidenceHref}
            rel="noreferrer"
            target="_blank"
            title="View captured image"
          >
            <VisualEvidenceIcon />
            <IconTooltip label="View captured image" />
          </a>
        ) : null}
      </div>
      {copyState === "failed" ? (
        <p className="mt-1 text-xs leading-5 text-amber-700">
          Copy was not available in this browser. Use the page URL from the address bar.
        </p>
      ) : null}
      {isEmailDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6">
          <div
            aria-modal="true"
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
            role="dialog"
          >
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-slate-950">Email this report</h2>
              <p className="text-sm leading-6 text-slate-600">
                Send a link to this CertScore.ai report for {domainLabel}.
              </p>
            </div>
            <form action={emailAction} className="mt-4 space-y-3">
              <input name="scanId" type="hidden" value={scanId} />
              <input name="domainLabel" type="hidden" value={domainLabel} />
              <label className="block space-y-1 text-sm font-medium text-slate-700">
                <span>Email address</span>
                <input
                  autoComplete="email"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  disabled={isEmailPending}
                  name="recipientEmail"
                  placeholder="you@example.com"
                  required
                  type="email"
                />
              </label>
              {emailState.error ? <p className="text-sm text-red-600">{emailState.error}</p> : null}
              {emailState.success ? <p className="text-sm text-emerald-700">{emailState.success}</p> : null}
              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <button
                  className={actionClassName()}
                  disabled={isEmailPending}
                  onClick={() => setIsEmailDialogOpen(false)}
                  type="button"
                >
                  Close
                </button>
                <button className={actionClassName("primary")} disabled={isEmailPending} type="submit">
                  {isEmailPending ? "Sending..." : emailState.success ? "Sent" : "Send report"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function AgentSummaryActions({ domainLabel, scanId }: ShareReportActionsProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [currentUrl, setCurrentUrl] = useState("");

  useEffect(() => {
    setCurrentUrl(window.location.href);
  }, []);

  async function copyValue(value: string) {
    try {
      if (!value || !navigator.clipboard) {
        setCopyState("failed");
        return;
      }
      await navigator.clipboard.writeText(value);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2400);
    } catch {
      setCopyState("failed");
    }
  }

  function absoluteAppUrl(path: string) {
    if (!currentUrl) {
      return path;
    }
    return new URL(path, currentUrl).toString();
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
        CertScore.ai can make mistakes. Treat this automated summary as a review aid and verify important conclusions against the retained evidence and your own legal, privacy, and accessibility review.
      </p>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Agent summary</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Share this scan through the CertScore Pulse API using this report's scan ID.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className={actionClassName()} href={`/pulse/${encodeURIComponent(domainLabel)}`}>
            View Pulse page
          </Link>
          <button className={actionClassName()} onClick={() => copyValue(absoluteAppUrl(`/api/v1/pulse?scanId=${scanId}`))} type="button">
            Copy Pulse JSON URL
          </button>
          <button className={actionClassName()} onClick={() => copyValue(absoluteAppUrl(`/api/v1/pulse?scanId=${scanId}&format=markdown`))} type="button">
            Copy Pulse Markdown URL
          </button>
          <button className={actionClassName()} onClick={() => copyValue(absoluteAppUrl(`/api/v1/pulse?scanId=${scanId}&detail=full`))} type="button">
            Copy Full Pulse JSON URL
          </button>
        </div>
      </div>
      {copyState === "copied" ? <p className="mt-2 text-xs leading-5 text-emerald-700">Pulse URL copied.</p> : null}
      {copyState === "failed" ? (
        <p className="mt-2 text-xs leading-5 text-amber-700">
          Copy was not available in this browser. Use the Pulse API links from this section.
        </p>
      ) : null}
    </section>
  );
}

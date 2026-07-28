"use client";

import React, { useActionState, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { sendReportEmailAction, type SendReportEmailActionState } from "../../server/scans/email-report";

type ShareReportActionsProps = {
  domainLabel: string;
  scanId: string;
  showMonitorSite?: boolean;
  visualEvidenceHref?: string | null;
};

const initialSendReportEmailActionState: SendReportEmailActionState = {
  error: null,
  success: null
};

export const VISUAL_EVIDENCE_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000] as const;

export function buildVisualEvidenceRetryHref(href: string, attempt: number) {
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}visualEvidenceAttempt=${attempt}`;
}

function actionClassName(tone: "primary" | "secondary" = "secondary") {
  const base =
    "scan-report-button inline-flex min-h-9 items-center justify-center rounded-full px-3 text-xs font-semibold";

  if (tone === "primary") {
    return `${base} scan-report-button-primary text-white`;
  }

  return `${base} text-slate-700 hover:text-slate-950`;
}

function iconActionClassName(tone: "primary" | "secondary" = "secondary") {
  const base =
    "scan-report-button group relative inline-flex h-10 w-10 items-center justify-center rounded-full text-sm";

  if (tone === "primary") {
    return `${base} scan-report-button-primary text-white`;
  }

  return `${base} text-slate-700 hover:text-slate-950`;
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

function ExternalLinkIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path d="M14 5h5v5M19 5l-8 8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M11 6.5H7.5A2.5 2.5 0 0 0 5 9v7.5A2.5 2.5 0 0 0 7.5 19H15a2.5 2.5 0 0 0 2.5-2.5V13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function JsonIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path d="M9 7 5 12l4 5M15 7l4 5-4 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function MarkdownIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <rect height="12" rx="2" stroke="currentColor" strokeWidth="1.8" width="16" x="4" y="6" />
      <path d="M7.5 15V9l2.5 3 2.5-3v6M16 9v6M14.2 13.2 16 15l1.8-1.8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
    </svg>
  );
}

function FullJsonIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path d="M7 4.5h7l3 3v12H7z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
      <path d="M14 4.5v3h3M9.5 11h5M9.5 14h5M9.5 17h3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  );
}

function TextIcon({ label }: { label: string }) {
  return <span aria-hidden="true" className="text-[9px] font-bold tracking-tight">{label}</span>;
}

export function buildSdkEvidenceSnippet(scanId: string) {
  return [
    'import { CertScoreClient } from "@certscore/sdk";',
    "",
    "const certscore = new CertScoreClient({",
    "  apiKey: process.env.CERTSCORE_API_KEY",
    "});",
    `const evidence = await certscore.pulse.evidence(${JSON.stringify(scanId)});`
  ].join("\n");
}

export function buildMcpEvidenceInvocation(scanId: string) {
  return JSON.stringify({
    tool: "get_evidence",
    arguments: { scanId }
  }, null, 2);
}

function VisualEvidenceIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24">
      <path d="M3.5 12s3.2-5.5 8.5-5.5S20.5 12 20.5 12s-3.2 5.5-8.5 5.5S3.5 12 3.5 12Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
    </svg>
  );
}

function ZoomOutIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <circle cx="10.5" cy="10.5" r="5.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 10.5h5M15 15l4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function ZoomInIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <circle cx="10.5" cy="10.5" r="5.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10.5 8v5M8 10.5h5M15 15l4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function ImageLoadingGlyph() {
  return (
    <span aria-hidden="true" className="relative h-6 w-6 shrink-0">
      <span className="absolute inset-0 rounded-full border border-sky-300/70" />
      <span className="absolute inset-[3px] animate-spin rounded-full border-2 border-sky-200 border-t-sky-600" />
      <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full bg-sky-500" />
    </span>
  );
}

export function ShareReportActions({
  domainLabel,
  scanId,
  showMonitorSite = false,
  visualEvidenceHref = null
}: ShareReportActionsProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [currentUrl, setCurrentUrl] = useState("");
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [isVisualEvidenceDialogOpen, setIsVisualEvidenceDialogOpen] = useState(false);
  const [isVisualEvidenceImageLoading, setIsVisualEvidenceImageLoading] = useState(false);
  const [visualEvidenceImageFailed, setVisualEvidenceImageFailed] = useState(false);
  const [visualEvidenceLoadAttempt, setVisualEvidenceLoadAttempt] = useState(0);
  const [visualEvidenceZoom, setVisualEvidenceZoom] = useState(1);
  const visualEvidenceRetryTimerRef = useRef<number | null>(null);
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

  useEffect(() => {
    return () => {
      if (visualEvidenceRetryTimerRef.current !== null) {
        window.clearTimeout(visualEvidenceRetryTimerRef.current);
      }
    };
  }, []);

  function beginVisualEvidenceLoad() {
    if (visualEvidenceRetryTimerRef.current !== null) {
      window.clearTimeout(visualEvidenceRetryTimerRef.current);
      visualEvidenceRetryTimerRef.current = null;
    }
    setVisualEvidenceImageFailed(false);
    setIsVisualEvidenceImageLoading(true);
  }

  function retryVisualEvidenceNow() {
    beginVisualEvidenceLoad();
    setVisualEvidenceLoadAttempt(0);
  }

  function closeVisualEvidenceDialog() {
    if (visualEvidenceRetryTimerRef.current !== null) {
      window.clearTimeout(visualEvidenceRetryTimerRef.current);
      visualEvidenceRetryTimerRef.current = null;
    }
    setIsVisualEvidenceDialogOpen(false);
  }

  function handleVisualEvidenceLoadError() {
    const retryDelay = VISUAL_EVIDENCE_RETRY_DELAYS_MS[visualEvidenceLoadAttempt];
    if (retryDelay === undefined) {
      setIsVisualEvidenceImageLoading(false);
      setVisualEvidenceImageFailed(true);
      return;
    }

    setIsVisualEvidenceImageLoading(true);
    visualEvidenceRetryTimerRef.current = window.setTimeout(() => {
      visualEvidenceRetryTimerRef.current = null;
      setVisualEvidenceLoadAttempt((attempt) => attempt + 1);
    }, retryDelay);
  }

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
        {showMonitorSite ? (
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
        ) : null}
        {visualEvidenceHref ? (
          <button
            type="button"
            aria-label="View captured image"
            className={iconActionClassName()}
            data-analytics-cta-type="visual-evidence"
            data-analytics-event="report_cta_clicked"
            onClick={() => {
              setVisualEvidenceLoadAttempt(0);
              beginVisualEvidenceLoad();
              setVisualEvidenceZoom(1);
              setIsVisualEvidenceDialogOpen(true);
            }}
            title="View captured image"
          >
            <VisualEvidenceIcon />
            <IconTooltip label="View captured image" />
          </button>
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
      {isVisualEvidenceDialogOpen && visualEvidenceHref ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6">
          <div
            aria-labelledby="visual-evidence-modal-title"
            aria-modal="true"
            className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div className="space-y-1">
                <h2 id="visual-evidence-modal-title" className="text-xl font-semibold tracking-normal text-slate-950">
                  Captured image
                </h2>
                <p className="text-sm leading-6 text-slate-600">
                  Visual evidence retained for {domainLabel}.
                </p>
              </div>
              <div className="flex flex-none items-center gap-2">
                <div className="flex items-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <button
                    type="button"
                    aria-label="Zoom out captured image"
                    className="scan-report-button inline-flex h-10 w-10 items-center justify-center text-slate-600 hover:text-slate-950 disabled:cursor-not-allowed disabled:text-slate-300"
                    disabled={visualEvidenceZoom <= 0.5}
                    onClick={() => setVisualEvidenceZoom((value) => Math.max(0.5, Number((value - 0.25).toFixed(2))))}
                    title="Zoom out"
                  >
                    <ZoomOutIcon />
                  </button>
                  <button
                    type="button"
                    aria-label="Reset captured image zoom"
                    className="scan-report-button inline-flex h-10 min-w-14 items-center justify-center border-x-0 px-2 text-xs font-semibold text-slate-600 hover:text-slate-950"
                    onClick={() => setVisualEvidenceZoom(1)}
                    title="Reset zoom"
                  >
                    {Math.round(visualEvidenceZoom * 100)}%
                  </button>
                  <button
                    type="button"
                    aria-label="Zoom in captured image"
                    className="scan-report-button inline-flex h-10 w-10 items-center justify-center text-slate-600 hover:text-slate-950 disabled:cursor-not-allowed disabled:text-slate-300"
                    disabled={visualEvidenceZoom >= 3}
                    onClick={() => setVisualEvidenceZoom((value) => Math.min(3, Number((value + 0.25).toFixed(2))))}
                    title="Zoom in"
                  >
                    <ZoomInIcon />
                  </button>
                </div>
                <button
                  type="button"
                  aria-label="Close captured image"
                  className="scan-report-button inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 hover:text-slate-950"
                  onClick={closeVisualEvidenceDialog}
                >
                  <CloseIcon />
                </button>
              </div>
            </div>
            <div className="relative min-h-[18rem] flex-1 overflow-auto bg-slate-950/95 p-4">
              {isVisualEvidenceImageLoading ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="inline-flex items-center gap-3 rounded-full border border-slate-700 bg-slate-900/90 px-4 py-3 text-sm font-semibold text-slate-100 shadow-xl">
                    <ImageLoadingGlyph />
                    <span>Loading captured image</span>
                  </div>
                </div>
              ) : null}
              {visualEvidenceImageFailed ? (
                <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
                  <div className="max-w-md rounded-2xl border border-slate-700 bg-slate-900/95 p-5 text-slate-100 shadow-xl">
                    <p className="font-semibold">The captured image is temporarily unavailable.</p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      The evidence was retained, but the image service did not respond after several attempts.
                    </p>
                    <button className={`${actionClassName("primary")} mt-4`} onClick={retryVisualEvidenceNow} type="button">
                      Try again
                    </button>
                  </div>
                </div>
              ) : (
                <img
                  alt={`Captured scan evidence for ${domainLabel}`}
                  className={`mx-auto block rounded-lg bg-white object-contain shadow-lg transition-opacity duration-150 ${isVisualEvidenceImageLoading ? "opacity-0" : "opacity-100"}`}
                  onError={handleVisualEvidenceLoadError}
                  onLoad={() => {
                    setIsVisualEvidenceImageLoading(false);
                    setVisualEvidenceImageFailed(false);
                  }}
                  src={buildVisualEvidenceRetryHref(visualEvidenceHref, visualEvidenceLoadAttempt)}
                  style={{
                    maxHeight: visualEvidenceZoom === 1 ? "72vh" : "none",
                    maxWidth: visualEvidenceZoom === 1 ? "100%" : "none",
                    width: `${visualEvidenceZoom * 100}%`
                  }}
                />
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white px-5 py-3">
              <button
                className={actionClassName("primary")}
                onClick={closeVisualEvidenceDialog}
                type="button"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function AgentSummaryActions({ domainLabel, scanId }: ShareReportActionsProps) {
  const [copyState, setCopyState] = useState<{
    label: string | null;
    status: "idle" | "copied" | "failed";
  }>({ label: null, status: "idle" });
  const [currentUrl, setCurrentUrl] = useState("");

  useEffect(() => {
    setCurrentUrl(window.location.href);
  }, []);

  async function copyValue(value: string, label: string) {
    try {
      if (!value || !navigator.clipboard) {
        setCopyState({ label, status: "failed" });
        return;
      }
      await navigator.clipboard.writeText(value);
      setCopyState({ label, status: "copied" });
      window.setTimeout(() => setCopyState({ label: null, status: "idle" }), 2400);
    } catch {
      setCopyState({ label, status: "failed" });
    }
  }

  function absoluteAppUrl(path: string) {
    if (!currentUrl) {
      return path;
    }
    return new URL(path, currentUrl).toString();
  }

  return (
    <div className="space-y-2">
      <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Agent summary</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Share this scan through the CertScore.ai Pulse API using this report's scan ID.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link aria-label="View Pulse page" className={iconActionClassName()} href={`/pulse/${encodeURIComponent(domainLabel)}`} title="View Pulse page">
              <ExternalLinkIcon />
              <IconTooltip label="View Pulse page" />
            </Link>
            <button aria-label="Copy Pulse JSON URL" className={iconActionClassName()} onClick={() => copyValue(absoluteAppUrl(`/api/v1/pulse?scanId=${scanId}`), "Pulse JSON URL")} title="Copy Pulse JSON URL" type="button">
              <JsonIcon />
              <IconTooltip label="Copy Pulse JSON URL" />
            </button>
            <button aria-label="Copy Pulse Markdown URL" className={iconActionClassName()} onClick={() => copyValue(absoluteAppUrl(`/api/v1/pulse?scanId=${scanId}&format=markdown`), "Pulse Markdown URL")} title="Copy Pulse Markdown URL" type="button">
              <MarkdownIcon />
              <IconTooltip label="Copy Pulse Markdown URL" />
            </button>
            <button aria-label="Copy Evidence JSON URL" className={iconActionClassName()} onClick={() => copyValue(absoluteAppUrl(`/api/v1/pulse?scanId=${scanId}&detail=evidence`), "Evidence JSON URL")} title="Copy Evidence JSON URL" type="button">
              <TextIcon label="EVD" />
              <IconTooltip label="Copy Evidence JSON URL" />
            </button>
            <button aria-label="Copy Full Pulse JSON URL" className={iconActionClassName()} onClick={() => copyValue(absoluteAppUrl(`/api/v1/pulse?scanId=${scanId}&detail=full`), "Full Pulse JSON URL")} title="Copy Full Pulse JSON URL" type="button">
              <FullJsonIcon />
              <IconTooltip label="Copy Full Pulse JSON URL" />
            </button>
            <button aria-label="Copy SDK evidence example" className={iconActionClassName()} onClick={() => copyValue(buildSdkEvidenceSnippet(scanId), "SDK evidence example")} title="Copy SDK evidence example" type="button">
              <TextIcon label="SDK" />
              <IconTooltip label="Copy SDK evidence example" />
            </button>
            <button aria-label="Copy MCP evidence invocation" className={iconActionClassName()} onClick={() => copyValue(buildMcpEvidenceInvocation(scanId), "MCP evidence invocation")} title="Copy MCP evidence invocation" type="button">
              <TextIcon label="MCP" />
              <IconTooltip label="Copy MCP evidence invocation" />
            </button>
          </div>
        </div>
        {copyState.status === "copied" ? <p className="mt-2 text-xs leading-5 text-emerald-700">{copyState.label} copied.</p> : null}
        {copyState.status === "failed" ? (
          <p className="mt-2 text-xs leading-5 text-amber-700">
            Copy was not available in this browser. Open the Pulse API documentation for the equivalent request.
          </p>
        ) : null}
      </section>
    </div>
  );
}

"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { sendReportEmailAction, type SendReportEmailActionState } from "../../server/scans/email-report";

type ShareReportActionsProps = {
  domainLabel: string;
  scanId: string;
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

export function ShareReportActions({ domainLabel, scanId }: ShareReportActionsProps) {
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

  async function copyReportUrl() {
    try {
      if (!currentUrl || !navigator.clipboard) {
        setCopyState("failed");
        return;
      }
      await navigator.clipboard.writeText(currentUrl);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2400);
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={actionClassName("primary")}
          data-analytics-cta-type="share"
          data-analytics-event="report_cta_clicked"
          onClick={copyReportUrl}
        >
          {copyState === "copied" ? "Report URL copied" : "Share report"}
        </button>
        <button
          type="button"
          className={actionClassName()}
          data-analytics-cta-type="email"
          data-analytics-event="report_cta_clicked"
          onClick={() => setIsEmailDialogOpen(true)}
        >
          {emailState.success ? "Sent" : "Email me this report"}
        </button>
        <Link
          className={actionClassName()}
          data-analytics-cta-type="monitor"
          data-analytics-event="report_cta_clicked"
          href={monitorHref}
        >
          Monitor this site
        </Link>
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

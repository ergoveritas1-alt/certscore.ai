"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type ShareReportActionsProps = {
  domainLabel: string;
};

function actionClassName(tone: "primary" | "secondary" = "secondary") {
  const base =
    "inline-flex min-h-9 items-center justify-center rounded-full px-3 text-xs font-semibold shadow-sm transition";

  if (tone === "primary") {
    return `${base} border-0 bg-[linear-gradient(135deg,#0f8bd7_0%,#1ea7e1_62%,#67c7f0_100%)] text-white hover:brightness-[1.04]`;
  }

  return `${base} border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:text-slate-950`;
}

export function ShareReportActions({ domainLabel }: ShareReportActionsProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [currentUrl, setCurrentUrl] = useState("");
  const monitorHref = useMemo(() => {
    const params = new URLSearchParams({ website: domainLabel });
    if (currentUrl) {
      params.set("reportUrl", currentUrl);
      params.set("source", currentUrl);
    }
    return `/monitor-site?${params.toString()}`;
  }, [currentUrl, domainLabel]);
  const mailtoHref = useMemo(() => {
    const subject = `CertScore.ai report for ${domainLabel}`;
    const body = currentUrl
      ? `Please send me this CertScore.ai report link:\n\n${currentUrl}\n\nAutomated public-web observations. Review the evidence before relying on findings.`
      : `Please send me this CertScore.ai report for ${domainLabel}.`;

    return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, [currentUrl, domainLabel]);

  useEffect(() => {
    setCurrentUrl(window.location.href);
  }, []);

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
    <div className="w-full max-w-[28rem] rounded-[1.1rem] border border-slate-200 bg-slate-50/85 p-3 shadow-sm">
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
        <Link
          className={actionClassName()}
          data-analytics-cta-type="email"
          data-analytics-event="report_cta_clicked"
          href={mailtoHref}
        >
          Email me this report
        </Link>
        <Link
          className={actionClassName()}
          data-analytics-cta-type="monitor"
          data-analytics-event="report_cta_clicked"
          href={monitorHref}
        >
          Monitor this site
        </Link>
        <Link
          className={actionClassName()}
          data-analytics-cta-type="checklist"
          data-analytics-event="report_cta_clicked"
          href="/guides/website-consent-audit-checklist"
        >
          Get a remediation checklist
        </Link>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-500">
        Automated public-web observations. Review the evidence before relying on findings.
      </p>
      {copyState === "failed" ? (
        <p className="mt-1 text-xs leading-5 text-amber-700">
          Copy was not available in this browser. Use the page URL from the address bar.
        </p>
      ) : null}
    </div>
  );
}

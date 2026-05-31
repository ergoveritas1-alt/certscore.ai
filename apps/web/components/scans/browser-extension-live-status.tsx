"use client";

import { useEffect, useState } from "react";

type BrowserExtensionLiveStatusProps = {
  browserScanId: string;
};

type BrowserExtensionStatus = {
  browserScanId?: string;
  busy?: boolean;
  label?: string;
  message?: string;
  phase?: string;
  reportUrl?: string;
  summary?: {
    bannerObserved?: boolean;
    cookieEventCount?: number;
    networkRequestCount?: number;
  };
};

type BrowserExtensionWindowMessage = {
  source?: string;
  status?: BrowserExtensionStatus;
  type?: string;
};

export function BrowserExtensionLiveStatus({ browserScanId }: BrowserExtensionLiveStatusProps) {
  const [status, setStatus] = useState<BrowserExtensionStatus | null>(null);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.source !== window || !event.data || typeof event.data !== "object") {
        return;
      }

      const data = event.data as BrowserExtensionWindowMessage;
      if (data.source !== "certscore-bx01-extension" || data.type !== "CERTSCORE_BX01_STATUS" || !data.status) {
        return;
      }

      if (data.status.browserScanId && data.status.browserScanId !== browserScanId) {
        return;
      }

      setStatus(data.status);
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [browserScanId]);

  useEffect(() => {
    if (!status?.reportUrl) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const reportUrl = new URL(status.reportUrl ?? "", window.location.origin);
      if (`${reportUrl.pathname}${reportUrl.search}${reportUrl.hash}` !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
        window.location.assign(reportUrl.toString());
      }
    }, 800);

    return () => window.clearTimeout(timeoutId);
  }, [status?.reportUrl]);

  if (!status) {
    return null;
  }

  const summary = status.summary;

  return (
    <section className="rounded-3xl border border-sky-100 bg-sky-50/70 px-5 py-4 text-sm text-slate-700 shadow-[0_12px_32px_rgba(14,165,233,0.08)] sm:px-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Live BX01 status</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-950">{status.label ?? "Browser scan"}</h2>
          <p className="mt-1 leading-6">{status.message ?? "BX01 is capturing browser evidence."}</p>
        </div>
        {status.phase ? (
          <span className="w-fit rounded-full bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-sky-700 ring-1 ring-sky-100">
            {status.phase}
          </span>
        ) : null}
      </div>
      {summary ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-2xl bg-white px-3 py-2 ring-1 ring-sky-100">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Requests</p>
            <p className="mt-1 text-xl font-semibold text-slate-950">{summary.networkRequestCount ?? 0}</p>
          </div>
          <div className="rounded-2xl bg-white px-3 py-2 ring-1 ring-sky-100">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cookies</p>
            <p className="mt-1 text-xl font-semibold text-slate-950">{summary.cookieEventCount ?? 0}</p>
          </div>
          <div className="rounded-2xl bg-white px-3 py-2 ring-1 ring-sky-100">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Banner</p>
            <p className="mt-1 text-xl font-semibold text-slate-950">
              {summary.bannerObserved === true ? "Seen" : summary.bannerObserved === false ? "Not seen" : "Unknown"}
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}

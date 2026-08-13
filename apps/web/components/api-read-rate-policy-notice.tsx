import React from "react";
import Link from "next/link";
import {
  API_READ_RATE_POLICY,
  apiReadRateWindow
} from "@website-signal-risk-scanner/shared";

const terminalBurst = apiReadRateWindow("terminal", "burst");
const terminalDaily = apiReadRateWindow("terminal", "daily");

export function ApiReadRatePolicyNotice({ className = "" }: { className?: string }) {
  return (
    <aside
      aria-label="Automated access limits"
      className={`rounded-xl border border-sky-100 bg-sky-50/70 px-5 py-4 text-sm leading-6 text-slate-700 ${className}`.trim()}
      data-api-read-rate-policy-notice
      data-api-read-rate-policy-version={API_READ_RATE_POLICY.version}
    >
      <p className="font-semibold text-slate-950">Automated access is rate protected</p>
      <p className="mt-1">
        API and MCP reads for one caller plus one completed scan are limited to{" "}
        <strong>{terminalBurst.limits.callerTarget} units per rolling 10 minutes</strong> and{" "}
        <strong>{terminalDaily.limits.callerTarget} units per rolling 24 hours</strong>. A CertScore API HTTP 429 means
        retrieval was throttled; it is not the scanned site&apos;s result. Bots must wait for <code>Retry-After</code> before
        retrying and must not poll terminal scans.
      </p>
      <Link className="mt-2 inline-flex font-semibold text-sky-800 underline decoration-sky-300 underline-offset-4 hover:text-sky-950" href="/developers/reference#read-rate-limits">
        View all API and MCP limits
      </Link>
    </aside>
  );
}

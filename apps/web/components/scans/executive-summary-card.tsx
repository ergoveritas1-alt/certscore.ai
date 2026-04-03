import type { ReactNode } from "react";
import type { CertScoreFinding } from "../../lib/scans/finding-registry";
import { SummaryMetricTile } from "./report-primitives";

function MetricIconShell({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "rose" | "amber" | "sky" }) {
  const toneClass =
    tone === "rose"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : tone === "sky"
          ? "border-sky-200 bg-sky-50 text-sky-700"
          : "border-slate-200 bg-white text-slate-600";

  return <span className={`flex h-8 w-8 items-center justify-center rounded-full border shadow-sm ${toneClass}`}>{children}</span>;
}

function ShieldIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.7">
      <path d="M10 2.5 15.5 4.5v4.8c0 3.5-2.2 5.9-5.5 8.2-3.3-2.3-5.5-4.7-5.5-8.2V4.5L10 2.5Z" />
      <path d="m7.6 10 1.5 1.6 3.3-3.5" />
    </svg>
  );
}

function NetworkIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="4.5" cy="10" r="1.8" />
      <circle cx="15.5" cy="5" r="1.8" />
      <circle cx="15.5" cy="15" r="1.8" />
      <path d="M6.3 9.3 13.7 5.7M6.3 10.7l7.4 3.6" />
    </svg>
  );
}

function CookieIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.8 3.1c-.2 1.7 1.2 3.1 2.8 3-.2 4.8-3.5 8.8-8.3 9-3.9.2-7.1-3-7.1-6.9 0-4.4 3.6-8 8-8 .7 0 1.3.1 1.9.2" />
      <circle cx="6.6" cy="7.5" r=".8" fill="currentColor" stroke="none" />
      <circle cx="8.8" cy="11.4" r=".8" fill="currentColor" stroke="none" />
      <circle cx="12.1" cy="9.3" r=".8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function RadarIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="6.5" />
      <circle cx="10" cy="10" r="3.3" />
      <path d="M10 10 15 6.2" />
      <circle cx="15" cy="6.2" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function FingerprintIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.2 7.5a3.8 3.8 0 0 1 7.6 0" />
      <path d="M4.6 8.7a5.4 5.4 0 0 1 10.8 0" />
      <path d="M8 9.5c0 3-.7 5-2 7" />
      <path d="M12 9.5c0 2.4.5 4.4 1.5 6.3" />
      <path d="M10 8.4c0 3.7-.1 6.1-1 8.3" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 3.2 17 15.8H3L10 3.2Z" />
      <path d="M10 7.2v4.5M10 14.4h.01" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="3.5" width="5" height="5" rx="1" />
      <rect x="11.5" y="3.5" width="5" height="5" rx="1" />
      <rect x="3.5" y="11.5" width="5" height="5" rx="1" />
      <rect x="11.5" y="11.5" width="5" height="5" rx="1" />
    </svg>
  );
}

function RecordIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 7.2c2.2-2.3 4.2-3.5 6.5-3.5s4.3 1.2 6.5 3.5c-2.2 2.3-4.2 3.5-6.5 3.5S5.7 9.5 3.5 7.2Z" />
      <circle cx="10" cy="7.2" r="1.8" />
      <circle cx="14.8" cy="13.7" r="2.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function BalanceIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 3.5v11.8M6.2 5.8h7.6M4.8 15.3h10.4" />
      <path d="m6.2 5.8-2.2 4.1h4.4l-2.2-4.1ZM13.8 5.8l-2.2 4.1H16l-2.2-4.1Z" />
    </svg>
  );
}

function getFindingIcon(finding: CertScoreFinding) {
  if (finding.id.includes("session_record")) {
    return <RecordIcon />;
  }
  if (finding.id.includes("consent") || finding.id.includes("imbalance")) {
    return <BalanceIcon />;
  }
  if (finding.id.includes("cookie")) {
    return <CookieIcon />;
  }
  if (finding.id.includes("fingerprint")) {
    return <FingerprintIcon />;
  }
  if (finding.id.includes("vendor") || finding.id.includes("footprint")) {
    return <GridIcon />;
  }
  return <NetworkIcon />;
}

function formatFreshness(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Scan completed";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function getPostureClasses(posture: "Clear" | "Watch" | "Action Needed") {
  if (posture === "Action Needed") {
    return "border-rose-200 bg-rose-50/90 text-rose-950";
  }
  if (posture === "Watch") {
    return "border-amber-200 bg-amber-50/90 text-amber-950";
  }
  return "border-emerald-200 bg-emerald-50/90 text-emerald-950";
}

export function ExecutiveSummaryCard(input: {
  beforeConsentCookieCount: number;
  finalHost: string | null;
  fingerprintLabel: string;
  fingerprintNarrative: string;
  landedOnDifferentHost: boolean;
  lastScannedAt: string;
  posture: "Clear" | "Watch" | "Action Needed";
  requestedHost: string | null;
  score: number | null;
  thirdPartyRequestCount: number;
  topFindings: CertScoreFinding[];
  trackerSummary: string;
  vendorCategoryCounts: Record<string, number>;
}) {
  const categorySummary = Object.entries(input.vendorCategoryCounts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([key, count]) => `${key.replaceAll("_", " ")} ${count}`)
    .join(" · ");
  const primaryFindings = input.topFindings.slice(0, 3);
  const secondaryFindings = input.topFindings.slice(3, 6);

  return (
    <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_18px_60px_-32px_rgba(15,23,42,0.18)]">
      <div className="grid gap-6 px-6 py-6 lg:grid-cols-[1.35fr_0.9fr] lg:px-8">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] ${getPostureClasses(input.posture)}`}>
              {input.posture}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700">
              Scanned {formatFreshness(input.lastScannedAt)}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryMetricTile
              label="Overall score"
              icon={<ShieldIcon />}
              value={input.score !== null ? String(input.score) : "—"}
              className="rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-4"
            />
            <SummaryMetricTile
              label="Third-party requests"
              icon={<NetworkIcon />}
              value={String(input.thirdPartyRequestCount)}
              className="rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-4"
            />
            <SummaryMetricTile
              label="Cookies before consent"
              icon={<CookieIcon />}
              value={String(input.beforeConsentCookieCount)}
              className="rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-4"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.18em] text-slate-500">
                  <MetricIconShell tone="amber">
                    <AlertIcon />
                  </MetricIconShell>
                  <span>Top findings</span>
                </p>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-950 lg:text-[2.2rem]">Highest-priority issues</h2>
              </div>
              <div className="hidden min-w-[180px] rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-3 lg:block">
                <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                  <MetricIconShell>
                    <RadarIcon />
                  </MetricIconShell>
                  <span>Tracker footprint</span>
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-950">{input.trackerSummary}</p>
                <p className="mt-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                  <MetricIconShell>
                    <FingerprintIcon />
                  </MetricIconShell>
                  <span>Fingerprinting</span>
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-950">{input.fingerprintNarrative}</p>
              </div>
            </div>
            {input.landedOnDifferentHost && input.requestedHost && input.finalHost ? (
              <div className="rounded-[1.2rem] border border-sky-200/80 bg-sky-50/75 px-4 py-3 text-sm text-sky-950">
                Findings reflect the landed domain <span className="font-semibold">{input.finalHost}</span>, not the requested domain <span className="font-semibold">{input.requestedHost}</span>.
              </div>
            ) : null}
          </div>

          <div className="grid gap-3">
            {primaryFindings.map((finding, index) => (
              <div
                key={finding.id}
                className={`rounded-[1.4rem] border px-4 py-4 shadow-[0_12px_35px_-26px_rgba(15,23,42,0.18)] ${
                  index === 0 ? "border-rose-200 bg-rose-50/70" : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2.5">
                  <MetricIconShell tone={index === 0 ? "rose" : "slate"}>
                    {getFindingIcon(finding)}
                  </MetricIconShell>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-700">
                    {finding.severity}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-700">
                    {finding.confidence === "strong" ? "Strong evidence" : finding.confidence === "good" ? "Good evidence" : "Moderate evidence"}
                  </span>
                </div>
                <p className="mt-3 text-[15px] font-semibold tracking-tight text-slate-950">{finding.label}</p>
                <p className="mt-1.5 text-sm leading-6 text-slate-700">{finding.shortSummary}</p>
              </div>
            ))}
          </div>
          {secondaryFindings.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-3">
              {secondaryFindings.map((finding) => (
                <div key={finding.id} className="rounded-[1.25rem] border border-slate-200 bg-slate-50/70 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <MetricIconShell>
                      {getFindingIcon(finding)}
                    </MetricIconShell>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{finding.severity}</p>
                  </div>
                  <p className="mt-2 text-sm font-semibold tracking-tight text-slate-950">{finding.label}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="space-y-4 rounded-[1.7rem] border border-slate-200 bg-slate-50/85 p-4">
          <div className="space-y-1">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              <MetricIconShell tone="sky">
                <GridIcon />
              </MetricIconShell>
              <span>Signal snapshot</span>
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <SummaryMetricTile label="Tracker footprint" icon={<RadarIcon />} value={input.trackerSummary} className="rounded-[1.3rem] border border-slate-200 bg-white px-4 py-4" />
            <SummaryMetricTile label="Fingerprinting" icon={<FingerprintIcon />} value={input.fingerprintNarrative} className="rounded-[1.3rem] border border-slate-200 bg-white px-4 py-4" />
            <SummaryMetricTile label="Top findings surfaced" icon={<AlertIcon />} value={String(input.topFindings.length)} className="rounded-[1.3rem] border border-slate-200 bg-white px-4 py-4" />
          </div>
          {categorySummary ? (
            <div className="rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3.5">
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                <MetricIconShell>
                  <GridIcon />
                </MetricIconShell>
                <span>Vendor mix</span>
              </p>
              <p className="mt-2 text-sm text-slate-800">{categorySummary}</p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

import type { CertScoreFinding } from "../../lib/scans/finding-registry";
import { SummaryMetricTile } from "./report-primitives";

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
              value={input.score !== null ? String(input.score) : "—"}
              className="rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-4"
            />
            <SummaryMetricTile
              label="Third-party requests"
              value={String(input.thirdPartyRequestCount)}
              className="rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-4"
            />
            <SummaryMetricTile
              label="Cookies before consent"
              value={String(input.beforeConsentCookieCount)}
              className="rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-4"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">Top findings</p>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-950 lg:text-[2.2rem]">Highest-priority issues</h2>
              </div>
              <div className="hidden min-w-[180px] rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-3 lg:block">
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Tracker footprint</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">{input.trackerSummary}</p>
                <p className="mt-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">Fingerprinting</p>
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
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{finding.severity}</p>
                  <p className="mt-2 text-sm font-semibold tracking-tight text-slate-950">{finding.label}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="space-y-4 rounded-[1.7rem] border border-slate-200 bg-slate-50/85 p-4">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Signal snapshot</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <SummaryMetricTile label="Tracker footprint" value={input.trackerSummary} className="rounded-[1.3rem] border border-slate-200 bg-white px-4 py-4" />
            <SummaryMetricTile label="Fingerprinting" value={input.fingerprintNarrative} className="rounded-[1.3rem] border border-slate-200 bg-white px-4 py-4" />
            <SummaryMetricTile label="Top findings surfaced" value={String(input.topFindings.length)} className="rounded-[1.3rem] border border-slate-200 bg-white px-4 py-4" />
          </div>
          {categorySummary ? (
            <div className="rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Vendor mix</p>
              <p className="mt-2 text-sm text-slate-800">{categorySummary}</p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

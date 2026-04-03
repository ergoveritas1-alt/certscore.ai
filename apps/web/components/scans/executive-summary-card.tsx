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

  return (
    <section className="overflow-hidden rounded-[2rem] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(248,250,252,0.98)_0%,rgba(255,255,255,0.96)_42%,rgba(241,245,249,0.92)_100%)] shadow-[0_24px_80px_-32px_rgba(15,23,42,0.26)]">
      <div className="grid gap-8 px-6 py-6 lg:grid-cols-[1.25fr_0.95fr] lg:px-8 lg:py-8">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] ${getPostureClasses(input.posture)}`}>
              {input.posture}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700">
              Scanned {formatFreshness(input.lastScannedAt)}
            </span>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">Executive summary</p>
            <h2 className="max-w-3xl text-3xl font-semibold tracking-tight text-slate-950 lg:text-[2.55rem] lg:leading-[1.02]">
              The strongest privacy and consent risks, without making users dig for them.
            </h2>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              This report is based on automated website analysis and is intended for product and compliance review. It is not legal advice.
            </p>
            {input.landedOnDifferentHost && input.requestedHost && input.finalHost ? (
              <div className="rounded-[1.2rem] border border-sky-200/80 bg-sky-50/75 px-4 py-3 text-sm text-sky-950">
                Findings reflect the landed domain <span className="font-semibold">{input.finalHost}</span>, not the requested domain <span className="font-semibold">{input.requestedHost}</span>.
              </div>
            ) : null}
          </div>

          <div className="grid gap-3">
            {input.topFindings.slice(0, 5).map((finding) => (
              <div key={finding.id} className="rounded-[1.4rem] border border-slate-200/80 bg-white/80 px-4 py-4 shadow-[0_12px_35px_-26px_rgba(15,23,42,0.24)]">
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
        </div>

        <div className="space-y-4 rounded-[1.7rem] border border-slate-200/80 bg-white/72 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">At a glance</p>
            <p className="text-sm text-slate-600">A compact operational readout for buyers and analysts.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <SummaryMetricTile label="Overall score" value={input.score !== null ? String(input.score) : "—"} className="rounded-[1.3rem] border border-slate-200/80 bg-white/88 px-4 py-4 shadow-[0_12px_35px_-26px_rgba(15,23,42,0.24)]" />
            <SummaryMetricTile label="Third-party requests" value={String(input.thirdPartyRequestCount)} className="rounded-[1.3rem] border border-slate-200/80 bg-white/88 px-4 py-4 shadow-[0_12px_35px_-26px_rgba(15,23,42,0.24)]" />
            <SummaryMetricTile label="Cookies before consent" value={String(input.beforeConsentCookieCount)} className="rounded-[1.3rem] border border-slate-200/80 bg-white/88 px-4 py-4 shadow-[0_12px_35px_-26px_rgba(15,23,42,0.24)]" />
            <SummaryMetricTile label="Tracker footprint" value={input.trackerSummary} className="rounded-[1.3rem] border border-slate-200/80 bg-white/88 px-4 py-4 shadow-[0_12px_35px_-26px_rgba(15,23,42,0.24)]" />
            <SummaryMetricTile label="Fingerprinting" value={input.fingerprintNarrative} className="rounded-[1.3rem] border border-slate-200/80 bg-white/88 px-4 py-4 shadow-[0_12px_35px_-26px_rgba(15,23,42,0.24)]" />
            <SummaryMetricTile label="Top findings surfaced" value={String(input.topFindings.length)} className="rounded-[1.3rem] border border-slate-200/80 bg-white/88 px-4 py-4 shadow-[0_12px_35px_-26px_rgba(15,23,42,0.24)]" />
          </div>
          {categorySummary ? (
            <div className="rounded-[1.2rem] border border-slate-200/80 bg-slate-50/70 px-4 py-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Vendor mix</p>
              <p className="mt-2 text-sm text-slate-800">{categorySummary}</p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

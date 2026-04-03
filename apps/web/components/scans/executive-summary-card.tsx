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

function formatCategoryLabel(value: string) {
  return value.replaceAll("_", " ");
}

function DetailDisclosure(input: {
  items: string[];
  summary: string;
  title: string;
}) {
  const uniqueItems = [...new Set(input.items.filter(Boolean))];

  if (uniqueItems.length === 0) {
    return null;
  }

  return (
    <details className="group mt-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-medium text-slate-700">
        <span>{input.summary}</span>
        <span className="text-slate-400 transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <div className="mt-3 space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{input.title}</p>
        <div className="flex flex-wrap gap-2">
          {uniqueItems.map((item) => (
            <span key={item} className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700">
              {item}
            </span>
          ))}
        </div>
      </div>
    </details>
  );
}

export function ExecutiveSummaryCard(input: {
  beforeConsentCookieCount: number;
  finalHost: string | null;
  fingerprintReasons: string[];
  fingerprintLabel: string;
  fingerprintNarrative: string;
  landedOnDifferentHost: boolean;
  lastScannedAt: string;
  posture: "Clear" | "Watch" | "Action Needed";
  preConsentVendorNames: string[];
  requestedHost: string | null;
  resolvedVendorNames: string[];
  score: number | null;
  sessionReplayVendorNames: string[];
  thirdPartyRequestCount: number;
  thirdPartyDomains: string[];
  topFindings: CertScoreFinding[];
  topObservedEntities: Array<{ label: string; category: string; requestCount: number }>;
  trackerSummary: string;
  unresolvedVendorHosts: string[];
  vendorCategoryCounts: Record<string, number>;
}) {
  const categorySummary = Object.entries(input.vendorCategoryCounts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([key, count]) => `${formatCategoryLabel(key)} ${count}`)
    .join(" · ");
  const primaryFindings = input.topFindings.slice(0, 3);
  const secondaryFindings = input.topFindings.slice(3, 6);
  const namedVendors = input.resolvedVendorNames.slice(0, 8);
  const thirdPartyDomains = input.thirdPartyDomains.slice(0, 9);
  const vendorMixDetails = input.topObservedEntities
    .slice(0, 6)
    .map((entity) => `${entity.label} · ${formatCategoryLabel(entity.category)} · ${entity.requestCount} req`);
  const fingerprintEvidence = [
    input.fingerprintLabel,
    ...input.fingerprintReasons
  ].filter(Boolean);
  const vendorEvidence = [
    ...namedVendors,
    ...input.unresolvedVendorHosts.slice(0, Math.max(0, 8 - namedVendors.length))
  ];

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
          <div className="space-y-3">
            <div className="rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3.5">
              <SummaryMetricTile label="Tracker footprint" value={input.trackerSummary} className="border-0 bg-transparent px-0 py-0 shadow-none" />
              <DetailDisclosure
                summary={`${vendorEvidence.length} vendor names and ${thirdPartyDomains.length} third-party domains`}
                title="Observed vendors and domains"
                items={[...vendorEvidence, ...thirdPartyDomains]}
              />
            </div>
            <div className="rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3.5">
              <SummaryMetricTile label="Fingerprinting" value={input.fingerprintNarrative} className="border-0 bg-transparent px-0 py-0 shadow-none" />
              <DetailDisclosure
                summary={`${fingerprintEvidence.length} fingerprint indicators retained`}
                title="Fingerprint evidence"
                items={fingerprintEvidence}
              />
            </div>
          </div>
          {categorySummary ? (
            <div className="rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Vendor mix</p>
              <p className="mt-2 text-sm text-slate-800">{categorySummary}</p>
              <DetailDisclosure
                summary={`${input.topObservedEntities.length} named entities, ${Object.keys(input.vendorCategoryCounts).length} categories`}
                title="Category and entity detail"
                items={[
                  ...Object.entries(input.vendorCategoryCounts).map(([key, count]) => `${formatCategoryLabel(key)} · ${count}`),
                  ...vendorMixDetails,
                  ...input.preConsentVendorNames.slice(0, 3).map((vendor) => `${vendor} · pre-consent`),
                  ...input.sessionReplayVendorNames.slice(0, 3).map((vendor) => `${vendor} · session replay`)
                ]}
              />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

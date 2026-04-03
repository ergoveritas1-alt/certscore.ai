import type { CertScoreFinding } from "../../lib/scans/finding-registry";
import { SummaryMetricTile } from "./report-primitives";

type DomainBenchmarkCardData = {
  confidence: "low" | "medium" | "high";
  estimatedRankLabel: string;
  expectedCookiesBeforeConsent: number;
  expectedOverallScore: number;
  expectedThirdPartyRequests: number;
  industry: string;
  rationale: string;
} | null;

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

function getConfidenceTone(confidence: "low" | "medium" | "high") {
  if (confidence === "high") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (confidence === "medium") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function polarToCartesian(cx: number, cy: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;

  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians)
  };
}

function describeArc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

function BenchmarkMetricCard(input: {
  actualValue: number | null;
  benchmarkValue: number | null;
  label: string;
  maxValue?: number;
}) {
  const actualValue = typeof input.actualValue === "number" ? input.actualValue : null;
  const benchmarkValue = typeof input.benchmarkValue === "number" ? input.benchmarkValue : null;
  const scaleMax = Math.max(input.maxValue ?? 0, actualValue ?? 0, benchmarkValue ?? 0, 1);
  const actualRatio = Math.max(0, Math.min(1, (actualValue ?? 0) / scaleMax));
  const benchmarkRatio = benchmarkValue !== null ? Math.max(0, Math.min(1, benchmarkValue / scaleMax)) : null;
  const actualArc = describeArc(72, 72, 54, 180, 180 - actualRatio * 180);
  const benchmarkArc =
    benchmarkRatio !== null
      ? describeArc(
          72,
          72,
          66,
          Math.max(180 - benchmarkRatio * 180 - 8, 0),
          Math.max(180 - benchmarkRatio * 180 + 8, 0)
        )
      : null;

  return (
    <div className="rounded-[1.4rem] border border-slate-200 bg-[radial-gradient(circle_at_top,_rgba(125,211,252,0.24),_rgba(255,255,255,0)_58%)] px-4 py-4">
      <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{input.label}</p>
      <div className="mt-2 flex items-center justify-center">
        <div className="relative h-[104px] w-[144px]">
          <svg viewBox="0 0 144 86" className="h-[86px] w-[144px] overflow-visible">
            <path d={describeArc(72, 72, 54, 180, 0)} fill="none" stroke="rgba(226,232,240,0.95)" strokeWidth="16" strokeLinecap="round" />
            {benchmarkArc ? (
              <path d={benchmarkArc} fill="none" stroke="rgba(196,181,253,0.95)" strokeWidth="12" strokeLinecap="round" />
            ) : null}
            <path d={actualArc} fill="none" stroke="rgba(96,165,250,0.95)" strokeWidth="16" strokeLinecap="round" />
          </svg>
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center text-center">
            <div className="flex items-end gap-1">
              <span className="text-[2rem] font-semibold tracking-tight text-sky-700">{actualValue ?? "—"}</span>
              <span className="pb-1 text-base text-slate-500">/{scaleMax}</span>
            </div>
            {benchmarkValue !== null ? (
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
                Expected {benchmarkValue}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function getFindingReferenceLink(finding: CertScoreFinding) {
  if (finding.id === "third_party_tracking_pre_consent") {
    return {
      href: "https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/cookies-and-similar-technologies/",
      label: "ICO guidance on cookies and similar technologies"
    };
  }

  if (finding.id === "session_recording_services_detected") {
    if (/microsoft clarity/i.test(finding.shortSummary)) {
      return {
        href: "https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-masking",
        label: "Microsoft Clarity data masking guidance"
      };
    }

    return {
      href: "https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/online-tracking/guidance-for-consumer-internet-of-things-products-and-services/how-do-we-ensure-our-use-of-online-tracking-is-fair/",
      label: "ICO fairness guidance for online tracking"
    };
  }

  if (finding.id === "asymmetric_consent_ui") {
    return {
      href: "https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/online-tracking/how-do-we-comply-with-the-rules-on-storing-information-and-gaining-access-to-information/",
      label: "ICO guidance on consent choice presentation"
    };
  }

  return null;
}

function getFindingFixText(finding: CertScoreFinding) {
  if (finding.id === "third_party_tracking_pre_consent") {
    return "Move non-essential analytics, adtech, and session-replay tags behind a consent gate. Load them only after an explicit accept signal and verify that the default page path produces zero third-party tracking requests before consent.";
  }

  if (finding.id === "session_recording_services_detected") {
    return "Either remove session replay from the public path or gate it behind consent. If it remains, enable masking for form fields, auth flows, and user-generated content, and add a plain-language disclosure naming the replay vendor and purpose.";
  }

  if (finding.id === "asymmetric_consent_ui") {
    return "Bring reject and settings up to the first layer, match the visual weight of accept, and avoid button color, size, or placement patterns that steer users toward one choice. Re-test the live banner after the CSS change, not just the design mock.";
  }

  return finding.remediation;
}

function FindingDetailDisclosure(input: { finding: CertScoreFinding }) {
  const reference = getFindingReferenceLink(input.finding);
  const jsonPayload = JSON.stringify(input.finding, null, 2);

  return (
    <details className="group mt-4 rounded-xl border border-slate-200 bg-slate-50/85 px-4 py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-slate-800">
        <span>More detail</span>
        <span className="text-slate-400 transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <div className="mt-4 space-y-4">
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Why this matters</p>
          <p className="text-sm leading-6 text-slate-700">{input.finding.whyItMatters}</p>
        </div>
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">How to fix</p>
          <p className="text-sm leading-6 text-slate-700">{getFindingFixText(input.finding)}</p>
          {reference ? (
            <a
              href={reference.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center text-sm font-medium text-sky-700 underline decoration-sky-200 underline-offset-4 hover:text-sky-800"
            >
              {reference.label}
            </a>
          ) : null}
        </div>
        <details className="group/json min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
            <span>{"{}"} JSON evidence</span>
            <span className="text-slate-400 transition-transform group-open/json:rotate-180">⌄</span>
          </summary>
          <div className="mt-3 min-w-0 max-w-full overflow-hidden rounded-lg bg-slate-950">
            <pre className="max-w-full whitespace-pre-wrap break-words px-3 py-3 text-xs leading-5 text-slate-100">{jsonPayload}</pre>
          </div>
        </details>
      </div>
    </details>
  );
}

export function ExecutiveSummaryCard(input: {
  beforeConsentCookieCount: number;
  domainBenchmark: DomainBenchmarkCardData;
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
  const secondaryFindings = input.topFindings
    .filter((finding) => finding.id !== "multi_vendor_tracking_detected" && finding.id !== "large_third_party_footprint")
    .slice(3, 6);
  const namedVendors = input.resolvedVendorNames.slice(0, 8);
  const thirdPartyDomains = input.thirdPartyDomains.slice(0, 9);
  const vendorMixDetails = input.topObservedEntities
    .slice(0, 6)
    .map((entity) => `${entity.label} · ${formatCategoryLabel(entity.category)} · ${entity.requestCount} req`);
  const fingerprintEvidence = input.fingerprintReasons.filter(Boolean);
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
            {input.domainBenchmark ? (
              <>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700">
                  Industry {input.domainBenchmark.industry}
                </span>
              </>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <BenchmarkMetricCard
              label="Overall score"
              actualValue={input.score}
              benchmarkValue={input.domainBenchmark?.expectedOverallScore ?? null}
              maxValue={100}
            />
            <BenchmarkMetricCard
              label="Third-party requests"
              actualValue={input.thirdPartyRequestCount}
              benchmarkValue={input.domainBenchmark?.expectedThirdPartyRequests ?? null}
            />
            <BenchmarkMetricCard
              label="Cookies before consent"
              actualValue={input.beforeConsentCookieCount}
              benchmarkValue={input.domainBenchmark?.expectedCookiesBeforeConsent ?? null}
            />
          </div>
          {input.domainBenchmark ? (
            <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-700">
              <span className="font-medium text-slate-900">Expected baseline:</span> {input.domainBenchmark.rationale}
            </div>
          ) : null}

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
                <FindingDetailDisclosure finding={finding} />
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

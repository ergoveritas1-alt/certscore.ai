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

type RegulatoryLens = {
  acronym: string;
  detailTitle: string;
  ratingLabel: string;
  score: number;
  summary: string;
  toneClass: string;
  findings: string[];
};

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

function buildRegulatoryLenses(findings: CertScoreFinding[], counts: {
  beforeConsentCookieCount: number;
  thirdPartyRequestCount: number;
}) {
  const findingIds = new Set(findings.map((finding) => finding.id));
  const trackingFinding = findings.find((finding) => finding.id === "third_party_tracking_pre_consent");
  const replayFinding = findings.find((finding) => finding.id === "session_recording_services_detected");
  const consentFinding = findings.find((finding) => finding.id === "asymmetric_consent_ui");
  const clarityFinding = findings.find((finding) => finding.id === "policy_clarity_risk");

  const privacyTrackingNotes = [
    trackingFinding ? trackingFinding.shortSummary : null,
    counts.beforeConsentCookieCount > 0 ? `${counts.beforeConsentCookieCount} cookies were observed before consent.` : null,
    consentFinding ? consentFinding.shortSummary : null,
    replayFinding ? replayFinding.shortSummary : null
  ].filter(Boolean) as string[];

  const cpraNotes = [
    trackingFinding ? trackingFinding.shortSummary : null,
    counts.thirdPartyRequestCount > 0 ? `${counts.thirdPartyRequestCount} third-party requests were observed on the initial path.` : null,
    replayFinding ? replayFinding.shortSummary : null,
    clarityFinding ? clarityFinding.shortSummary : null
  ].filter(Boolean) as string[];

  const ftcNotes = [
    consentFinding ? consentFinding.shortSummary : null,
    replayFinding ? replayFinding.shortSummary : null,
    trackingFinding ? trackingFinding.shortSummary : null
  ].filter(Boolean) as string[];

  const gdprScore = clampScore(
    84 -
      (findingIds.has("third_party_tracking_pre_consent") ? 32 : 0) -
      (counts.beforeConsentCookieCount > 0 ? 14 : 0) -
      (findingIds.has("asymmetric_consent_ui") ? 16 : 0) -
      (findingIds.has("session_recording_services_detected") ? 10 : 0)
  );
  const cpraScore = clampScore(
    82 -
      (findingIds.has("third_party_tracking_pre_consent") ? 24 : 0) -
      (counts.beforeConsentCookieCount > 0 ? 12 : 0) -
      (findingIds.has("session_recording_services_detected") ? 10 : 0) -
      (findingIds.has("policy_clarity_risk") ? 8 : 0)
  );
  const ftcScore = clampScore(
    80 -
      (findingIds.has("asymmetric_consent_ui") ? 24 : 0) -
      (findingIds.has("third_party_tracking_pre_consent") ? 18 : 0) -
      (findingIds.has("session_recording_services_detected") ? 10 : 0)
  );

  const buildTone = (score: number) => {
    if (score >= 72) {
      return { label: "Stronger", toneClass: "border-emerald-200 bg-emerald-50 text-emerald-800" };
    }
    if (score >= 50) {
      return { label: "Watch", toneClass: "border-amber-200 bg-amber-50 text-amber-800" };
    }
    return { label: "Needs work", toneClass: "border-rose-200 bg-rose-50 text-rose-800" };
  };

  const gdprTone = buildTone(gdprScore);
  const cpraTone = buildTone(cpraScore);
  const ftcTone = buildTone(ftcScore);

  return [
    {
      acronym: "GDPR / ePrivacy",
      detailTitle: "Consent and tracking issues",
      findings: privacyTrackingNotes,
      ratingLabel: gdprTone.label,
      score: gdprScore,
      summary: trackingFinding ? "Consent and pre-consent tracking risk is the main issue." : "No major consent-triggering issue surfaced in the top findings.",
      toneClass: gdprTone.toneClass
    },
    {
      acronym: "CCPA / CPRA",
      detailTitle: "Disclosure and downstream sharing issues",
      findings: cpraNotes,
      ratingLabel: cpraTone.label,
      score: cpraScore,
      summary: replayFinding || trackingFinding ? "Third-party collection and disclosure posture drives this score." : "No strong sale/share-style signal surfaced in the top findings.",
      toneClass: cpraTone.toneClass
    },
    {
      acronym: "FTC",
      detailTitle: "Dark pattern and disclosure issues",
      findings: ftcNotes,
      ratingLabel: ftcTone.label,
      score: ftcScore,
      summary: consentFinding ? "Choice architecture and disclosure clarity are the main FTC-style concerns." : "No strong unfairness/deception cue surfaced in the top findings.",
      toneClass: ftcTone.toneClass
    }
  ] satisfies RegulatoryLens[];
}

function RegulatoryRatingBar(input: { score: number; toneClass: string }) {
  const filledSegments = Math.max(1, Math.min(5, Math.round(input.score / 20)));

  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: 5 }, (_, index) => (
        <span
          key={index}
          className={`h-2.5 w-7 rounded-full border ${
            index < filledSegments ? input.toneClass : "border-slate-200 bg-slate-100 text-transparent"
          }`}
        />
      ))}
    </div>
  );
}

function BenchmarkMetricCard(input: {
  actualValue: number | null;
  benchmarkValue: number | null;
  label: string;
  maxValue?: number;
}) {
  const actualValue = typeof input.actualValue === "number" ? input.actualValue : null;
  const benchmarkValue = typeof input.benchmarkValue === "number" ? input.benchmarkValue : null;
  const dynamicScaleBase = Math.max(actualValue ?? 0, benchmarkValue ?? 0, 1);
  const scaleMax =
    input.maxValue ??
    Math.max(10, Math.ceil((dynamicScaleBase * 1.25) / 5) * 5);
  const actualRatio = Math.max(0, Math.min(1, (actualValue ?? 0) / scaleMax));
  const benchmarkRatio = benchmarkValue !== null ? Math.max(0, Math.min(1, benchmarkValue / scaleMax)) : null;
  const delta =
    actualValue !== null && benchmarkValue !== null ? actualValue - benchmarkValue : null;
  const tone =
    input.label === "Overall score"
      ? {
          card: "bg-white",
          rail: "bg-sky-100/90",
          fill: "bg-sky-500/85",
          marker: "bg-cyan-500 shadow-[0_0_0_3px_rgba(236,254,255,0.95)]",
          value: "text-sky-700",
          deltaPositive: "text-sky-700",
          deltaNegative: "text-cyan-700"
        }
      : input.label === "Third-party requests"
        ? {
            card: "bg-white",
            rail: "bg-amber-100/90",
            fill: "bg-amber-500/85",
            marker: "bg-orange-500 shadow-[0_0_0_3px_rgba(255,247,237,0.95)]",
            value: "text-amber-700",
            deltaPositive: "text-amber-700",
            deltaNegative: "text-orange-700"
          }
        : {
            card: "bg-white",
            rail: "bg-emerald-100/90",
            fill: "bg-emerald-500/82",
            marker: "bg-lime-500 shadow-[0_0_0_3px_rgba(247,254,231,0.95)]",
            value: "text-emerald-700",
            deltaPositive: "text-emerald-700",
            deltaNegative: "text-lime-700"
          };

  return (
    <div className={`relative overflow-hidden rounded-[1.6rem] border border-slate-200 px-5 py-4 ${tone.card}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
          {input.label === "Overall score" ? (
            <>
              Overall
              <br />
              score
            </>
          ) : (
            input.label
          )}
        </p>
        <span className="sr-only">{benchmarkValue !== null ? `Expected ${benchmarkValue}` : "Expected benchmark unavailable"}</span>
      </div>
      <div className="mt-5">
        <div className="flex items-end gap-1">
          <span className={`text-[3.2rem] font-semibold leading-none tracking-tight ${tone.value}`}>{actualValue ?? "—"}</span>
          {input.maxValue ? <span className="pb-1 text-[2rem] leading-none text-slate-500">/100</span> : null}
        </div>
      </div>
      <div className="mt-5 space-y-2">
        <div className={`relative h-3 rounded-full ${tone.rail}`}>
          <div
            className={`absolute left-0 top-0 h-3 rounded-full ${tone.fill}`}
            style={{ width: `${Math.max(actualRatio * 100, actualValue === null ? 0 : 6)}%` }}
          />
          {benchmarkRatio !== null ? (
            <div
              className={`absolute top-1/2 h-5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${tone.marker}`}
              style={{ left: `${benchmarkRatio * 100}%` }}
            />
          ) : null}
        </div>
        <div className="flex items-center text-[11px] text-slate-500">
          {delta !== null ? (
            <span className={delta > 0 ? tone.deltaPositive : delta < 0 ? tone.deltaNegative : "text-slate-500"}>
              {delta > 0 ? "+" : ""}
              {delta} vs expected
            </span>
          ) : (
            <span>&nbsp;</span>
          )}
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
        <span>{input.finding.shortSummary}</span>
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
  const suppressedTopFindingIds = new Set([
    "multi_vendor_tracking_detected",
    "large_third_party_footprint",
    "collection_endpoints_detected",
    "high_request_density"
  ]);
  const categorySummary = Object.entries(input.vendorCategoryCounts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([key, count]) => `${formatCategoryLabel(key)} ${count}`)
    .join(" · ");
  const filteredTopFindings = input.topFindings.filter((finding) => !suppressedTopFindingIds.has(finding.id));
  const primaryFindings = filteredTopFindings.slice(0, 5);
  const secondaryFindings = filteredTopFindings
    .slice(5, 8);
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
  const regulatoryLenses = buildRegulatoryLenses(input.topFindings, {
    beforeConsentCookieCount: input.beforeConsentCookieCount,
    thirdPartyRequestCount: input.thirdPartyRequestCount
  });

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
          {input.domainBenchmark ? (
            <div className="rounded-[1rem] border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-700">
              <span className="font-medium text-slate-900">Benchmark estimate for {input.domainBenchmark.industry}.</span>
            </div>
          ) : null}

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
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">Top findings</p>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-950 lg:text-[2.2rem]">Highest-priority issues</h2>
              </div>
            </div>
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
          <div className="rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Regulatory findings</p>
            <div className="mt-3 space-y-3">
              {regulatoryLenses.map((lens) => (
                <details key={lens.acronym} className="group rounded-xl border border-slate-200 bg-slate-50/75 px-3 py-3">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">{lens.acronym}</p>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${lens.toneClass}`}>
                          {lens.ratingLabel}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-slate-600">{lens.summary}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xl font-semibold tracking-tight text-slate-900">{lens.score}</p>
                      <RegulatoryRatingBar score={lens.score} toneClass={lens.toneClass} />
                      <p className="mt-1 text-slate-400 transition-transform group-open:rotate-180">⌄</p>
                    </div>
                  </summary>
                  <div className="mt-3 border-t border-slate-200 pt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{lens.detailTitle}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {lens.findings.length > 0 ? (
                        lens.findings.map((item) => (
                          <span key={item} className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700">
                            {item}
                          </span>
                        ))
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700">
                          No top-level issue mapped here
                        </span>
                      )}
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

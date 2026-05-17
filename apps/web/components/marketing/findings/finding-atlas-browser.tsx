"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  type FindingReferenceItem
} from "../../../lib/marketing/finding-atlas";

type FindingAtlasBrowserProps = {
  findings: FindingReferenceItem[];
  compact?: boolean;
};

function EvidenceBlock({ title, code }: { title: string; code: string }) {
  return (
    <div className="border border-slate-200 bg-slate-950">
      <div className="border-b border-slate-800 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">
        {title}
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words p-3 font-mono text-xs leading-5 text-slate-100">
        {code}
      </pre>
    </div>
  );
}

type TimelineEvent = {
  label: string;
  value: string;
};

function JsonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path d="M8 7H5.8c-.8 0-1.3.5-1.3 1.3v2.2c0 .8-.5 1.5-1.2 1.5.7 0 1.2.7 1.2 1.5v2.2c0 .8.5 1.3 1.3 1.3H8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M16 7h2.2c.8 0 1.3.5 1.3 1.3v2.2c0 .8.5 1.5 1.2 1.5-.7 0-1.2.7-1.2 1.5v2.2c0 .8-.5 1.3-1.3 1.3H16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M11 8.5h2M10.5 12h3M11 15.5h2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2 text-sm leading-6 text-slate-600">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function formatDensity(value: number) {
  return `${value.toFixed(value < 1 ? 1 : 0)}%`;
}

function formatChipLabel(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function getPayloadRecord(finding: FindingReferenceItem) {
  return finding.sample.payload;
}

function getNestedRecord(value: unknown, key: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const candidate = (value as Record<string, unknown>)[key];

  return candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate as Record<string, unknown> : {};
}

function getStringField(record: Record<string, unknown>, key: string) {
  const value = record[key];

  return typeof value === "string" ? value : null;
}

function getBooleanField(record: Record<string, unknown>, key: string) {
  const value = record[key];

  return typeof value === "boolean" ? value : null;
}

function getNumberField(record: Record<string, unknown>, key: string) {
  const value = record[key];

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getStringArrayField(record: Record<string, unknown>, key: string) {
  const value = record[key];

  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function getFindingBadges(finding: FindingReferenceItem) {
  const payload = getPayloadRecord(finding);
  const confidence = getStringField(payload, "confidence") ?? "review";
  const directVsInferred = getStringField(payload, "direct_vs_inferred");
  const severityLabel = finding.id === "pre_consent_tracking_detected"
    ? "Critical"
    : formatChipLabel(finding.criticality);
  const observationLabel = directVsInferred === "direct" ? "Direct observation" : "Observation for review";
  const contextLabel = finding.id === "pre_consent_tracking_detected" ? "Consent timing" : finding.category;

  return [
    severityLabel,
    `${formatChipLabel(confidence)} evidence`,
    observationLabel,
    contextLabel,
    `Seen on ~${Math.round(finding.benchmark.densityPct)}% of sampled sites`
  ];
}

function getCoverageFlags(finding: FindingReferenceItem) {
  return getStringArrayField(getPayloadRecord(finding), "coverage_flags");
}

function getRepresentativeVendors(finding: FindingReferenceItem) {
  const evidence = getNestedRecord(getPayloadRecord(finding), "evidence");
  const vendors = getStringArrayField(evidence, "vendors");

  if (vendors.length > 0) {
    return vendors;
  }

  const vendorExample = finding.exampleEvidence.find((example) => /vendor/i.test(example.title));

  return vendorExample
    ? vendorExample.code
        .split(/\n|,/)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0 && !entry.includes("="))
    : [];
}

function getPreConsentRequestCount(finding: FindingReferenceItem) {
  const evidence = getNestedRecord(getPayloadRecord(finding), "evidence");
  const counts = getNestedRecord(evidence, "counts");
  const vendorExample = finding.exampleEvidence.find((example) => /vendor/i.test(example.title));
  const match = vendorExample?.code.match(/pre_consent_tracking_requests=(\d+)/);

  if (match?.[1]) {
    return Number(match[1]);
  }

  const retainedCount = getNumberField(counts, `preconsent_${"viola"}tion_count`);

  if (retainedCount !== null) {
    return retainedCount;
  }

  return null;
}

function getConsentActionObserved(finding: FindingReferenceItem) {
  const evidence = getNestedRecord(getPayloadRecord(finding), "evidence");
  const consentSummary = getNestedRecord(evidence, "consent_summary");
  const timelineExample = finding.exampleEvidence.find((example) => /timeline/i.test(example.title));
  const timelineMatch = timelineExample?.code.match(/consent_action_observed=(true|false)/);

  if (timelineMatch?.[1]) {
    return timelineMatch[1] === "true";
  }

  return getBooleanField(consentSummary, "consent_action_observed");
}

function describeTimelineEvent(raw: string) {
  if (raw === "page_start") {
    return "Page started";
  }

  if (raw === "consent_banner_visible") {
    return "Consent banner visible";
  }

  if (raw.includes("googletagmanager.com")) {
    return "Google Tag Manager loaded";
  }

  if (raw.includes("google-analytics.com")) {
    return "Google Analytics collect request fired";
  }

  try {
    const url = new URL(raw);
    return `${url.hostname} request observed`;
  } catch {
    return formatChipLabel(raw);
  }
}

function getTimelineEvents(finding: FindingReferenceItem): TimelineEvent[] {
  const timelineExample = finding.exampleEvidence.find((example) => /timeline/i.test(example.title));

  if (!timelineExample) {
    return [];
  }

  const events = timelineExample.code.split("\n").flatMap((line) => {
    const trimmed = line.trim();
    const timedMatch = trimmed.match(/^([0-9,]+ms)\s+(.+)$/);

    if (!timedMatch?.[1] || !timedMatch[2]) {
      return [];
    }

    return [{ value: timedMatch[1], label: describeTimelineEvent(timedMatch[2]) }];
  });

  const consentActionObserved = getConsentActionObserved(finding);

  return consentActionObserved === null
    ? events
    : [...events, { value: "Choice", label: `Consent action observed: ${consentActionObserved ? "Yes" : "No"}` }];
}

function makeRedactedJson(finding: FindingReferenceItem) {
  const payload = getPayloadRecord(finding);
  const evidence = getNestedRecord(payload, "evidence");
  const counts = getNestedRecord(evidence, "counts");
  const vendors = getRepresentativeVendors(finding);
  const consentActionObserved = getConsentActionObserved(finding);
  const preConsentTrackingRequests = getPreConsentRequestCount(finding);

  return {
    findingId: finding.id,
    label: finding.title,
    confidence: getStringField(payload, "confidence") ?? "review",
    directVsInferred: getStringField(payload, "direct_vs_inferred") ?? "observation",
    evidence: {
      firstTrackingRequestMs: getNumberField(counts, "firstRequestMs"),
      consentActionObserved,
      preConsentTrackingRequests,
      uniquePreConsentVendors: getNumberField(counts, "total_tracker_count") ?? vendors.length,
      representativeVendors: vendors.slice(0, 4),
      timelineEvents: getTimelineEvents(finding)
    }
  };
}

function DensityBenchmarkGraph({ finding }: { finding: FindingReferenceItem }) {
  const rows = finding.benchmark.slices.length > 0
    ? finding.benchmark.slices
    : [
        {
          label: finding.benchmark.sourceLabel,
          positiveCount: finding.benchmark.positiveCount,
          sampleSize: finding.benchmark.sampleSize,
          densityPct: finding.benchmark.densityPct
        }
      ];

  return (
    <section className="border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">How common this appeared in recent scans</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Directional benchmark context, not a legal or statistical conclusion.
          </p>
        </div>
        <p className="shrink-0 text-2xl font-semibold tracking-tight text-slate-950">
          {formatDensity(finding.benchmark.densityPct)}
        </p>
      </div>
      <div className="mt-4 space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="space-y-1.5">
            <div className="flex flex-col gap-1 text-xs sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <span className="min-w-0 truncate font-medium text-slate-700">{row.label}</span>
              <span className="tabular-nums text-slate-500 sm:text-right">
                {formatBenchmarkSampleText(row)}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden bg-slate-100">
              <div
                className="h-full bg-sky-500"
                style={{ width: `${Math.max(1, Math.min(100, row.densityPct))}%` }}
                aria-label={`${row.label}: ${formatDensity(row.densityPct)}`}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">{finding.benchmark.sourceLabel}</p>
    </section>
  );
}

function formatBenchmarkSampleText(row: { label: string; positiveCount: number; sampleSize: number }) {
  if (/tranco ranks 851-1205/i.test(row.label)) {
    return `${row.positiveCount} of ${row.sampleSize} sampled Tranco rank 851-1205 sites`;
  }

  return `${row.positiveCount} of ${row.sampleSize} sampled sites`;
}

function TimelineSummary({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return null;
  }

  return (
    <section className="border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-950">Timeline</h3>
      <ol className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
        {events.map((event) => (
          <li key={`${event.value}-${event.label}`} className="grid grid-cols-[4.5rem_1fr] gap-3">
            <span className="font-mono text-xs tabular-nums text-slate-500">{event.value}</span>
            <span>{event.label}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function VendorSummary({ vendors }: { vendors: string[] }) {
  if (vendors.length === 0) {
    return null;
  }

  const visibleVendors = vendors.slice(0, 4);
  const remainingCount = Math.max(0, vendors.length - visibleVendors.length);

  return (
    <section className="border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-950">Observed vendors</h3>
      <p className="mt-3 text-sm leading-6 text-slate-600">{visibleVendors.join(", ")}</p>
      {remainingCount > 0 ? (
        <p className="mt-2 text-xs font-semibold text-slate-500">+{remainingCount} more</p>
      ) : null}
    </section>
  );
}

function KeyCounts({
  requestCount,
  vendorCount,
  consentActionObserved
}: {
  requestCount: number | null;
  vendorCount: number;
  consentActionObserved: boolean | null;
}) {
  return (
    <section className="border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-950">Key counts</h3>
      <dl className="mt-3 grid gap-3 text-sm">
        {requestCount !== null ? (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-500">Pre-consent tracking requests</dt>
            <dd className="font-semibold tabular-nums text-slate-950">{requestCount}</dd>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <dt className="text-slate-500">Representative vendors</dt>
          <dd className="font-semibold tabular-nums text-slate-950">{vendorCount}</dd>
        </div>
        {consentActionObserved !== null ? (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-500">Consent action observed first</dt>
            <dd className="font-semibold text-slate-950">{consentActionObserved ? "Yes" : "No"}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

function EvidenceStandard() {
  return (
    <section className="border border-slate-200 bg-slate-50 p-4">
      <h3 className="text-sm font-semibold text-slate-950">Evidence standard</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">CertScore looks for:</p>
      <ul className="mt-3 grid gap-2 text-sm leading-6 text-slate-600 sm:grid-cols-2">
        {[
          "A page-load timeline",
          "Vendor or request activity before consent",
          "A non-essential classification",
          "No recorded consent action before the signal"
        ].map((item) => (
          <li key={item} className="flex gap-2">
            <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function FindingReferenceSection({
  finding
}: {
  finding: FindingReferenceItem;
}) {
  const [isJsonOpen, setIsJsonOpen] = useState(false);
  const badges = useMemo(() => getFindingBadges(finding), [finding]);
  const coverageFlags = useMemo(() => getCoverageFlags(finding), [finding]);
  const timelineEvents = useMemo(() => getTimelineEvents(finding), [finding]);
  const vendors = useMemo(() => getRepresentativeVendors(finding), [finding]);
  const requestCount = useMemo(() => getPreConsentRequestCount(finding), [finding]);
  const consentActionObserved = useMemo(() => getConsentActionObserved(finding), [finding]);
  const sampleJson = useMemo(() => JSON.stringify(makeRedactedJson(finding), null, 2), [finding]);

  return (
    <article id={finding.id} className="min-w-0">
      <div className="min-w-0 space-y-5">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Selected finding</p>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-950">{finding.title}</h2>
          <div className="flex flex-wrap gap-2">
            {badges.map((badge) => (
              <span key={badge} className="border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                {badge}
              </span>
            ))}
          </div>
          <p className="text-base leading-7 text-slate-600">{finding.observed}</p>
        </div>

        <section className="border border-sky-100 bg-sky-50 p-4">
          <h3 className="text-sm font-semibold text-slate-950">Why this matters</h3>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            This can indicate that analytics, advertising, or profiling vendors were allowed to run before the site recorded a user choice.
          </p>
        </section>

        <DensityBenchmarkGraph finding={finding} />

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-950">Example evidence</h3>
            <button
              type="button"
              onClick={() => setIsJsonOpen((current) => !current)}
              aria-expanded={isJsonOpen}
              className="inline-flex items-center gap-2 border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800"
            >
              <JsonIcon />
              {isJsonOpen ? "Hide example JSON" : "View example JSON"}
            </button>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <TimelineSummary events={timelineEvents} />
            <VendorSummary vendors={vendors} />
            <KeyCounts
              requestCount={requestCount}
              vendorCount={vendors.length}
              consentActionObserved={consentActionObserved}
            />
          </div>
          <EvidenceStandard />
          {coverageFlags.length > 0 ? (
            <p className="border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              Coverage note: This example came from a partial scan, so the evidence is illustrative rather than a full-site conclusion.
            </p>
          ) : null}
          {isJsonOpen ? (
            <EvidenceBlock title="Redacted example JSON" code={sampleJson} />
          ) : null}
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-950">Common causes</h3>
            <div className="mt-3">
              <BulletList items={finding.commonCauses} />
            </div>
          </section>
          <section className="border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-950">Recommended review questions</h3>
            <div className="mt-3">
              <BulletList items={finding.reviewQuestions} />
            </div>
          </section>
        </div>
      </div>
    </article>
  );
}

export function FindingAtlasBrowser({ findings, compact = false }: FindingAtlasBrowserProps) {
  const [activeFindingId, setActiveFindingId] = useState("pre_consent_tracking_detected");
  const activeFinding = useMemo(
    () => findings.find((finding) => finding.id === activeFindingId) ?? findings[0],
    [activeFindingId, findings]
  );

  if (findings.length === 0 || !activeFinding) {
    return null;
  }

  return (
    <div className="space-y-8">
      <section className="border border-slate-200 bg-white">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <aside className="min-w-0 border-b border-slate-200 bg-slate-50 lg:border-b-0 lg:border-r">
            <div className="sticky top-20 min-w-0 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Registry index</p>
              <div className="mt-3 grid max-h-[14rem] gap-2 overflow-y-auto pr-1 lg:max-h-[34rem]">
                {findings.map((finding) => {
                  const isActive = finding.id === activeFinding.id;

                  return (
                    <button
                      key={finding.id}
                      type="button"
                      onClick={() => setActiveFindingId(finding.id)}
                      className={
                        isActive
                          ? "block w-full min-w-0 border border-slate-950 bg-slate-950 px-3 py-3 text-left text-white"
                          : "block w-full min-w-0 border border-slate-200 bg-white px-3 py-3 text-left text-slate-800 hover:border-sky-200 hover:bg-sky-50"
                      }
                    >
                      <span className="block break-words text-sm font-semibold leading-5">{finding.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          <div className="min-w-0 p-5 sm:p-6 lg:p-8">
            <FindingReferenceSection key={activeFinding.id} finding={activeFinding} />
          </div>
        </div>
      </section>

      {!compact ? (
        <section className="border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">Related reading</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              { href: "/guides/pre-consent-tracking", label: "Tracking before consent" },
              { href: "/guides/cookie-consent-enforcement-checker", label: "Cookie consent enforcement" },
              { href: "/guides/rtb-cookie-syncing", label: "Third-party cookies and RTB sync" },
              { href: "/guides/session-replay-risk", label: "Session replay risk" },
              { href: "/guides/wcag-website-checklist", label: "Accessibility signals" }
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-sky-700 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  type FindingReferenceItem
} from "../../../lib/marketing/finding-atlas";

type FindingAtlasBrowserProps = {
  findings: FindingReferenceItem[];
  compact?: boolean;
  initialFindingId?: string;
};

function getFindingReferenceHref(findingId: string) {
  return `/guides/findings/${findingId}`;
}

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
    finding.benchmark.contextLabel
  ];
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
  const vendors = getRepresentativeVendors(finding);
  const consentActionObserved = getConsentActionObserved(finding);
  const preConsentTrackingRequests = getPreConsentRequestCount(finding);
  const timelineEvents = getTimelineEvents(finding);
  const evidenceCounts = {
    ...(preConsentTrackingRequests !== null ? { preConsentTrackingRequests } : {}),
    ...(vendors.length > 0 ? { representativeVendorCount: vendors.length } : {})
  };

  return {
    findingId: finding.id,
    label: finding.title,
    category: finding.category,
    criticality: finding.criticality,
    confidence: getStringField(payload, "confidence") ?? "review",
    directVsInferred: getStringField(payload, "direct_vs_inferred") ?? "observation",
    evidence: {
      summary: finding.observed,
      examples: finding.exampleEvidence.map((example) => ({
        title: example.title,
        lines: example.code.split("\n")
      })),
      ...(Object.keys(evidenceCounts).length > 0 ? { counts: evidenceCounts } : {}),
      ...(consentActionObserved !== null ? { consentActionObserved } : {}),
      ...(vendors.length > 0 ? { representativeVendors: vendors.slice(0, 4) } : {}),
      ...(timelineEvents.length > 0 ? { timelineEvents } : {})
    }
  };
}

function TimelineSummary({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return null;
  }

  return (
    <section className="border border-slate-800 bg-slate-950 p-4">
      <h3 className="text-sm font-semibold text-slate-50">Timeline</h3>
      <ol className="mt-3 space-y-2 text-sm leading-6 text-slate-200">
        {events.map((event) => (
          <li key={`${event.value}-${event.label}`} className="grid grid-cols-[4.5rem_1fr] gap-3">
            <span className="font-mono text-xs tabular-nums text-slate-400">{event.value}</span>
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
    <section className="border border-slate-800 bg-slate-950 p-4">
      <h3 className="text-sm font-semibold text-slate-50">Observed vendors</h3>
      <p className="mt-3 text-sm leading-6 text-slate-200">{visibleVendors.join(", ")}</p>
      {remainingCount > 0 ? (
        <p className="mt-2 text-xs font-semibold text-slate-400">+{remainingCount} more</p>
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

function MethodologyContext({ finding }: { finding: FindingReferenceItem }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className="border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-950">Confidence semantics</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">{finding.confidenceSemantics}</p>
      </section>
      <section className="border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-950">Detection methodology</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">{finding.detectionMethodology}</p>
      </section>
    </div>
  );
}

function RegulatoryReviewContext({ finding }: { finding: FindingReferenceItem }) {
  const context = finding.regulatoryContext;

  if (!context) {
    return null;
  }

  const visibleChips = [
    ...context.technicalStandards.map((item) => item.label),
    ...context.jurisdictionalContexts.map((item) => item.label)
  ].slice(0, 6);
  const hiddenCount = Math.max(
    0,
    context.technicalStandards.length + context.jurisdictionalContexts.length - visibleChips.length
  );

  return (
    <section className="border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Regulatory review context</p>
      <div className="mt-3 space-y-2">
        <h3 className="text-base font-semibold text-slate-950">{context.primaryConcern.label}</h3>
        <p className="text-sm leading-6 text-slate-600">{context.primaryConcern.displayCopy}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {visibleChips.map((chip) => (
          <span key={chip} className="border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
            {chip}
          </span>
        ))}
        {hiddenCount > 0 ? (
          <span className="border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-500">
            Additional context in notes
          </span>
        ) : null}
      </div>
      <details className="mt-3 group">
        <summary className="inline-flex h-10 cursor-pointer list-none items-center justify-center rounded-md border border-slate-950 bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 [&::-webkit-details-marker]:hidden">
          <span>View applicability notes</span>
        </summary>
        <div className="mt-3 grid gap-3 text-sm leading-6 text-slate-600 lg:grid-cols-2">
          <div>
            <h4 className="font-semibold text-slate-950">Technical standards</h4>
            <ul className="mt-2 space-y-2">
              {context.technicalStandards.map((item) => (
                <li key={item.id}>
                  <span className="font-medium text-slate-800">{item.label}</span>
                  {item.level ? <span className="text-slate-500"> ({item.level})</span> : null}
                  <span className="block text-slate-500">{item.appliesWhen}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-slate-950">Jurisdictional contexts</h4>
            <ul className="mt-2 space-y-2">
              {context.jurisdictionalContexts.map((item) => (
                <li key={item.id}>
                  <span className="font-medium text-slate-800">{item.label}</span>
                  <span className="block text-slate-500">{item.appliesWhen}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </details>
      <p className="mt-3 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">
        {context.displayCaution}
      </p>
    </section>
  );
}

function getWhyThisMattersCopy(finding: FindingReferenceItem) {
  if (finding.id === "pre_consent_tracking_detected") {
    return "This can indicate that analytics, advertising, or profiling vendors were allowed to run before the site recorded a user choice. Depending on the site, region, vendor purpose, and consent design, that timing can be relevant to privacy, consent, and consumer-protection review.";
  }

  return "This observation can help reviewers decide whether the site behavior deserves deeper privacy, accessibility, consent, or consumer-protection review in context.";
}

function FindingReferenceSection({
  finding
}: {
  finding: FindingReferenceItem;
}) {
  const badges = useMemo(() => getFindingBadges(finding), [finding]);
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
            {getWhyThisMattersCopy(finding)}
          </p>
        </section>

        <RegulatoryReviewContext finding={finding} />

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-950">Example evidence</h3>
          </div>
          <details id={`${finding.id}-example-json`} className="group">
            <summary className="inline-flex h-10 cursor-pointer list-none items-center justify-center gap-2 rounded-md border border-slate-950 bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 [&::-webkit-details-marker]:hidden">
              <JsonIcon />
              <span>View example JSON</span>
            </summary>
            <div className="mt-3">
              <EvidenceBlock title="Redacted example JSON" code={sampleJson} />
            </div>
          </details>
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

        <MethodologyContext finding={finding} />
      </div>
    </article>
  );
}

export function FindingAtlasBrowser({ findings, compact = false, initialFindingId = "pre_consent_tracking_detected" }: FindingAtlasBrowserProps) {
  const [activeFindingId, setActiveFindingId] = useState(initialFindingId);

  useEffect(() => {
    setActiveFindingId(initialFindingId);
  }, [initialFindingId]);

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
            <div className="min-w-0 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Registry index</p>
              <div className="mt-3 grid max-h-[14rem] gap-2 overflow-y-auto pr-1 lg:max-h-[34rem]">
                {findings.map((finding) => {
                  const isActive = finding.id === activeFinding.id;

                  return (
                    <Link
                      key={finding.id}
                      href={getFindingReferenceHref(finding.id)}
                      onClick={() => setActiveFindingId(finding.id)}
                      className={
                        isActive
                          ? "block w-full min-w-0 border border-slate-950 bg-slate-950 px-3 py-3 text-left text-white"
                          : "block w-full min-w-0 border border-slate-200 bg-white px-3 py-3 text-left text-slate-800 hover:border-sky-200 hover:bg-sky-50"
                      }
                    >
                      <span className="block break-words text-sm font-semibold leading-5">{finding.title}</span>
                    </Link>
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

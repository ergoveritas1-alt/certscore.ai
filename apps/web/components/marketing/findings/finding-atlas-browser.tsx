"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  type FindingEvidenceStandard,
  type FindingReferenceItem
} from "../../../lib/marketing/finding-atlas";

type FindingAtlasBrowserProps = {
  findings: FindingReferenceItem[];
  compact?: boolean;
  initialFindingId?: string;
};

function getFindingReferenceHref(findingId: string) {
  return `/findings/${findingId}`;
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

function EvidenceExampleCards({ examples }: { examples: FindingReferenceItem["exampleEvidence"] }) {
  if (examples.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {examples.map((example) => (
        <section key={example.title} className="min-w-0 border border-slate-200 bg-white p-4">
          <h4 className="text-sm font-semibold text-slate-950">{example.title}</h4>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
            {example.code.split("\n").filter((line) => line.trim().length > 0).map((line) => (
              <li key={line} className="flex min-w-0 gap-2">
                <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                <code className="min-w-0 break-words rounded bg-slate-50 px-1 py-0.5 font-mono text-[12px] text-slate-700">
                  {line}
                </code>
              </li>
            ))}
          </ul>
        </section>
      ))}
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

function DisclosureChevronIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-4 w-4 transition-transform group-open:rotate-180"
      aria-hidden="true"
    >
      <path
        d="M5.5 7.5 10 12l4.5-4.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
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
  const severityLabel = formatChipLabel(finding.criticality);
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

  const requestCount = getNumberField(counts, "preConsentTrackingRequestCount");

  if (requestCount !== null) {
    return requestCount;
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

  if (raw.includes("tagmanager.example")) {
    return "Example Tag Manager loaded — supporting context only";
  }

  if (raw.includes("analytics.example")) {
    return "Example Analytics collect request fired — classified non-essential artifact";
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
    : [
        ...events,
        {
          value: "Choice",
          label: `Consent action observed: ${consentActionObserved ? "Yes" : "No action recorded"}`
        }
      ];
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
      <h3 className="text-sm font-semibold text-slate-50">Representative runtime context</h3>
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
  const hasRuntimeEvidenceCount = vendorCount > 0;
  const hasMeaningfulCount = requestCount !== null || hasRuntimeEvidenceCount || consentActionObserved !== null;

  if (!hasMeaningfulCount) {
    return null;
  }

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
        {hasRuntimeEvidenceCount ? (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-500">Runtime context entries</dt>
            <dd className="font-semibold tabular-nums text-slate-950">{vendorCount}</dd>
          </div>
        ) : null}
        {consentActionObserved !== null ? (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-500">Consent action observed first</dt>
            <dd className="font-semibold text-slate-950">{consentActionObserved ? "Yes" : "No action recorded"}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

const EVIDENCE_STANDARD_SECTIONS: Array<{
  key: keyof FindingEvidenceStandard;
  title: string;
}> = [
  { key: "strong", title: "Strong" },
  { key: "good", title: "Good" },
  { key: "auditOnly", title: "Audit-only" },
  { key: "insufficient", title: "Insufficient" }
];

const CONSENT_UI_FINDING_IDS = new Set([
  "reject_option_missing_or_hidden",
  "forced_consent_interaction",
  "asymmetric_consent_ui",
  "consent_dark_patterns_detected"
]);

const RUNTIME_ARTIFACT_FINDING_IDS = new Set([
  "pre_consent_tracking_detected",
  "third_party_cookie_pre_consent",
  "reject_tracking_persists_after_reject",
  "rtb_cookie_sync_observed",
  "cross_domain_identifier_sharing_observed",
  "session_recording_services_detected",
  "possible_session_replay_on_sensitive_input_surface",
  "sensitive_data_collection_with_third_party_tracking_present",
  "fingerprinting_related_signals_observed",
  "probable_fingerprinting"
]);

const FINGERPRINTING_RELATIONSHIP_COPY: Record<string, string> = {
  fingerprinting_related_signals_observed:
    "This finding is the lower-tier fingerprinting/device-signal review signal. It is used when retained evidence shows browser or device signal collection that may warrant review, but the retained cluster does not support the higher-tier probable fingerprinting finding. A site may show this finding on its own, or alongside probable fingerprinting when stronger multi-category clustering is also retained.",
  probable_fingerprinting:
    "This finding is the higher-tier fingerprinting/device-signal review signal. It is used when retained evidence shows a stronger clustered set of high-entropy browser or device signals, such as multiple signal categories or stronger corroboration, that may warrant probable fingerprinting review. A site may also show the related lower-tier fingerprinting signal when additional device-signal context is retained."
};

const COMMON_REMEDIATION_APPROACHES: Record<string, string[]> = {
  pre_consent_tracking_detected: [
    "Teams commonly review whether consent mode or CMP state is initialized before the tag manager or vendor scripts can fire.",
    "Tag-manager triggers may need to be gated on consent-state variables rather than page-load timing alone.",
    "CMP event listeners are often reviewed to confirm that analytics, advertising, measurement, and replay vendors are blocked until the intended consent state is available.",
    "Clean-profile testing with the browser network panel open can help compare the first non-essential request timestamp against banner visibility and consent-state observations.",
    "Regional CMP configuration should be tested separately where consent behavior varies by geography."
  ],
  reject_tracking_persists_after_reject: [
    "Teams commonly replay the reject path with the browser network panel open and compare pre-reject and post-reject request timing.",
    "CMP-to-tag-manager propagation is often reviewed to confirm that reject state reaches the data layer, consent mode, and vendor trigger conditions.",
    "Queued or delayed beacons may need special review because a request can fire after reject even if it was initiated before the choice.",
    "Cookie and storage behavior should be reviewed to confirm whether non-essential identifiers are cleared, suppressed, or not written after reject.",
    "Regional CMP variants should be tested separately where reject behavior differs by jurisdiction or language."
  ],
  rtb_cookie_sync_observed: [
    "Teams commonly audit which programmatic advertising tags, header-bidding wrappers, or adtech adapters trigger sync-style requests.",
    "Header bidding initialization, including Prebid-style adapter loading, may need review against consent state and vendor-suppression rules.",
    "Audience manager, DMP, retargeting, and identity-match integrations should be reviewed for sync, match, or redirect endpoints.",
    "Sync endpoints may need to be suppressed until the relevant consent or opt-out state has been evaluated.",
    "Privacy and adtech teams should compare observed sync-chain behavior with the site's privacy disclosures and vendor list."
  ],
  probable_fingerprinting: [
    "Teams commonly identify which script, SDK, or vendor owns the high-entropy signal cluster by reviewing initiator chains and retained request anchors.",
    "Fraud-prevention, bot-detection, security, analytics, and identity SDKs should be reviewed for purpose, necessity, and configuration options.",
    "Vendors may need to explain whether high-entropy browser or device attributes are necessary for the stated purpose and whether collection can be minimized.",
    "Teams should review whether consent gating or purpose-based suppression applies to the identified script or endpoint.",
    "Raw device attribute values, identifiers, and payloads should remain out of public evidence while preserving stable anchors for review."
  ],
  sensitive_data_collection_with_third_party_tracking_present: [
    "Teams commonly review page-level tag exclusions for sensitive form pages, account flows, application flows, and other high-review surfaces.",
    "Session replay and analytics vendors should be reviewed for field masking, event suppression, and page-exclusion settings on sensitive inputs.",
    "Analytics event tracking should be tested on the specific form page, not only the homepage or shared template.",
    "Tag-manager rules should be reviewed to confirm that sensitive pages do not inherit unnecessary advertising, replay, or measurement tags.",
    "Payload and event-name review may help confirm whether only co-occurrence is present or whether field-level transmission requires deeper review."
  ]
};

const PREVALENCE_INTERPRETATION_NOTES: Record<string, string> = {
  pre_consent_tracking_detected:
    "Directionally, this is one of the more common findings in the calibration set. It suggests that consent-timing enforcement remains a recurring implementation challenge across public websites.",
  reject_tracking_persists_after_reject:
    "This pattern appears less often in the calibration set, but it can be higher-priority when observed because it concerns behavior after an explicit reject-style interaction rather than only initial consent timing.",
  rtb_cookie_sync_observed:
    "This prevalence is concentrated around adtech-heavy implementations. The signal is most relevant where programmatic advertising, identity matching, or audience-management integrations are active.",
  probable_fingerprinting:
    "This is rare in the calibration set and uses a higher evidence bar than a single device-signal observation. When present, it indicates a stronger multi-signal cluster that may warrant focused fingerprinting review."
};

const FINDING_REGISTRY_GROUPS: Array<{
  title: string;
  findingIds: string[];
}> = [
  {
    title: "Consent and choice architecture",
    findingIds: [
      "pre_consent_tracking_detected",
      "reject_tracking_persists_after_reject",
      "third_party_cookie_pre_consent",
      "forced_consent_interaction",
      "reject_option_missing_or_hidden",
      "asymmetric_consent_ui",
      "consent_dark_patterns_detected"
    ]
  },
  {
    title: "Third-party tracking and adtech",
    findingIds: [
      "session_recording_services_detected",
      "possible_session_replay_on_sensitive_input_surface",
      "sensitive_data_collection_with_third_party_tracking_present",
      "rtb_cookie_sync_observed",
      "cross_domain_identifier_sharing_observed"
    ]
  },
  {
    title: "Fingerprinting and device signals",
    findingIds: ["probable_fingerprinting", "fingerprinting_related_signals_observed"]
  },
  {
    title: "Accessibility",
    findingIds: [
      "visual_contrast_accessibility_issue",
      "semantic_labeling_accessibility_issue",
      "text_alternative_accessibility_issue",
      "keyboard_navigation_accessibility_issue"
    ]
  },
  {
    title: "Privacy choice / CPRA",
    findingIds: ["cpra_cba_opt_out_missing"]
  }
];

const PRIVACY_RELATED_READING = [
  { href: "/guides/pre-consent-tracking", label: "Tracking before consent" },
  { href: "/guides/cookie-consent-enforcement-checker", label: "Cookie consent enforcement" },
  { href: "/guides/rtb-cookie-syncing", label: "Third-party cookies and RTB sync" },
  { href: "/guides/session-replay-risk", label: "Session replay risk" },
  { href: "/guides/wcag-website-checklist", label: "Accessibility signals" }
];

const CONSENT_RELATED_READING = [
  { href: "/guides/pre-consent-tracking", label: "Tracking before consent" },
  { href: "/guides/cookie-consent-enforcement-checker", label: "Cookie consent enforcement" },
  { href: "/guides/cookie-banner-requirements", label: "Cookie banner requirements" }
];

const TRACKING_RELATED_READING = [
  { href: "/guides/pre-consent-tracking", label: "Tracking before consent" },
  { href: "/guides/cookie-consent-enforcement-checker", label: "Cookie consent enforcement" },
  { href: "/guides/third-party-cookies-before-consent", label: "Third-party cookies before consent" },
  { href: "/guides/rtb-cookie-syncing", label: "Third-party cookies and RTB sync" }
];

const PRIVACY_CHOICE_RELATED_READING = [
  { href: "/guides/cookie-consent-enforcement-checker", label: "Cookie consent enforcement" },
  { href: "/guides/pre-consent-tracking", label: "Tracking before consent" },
  { href: "/guides/cookie-banner-requirements", label: "Cookie banner requirements" },
  { href: "/guides/third-party-cookies-before-consent", label: "Third-party cookies before consent" },
  { href: "/guides/website-privacy-policy-requirements", label: "Privacy policy requirements" }
];

const FINGERPRINTING_RELATED_READING = [
  { href: "/guides/website-fingerprinting", label: "Website fingerprinting" },
  { href: "/guides/pre-consent-tracking", label: "Tracking before consent" },
  { href: "/guides/third-party-cookies-before-consent", label: "Third-party cookies before consent" },
  { href: "/guides/rtb-cookie-syncing", label: "Third-party cookies and RTB sync" }
];

const ACCESSIBILITY_RELATED_READING = [
  { href: "/guides/wcag-website-checklist", label: "Accessibility signals" }
];

function getRelatedReadingLinks(finding: FindingReferenceItem) {
  if (finding.id === "cpra_cba_opt_out_missing") {
    return PRIVACY_CHOICE_RELATED_READING;
  }

  if (finding.category === "Accessibility") {
    return ACCESSIBILITY_RELATED_READING;
  }

  if (finding.category === "Consent" || finding.category === "Consumer protection") {
    return CONSENT_RELATED_READING;
  }

  if (finding.category === "Cookies" || finding.category === "Third-party tracking") {
    return TRACKING_RELATED_READING;
  }

  if (finding.category === "Fingerprinting") {
    return FINGERPRINTING_RELATED_READING;
  }

  return PRIVACY_RELATED_READING;
}

function getEvidenceStandardNote(finding: FindingReferenceItem) {
  if (finding.category === "Accessibility") {
    return "Evidence levels explain how CertScore treats retained accessibility artifacts. They are not legal conclusions.";
  }

  if (CONSENT_UI_FINDING_IDS.has(finding.id)) {
    return "Evidence levels explain how CertScore treats retained consent-surface artifacts. They are not legal conclusions.";
  }

  if (finding.id === "cpra_cba_opt_out_missing") {
    return "Evidence levels explain how CertScore treats retained public-surface and runtime artifacts. They are not legal conclusions.";
  }

  if (RUNTIME_ARTIFACT_FINDING_IDS.has(finding.id)) {
    return "Evidence levels explain how CertScore treats retained runtime artifacts. They are not legal conclusions.";
  }

  return "Evidence levels explain how CertScore treats retained review artifacts. They are not legal conclusions.";
}

function EvidenceStandard({ finding }: { finding: FindingReferenceItem }) {
  const { evidenceStandard: standard } = finding;

  if (!standard) {
    return null;
  }

  const note = getEvidenceStandardNote(finding);

  return (
    <section className="border border-slate-200 bg-slate-50 p-4">
      <h3 className="text-sm font-semibold text-slate-950">Evidence standard</h3>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {EVIDENCE_STANDARD_SECTIONS.map(({ key, title }) => (
          <div key={key} className="border border-slate-200 bg-white p-3">
            <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</h4>
            <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-600">
              {standard[key].map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-3 border-t border-slate-200 pt-3 text-xs leading-5 text-slate-500">
        {note}
      </p>
    </section>
  );
}

function MethodologyContext({ finding }: { finding: FindingReferenceItem }) {
  return (
    <section className="border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-950">Detection methodology</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{finding.detectionMethodology}</p>
      <p className="mt-3 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">
        Confidence semantics: {finding.confidenceSemantics}
      </p>
    </section>
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
          <span
            className="border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-500"
            title="Additional framework context appears in the Reference notes section near the bottom of this page."
          >
            More context in reference notes
          </span>
        ) : null}
      </div>
      <details className="mt-3 group">
        <summary className="inline-flex h-10 cursor-pointer list-none items-center justify-center gap-2 rounded-md border border-slate-950 bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 [&::-webkit-details-marker]:hidden">
          <DisclosureChevronIcon />
          <span>View applicability notes</span>
        </summary>
        <div className="mt-3 grid gap-3 text-sm leading-6 text-slate-600 lg:grid-cols-2">
          <div>
            <h4 className="font-semibold text-slate-950">Legal and regulatory frameworks</h4>
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

function LimitationsContext({ finding }: { finding: FindingReferenceItem }) {
  if (finding.limitations.length === 0) {
    return null;
  }

  return (
    <section className="border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-950">Limitations and cautions</h3>
      <div className="mt-3">
        <BulletList items={finding.limitations} />
      </div>
    </section>
  );
}

function FingerprintingRelationshipCallout({ finding }: { finding: FindingReferenceItem }) {
  const copy = FINGERPRINTING_RELATIONSHIP_COPY[finding.id];

  if (!copy) {
    return null;
  }

  return (
    <section className="border border-indigo-100 bg-indigo-50 p-4">
      <h3 className="text-sm font-semibold text-slate-950">Finding relationship</h3>
      <p className="mt-2 text-sm leading-6 text-slate-700">{copy}</p>
    </section>
  );
}

function CommonRemediationApproaches({ finding }: { finding: FindingReferenceItem }) {
  const approaches = COMMON_REMEDIATION_APPROACHES[finding.id];

  if (!approaches) {
    return null;
  }

  return (
    <section className="border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-950">Common remediation approaches</h3>
      <div className="mt-3">
        <BulletList items={approaches} />
      </div>
    </section>
  );
}

function PrevalenceInterpretationNote({ finding }: { finding: FindingReferenceItem }) {
  const note = PREVALENCE_INTERPRETATION_NOTES[finding.id];

  if (!note) {
    return null;
  }

  return (
    <p className="border-l-2 border-sky-200 pl-3 text-sm leading-6 text-slate-600">
      {note}
    </p>
  );
}

export function getWhyThisMattersCopy(finding: FindingReferenceItem) {
  if (finding.id === "pre_consent_tracking_detected") {
    return "This can indicate that analytics, advertising, or profiling vendors were observed running before the site recorded a user choice. Depending on the site, region, vendor purpose, consent state, and consent design, that timing can be relevant to privacy, consent, and consumer-protection review.";
  }

  if (finding.id === "visual_contrast_accessibility_issue") {
    return "Users with low vision, color-vision differences, glare, aging-related vision changes, zoomed interfaces, or high-brightness environments may struggle to read text or distinguish controls when contrast is too low. For review teams, the signal can help identify design-token, component-state, or template-level contrast issues that may affect usability and accessibility.";
  }

  if (finding.id === "semantic_labeling_accessibility_issue") {
    return "Clear labels, roles, and relationships help screen reader, voice control, keyboard, and cognitive-accessibility users understand what elements are, what they do, and how they relate to surrounding content. For review teams, this signal can help identify component, form, ARIA, or template patterns where visible labels and programmatic semantics may not align.";
  }

  if (finding.id === "text_alternative_accessibility_issue") {
    return "Text alternatives help screen reader, voice control, low-bandwidth, image-blocking, and cognitive-accessibility users understand meaningful non-text content. For review teams, the signal can help identify where informative images, icons, controls, or media may need appropriate alternative text or where decorative content may need to be hidden from assistive technologies.";
  }

  if (finding.id === "keyboard_navigation_accessibility_issue") {
    return "Keyboard access is essential for people who use keyboards, switch devices, voice input, screen readers, or other assistive technologies to navigate and operate web interfaces. For review teams, the signal can help identify custom controls, focus states, focus order, or interaction patterns that may need keyboard-operability review.";
  }

  if (finding.id === "reject_option_missing_or_hidden") {
    return "When refusal is not visible or is harder to find than acceptance, users may have difficulty expressing a privacy choice. For review teams, this signal can help identify CMP template, button-label, preference-center, localization, or first-layer design issues that may require consent UI review.";
  }

  if (finding.id === "forced_consent_interaction") {
    return "When a consent prompt blocks ordinary browsing or requires interaction before users can access content, reviewers may need to confirm whether the interface provides a genuine, accessible, and context-appropriate choice. For product and privacy teams, this signal can help identify CMP, overlay, scroll-lock, modal, or template behavior that may need consent UI review.";
  }

  if (finding.id === "asymmetric_consent_ui") {
    return "When acceptance appears more prominent or easier than refusal, users may have difficulty comparing choices. For review teams, this signal can help identify CMP template, button hierarchy, wording, step-count, visual prominence, or accessibility issues that may require consent choice-architecture review.";
  }

  if (finding.id === "consent_dark_patterns_detected") {
    return "Consent interfaces can shape how users understand and exercise privacy choices. For review teams, this signal can help identify consent UX patterns that may warrant deeper review across choice availability, effort, clarity, repetition, accessibility, and consistency with public statements.";
  }

  if (finding.id === "cpra_cba_opt_out_missing") {
    return "When advertising, cross-context behavioral advertising, sale/share, or similar privacy-choice signals appear on a site, reviewers may need to confirm whether applicable opt-out paths are present, discoverable, and connected to the relevant data uses. For privacy and product teams, this signal can help identify footer, privacy-policy, preference-center, CMP, GPC, and state-specific rights-flow gaps that may require CPRA or privacy-choice review.";
  }

  if (finding.id === "third_party_cookie_pre_consent") {
    return "Cookies or browser storage set by third-party domains before a recorded choice can be relevant to cookie, consent, tracking, and vendor-governance review. For review teams, this signal can help identify whether the storage is necessary, exempt, consent-gated, or tied to analytics, advertising, measurement, security, fraud prevention, or another purpose.";
  }

  if (finding.id === "reject_tracking_persists_after_reject") {
    return "When non-essential tracking or storage continues after a reject-style interaction, reviewers may need to confirm whether the reject action succeeded, whether consent state propagated correctly, and whether downstream tags or vendors honored the intended choice. For engineering and privacy teams, this signal can help identify CMP-to-tag-manager wiring, consent-mode propagation, queued beacons, or vendor-suppression issues.";
  }

  if (finding.id === "rtb_cookie_sync_observed") {
    return "RTB and adtech sync requests can be relevant to advertising, measurement, identity, and vendor-governance review because they may involve pseudonymous identifiers, redirects, or cookie-matching style flows. For review teams, this signal can help identify which adtech integrations, endpoints, or request patterns may warrant review for consent state, disclosure, purpose, and data-flow context.";
  }

  if (finding.id === "cross_domain_identifier_sharing_observed") {
    return "Identifier-like values in cross-domain requests can be relevant to tracking, attribution, advertising, analytics, identity, and vendor-governance review. For review teams, this signal can help identify where browser-visible data flows may warrant review for purpose, consent state, disclosure, contract, minimization, and vendor-governance context.";
  }

  if (finding.id === "session_recording_services_detected") {
    return "Session replay and behavior-analytics tools can be useful for product debugging, but they may observe detailed interaction patterns. For review teams, this signal can help identify where replay tooling, masking, sampling, consent gating, and page exclusions may warrant review before relying on the finding operationally or legally.";
  }

  if (finding.id === "possible_session_replay_on_sensitive_input_surface") {
    return "Replay-related tooling near sensitive forms or flows can raise higher review priority because masking, event capture, visual-capture settings, and page exclusions matter more in those contexts. The signal helps review teams locate pages where sensitive context and replay runtime evidence should be checked together.";
  }

  if (finding.id === "sensitive_data_collection_with_third_party_tracking_present") {
    return "Sensitive forms or flows that also load third-party tracking context may warrant deeper review because field purpose, payload contents, vendor purpose, consent state, and minimization can change the risk assessment. The signal helps teams find shared templates or tag rules that may need page-level exclusions.";
  }

  if (finding.id === "fingerprinting_related_signals_observed") {
    return "Browser and device signals can be relevant to fingerprinting review even when retained evidence does not support a probable fingerprinting finding. For review teams, this signal can help identify where high-entropy collection, purpose, consent state, vendor role, and minimization may warrant manual review.";
  }

  if (finding.id === "probable_fingerprinting") {
    return "Clusters of high-entropy browser or device signals can support fingerprinting review because they may help distinguish browsers or devices without relying only on cookies. For review teams, this signal can help prioritize purpose, necessity, consent state, security or fraud-prevention context, and minimization review.";
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
          <PrevalenceInterpretationNote finding={finding} />
          <section>
            <h3 className="text-sm font-semibold text-slate-950">Observed</h3>
            <p className="mt-2 text-base leading-7 text-slate-600">{finding.observed}</p>
          </section>
        </div>

        <section className="border border-sky-100 bg-sky-50 p-4">
          <h3 className="text-sm font-semibold text-slate-950">Why this matters</h3>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {getWhyThisMattersCopy(finding)}
          </p>
        </section>

        <MethodologyContext finding={finding} />

        <FingerprintingRelationshipCallout finding={finding} />

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-950">Example evidence</h3>
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
          <EvidenceExampleCards examples={finding.exampleEvidence} />
          <details id={`${finding.id}-example-json`} className="group">
            <summary className="inline-flex h-10 cursor-pointer list-none items-center justify-center gap-2 rounded-md border border-slate-950 bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 [&::-webkit-details-marker]:hidden">
              <JsonIcon />
              <span className="group-open:hidden">View redacted sample JSON</span>
              <span className="hidden group-open:inline">Hide redacted sample JSON</span>
            </summary>
            <div className="mt-3">
              <EvidenceBlock title="Redacted sample JSON" code={sampleJson} />
            </div>
          </details>
        </section>

        <RegulatoryReviewContext finding={finding} />

        <EvidenceStandard finding={finding} />

        <section className="border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-950">Common causes</h3>
          <div className="mt-3">
            <BulletList items={finding.commonCauses} />
          </div>
        </section>

        <CommonRemediationApproaches finding={finding} />

        <section className="border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-950">Recommended review questions</h3>
          <div className="mt-3">
            <BulletList items={finding.reviewQuestions} />
          </div>
        </section>

        <LimitationsContext finding={finding} />
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

  const relatedReadingLinks = getRelatedReadingLinks(activeFinding);
  const findingsById = new Map(findings.map((finding) => [finding.id, finding]));
  const groupedFindings = FINDING_REGISTRY_GROUPS.map((group) => ({
    ...group,
    findings: group.findingIds.flatMap((findingId) => {
      const finding = findingsById.get(findingId);

      return finding ? [finding] : [];
    })
  })).filter((group) => group.findings.length > 0);

  return (
    <div className="space-y-8">
      <section className="border border-slate-200 bg-white">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <aside className="min-w-0 border-b border-slate-200 bg-slate-50 lg:border-b-0 lg:border-r">
            <div className="min-w-0 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Registry index</p>
              <div className="mt-3 max-h-[16rem] space-y-4 overflow-y-auto pr-1 lg:max-h-[38rem]">
                {groupedFindings.map((group) => (
                  <section key={group.title} className="space-y-2">
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      {group.title}
                    </h3>
                    <div className="grid gap-2">
                      {group.findings.map((finding) => {
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
                            <span className={isActive ? "mt-2 block text-xs leading-5 text-slate-300" : "mt-2 block text-xs leading-5 text-slate-500"}>
                              {finding.category} · {formatChipLabel(finding.criticality)}
                            </span>
                            <span className={isActive ? "mt-2 inline-block border border-slate-600 px-2 py-0.5 text-[11px] font-semibold text-slate-200" : "mt-2 inline-block border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-500"}>
                              {finding.benchmark.contextLabel}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </aside>

          <div className="min-w-0 p-5 sm:p-6 lg:p-8">
            <FindingReferenceSection key={activeFinding.id} finding={activeFinding} />
          </div>
        </div>
      </section>

      {!compact && relatedReadingLinks.length > 0 ? (
        <section className="border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">Related reading</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {relatedReadingLinks.map((link) => (
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

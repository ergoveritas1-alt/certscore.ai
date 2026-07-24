"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { FindingReferenceItem } from "../../lib/marketing/finding-atlas";

type HomepageFindingsOverviewProps = {
  findings: FindingReferenceItem[];
};

type HomepageChecklistFinding = {
  category: "Consent Controls" | "Policy Surfaces" | "GDPR Transparency" | "Pre-consent Signals";
  criticalityChip: string;
  evidence: {
    lines: string[];
    title: string;
  };
  href?: string;
  id: string;
  overview: string;
  regulatoryCopy: string;
  regulatoryLabel: string;
  reviewPrompt: string;
  title: string;
};

const HOMEPAGE_GDPR_EPRIVACY_CHECKLIST_FINDINGS = [
  {
    id: "consent_banner_observed",
    title: "Consent banner observed",
    category: "Consent Controls",
    criticalityChip: "Evidence checklist",
    overview:
      "CertScore retains whether an actionable cookie banner, consent prompt, or CMP preference surface was observed in the tested public-web context.",
    regulatoryLabel: "Consent surface availability",
    regulatoryCopy:
      "Useful for reviewing whether a visitor was presented with a choice surface before optional cookies, tracking, or storage activity was evaluated.",
    evidence: {
      title: "Consent surface sample",
      lines: [
        "{\"rowId\":\"consent_surface_observed\",\"status\":\"Observed\"}",
        "{\"surface\":\"homepage\",\"component\":\"cookie_banner\"}",
        "{\"evidenceState\":\"observed\",\"source\":\"retained_scan_evidence\"}"
      ]
    },
    reviewPrompt: "What retained screenshot or DOM evidence shows the consent surface that was available to the visitor?"
  },
  {
    id: "accept_control_available",
    title: "Accept control available",
    category: "Consent Controls",
    criticalityChip: "Evidence checklist",
    overview:
      "The checklist can show whether a first-layer accept, accept-all, allow-all, or agree control was observed on the retained consent surface.",
    regulatoryLabel: "Affirmative choice control",
    regulatoryCopy:
      "Useful for comparing the available acceptance path with refusal and settings paths without treating label presence as a consent action.",
    evidence: {
      title: "Accept control sample",
      lines: [
        "{\"rowId\":\"accept_consent_control\",\"status\":\"Observed\"}",
        "{\"controlIntent\":\"accept\",\"layer\":\"initial\"}",
        "{\"labelEvidence\":\"Accept all\",\"actionClicked\":false}"
      ]
    },
    reviewPrompt: "Which retained first-layer control supports accept availability, and what language or viewport was captured?"
  },
  {
    id: "reject_decline_control_available",
    title: "Reject / decline control available",
    category: "Consent Controls",
    criticalityChip: "High criticality",
    href: "/findings/reject_option_missing_or_hidden",
    overview:
      "The checklist can show whether a reject, decline, refuse, necessary-only, or continue-without-accepting path was observed on the retained consent surface.",
    regulatoryLabel: "Refusal path availability",
    regulatoryCopy:
      "Useful for reviewing whether refusal evidence is visible and direct in the tested context, without relying on post-consent clicking.",
    evidence: {
      title: "Reject control sample",
      lines: [
        "{\"rowId\":\"reject_all_path_availability\",\"status\":\"Observed\"}",
        "{\"controlIntent\":\"reject\",\"variant\":\"continue_without_accepting\"}",
        "{\"layer\":\"initial\",\"actionClicked\":false}"
      ]
    },
    reviewPrompt: "Was a refusal-equivalent control retained on the first layer, or was the row coverage limited?"
  },
  {
    id: "options_settings_preferences_control",
    title: "Options / settings / preferences control",
    category: "Consent Controls",
    criticalityChip: "Evidence checklist",
    overview:
      "The checklist can show whether a settings, preferences, options, or manage-choices control was retained on the consent surface.",
    regulatoryLabel: "Choice configuration path",
    regulatoryCopy:
      "Useful for reviewing whether a path to more granular choices was visible, while keeping options distinct from proof of reject availability.",
    evidence: {
      title: "Options control sample",
      lines: [
        "{\"rowId\":\"options_settings_preferences_control\",\"status\":\"Observed\"}",
        "{\"controlIntent\":\"options\",\"labelEvidence\":\"Set up\"}",
        "{\"layer\":\"initial\",\"deeperPathClicked\":false}"
      ]
    },
    reviewPrompt: "Which retained control opened or indicated a settings path, and does the evidence distinguish it from reject?"
  },
  {
    id: "consent_platform_identified",
    title: "Consent platform identified",
    category: "Consent Controls",
    criticalityChip: "Review signal",
    overview:
      "CertScore can retain CMP or consent-framework evidence such as known vendor signals, framework APIs, consent cookies, or canonical CMP registry matches.",
    regulatoryLabel: "CMP and consent framework context",
    regulatoryCopy:
      "Useful for reviewing regional configuration, framework behavior, and whether consent evidence comes from a recognizable consent-management surface.",
    evidence: {
      title: "CMP signal sample",
      lines: [
        "{\"rowId\":\"cmp_framework_signal_observed\",\"status\":\"Observed\"}",
        "{\"cmp\":\"Didomi\",\"registryMatch\":\"canonical_cmp\"}",
        "{\"signals\":[\"dom_selector\",\"consent_cookie\"]}"
      ]
    },
    reviewPrompt: "Which retained CMP signal or framework evidence supports the consent-platform identification?"
  },
  {
    id: "privacy_notice_availability",
    title: "Privacy notice availability",
    category: "Policy Surfaces",
    criticalityChip: "Evidence checklist",
    overview:
      "The checklist can show whether a reachable privacy notice or privacy policy surface was retained for the scanned site.",
    regulatoryLabel: "Public privacy surface retained",
    regulatoryCopy:
      "Useful for deciding whether GDPR transparency rows can be evaluated from retained policy text or should be marked coverage limited.",
    evidence: {
      title: "Privacy notice sample",
      lines: [
        "{\"rowId\":\"privacy_notice_availability\",\"status\":\"Observed\"}",
        "{\"surfaceType\":\"privacy_policy\",\"url\":\"https://example.test/privacy\"}",
        "{\"textQuality\":\"usable\",\"source\":\"policy_surface_scanner\"}"
      ]
    },
    reviewPrompt: "Was a usable privacy notice retained, and what coverage limitation applies if text extraction was low quality?"
  },
  {
    id: "cookie_policy_availability",
    title: "Cookie policy availability",
    category: "Policy Surfaces",
    criticalityChip: "Evidence checklist",
    overview:
      "The checklist can show whether a cookie policy, cookie notice, cookie-settings surface, or equivalent disclosure surface was retained.",
    regulatoryLabel: "Cookie disclosure surface retained",
    regulatoryCopy:
      "Useful for reviewing whether observed cookie and tracker behavior has a retained policy surface for comparison.",
    evidence: {
      title: "Cookie policy sample",
      lines: [
        "{\"rowId\":\"cookie_notice_policy_availability\",\"status\":\"Observed\"}",
        "{\"surfaceType\":\"cookie_policy\",\"url\":\"https://example.test/cookies\"}",
        "{\"coverage\":\"retained_policy_surface\"}"
      ]
    },
    reviewPrompt: "Which retained cookie disclosure surface was used, and did it include usable text for reviewer context?"
  },
  {
    id: "policy_surface_retained",
    title: "Policy surface retained",
    category: "Policy Surfaces",
    criticalityChip: "Evidence checklist",
    overview:
      "CertScore can retain the policy surface URL, text quality, fetch or render pathway, and coverage notes needed before display rows claim policy evidence.",
    regulatoryLabel: "Policy evidence availability",
    regulatoryCopy:
      "Useful for separating observed disclosure evidence from not-testable rows caused by missing, blocked, or low-quality policy extraction.",
    evidence: {
      title: "Policy retention sample",
      lines: [
        "{\"surfaceType\":\"privacy_policy\",\"coverageStatus\":\"usable\"}",
        "{\"fetchPath\":\"canonical_prefetch\",\"textQuality\":\"usable\"}",
        "{\"limitation\":null,\"evidenceRefs\":[\"policy_surface_001\"]}"
      ]
    },
    reviewPrompt: "Was policy evidence actually retained, and does the retained text quality support row-specific extraction?"
  },
  {
    id: "controller_contact_disclosure",
    title: "Controller/contact disclosure",
    category: "GDPR Transparency",
    criticalityChip: "Article 13",
    overview:
      "The checklist can show whether retained privacy-policy evidence includes a controller, privacy contact, or equivalent contact-point disclosure.",
    regulatoryLabel: "Controller and contact transparency",
    regulatoryCopy:
      "Useful for reviewing whether users can identify who is responsible for processing and how to contact the privacy team.",
    evidence: {
      title: "Controller disclosure sample",
      lines: [
        "{\"rowId\":\"controller_contact_disclosure\",\"status\":\"Observed\"}",
        "{\"disclosureType\":\"controller_contact\",\"matchStrength\":\"direct\"}",
        "{\"source\":\"gdpr_transparency_topic_classifier.v1\"}"
      ]
    },
    reviewPrompt: "Which retained policy excerpt identifies the controller, privacy contact, or equivalent contact point?"
  },
  {
    id: "processing_purposes_disclosure",
    title: "Processing purposes disclosure",
    category: "GDPR Transparency",
    criticalityChip: "Article 13",
    overview:
      "The checklist can show whether retained policy text describes purposes for processing personal data.",
    regulatoryLabel: "Purpose transparency",
    regulatoryCopy:
      "Useful for reviewing whether policy evidence gives a concrete purpose context for observed processing, cookies, vendors, or tracking.",
    evidence: {
      title: "Purpose disclosure sample",
      lines: [
        "{\"rowId\":\"processing_purposes_disclosure\",\"status\":\"Observed\"}",
        "{\"disclosureType\":\"processing_purposes\",\"matchStrength\":\"direct\"}",
        "{\"evidenceText\":\"bounded policy excerpt retained\"}"
      ]
    },
    reviewPrompt: "Which retained policy text describes processing purposes, and is it specific enough for reviewer use?"
  },
  {
    id: "legal_basis_disclosure",
    title: "Legal basis disclosure",
    category: "GDPR Transparency",
    criticalityChip: "Article 13",
    overview:
      "The checklist can show whether retained privacy-policy evidence includes a canonical legal-basis disclosure signal.",
    regulatoryLabel: "Legal basis transparency",
    regulatoryCopy:
      "Useful for reviewing whether the policy text names legal bases without CertScore deciding whether the basis is correct.",
    evidence: {
      title: "Legal basis sample",
      lines: [
        "{\"rowId\":\"legal_basis_disclosure_observed\",\"status\":\"Observed\"}",
        "{\"disclosureType\":\"legal_basis\",\"selectedEvidenceStrength\":\"strong\"}",
        "{\"matchedLocale\":\"fr\",\"source\":\"deterministic\"}"
      ]
    },
    reviewPrompt: "Which retained excerpt supports legal-basis disclosure, and what locale or classifier matched it?"
  },
  {
    id: "recipients_vendor_categories_disclosed",
    title: "Recipients/vendor categories disclosed",
    category: "GDPR Transparency",
    criticalityChip: "Article 13",
    overview:
      "The checklist can show whether retained policy evidence describes recipient, vendor, partner, or third-party categories.",
    regulatoryLabel: "Recipient and vendor-category transparency",
    regulatoryCopy:
      "Useful for comparing retained policy statements with observed runtime vendors and third-party domains.",
    evidence: {
      title: "Recipient disclosure sample",
      lines: [
        "{\"rowId\":\"recipients_vendor_categories_disclosure\",\"status\":\"Review signal\"}",
        "{\"disclosureType\":\"recipients_vendor_categories\",\"matchStrength\":\"direct\"}",
        "{\"runtimeComparison\":\"available_when_vendor_evidence_retained\"}"
      ]
    },
    reviewPrompt: "Which retained text describes recipient or vendor categories, and does runtime evidence suggest review follow-up?"
  },
  {
    id: "retention_disclosure",
    title: "Retention disclosure",
    category: "GDPR Transparency",
    criticalityChip: "Article 13",
    overview:
      "The checklist can show whether retained privacy-policy evidence includes a data-retention disclosure signal.",
    regulatoryLabel: "Retention transparency",
    regulatoryCopy:
      "Useful for reviewing whether policy text describes retention periods or criteria, especially when cookie-retention evidence is retained.",
    evidence: {
      title: "Retention disclosure sample",
      lines: [
        "{\"rowId\":\"retention_disclosure_observed\",\"status\":\"Observed\"}",
        "{\"disclosureType\":\"retention\",\"matchStrength\":\"direct\"}",
        "{\"selectedPolicySectionUrl\":\"https://example.test/privacy\"}"
      ]
    },
    reviewPrompt: "Which retained policy excerpt describes retention periods, criteria, or deletion timing?"
  },
  {
    id: "data_subject_rights_disclosure",
    title: "Data subject rights disclosure",
    category: "GDPR Transparency",
    criticalityChip: "Article 13",
    overview:
      "The checklist can show whether retained policy evidence describes data subject rights or a rights request path.",
    regulatoryLabel: "Rights request transparency",
    regulatoryCopy:
      "Useful for reviewing whether users are told how to exercise access, deletion, objection, correction, or portability rights.",
    evidence: {
      title: "Rights disclosure sample",
      lines: [
        "{\"rowId\":\"data_subject_rights_disclosure\",\"status\":\"Observed\"}",
        "{\"disclosureType\":\"data_subject_rights\",\"matchStrength\":\"direct\"}",
        "{\"evidenceRefs\":[\"policy_surface_001#rights\"]}"
      ]
    },
    reviewPrompt: "Which retained policy text describes data subject rights or a request mechanism?"
  },
  {
    id: "international_transfer_disclosure",
    title: "International transfer disclosure",
    category: "GDPR Transparency",
    criticalityChip: "Article 13",
    overview:
      "The checklist can show whether retained policy evidence describes international transfers or transfer-relevant vendor and endpoint context.",
    regulatoryLabel: "Transfer transparency review",
    regulatoryCopy:
      "Useful for reviewing transfer disclosures alongside observed analytics, advertising, or identifier-bearing third-party endpoints.",
    evidence: {
      title: "Transfer disclosure sample",
      lines: [
        "{\"rowId\":\"international_transfers_disclosure\",\"status\":\"Review signal\"}",
        "{\"disclosureType\":\"international_transfers\",\"matchStrength\":\"direct\"}",
        "{\"endpointContext\":\"review_when_runtime_evidence_retained\"}"
      ]
    },
    reviewPrompt: "Which retained policy text or endpoint context supports international-transfer review?"
  },
  {
    id: "dpo_privacy_contact_point",
    title: "DPO / privacy contact point",
    category: "GDPR Transparency",
    criticalityChip: "Article 13",
    overview:
      "The checklist can show whether retained privacy-policy evidence identifies a DPO, privacy office, or data-protection contact point.",
    regulatoryLabel: "DPO or privacy contact evidence",
    regulatoryCopy:
      "Useful for reviewing whether a data-protection contact path is visible in the retained policy surface.",
    evidence: {
      title: "DPO contact sample",
      lines: [
        "{\"rowId\":\"dpo_contact_point_disclosure\",\"status\":\"Observed\"}",
        "{\"disclosureType\":\"dpo_privacy_contact\",\"matchStrength\":\"direct\"}",
        "{\"values\":\"contact details redacted in public preview\"}"
      ]
    },
    reviewPrompt: "Which retained policy excerpt identifies a DPO, privacy office, or data-protection contact point?"
  },
  {
    id: "third_party_tracking_before_recorded_consent",
    title: "Third-party tracking before recorded consent",
    category: "Pre-consent Signals",
    criticalityChip: "High criticality",
    href: "/findings/pre_consent_tracking_detected",
    overview:
      "Runtime evidence can tie analytics, advertising, cross-site measurement, or similar third-party requests to the page-load timeline before recorded consent.",
    regulatoryLabel: "Consent timing before recorded choice",
    regulatoryCopy:
      "Useful for reviewing whether non-essential third-party activity began before a retained choice point was observed.",
    evidence: {
      title: "Pre-consent tracking sample",
      lines: [
        "{\"rowId\":\"pre_consent_third_party_tracking\",\"status\":\"Gap observed\"}",
        "{\"surface\":\"homepage\",\"consentState\":\"no_choice_observed\"}",
        "{\"signal\":\"analytics_or_ad_request\",\"firstSeenMs\":3405}"
      ]
    },
    reviewPrompt: "What was the first retained third-party tracking signal, and what timeline supports it?"
  },
  {
    id: "cookies_storage_before_recorded_consent",
    title: "Cookies/storage before recorded consent",
    category: "Pre-consent Signals",
    criticalityChip: "High criticality",
    href: "/findings/third_party_cookie_pre_consent",
    overview:
      "Cookie and browser-storage evidence can show whether non-essential storage appeared before a recorded consent action or prior consent state.",
    regulatoryLabel: "Storage timing before recorded choice",
    regulatoryCopy:
      "Useful for reviewing cookie consent timing, domain scope, purpose classification, and whether storage was retained before choice.",
    evidence: {
      title: "Pre-consent storage sample",
      lines: [
        "{\"rowId\":\"pre_consent_cookies_storage\",\"status\":\"Gap observed\"}",
        "{\"type\":\"cookie_observed\",\"party\":\"third_party\"}",
        "{\"firstSeenMs\":1840,\"consentBeforeFirstSeen\":false}"
      ]
    },
    reviewPrompt: "Which cookie or storage key appeared first, and what domain or scope set it?"
  },
  {
    id: "ad_vendor_activity_before_recorded_consent",
    title: "Ad vendor activity before recorded consent",
    category: "Pre-consent Signals",
    criticalityChip: "Review signal",
    href: "/findings/pre_consent_tracking_detected",
    overview:
      "Retained runtime evidence can identify ad serving, ad measurement, ad verification, retargeting, or audience-building signals before recorded consent.",
    regulatoryLabel: "Advertising and retargeting review",
    regulatoryCopy:
      "Useful for reviewing adtech purpose, vendor role, timing, and disclosure alignment without treating a vendor match as a legal conclusion.",
    evidence: {
      title: "Advertising signal sample",
      lines: [
        "{\"rowId\":\"advertising_retargeting_vendor_signal_observed\",\"status\":\"Review signal\"}",
        "{\"purpose\":\"advertising\",\"vendor\":\"classified_ad_vendor\"}",
        "{\"firstSeenMs\":2210,\"consentState\":\"no_choice_observed\"}"
      ]
    },
    reviewPrompt: "Which retained request, vendor, or purpose classification supports ad-vendor review?"
  },
  {
    id: "fingerprinting_signal_before_recorded_consent",
    title: "Fingerprinting signal before recorded consent",
    category: "Pre-consent Signals",
    criticalityChip: "Review signal",
    href: "/findings/probable_fingerprinting",
    overview:
      "Runtime evidence can retain browser or device entropy signals that support fingerprinting-oriented review in the pre-consent/public-web context.",
    regulatoryLabel: "Device identification review",
    regulatoryCopy:
      "Useful for reviewing high-entropy signal categories, purpose, disclosure, consent state, and whether raw values were avoided or redacted.",
    evidence: {
      title: "Fingerprinting signal sample",
      lines: [
        "{\"rowId\":\"device_identification_fingerprinting_signal_observed\",\"status\":\"Review signal\"}",
        "{\"signals\":[\"canvas_or_webgl\",\"screen_locale\"],\"rawValues\":\"not_retained\"}",
        "{\"consentState\":\"no_choice_observed\"}"
      ]
    },
    reviewPrompt: "Which browser or device signal categories co-occurred, and what raw values were excluded from public evidence?"
  },
  {
    id: "embedded_content_before_recorded_consent",
    title: "Embedded content before recorded consent",
    category: "Pre-consent Signals",
    criticalityChip: "Review signal",
    overview:
      "The checklist can show whether social, media, map, form/chat, iframe, or other embedded third-party services loaded before recorded consent.",
    regulatoryLabel: "Embedded third-party service review",
    regulatoryCopy:
      "Useful for reviewing whether embedded services, plugins, or widgets triggered third-party requests before a retained choice point.",
    evidence: {
      title: "Embedded service sample",
      lines: [
        "{\"rowId\":\"embedded_content_pre_consent\",\"status\":\"Gap observed\"}",
        "{\"serviceType\":\"media_embed\",\"party\":\"third_party\"}",
        "{\"firstSeenMs\":2975,\"consentBeforeFirstSeen\":false}"
      ]
    },
    reviewPrompt: "Which retained iframe, embed, widget, or service request supports embedded-content review?"
  }
] satisfies HomepageChecklistFinding[];

function ArrowIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      {direction === "left" ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}
    </svg>
  );
}

function getFindingHref(finding: HomepageChecklistFinding, referenceFindingIds: Set<string>) {
  if (!finding.href) {
    return "/findings";
  }

  const referenceId = finding.href.replace("/findings/", "");
  return referenceFindingIds.has(referenceId) ? finding.href : "/findings";
}

export function HomepageFindingsOverview({ findings }: HomepageFindingsOverviewProps) {
  const carouselFindings = HOMEPAGE_GDPR_EPRIVACY_CHECKLIST_FINDINGS;
  const [activeIndex, setActiveIndex] = useState(0);
  const activeFinding = useMemo(
    () => carouselFindings[activeIndex] ?? carouselFindings[0],
    [activeIndex, carouselFindings]
  );
  const referenceFindingIds = useMemo(() => new Set(findings.map((finding) => finding.id)), [findings]);

  if (!activeFinding) {
    return null;
  }

  function showPrevious() {
    setActiveIndex((current) => (current === 0 ? carouselFindings.length - 1 : current - 1));
  }

  function showNext() {
    setActiveIndex((current) => (current === carouselFindings.length - 1 ? 0 : current + 1));
  }

  return (
    <section className="border-y border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-5 lg:h-[34rem] lg:grid-cols-[0.64fr_1.36fr] lg:items-stretch">
          <div className="flex max-w-sm flex-col gap-3">
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Findings overview</p>
              <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Review the evidence.</h2>
            </div>

            <div className="flex min-h-[18rem] flex-1 flex-col rounded-[2rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.98)_0%,rgba(255,255,255,1)_100%)] p-4 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.25)]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Finding navigator</p>
              <div className="mt-4 space-y-3">
                <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">{activeFinding.category}</span>
                <p className="max-w-[19rem] text-sm leading-6 text-slate-600">Browse retained signals one at a time, then use the detail panel to review the evidence and context.</p>
              </div>

              <div className="mt-auto flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
                <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Show previous finding"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-sky-200 bg-[linear-gradient(180deg,#ffffff_0%,#f0f9ff_100%)] text-slate-900 shadow-[0_2px_0_rgba(186,230,253,0.9),0_8px_16px_-12px_rgba(14,116,144,0.6)] transition hover:-translate-y-0.5 hover:border-sky-400 hover:shadow-[0_3px_0_rgba(125,211,252,0.95),0_12px_20px_-12px_rgba(14,116,144,0.75)] active:translate-y-0.5 active:shadow-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                  onClick={showPrevious}
                >
                  <ArrowIcon direction="left" />
                </button>
                <button
                  type="button"
                  aria-label="Show next finding"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-sky-200 bg-[linear-gradient(180deg,#ffffff_0%,#f0f9ff_100%)] text-slate-900 shadow-[0_2px_0_rgba(186,230,253,0.9),0_8px_16px_-12px_rgba(14,116,144,0.6)] transition hover:-translate-y-0.5 hover:border-sky-400 hover:shadow-[0_3px_0_rgba(125,211,252,0.95),0_12px_20px_-12px_rgba(14,116,144,0.75)] active:translate-y-0.5 active:shadow-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                  onClick={showNext}
                >
                  <ArrowIcon direction="right" />
                </button>
                </div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
                  {String(activeIndex + 1).padStart(2, "0")} / {String(carouselFindings.length).padStart(2, "0")}
                </p>
              </div>
            </div>
          </div>

          <div className="relative h-full overflow-hidden rounded-[2rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,252,255,1)_0%,rgba(255,255,255,0.98)_64%,rgba(249,253,250,0.98)_100%)] p-4 shadow-[0_24px_56px_rgba(15,23,42,0.08)]">
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,rgba(15,139,215,0.9)_0%,rgba(103,199,240,0.78)_58%,rgba(71,181,74,0.7)_100%)]"
            />
            <div className="relative grid h-full min-h-0 gap-4 lg:grid-cols-[1fr_0.78fr]">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                    {activeFinding.criticalityChip}
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                    GDPR / ePrivacy checklist
                  </span>
                </div>
                <div>
                  <h3 className="text-2xl font-semibold tracking-tight text-slate-950">{activeFinding.title}</h3>
                  <p className="mt-2 text-sm leading-5 text-slate-600">{activeFinding.overview}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Brief regulatory context</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">{activeFinding.regulatoryLabel}</p>
                  <p className="mt-1 text-xs leading-4 text-slate-500">{activeFinding.regulatoryCopy}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                      GDPR / ePrivacy
                    </span>
                    <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                      Evidence review
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col rounded-[1.5rem] border border-slate-200 bg-white p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Example evidence</p>
                <div className="mt-2 rounded-2xl border border-slate-800 bg-slate-950 p-3">
                  <p className="text-xs font-semibold text-slate-100">{activeFinding.evidence.title}</p>
                  <div className="mt-2 space-y-1 font-mono text-[11px] leading-5 text-slate-300">
                    {activeFinding.evidence.lines.map((line) => (
                      <p key={line} className="break-all">{line}</p>
                    ))}
                  </div>
                </div>
                <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Reviewer prompts</p>
                <ul className="mt-1.5 space-y-2 text-sm leading-5 text-slate-600">
                  <li className="flex gap-2">
                    <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                    <span>{activeFinding.reviewPrompt}</span>
                  </li>
                </ul>
                <div className="mt-auto pt-4">
                  <Link
                    href={getFindingHref(activeFinding, referenceFindingIds)}
                    className="inline-flex h-10 items-center justify-center rounded-md border border-slate-950 bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  >
                    View full finding
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

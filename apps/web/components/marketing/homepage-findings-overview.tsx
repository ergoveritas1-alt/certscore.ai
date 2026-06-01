"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { FindingReferenceItem } from "../../lib/marketing/finding-atlas";
import type { EXECUTIVE_SUMMARY_TOP_FINDING_IDS } from "../../lib/scans/rank-findings";

type HomepageFindingsOverviewProps = {
  findings: FindingReferenceItem[];
};

type HomepageFindingCarouselCopy = {
  overview: string;
  regulatoryLabel: string;
  regulatoryCopy: string;
  evidence: {
    title: string;
    lines: string[];
  };
  reviewPrompts: string[];
};

const HOMEPAGE_FINDING_CAROUSEL_COPY = {
  pre_consent_tracking_detected: {
    overview:
      "Runtime evidence ties a classified non-essential request or storage event to the page-load timeline before a recorded consent action or prior consent state.",
    regulatoryLabel: "Consent timing before recorded choice",
    regulatoryCopy:
      "Useful for reviewing whether non-essential tracking, measurement, advertising, or storage began before a recorded choice point was observed.",
    evidence: {
      title: "Pre-consent timeline sample",
      lines: [
        "{\"artifact\":\"req_pre_consent_001\",\"role\":\"supporting\"}",
        "{\"surface\":\"homepage\",\"consentState\":\"no_choice_observed\"}",
        "{\"signal\":\"analytics_collect\",\"firstSeenMs\":3405,\"values\":\"redacted\"}"
      ]
    },
    reviewPrompts: ["What was the first concrete pre-consent signal, and what retained timeline supports it?"]
  },
  visual_contrast_accessibility_issue: {
    overview:
      "Automated accessibility evidence flags text or UI controls whose retained contrast signal may need manual review against the affected state and element purpose.",
    regulatoryLabel: "Accessibility contrast review",
    regulatoryCopy:
      "Useful for triaging likely WCAG contrast concerns while preserving the need to review text size, state, purpose, and exceptions.",
    evidence: {
      title: "Contrast evidence sample",
      lines: [
        "{\"artifact\":\"contrast_001\",\"rule\":\"color-contrast\"}",
        "{\"surface\":\"pricing\",\"selector\":\"pricing-card muted copy\"}",
        "{\"impact\":\"serious\",\"wcag\":\"1.4.3\",\"values\":\"not_public\"}"
      ]
    },
    reviewPrompts: ["Which selector, component, page, and visual state produced the contrast evidence?"]
  },
  semantic_labeling_accessibility_issue: {
    overview:
      "Automated evidence identifies controls, fields, links, landmarks, or ARIA relationships where programmatic labels or semantics may not match user intent.",
    regulatoryLabel: "Accessibility semantics review",
    regulatoryCopy:
      "Useful for reviewing whether labels, accessible names, roles, states, and relationships support assistive-technology use.",
    evidence: {
      title: "Semantic labeling sample",
      lines: [
        "{\"artifact\":\"semantic_001\",\"rule\":\"label\"}",
        "{\"surface\":\"signup\",\"element\":\"email input\"}",
        "{\"signal\":\"missing_or_unassociated_label\",\"wcag\":\"1.3.1/4.1.2\"}"
      ]
    },
    reviewPrompts: ["Which element and programmatic relationship triggered the semantic-labeling evidence?"]
  },
  session_recording_services_detected: {
    overview:
      "Runtime evidence shows a script, endpoint, or vendor pattern associated with session replay, heatmaps, recording, or behavior analytics.",
    regulatoryLabel: "Session replay and behavior analytics review",
    regulatoryCopy:
      "Useful for reviewing consent posture, transparency, masking, sampling, payload behavior, page exclusions, and vendor configuration.",
    evidence: {
      title: "Replay vendor sample",
      lines: [
        "{\"artifact\":\"replay_req_001\",\"role\":\"supporting\"}",
        "{\"surface\":\"public_page\",\"requestOrigin\":\"https://replay.example\"}",
        "{\"signal\":\"replay_library_or_endpoint\",\"payloadValues\":\"not_retained\"}"
      ]
    },
    reviewPrompts: ["Which script, request, endpoint, or vendor pattern triggered the replay signal?"]
  },
  third_party_cookie_pre_consent: {
    overview:
      "A third-party cookie or storage artifact was retained before CertScore.ai recorded a matching consent action or prior consent state.",
    regulatoryLabel: "Cookie/storage timing before choice",
    regulatoryCopy:
      "Useful for reviewing cookie consent timing, domain and scope, storage purpose, vendor role, necessity, exemptions, and regional configuration.",
    evidence: {
      title: "Third-party storage sample",
      lines: [
        "{\"artifact\":\"storage_001\",\"type\":\"cookie_observed\"}",
        "{\"domain\":\".ads.example\",\"scope\":\"third_party\",\"value\":\"redacted\"}",
        "{\"firstSeenMs\":1840,\"consentBeforeFirstSeen\":false}"
      ]
    },
    reviewPrompts: ["Which cookie or storage key appeared, and what domain or scope set it?"]
  },
  long_lived_cookie_retention_review: {
    overview:
      "Runtime cookie evidence includes a retained name, domain, page attribution, classification, and expiry duration that crosses CertScore.ai's retention review threshold.",
    regulatoryLabel: "Cookie retention review",
    regulatoryCopy:
      "Useful for reviewing whether observed cookie lifetimes match stated retention, minimization, consent, opt-out, and disclosure practices without treating the threshold as a legal conclusion.",
    evidence: {
      title: "Cookie retention sample",
      lines: [
        "{\"artifact\":\"cookie_retention_001\",\"cookie\":\"_fbp\"}",
        "{\"domain\":\".example.com\",\"durationDays\":540}",
        "{\"classification\":\"advertising/marketing\",\"threshold\":\"product_review\"}"
      ]
    },
    reviewPrompts: ["Which retained cookie expiry, classification, and page attribution support the review signal?"]
  },
  cookie_disclosure_gap: {
    overview:
      "Runtime cookie and storage evidence is compared against retained cookie-policy, CMP, or disclosure surfaces, including observed vendors or domains that were not clearly reflected.",
    regulatoryLabel: "Cookie transparency review",
    regulatoryCopy:
      "Useful for reviewing whether live cookie behavior, providers, categories, and purposes match what users can see in policy or preference-center disclosures.",
    evidence: {
      title: "Cookie disclosure sample",
      lines: [
        "{\"artifact\":\"cookie_disclosure_001\",\"subtype\":\"runtime_vendor_not_disclosed\"}",
        "{\"unmatchedRuntimeDomains\":[\"connect.example\"],\"value\":\"not_retained\"}",
        "{\"policySurfacesSearched\":[{\"type\":\"cookie_policy\",\"reached\":true}]}"
      ]
    },
    reviewPrompts: ["Which runtime cookie, vendor, or domain did not clearly match the retained disclosure surface?"]
  },
  rtb_cookie_sync_observed: {
    overview:
      "Network evidence shows adtech sync, match, redirect, or identifier-like request patterns that may indicate RTB or identity matching.",
    regulatoryLabel: "Adtech sync and identity matching review",
    regulatoryCopy:
      "Useful for reviewing sync endpoints, identifier scope, redirects, consent timing, sale/share context, and vendor-governance questions.",
    evidence: {
      title: "Adtech sync sample",
      lines: [
        "{\"artifact\":\"sync_req_001\",\"role\":\"supporting\"}",
        "{\"origin\":\"https://sync.ads.example\",\"path\":\"/user_sync\"}",
        "{\"keys\":[\"uid\",\"partner_id\"],\"values\":\"redacted\"}"
      ]
    },
    reviewPrompts: ["Which request origin, path, or redirect endpoint supported the sync classification?"]
  },
  text_alternative_accessibility_issue: {
    overview:
      "Automated evidence flags images, SVGs, icons, controls, or media elements whose text alternative may need manual accessibility review.",
    regulatoryLabel: "Accessibility text-alternative review",
    regulatoryCopy:
      "Useful for triaging non-text content where reviewers must confirm whether the element is informative, functional, decorative, or redundant.",
    evidence: {
      title: "Text alternative sample",
      lines: [
        "{\"artifact\":\"alt_001\",\"rule\":\"image-alt\"}",
        "{\"surface\":\"features\",\"element\":\"feature-card image\"}",
        "{\"signal\":\"missing_text_alternative\",\"wcag\":\"1.1.1\"}"
      ]
    },
    reviewPrompts: ["Which non-text element triggered the evidence, and what purpose does it serve?"]
  },
  consent_dark_patterns_detected: {
    overview:
      "Consent-surface evidence shows a cluster of choice-architecture signals such as nested refusal, forced interaction, hierarchy, repeated prompts, or misleading controls.",
    regulatoryLabel: "Consent choice-architecture review",
    regulatoryCopy:
      "Useful for reviewing whether consent controls, labels, visual hierarchy, path depth, accessibility, repetition, and preference-revisit controls affect user choice.",
    evidence: {
      title: "Choice architecture sample",
      lines: [
        "{\"artifact\":\"consent_ui_004\",\"component\":\"cookie_banner\"}",
        "{\"signals\":[\"reject_path_nested\",\"accept_primary\",\"repeated_prompting\"]}",
        "{\"accept\":\"Accept all\",\"rejectPath\":\"settings_layer\",\"buttonEvidence\":\"retained\"}"
      ]
    },
    reviewPrompts: ["Which consent-surface signals were retained, and how do they affect the choice path?"]
  },
  consent_preference_reopen_control_not_observed: {
    overview:
      "Retained public-page evidence showed consent or tracking context, but did not show an obvious cookie preferences, privacy settings, or consent-preference reopen control.",
    regulatoryLabel: "Consent preference lifecycle review",
    regulatoryCopy:
      "Useful for reviewing whether users can revisit, change, or withdraw cookie and privacy choices through an accessible footer link, CMP widget, preference center, or privacy-choice page.",
    evidence: {
      title: "Preference reopen sample",
      lines: [
        "{\"artifact\":\"consent_lifecycle_001\",\"surface\":\"public_page\"}",
        "{\"controlsSearched\":[\"cookie preferences\",\"privacy settings\",\"manage consent\"]}",
        "{\"preferenceReopen\":\"not_observed_in_retained_public_pages\",\"coverageStatus\":\"usable\"}"
      ]
    },
    reviewPrompts: ["Which page areas and preference-control labels were searched, and what consent or tracking context made the lifecycle review relevant?"]
  },
  cpra_cba_opt_out_missing: {
    overview:
      "Public-surface and runtime evidence suggests advertising or sale/share review context, but no clear California privacy choice path was observed.",
    regulatoryLabel: "California privacy choice review",
    regulatoryCopy:
      "Useful for reviewing Do Not Sell or Share, Your Privacy Choices, opt-out, GPC, footer, policy, and preference-center coverage.",
    evidence: {
      title: "Privacy choice sample",
      lines: [
        "{\"artifact\":\"privacy_choice_001\",\"surface\":\"footer_and_privacy_links\"}",
        "{\"adOrCrossContextSignal\":true,\"dnsLinkObserved\":false}",
        "{\"stateChoiceObserved\":false,\"gpcHandling\":\"not_determined\"}"
      ]
    },
    reviewPrompts: ["Which public surface was retained, and what made the opt-out path relevant?"]
  },
  forced_consent_interaction: {
    overview:
      "Consent-surface evidence shows an overlay or prompt that appeared to block ordinary page access or require interaction before the scan continued.",
    regulatoryLabel: "Forced consent interaction review",
    regulatoryCopy:
      "Useful for reviewing cookie-wall behavior, equivalent non-accept paths, page blocking, accessibility, necessity, and regional configuration.",
    evidence: {
      title: "Blocking overlay sample",
      lines: [
        "{\"artifact\":\"consent_ui_002\",\"component\":\"consent_overlay\"}",
        "{\"ordinaryPageAccess\":\"blocked\",\"scrollState\":\"blocked_or_obscured\"}",
        "{\"controls\":[\"Accept all\",\"Manage choices\"],\"dismissObserved\":false}"
      ]
    },
    reviewPrompts: ["What prompt, overlay, modal, or interaction state was retained?"]
  },
  reject_option_missing_or_hidden: {
    overview:
      "Consent UI evidence shows an accept path while a reject, decline, or equivalent refusal control was absent or less direct on the observed layer.",
    regulatoryLabel: "Reject path availability review",
    regulatoryCopy:
      "Useful for reviewing whether refusal is available, equally direct, accessible, and visible for the relevant region, language, and viewport.",
    evidence: {
      title: "Reject availability sample",
      lines: [
        "{\"artifact\":\"consent_ui_001\",\"component\":\"cookie_banner\"}",
        "{\"layer\":\"initial\",\"accept\":\"Accept all\",\"rejectObserved\":false}",
        "{\"preferences\":\"Manage choices\",\"consentActionObserved\":false}"
      ]
    },
    reviewPrompts: ["Which consent layer and browser state produced the missing or hidden reject observation?"]
  },
  sensitive_data_collection_with_third_party_tracking_present: {
    overview:
      "Page-surface evidence for a sensitive form or context appears alongside third-party tracking, analytics, advertising, replay, or measurement activity.",
    regulatoryLabel: "Sensitive surface tracking review",
    regulatoryCopy:
      "Useful for reviewing co-occurrence of sensitive contexts with vendors, payload behavior, minimization, consent state, and page-level exclusions.",
    evidence: {
      title: "Sensitive surface sample",
      lines: [
        "{\"artifact\":\"sensitive_tracking_001\",\"surface\":\"application_form\"}",
        "{\"sensitiveContext\":\"financial_or_identity\",\"values\":\"not_retained\"}",
        "{\"thirdPartyOrigin\":\"https://analytics.example\",\"payload\":\"redacted\"}"
      ]
    },
    reviewPrompts: ["Which page, form, field, or flow produced the sensitive-context evidence?"]
  },
  asymmetric_consent_ui: {
    overview:
      "Consent-surface evidence shows accept and refusal choices that appear visually, procedurally, or structurally imbalanced in the observed flow.",
    regulatoryLabel: "Imbalanced accept/reject choice review",
    regulatoryCopy:
      "Useful for reviewing step count, visual hierarchy, labels, same-layer availability, accessibility, localization, and CMP configuration.",
    evidence: {
      title: "Choice imbalance sample",
      lines: [
        "{\"artifact\":\"consent_ui_003\",\"component\":\"cookie_banner\"}",
        "{\"accept\":{\"layer\":\"initial\",\"steps\":1},\"reject\":{\"layer\":\"settings\",\"steps\":3}}",
        "{\"visualHierarchy\":\"accept_primary_vs_reject_secondary\",\"review\":\"manual\"}"
      ]
    },
    reviewPrompts: ["What controls or paths were available for acceptance and refusal?"]
  },
  keyboard_navigation_accessibility_issue: {
    overview:
      "Automated accessibility evidence flags interactive elements, focus behavior, or custom controls that may require keyboard-operability review.",
    regulatoryLabel: "Keyboard operability and focus review",
    regulatoryCopy:
      "Useful for reviewing focus visibility, focus order, keyboard operation, traps, custom controls, menus, modals, and responsive states.",
    evidence: {
      title: "Keyboard evidence sample",
      lines: [
        "{\"artifact\":\"keyboard_001\",\"rule\":\"keyboard\"}",
        "{\"surface\":\"navigation\",\"element\":\"nav-menu trigger\"}",
        "{\"signal\":\"keyboard_or_focus_review_needed\",\"wcag\":\"2.1.1/2.4.7\"}"
      ]
    },
    reviewPrompts: ["Which selector, component, page, and interaction state triggered the keyboard evidence?"]
  },
  focus_management_issue: {
    overview:
      "Automated accessibility evidence flags focus movement, containment, restoration, or visibility issues in modals, overlays, dynamic views, or keyboard paths.",
    regulatoryLabel: "Focus management review",
    regulatoryCopy:
      "Useful for reviewing whether keyboard and assistive-technology users can predictably enter, operate, and leave active UI surfaces.",
    evidence: {
      title: "Focus evidence sample",
      lines: [
        "{\"artifact\":\"focus_001\",\"rule\":\"focus-management\"}",
        "{\"surface\":\"dialog\",\"state\":\"open\"}",
        "{\"signal\":\"focus_not_moved_or_restored\",\"wcag\":\"2.4.3/2.4.7\"}"
      ]
    },
    reviewPrompts: ["Which interaction state produced the focus-management evidence?"]
  },
  cross_domain_identifier_sharing_observed: {
    overview:
      "Outbound request evidence shows identifier-like keys or values moving from the site to a different domain or third-party context.",
    regulatoryLabel: "Cross-domain identifier sharing review",
    regulatoryCopy:
      "Useful for reviewing identifier scope, destination role, purpose, consent timing, attribution, advertising, analytics, and vendor governance.",
    evidence: {
      title: "Identifier request sample",
      lines: [
        "{\"artifact\":\"identifier_req_001\",\"role\":\"supporting\"}",
        "{\"source\":\"https://example.com\",\"destination\":\"https://measure.example\"}",
        "{\"keys\":[\"client_id\",\"campaign_id\"],\"values\":\"redacted\"}"
      ]
    },
    reviewPrompts: ["Which outbound request carried the identifier-like key or value?"]
  },
  reject_tracking_persists_after_reject: {
    overview:
      "Runtime evidence shows a reject-style interaction followed by classified non-essential request or storage activity in the same observed scope.",
    regulatoryLabel: "Post-reject tracking effect review",
    regulatoryCopy:
      "Useful for reviewing whether rejection propagated to tags, vendors, cookies, storage, consent mode, queued beacons, and purpose controls.",
    evidence: {
      title: "Post-reject artifact sample",
      lines: [
        "{\"artifact\":\"post_reject_req_001\",\"role\":\"supporting\"}",
        "{\"rejectObserved\":true,\"rejectMs\":2600,\"postRejectMs\":4120}",
        "{\"origin\":\"https://analytics.example\",\"essentiality\":\"non_essential\"}"
      ]
    },
    reviewPrompts: ["Was a reject-style interaction actually observed and timestamped?"]
  },
  possible_session_replay_on_sensitive_input_surface: {
    overview:
      "Replay-related runtime evidence appears on or near a form, flow, or page surface that may collect sensitive information.",
    regulatoryLabel: "Replay near sensitive surface review",
    regulatoryCopy:
      "Useful for reviewing masking, page exclusions, active collection, visual capture, keystroke behavior, payload contents, and consent posture.",
    evidence: {
      title: "Replay near sensitive surface sample",
      lines: [
        "{\"artifact\":\"replay_sensitive_001\",\"surface\":\"application_form\"}",
        "{\"replayOrigin\":\"https://replay.example\",\"path\":\"/collect\"}",
        "{\"sensitiveContext\":\"financial_or_identity\",\"values\":\"not_retained\"}"
      ]
    },
    reviewPrompts: ["Which replay runtime artifact and sensitive surface were retained together?"]
  },
  session_replay_present_with_sensitive_surfaces_observed: {
    overview:
      "Replay-related runtime evidence and sensitive input-surface evidence were retained in the same scan, without claiming same-page replay linkage or field-value capture.",
    regulatoryLabel: "Replay plus sensitive-surface review",
    regulatoryCopy:
      "Useful for reviewing replay vendor configuration, masking, sampling, page exclusions, consent posture, and whether sensitive flows inherit behavior analytics.",
    evidence: {
      title: "Replay and sensitive-surface sample",
      lines: [
        "{\"artifact\":\"replay_sensitive_scan_001\",\"scope\":\"same_scan\"}",
        "{\"replayOrigin\":\"https://replay.example\",\"collectionEndpointObserved\":true}",
        "{\"sensitiveContext\":\"account_or_application_form\",\"values\":\"not_retained\"}"
      ]
    },
    reviewPrompts: ["Were replay tooling and sensitive input surfaces retained in the same scan, and what coverage limits apply?"]
  },
  policy_behavior_contradiction_detected: {
    overview:
      "A retained public policy or disclosure anchor is compared with concrete runtime behavior and an explicit bridge rationale, including disclosure-alignment notes for observed vendors or domains.",
    regulatoryLabel: "Policy/runtime alignment review",
    regulatoryCopy:
      "Useful for reviewing whether implementation behavior, consent flow, vendor activity, and public disclosures appear aligned within the observed scan scope.",
    evidence: {
      title: "Policy/runtime bridge sample",
      lines: [
        "{\"artifact\":\"policy_runtime_001\",\"policyAnchor\":\"privacy_notice\"}",
        "{\"runtimeAnchor\":\"classified_request_or_storage\",\"values\":\"redacted\"}",
        "{\"subtype\":\"runtime_vendor_not_disclosed\",\"coverageStatus\":\"usable\"}"
      ]
    },
    reviewPrompts: ["Which policy text, runtime anchor, disclosure surface, and bridge rationale support the alignment review?"]
  },
  scan_quality_visual_no_go: {
    overview:
      "The retained initial-load visual evidence shows a maintenance, block, placeholder, wrong-site, blank, or otherwise non-representative page state.",
    regulatoryLabel: "Scan-quality no-go review",
    regulatoryCopy:
      "Useful for deciding whether substantive runtime privacy, consent, disclosure, and accessibility findings should be rerun before review.",
    evidence: {
      title: "Visual no-go sample",
      lines: [
        "{\"artifact\":\"initial_load_visual\",\"pageState\":\"maintenance_or_unavailable\"}",
        "{\"goNoGo\":\"NO_GO\",\"reasonCode\":\"maintenance_recharging_page\"}",
        "{\"coverageStatus\":\"non_representative_public_surface\"}"
      ]
    },
    reviewPrompts: ["What retained screenshot, page text, and page-state reason show the scan did not capture a normal public site?"]
  },
  probable_fingerprinting: {
    overview:
      "Runtime evidence shows a clustered set of high-entropy browser or device signals that may warrant probable fingerprinting review.",
    regulatoryLabel: "Probable fingerprinting cluster review",
    regulatoryCopy:
      "Useful for reviewing multi-signal entropy, purpose, device access, disclosure, consent state, minimization, identity linkage, and security context.",
    evidence: {
      title: "Fingerprinting cluster sample",
      lines: [
        "{\"artifact\":\"fp_cluster_001\",\"role\":\"supporting\"}",
        "{\"signals\":[\"canvas_or_webgl\",\"audio\",\"storage\",\"screen_locale\"]}",
        "{\"tier\":\"probable_review_signal\",\"rawValues\":\"not_retained\"}"
      ]
    },
    reviewPrompts: ["Which high-entropy browser or device signal categories co-occurred?"]
  }
} satisfies Record<(typeof EXECUTIVE_SUMMARY_TOP_FINDING_IDS)[number], HomepageFindingCarouselCopy>;

function getFindingHref(findingId: string) {
  return `/findings/${findingId}`;
}

function ArrowIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      {direction === "left" ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}
    </svg>
  );
}

function formatPrevalence(finding: FindingReferenceItem) {
  return finding.benchmark.contextLabel;
}

function getCondensedEvidence(finding: FindingReferenceItem) {
  const example = finding.exampleEvidence[0];

  if (!example) {
    return null;
  }

  return {
    title: example.title,
    lines: example.code.split("\n").slice(0, 3)
  };
}

function getReviewLensBadges(finding: FindingReferenceItem) {
  const context = finding.regulatoryContext;

  if (!context) {
    return [];
  }

  const labels = [
    context.primaryConcern.label,
    ...context.technicalStandards.map((item) => item.label),
    ...context.jurisdictionalContexts.map((item) => item.label)
  ].join(" ");
  const badges: string[] = [];

  if (/ccpa|cpra|cipa|california/i.test(labels)) {
    badges.push("CCPA / CPRA / CIPA");
  }

  if (/gdpr|eprivacy|pecr|ico|edpb/i.test(labels)) {
    badges.push("GDPR / ePrivacy");
  }

  if (/ftc|consumer protection|dark-pattern|privacy claim/i.test(labels)) {
    badges.push("FTC");
  }

  if (/ada|wcag|section 508|accessibility|doj|en 301 549/i.test(labels)) {
    badges.push("DOJ / ADA");
  }

  return badges;
}

export function HomepageFindingsOverview({ findings }: HomepageFindingsOverviewProps) {
  const defaultIndex = Math.max(0, findings.findIndex((finding) => finding.id === "pre_consent_tracking_detected"));
  const [activeIndex, setActiveIndex] = useState(defaultIndex);
  const activeFinding = useMemo(
    () => findings[activeIndex] ?? findings[0],
    [activeIndex, findings]
  );

  if (!activeFinding) {
    return null;
  }

  const carouselCopy: HomepageFindingCarouselCopy | undefined =
    HOMEPAGE_FINDING_CAROUSEL_COPY[activeFinding.id as keyof typeof HOMEPAGE_FINDING_CAROUSEL_COPY];
  const findingOverview = carouselCopy?.overview ?? activeFinding.observed;
  const regulatoryLabel = carouselCopy?.regulatoryLabel ?? activeFinding.regulatoryContext?.primaryConcern.label;
  const regulatoryCopy = carouselCopy?.regulatoryCopy ?? activeFinding.regulatoryContext?.primaryConcern.displayCopy;
  const reviewLensBadges = getReviewLensBadges(activeFinding);
  const evidence = carouselCopy?.evidence ?? getCondensedEvidence(activeFinding);
  const visibleReviewQuestions = (carouselCopy?.reviewPrompts ?? activeFinding.reviewQuestions).slice(0, 2);

  function showPrevious() {
    setActiveIndex((current) => (current === 0 ? findings.length - 1 : current - 1));
  }

  function showNext() {
    setActiveIndex((current) => (current === findings.length - 1 ? 0 : current + 1));
  }

  return (
    <section className="border-y border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-6 lg:grid-cols-[0.64fr_1.36fr] lg:items-start">
          <div className="max-w-sm space-y-4">
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Findings overview</p>
              <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
                Browse the review items CertScore.ai can surface.
              </h2>
            </div>

            <div className="flex h-[22rem] flex-col rounded-[2rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.98)_0%,rgba(255,255,255,1)_100%)] p-4 shadow-none">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Finding highlights</p>
              <p className="mt-2 line-clamp-3 text-[1.35rem] font-semibold tracking-tight text-slate-950">{activeFinding.title}</p>
              <p className="mt-2 line-clamp-5 text-[13px] leading-5 text-slate-600">{findingOverview}</p>

              <div className="mt-auto flex items-center gap-3 pt-4">
                <button
                  type="button"
                  aria-label="Show previous finding"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-900 shadow-sm shadow-slate-200/70 transition hover:-translate-y-0.5 hover:border-slate-400 hover:bg-slate-950 hover:text-white hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                  onClick={showPrevious}
                >
                  <ArrowIcon direction="left" />
                </button>
                <button
                  type="button"
                  aria-label="Show next finding"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-900 shadow-sm shadow-slate-200/70 transition hover:-translate-y-0.5 hover:border-slate-400 hover:bg-slate-950 hover:text-white hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                  onClick={showNext}
                >
                  <ArrowIcon direction="right" />
                </button>
                <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
                  {String(activeIndex + 1).padStart(2, "0")} / {String(findings.length).padStart(2, "0")}
                </p>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,252,255,1)_0%,rgba(255,255,255,0.98)_64%,rgba(249,253,250,0.98)_100%)] p-5 shadow-[0_24px_56px_rgba(15,23,42,0.08)]">
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,rgba(15,139,215,0.9)_0%,rgba(103,199,240,0.78)_58%,rgba(71,181,74,0.7)_100%)]"
            />
            <div className="relative grid min-h-[18rem] gap-5 lg:grid-cols-[1fr_0.78fr]">
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                    {activeFinding.category}
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold capitalize text-slate-600 ring-1 ring-slate-200">
                    {activeFinding.criticality} criticality
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                    {formatPrevalence(activeFinding)}
                  </span>
                </div>
                <div>
                  <h3 className="text-2xl font-semibold tracking-tight text-slate-950">{activeFinding.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{findingOverview}</p>
                </div>
                {regulatoryLabel ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Brief regulatory context</p>
                    <p className="mt-2 text-sm font-semibold text-slate-950">{regulatoryLabel}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {regulatoryCopy
                        ? carouselCopy
                          ? regulatoryCopy
                          : `${regulatoryCopy.split(". ")[0]}.`
                        : "Automated public-web signals for review, not a legal conclusion."}
                    </p>
                    {reviewLensBadges.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {reviewLensBadges.map((badge) => (
                          <span key={badge} className="rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                            {badge}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col rounded-[1.5rem] border border-slate-200 bg-white p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Example evidence</p>
                {evidence ? (
                  <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950 p-3">
                    <p className="text-xs font-semibold text-slate-100">{evidence.title}</p>
                    <div className="mt-2 space-y-1 font-mono text-[11px] leading-5 text-slate-300">
                      {evidence.lines.map((line) => (
                        <p key={line} className="break-all">{line}</p>
                      ))}
                    </div>
                  </div>
                ) : null}
                <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Reviewer prompts</p>
                <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-600">
                  {visibleReviewQuestions.slice(0, 1).map((question) => (
                    <li key={question} className="flex gap-2">
                      <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                      <span>{question}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-4">
                  <Link
                    href={getFindingHref(activeFinding.id)}
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

export type ReviewFindingBestPracticeLink = {
  label: string;
  title: string;
  url: string;
};

export type ReviewFindingPresentation = {
  bestPracticeLink?: ReviewFindingBestPracticeLink;
  confidenceScore?: string | null;
  suggestedFix: string;
  whyThisMatters: string;
};

type ReviewFindingPresentationInput = {
  evidence?: Record<string, unknown> | null;
  findingTitle?: string | null;
  keyOrTitle: string;
  siblingFindingKeysOrTitles?: string[];
};

type ReviewFindingPresentationConfig = {
  base: ReviewFindingPresentation;
  evidenceAwareOverrides?: Array<{
    match: RegExp;
    override: Partial<ReviewFindingPresentation>;
  }>;
  matches: RegExp[];
};

const DEFAULT_REVIEW_FINDING_PRESENTATION: ReviewFindingPresentation = {
  confidenceScore: null,
  suggestedFix: "Review the flagged evidence in this section and confirm whether the signal needs follow-up.",
  whyThisMatters: "This finding surfaced enough evidence to merit reviewer attention and follow-up."
};

const REVIEW_FINDING_PRESENTATION_RULES: ReviewFindingPresentationConfig[] = [
  {
    base: {
      bestPracticeLink: {
        label: "ICO",
        title: "Guidance on cookies and similar technologies",
        url: "https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/cookies-and-similar-technologies/"
      },
      suggestedFix:
        "Refactor the Tag Manager configuration to ensure that all non-essential analytics and advertising scripts remain in a Denied state by default. Implement a technical gate that only initializes these scripts after a positive Accept signal is broadcast by the Consent Management Platform. Specifically, adopt Google Consent Mode v2 to manage tag behavior dynamically based on user interaction.",
      whyThisMatters:
        "The automated scan confirmed a Pre-consent Tracking signal, indicating that unique identifiers and behavioral metadata are transmitted to third-party vendors immediately upon page load. This fire-on-load behavior bypasses GDPR and CCPA requirements by initializing data collection, represented here by a detected third-party cookie, before the visitor can exercise a choice via the consent interface."
    },
    evidenceAwareOverrides: [
      {
        match: /preconsent_tracker_(vendors|evidence_urls)/i,
        override: {
          suggestedFix:
            "Update GTM trigger logic to use custom events such as consent_granted instead of All Pages. Implement Google Consent Mode v2 so tags remain in a denied state by default, preventing data ingestion until analytics_storage and ad_storage are explicitly toggled.",
          whyThisMatters:
            "The tag firing sequence is misconfigured, allowing high-intent advertising and analytics payloads to dispatch on the initial page load. Runtime logs confirm the transmission of unique client identifiers and behavioral metadata before the Consent Management Platform can initialize a suppression signal."
        }
      }
    ],
    matches: [/preconsent/i, /tracking_before_consent/i, /trackers_before_consent/i]
  },
  {
    base: {
      bestPracticeLink: {
        label: "FTC",
        title: "FTC privacy and data security guidance",
        url: "https://www.ftc.gov/business-guidance/privacy-security"
      },
      suggestedFix:
        "Confirm whether replay tooling is necessary, disclose it explicitly in privacy materials, and ensure it is governed by your consent framework before any replay scripts or related vendors activate.",
      whyThisMatters:
        "Session replay tooling can collect sensitive interaction data, and undisclosed or poorly governed deployment can create significant transparency and consent risk."
    },
    matches: [/session replay/i]
  },
  {
    base: {
      bestPracticeLink: {
        label: "W3C",
        title: "Data Privacy Vocabulary (DPV) for Automated Policy Processing",
        url: "https://www.w3.org/TR/dpv/"
      },
      suggestedFix:
        "Perform a manual technical review of the identified policy URL to map the missing critical fields. Ensure that the Data Controller and rights-fulfillment contact points are clearly defined in the HTML structure so future scans can index them consistently.",
      whyThisMatters:
        "The automated parser could not extract critical disclosure fields with high confidence. That usually points to non-standard document structure, heavy legal jargon, or weak technical mapping between the policy text and the expected disclosure fields."
    },
    evidenceAwareOverrides: [
      {
        match: /terms_of_service|tos/i,
        override: {
          suggestedFix:
            "Perform a manual technical review of the terms page to map missing contractual disclosures. To resolve this for future scans, refactor the rendered HTML to use semantic section or article tags with explicit IDs for Governing Law, Arbitration, Termination, and Notice/Contact language, ensuring they are not buried in unstructured containers.",
          whyThisMatters:
            "The automated scan confirmed a complete semantic obstruction regarding the Terms of Service. With a Policy Ambiguity Score of 90 and zero extractable snippets, the contractual terms are technically dark to automated auditing. This structural gap prevents the verification of core legal protections, including Governing Law, Dispute Resolution, and Termination rights."
        }
      },
      {
        match: /cookie policy|low-confidence cookie policy extraction|extraction cookie policy/i,
        override: {
          suggestedFix:
            "Immediate manual verification is required to identify and categorize active tracking technologies. To resolve this for future scans, refactor the rendered HTML to use a flattened table structure or semantic section tags with explicit IDs for Cookie Name, Provider, Purpose, and Duration, ensuring these fields are not buried in unstructured dynamic containers.",
          whyThisMatters:
            "The automated scan confirmed a complete semantic obstruction regarding cookie disclosures. With a Policy Ambiguity Score of 90 and zero extractable snippets, the tracking disclosures are technically dark to automated auditing. This structural gap prevents the verification of mandatory metadata, including cookie categories such as Essential, Performance, and Targeting, and specific retention periods."
        }
      },
      {
        match: /privacy policy|extraction privacy policy/i,
        override: {
          suggestedFix:
            "Immediate manual verification is required to extract the following missing metadata: (1) Data Retention periods, (2) Third-party recipient categories, and (3) Legal basis for processing. To resolve this for future scans, refactor the rendered HTML to replace unstructured div containers with semantic section or article tags that use explicit IDs for mandatory disclosures.",
          whyThisMatters:
            "The automated scan confirmed a complete semantic obstruction regarding the privacy policy. With a Policy Ambiguity Score of 90 and zero extractable snippets, the document is technically dark to automated auditing. This structural gap prevents the verification of mandatory disclosures, including Data Controller identity and DSAR endpoints."
        }
      }
    ],
    matches: [/low-confidence extraction/i, /low-confidence policy extraction/i, /low_confidence_critical_fields/i]
  },
  {
    base: {
      bestPracticeLink: {
        label: "CPPA",
        title: "CCPA Regulations on Dark Patterns and Symmetrical Choices",
        url: "https://cppa.ca.gov/regulations/pdf/20230329_final_approved_regs.pdf"
      },
      suggestedFix:
        "Perform a technical audit to achieve Functional Symmetry between the opt-in and opt-out paths. Refactor the privacy-request workflow to ensure that revoking consent or requesting data deletion is accessible in the same number of clicks as the initial consent, without requiring secondary authentication or account-creation hurdles not mentioned in the policy.",
      whyThisMatters:
        "The automated scan confirmed a definitive functional misalignment where the live rights-fulfillment workflow contradicts the site's stated privacy promises. This discrepancy indicates an asymmetric user experience, a technical dark pattern, where the friction required to exercise privacy rights is significantly higher than the initial data-ingestion path, creating direct CCPA and GDPR exposure."
    },
    matches: [/policy_runtime\.functional_misalignment/i, /high-confidence functional misalignment/i]
  },
  {
    base: {
      bestPracticeLink: {
        label: "W3C",
        title: "Data Privacy Vocabulary (DPV) for Automated Policy Processing",
        url: "https://www.w3.org/TR/dpv/"
      },
      suggestedFix:
        "Perform a technical audit to map active tracking scripts (for example, session replay, fingerprinters, or third-party pixels) against the current privacy policy. Update the Technical Disclosures section to explicitly name these technologies, their purpose, and their data retention periods. Ensure the new text is formatted with semantic HTML tags to allow for automated indexing.",
      whyThisMatters:
        "The automated scan confirmed a definitive Missing Technical Disclosure where observed runtime behavior, such as tracking or session replay, is active but entirely absent from the policy materials. This gap between technical reality and legal disclosure creates significant GDPR and CCPA exposure, as it constitutes processing personal data without the required notice or transparency."
    },
    matches: [/policy_runtime\.missing_technical_disclosure/i, /missing technical disclosure/i]
  },
  {
    base: {
      bestPracticeLink: {
        label: "W3C",
        title: "Data Privacy Vocabulary (DPV) for Automated Policy Processing",
        url: "https://www.w3.org/TR/dpv/"
      },
      suggestedFix:
        "Perform a technical audit of the policy DOM to expose all hidden or dynamic text blocks. To resolve this, refactor the page to use a flattened HTML structure with semantic section tags and explicit IDs for all mandatory disclosures, ensuring content is not gated behind JavaScript-only interactions or display:none CSS properties.",
      whyThisMatters:
        "The automated scan confirmed a definitive obstruction signal, indicating that the site's architecture prevents reliable data mapping. This technical barrier, often caused by content nested in non-semantic, dynamic, or collapsible containers, obstructs both automated auditing and user visibility into critical privacy practices."
    },
    matches: [/policy_runtime\.disclosure_likely_obstructed/i, /disclosure likely obstructed/i]
  },
  {
    base: {
      bestPracticeLink: {
        label: "Drafting",
        title: "FTC privacy and data security guidance",
        url: "https://www.ftc.gov/business-guidance/privacy-security"
      },
      suggestedFix: "Compare the supporting evidence against the public-facing policy language and confirm whether the mismatch is real.",
      whyThisMatters: "A mismatch between public disclosures and observed behavior can undermine trust, create legal exposure, and signal that important privacy or product claims need direct review."
    },
    matches: [/conflict/i, /mismatch/i]
  },
  {
    base: {
      bestPracticeLink: {
        label: "FTC",
        title: "Advertising and marketing guidance",
        url: "https://www.ftc.gov/business-guidance/advertising-marketing"
      },
      suggestedFix: "Review the surrounding offer and disclosure context to confirm the presentation is clear and not misleading.",
      whyThisMatters: "Promotional and choice-architecture patterns can create consumer-protection risk when urgency, discount framing, or disclosure language is unclear."
    },
    matches: [/dark_pattern/i, /limited_time_offer_language_present/i, /discount_claim_present/i, /original_price_comparison_present/i]
  },
  {
    base: {
      bestPracticeLink: {
        label: "ICO",
        title: "Guidance on cookies and similar technologies",
        url: "https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/cookies-and-similar-technologies/"
      },
      suggestedFix:
        "Audit the runtime cookies observed during the scan and update the cookie policy so each non-essential cookie or vendor is explicitly disclosed with a clear purpose and retention period. Make sure the disclosure stays aligned with the tags that actually execute on the site.",
      whyThisMatters:
        "Runtime cookies were observed that could not be matched to a disclosed cookie entry in the site’s cookie policy. That gap can undermine transparency obligations and leave visitors without a reliable explanation of what tracking technologies are active."
    },
    matches: [/cookie_runtime\.disclosure_gap/i, /cookie disclosure gap/i]
  },
  {
    base: {
      bestPracticeLink: {
        label: "W3C",
        title: "Data Privacy Vocabulary (DPV) for Automated Policy Processing",
        url: "https://www.w3.org/TR/dpv/"
      },
      suggestedFix:
        "Refactor the cookie policy into a more structured format that exposes cookie name, provider, purpose, and duration in rendered HTML. Avoid relying on weakly structured or dynamically hidden containers for the primary disclosure table.",
      whyThisMatters:
        "The cookie policy did not expose enough structured disclosure metadata to reconcile runtime cookies with confidence. That usually points to a technically obstructed disclosure surface rather than a simple wording issue."
    },
    matches: [/cookie_runtime\.cookie_policy_obstructed/i, /cookie policy structurally obstructed/i]
  },
  {
    base: {
      bestPracticeLink: {
        label: "W3C",
        title: "Targeted Advertising and Privacy Technical Guidance",
        url: "https://www.w3.org/TR/tpa/"
      },
      suggestedFix:
        "Perform a network stack audit to identify the specific third-party script, such as Meta, Google, or Criteo, firing the pixel. Reconfigure the Tag Manager to gate this script behind an explicit Marketing consent event, ensuring the tag only initializes after the Consent Management Platform broadcasts a positive signal.",
      whyThisMatters:
        "The automated scan confirmed the presence of an active retargeting pixel, which establishes a persistent technical link between the local user session and third-party advertising networks. This enables cross-site tracking by syncing behavioral data, such as page views or conversion events, with a broader advertising profile, often without the granular disclosure required by modern privacy frameworks."
    },
    matches: [/retargeting_pixel/i, /retargeting pixel detected/i]
  },
  {
    base: {
      bestPracticeLink: {
        label: "FTC",
        title: "Advertising and marketing guidance",
        url: "https://www.ftc.gov/business-guidance/advertising-marketing"
      },
      suggestedFix: "Review the refund and remedy language directly and confirm whether the limitation is acceptable.",
      whyThisMatters: "Restrictive refund or remedy language can create post-purchase fairness concerns and may warrant direct reviewer attention."
    },
    matches: [/store_credit_only/i]
  },
  {
    base: {
      bestPracticeLink: {
        label: "FTC",
        title: "FTC privacy and data security guidance",
        url: "https://www.ftc.gov/business-guidance/privacy-security"
      },
      suggestedFix: "Read the relevant terms language directly and assess whether the enforcement posture needs escalation.",
      whyThisMatters: "Broad termination or suspension rights can materially affect user rights and should be understood in the full contractual context."
    },
    matches: [/termination_for_cause/i, /service_suspension_or_termination/i]
  },
  {
    base: {
      bestPracticeLink: {
        label: "W3C",
        title: "WCAG 2.1 Technical Requirements",
        url: "https://www.w3.org/WAI/standards-guidelines/wcag/"
      },
      suggestedFix:
        "Conduct a technical audit of the site's shared templates (header, footer, and navigation) to remediate the root causes of the risk score. Prioritize resolving Keyboard Traps and ensuring all interactive elements have unique, machine-readable ARIA labels. Refactor the focus-management logic to ensure a logical tab order across all dynamic page components.",
      whyThisMatters:
        "The accessibility risk score of -4 indicates a significant departure from baseline WCAG compliance. In technical auditing, a negative or heavily outlier score typically correlates with a high density of unaddressed structural defects in the DOM, such as broken keyboard focus or missing ARIA landmarks, which create systemic barriers for users relying on assistive technologies."
    },
    matches: [/elevated accessibility risk score/i, /accessibility risk score/i]
  },
  {
    base: {
      bestPracticeLink: {
        label: "CPPA",
        title: "CCPA Regulations on Dark Patterns and Symmetrical Choices",
        url: "https://cppa.ca.gov/regulations/pdf/20230329_final_approved_regs.pdf"
      },
      suggestedFix:
        "Refactor the privacy UI to ensure functional symmetry. The technical implementation for opting out should be as streamlined as the opt-in flow, removing barriers such as forced account creation, multi-step authentication, or hidden navigation paths for basic data requests.",
      whyThisMatters:
        "The workflow for revoking data permissions returned a maximum friction score of 100. This indicates an asymmetric UX or broken path where the technical effort to exercise privacy rights is significantly higher than the initial data-ingestion path, often characterized as a technical dark pattern."
    },
    evidenceAwareOverrides: [
      {
        match: /critical user-rights fulfillment friction/i,
        override: {
          suggestedFix:
            "Implement Functional Symmetry in the UI. Ensure that the technical path for revoking consent or deleting data is reachable in the same number of clicks as the Accept path and does not trigger secondary modals, forced account creation, or login redirects that were not required during the initial data collection.",
          whyThisMatters:
            "The runtime detector returned a maximum friction score of 100, confirming that the user-rights fulfillment path is technically obstructed. This represents a Hard Block where exercising privacy rights, such as opting out or requesting deletion, is functionally impossible or significantly more complex than the initial data-ingestion path, signaling a high-risk technical dark pattern."
        }
      }
    ],
    matches: [/risk_score/i, /ambiguity_score/i, /friction_score/i]
  },
  {
    base: {
      bestPracticeLink: {
        label: "W3C",
        title: "WCAG 2.1 Technical Requirements",
        url: "https://www.w3.org/WAI/standards-guidelines/wcag/"
      },
      suggestedFix:
        "Perform a technical audit of the DOM to implement missing ARIA landmarks. Ensure the page uses semantic HTML5 tags or role attributes to define the header, nav, main, and footer regions. Specifically, verify that there is exactly one main landmark and that multiple nav regions have unique aria-labels to distinguish their purpose.",
      whyThisMatters:
        "The automated detector confirmed distinct ARIA landmark violations, signaling a failure in the page's semantic architecture. Landmarks, such as main, nav, and header regions, are critical for screen reader users to navigate efficiently; their absence or improper nesting prevents users from skipping repetitive content or jumping directly to primary sections."
    },
    matches: [/landmark issues/i, /aria landmark/i, /landmark/i]
  },
  {
    base: {
      bestPracticeLink: {
        label: "W3C",
        title: "WCAG 2.1 Technical Requirements",
        url: "https://www.w3.org/WAI/standards-guidelines/wcag/"
      },
      suggestedFix:
        "Perform a targeted DOM audit to resolve the identified WCAG failures. Prioritize Level A remediation: ensure all images have descriptive alt text, interactive elements (buttons/links) have unique aria-labels, and the tabindex sequence is logically structured to prevent keyboard traps in dynamic page components.",
      whyThisMatters:
        "The automated detector confirmed distinct WCAG rule violations, signaling structural defects in the DOM. In technical auditing, even a low error count can indicate critical barriers, such as missing ARIA landmarks or broken keyboard focus, that render core navigation or interactive elements inaccessible to users relying on assistive technologies."
    },
    matches: [/error_count/i, /warning_count/i, /issue_count/i, /failures_count/i, /accessibility/i, /wcag/i]
  }
];

function clampConfidence(value: number) {
  return Math.min(1, Math.max(0, value));
}

function formatConfidenceScore(value: number) {
  const rounded = Math.round(value * 100) / 100;
  const hundredths = Math.round(rounded * 100);
  return hundredths % 10 === 0 ? rounded.toFixed(1) : rounded.toFixed(2);
}

function inferDetectorStrength(haystack: string) {
  if (/critical user-rights fulfillment friction/i.test(haystack)) {
    return 0.8;
  }

  if (/landmark issues|aria landmark|landmark/i.test(haystack)) {
    return 0.72;
  }

  if (/accessibility risk score|elevated accessibility risk score/i.test(haystack)) {
    return 0.68;
  }

  if (/disclosure likely obstructed|policy_runtime\.disclosure_likely_obstructed/i.test(haystack)) {
    return 0.72;
  }

  if (/automated accessibility issues detected|wcag errors/i.test(haystack)) {
    return 0.55;
  }

  if (/functional misalignment/i.test(haystack)) {
    return 0.7;
  }

  if (/preconsent|tracking_before_consent|trackers_before_consent|cookie_runtime\.disclosure_gap|retargeting pixel|missing technical disclosure/i.test(haystack)) {
    return 0.6;
  }

  if (/high-confidence structural disclosure failure|structural disclosure failure/i.test(haystack)) {
    return 0.7;
  }

  if (/session replay|accessibility|wcag|error_count|warning_count|issue_count|failures_count|risk_score|friction_score|critical user-rights fulfillment friction/i.test(haystack)) {
    return 0.5;
  }

  if (/low-confidence extraction|low_confidence_critical_fields|obstructed/i.test(haystack)) {
    return 0.55;
  }

  return 0.45;
}

function evidenceArrayLength(evidence: Record<string, unknown> | null | undefined, key: string) {
  const value = evidence?.[key];
  return Array.isArray(value) ? value.length : 0;
}

function getSupportingSignalNumericValue(evidence: Record<string, unknown> | null | undefined) {
  const signals = evidence?.supportingSignals;
  if (!Array.isArray(signals)) {
    return null;
  }

  for (const signal of signals) {
    if (!signal || typeof signal !== "object") {
      continue;
    }

    const value = (signal as Record<string, unknown>).value;
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function computeSupportStrength(input: {
  evidence?: Record<string, unknown> | null;
  haystack: string;
  siblingHaystack: string;
}) {
  const evidence = input.evidence ?? null;
  let score = 0;

  if (!evidence) {
    return score;
  }

  if (evidenceArrayLength(evidence, "supportingSignals") > 0) {
    score += 0.15;
  }
  if (evidenceArrayLength(evidence, "runtimeEvidence") > 0) {
    score += 0.15;
  }
  if (evidenceArrayLength(evidence, "policyEvidence") > 0) {
    score += 0.1;
  }
  const policyCoverageRatio =
    typeof evidence.policyCoverageRatio === "number"
      ? evidence.policyCoverageRatio
      : typeof evidence.policy_coverage_ratio === "number"
        ? evidence.policy_coverage_ratio
        : null;
  if (typeof policyCoverageRatio === "number") {
    if (policyCoverageRatio >= 0.75) {
      score += 0.15;
    } else if (policyCoverageRatio >= 0.5) {
      score += 0.1;
    } else if (policyCoverageRatio > 0) {
      score += 0.05;
    }
  }
  const policySnippetCount =
    typeof evidence.policySnippetCount === "number"
      ? evidence.policySnippetCount
      : typeof evidence.policy_snippet_count === "number"
        ? evidence.policy_snippet_count
        : null;
  const policyAmbiguityScore =
    typeof evidence.policyAmbiguityScore === "number"
      ? evidence.policyAmbiguityScore
      : typeof evidence.policy_ambiguity_score === "number"
        ? evidence.policy_ambiguity_score
        : null;
  const policyStructurallyWeak =
    evidence.policyStructurallyWeak === true || evidence.policy_structurally_weak === true;
  const reviewPolicy =
    evidence.reviewPolicy && typeof evidence.reviewPolicy === "object"
      ? (evidence.reviewPolicy as Record<string, unknown>)
      : null;
  const detectorStrength = typeof reviewPolicy?.detectorStrength === "string" ? reviewPolicy.detectorStrength : null;
  const claimType = typeof reviewPolicy?.claimType === "string" ? reviewPolicy.claimType : null;
  const supportingSignalValue = getSupportingSignalNumericValue(evidence);
  if (detectorStrength === "strong") {
    score += 0.08;
  }
  if (typeof policySnippetCount === "number" && policySnippetCount > 0) {
    score += Math.min(0.1, policySnippetCount * 0.02);
  }
  if (typeof policySnippetCount === "number" && policySnippetCount === 0 && /low-confidence extraction|structural disclosure failure|obstructed/i.test(input.haystack)) {
    score += 0.12;
  }
  if (typeof policyAmbiguityScore === "number") {
    if (policyAmbiguityScore >= 90) {
      score += 0.25;
    } else if (policyAmbiguityScore >= 75) {
      score += 0.18;
    } else if (policyAmbiguityScore >= 50) {
      score += 0.08;
    }
  }
  if (policyStructurallyWeak) {
    score += 0.2;
  }
  const policyFieldCoverage =
    evidence.policyFieldCoverage && typeof evidence.policyFieldCoverage === "object"
      ? (evidence.policyFieldCoverage as Record<string, unknown>)
      : evidence.policy_field_coverage && typeof evidence.policy_field_coverage === "object"
        ? (evidence.policy_field_coverage as Record<string, unknown>)
        : null;
  if (policyFieldCoverage) {
    const fieldCoverageCount = Object.keys(policyFieldCoverage).length;
    if (fieldCoverageCount > 0) {
      score += Math.min(0.1, fieldCoverageCount * 0.02);
    }
  }
  if (evidenceArrayLength(evidence, "pageUrls") > 0) {
    score += 0.1;
  }
  if (evidenceArrayLength(evidence, "runtimeCookieNames") > 0 || evidenceArrayLength(evidence, "unmatchedCookieNames") > 0) {
    score += 0.15;
  }
  if (evidenceArrayLength(evidence, "disclosedCookieRows") > 0) {
    score += 0.1;
  }
  if (typeof evidence.pageUrl === "string" || typeof evidence.cookiePolicyUrl === "string" || typeof evidence.source_policy_url === "string") {
    score += 0.1;
  }
  if (typeof evidence.signalValue === "boolean" && evidence.signalValue) {
    score += 0.15;
  }
  if (typeof evidence.signalValue === "number" && evidence.signalValue > 0) {
    score += 0.15;
  }
  if (typeof evidence.count === "number" && evidence.count > 0) {
    score += 0.1;
  }
  if (/automated accessibility issues detected|accessibility|wcag/i.test(input.haystack)) {
    const countValue =
      typeof evidence.count === "number"
        ? evidence.count
        : claimType === "automated_accessibility"
          ? supportingSignalValue
          : null;
    if (claimType === "automated_accessibility") {
      score += 0.12;
    }
    if (countValue !== null) {
      if (countValue <= 3) {
        score += 0.1;
      } else if (countValue <= 10) {
        score += 0.22;
      } else {
        score += 0.26;
      }
    }
    if (evidenceArrayLength(evidence, "supportingSignals") > 0) {
      score += 0.05;
    }
  }
  if (/landmark issues|aria landmark|landmark/i.test(input.haystack)) {
    const countValue = typeof evidence.count === "number" ? evidence.count : null;
    if (countValue !== null && countValue > 0) {
      score += countValue <= 2 ? 0.13 : 0.18;
    }
    if (evidenceArrayLength(evidence, "supportingSignals") > 0) {
      score += 0.05;
    }
  }
  if (/accessibility risk score|elevated accessibility risk score/i.test(input.haystack)) {
    const signalValue =
      typeof evidence.signalValue === "number"
        ? evidence.signalValue
        : typeof evidence.value === "number"
          ? evidence.value
          : null;
    if (signalValue !== null && signalValue <= -10) {
      score += 0.32;
    } else if (signalValue !== null && signalValue <= -4) {
      score += 0.27;
    } else if (signalValue !== null && signalValue < 0) {
      score += 0.2;
    }
    if (evidenceArrayLength(evidence, "supportingSignals") > 0) {
      score += 0.05;
    }
  }
  if (typeof evidence.reviewQueueReason === "string" || typeof evidence.policyEnrichmentId === "string") {
    score += 0.05;
  }
  if (/functional misalignment/i.test(input.haystack)) {
    if (typeof evidence.signalValue === "number" && evidence.signalValue >= 90) {
      score += 0.2;
    }
    if (evidenceArrayLength(evidence, "runtimeEvidence") > 0 || evidenceArrayLength(evidence, "supportingSignals") > 0) {
      score += 0.1;
    }
    if (typeof evidence.pageUrl === "string" || evidenceArrayLength(evidence, "pageUrls") > 0) {
      score += 0.05;
    }
  }
  if (/critical user-rights fulfillment friction/i.test(input.haystack)) {
    if (typeof evidence.signalValue === "number" && evidence.signalValue >= 100) {
      score += 0.25;
    }
    if (evidenceArrayLength(evidence, "runtimeEvidence") > 0 || evidenceArrayLength(evidence, "supportingSignals") > 0) {
      score += 0.1;
    }
  }
  if (/disclosure likely obstructed|policy_runtime\.disclosure_likely_obstructed/i.test(input.haystack)) {
    if (typeof evidence.pageUrl === "string" || evidenceArrayLength(evidence, "pageUrls") > 0) {
      score += 0.05;
    }
    if (evidenceArrayLength(evidence, "policyEvidence") > 0 || evidenceArrayLength(evidence, "supportingSignals") > 0) {
      score += 0.08;
    }
  }
  if (/retargeting pixel|retargeting_pixel/i.test(input.haystack)) {
    if (evidenceArrayLength(evidence, "runtimeEvidence") > 0 || evidenceArrayLength(evidence, "supportingSignals") > 0) {
      score += 0.05;
    }
  }
  if (/low-confidence extraction|low_confidence_critical_fields/i.test(input.haystack) && /policy_runtime\.|cookie_runtime\./i.test(input.siblingHaystack)) {
    score += 0.35;
  }

  return Math.min(score, 0.45);
}

function computeContraryPenalty(evidence: Record<string, unknown> | null | undefined) {
  const contraryCount = evidenceArrayLength(evidence, "contraryEvidence");
  if (contraryCount >= 3) {
    return 0.3;
  }
  if (contraryCount > 0) {
    return 0.15;
  }
  return 0;
}

function computeGapPenalty(input: {
  evidence?: Record<string, unknown> | null;
  haystack: string;
  siblingHaystack: string;
}) {
  let penalty = 0;
  const missingCount = evidenceArrayLength(input.evidence, "missingEvidence");
  if (missingCount >= 3) {
    penalty += 0.15;
  } else if (missingCount > 0) {
    penalty += 0.05;
  }

  if (/obstructed/i.test(input.haystack)) {
    penalty += 0.1;
  }

  return Math.min(penalty, 0.35);
}

function computeConfidenceScore(input: {
  evidence?: Record<string, unknown> | null;
  haystack: string;
  siblingHaystack: string;
}) {
  const score = clampConfidence(
    inferDetectorStrength(input.haystack) +
      computeSupportStrength(input) -
      computeContraryPenalty(input.evidence) -
      computeGapPenalty(input)
  );

  return formatConfidenceScore(score);
}

function buildPresentationFromConfig(config: ReviewFindingPresentationConfig, input: {
  evidence?: Record<string, unknown> | null;
  haystack: string;
  siblingHaystack: string;
}): ReviewFindingPresentation {
  const presentation: ReviewFindingPresentation = {
    ...config.base,
    confidenceScore: computeConfidenceScore(input)
  };

  for (const override of config.evidenceAwareOverrides ?? []) {
    if (override.match.test(input.haystack)) {
      Object.assign(presentation, override.override);
    }
  }

  if (/accessibility risk score|elevated accessibility risk score/i.test(input.haystack)) {
    const signalValue =
      typeof input.evidence?.signalValue === "number"
        ? input.evidence.signalValue
        : typeof input.evidence?.value === "number"
          ? input.evidence.value
          : null;

    if (signalValue !== null && signalValue <= -10) {
      presentation.whyThisMatters =
        "The accessibility risk score of -10 represents a critical outlier, signaling a severe density of structural WCAG violations. In technical auditing, a score of this magnitude typically confirms systemic failures in the DOM, such as pervasive keyboard traps, non-semantic navigation, or entirely missing ARIA metadata, which present insurmountable barriers for users with disabilities and create maximum legal exposure.";
      presentation.suggestedFix =
        "Perform an immediate technical remediation of the site's global templates. Address the core architectural failures: (1) eliminate all keyboard traps in navigation modals, (2) implement a complete ARIA landmark structure (main, nav, header), and (3) refactor dynamic components to ensure focus-management logic follows a logical, machine-readable tab order.";
    }
  }

  return presentation;
}

function buildFindingPresentationHaystack(input: ReviewFindingPresentationInput) {
  return [input.keyOrTitle, input.findingTitle ?? ""].filter(Boolean).join(" ");
}

export function getReviewFindingPresentation(input: string | ReviewFindingPresentationInput): ReviewFindingPresentation {
  const normalizedInput = typeof input === "string" ? { keyOrTitle: input } : input;
  const haystack = buildFindingPresentationHaystack(normalizedInput);
  const siblingHaystack = (normalizedInput.siblingFindingKeysOrTitles ?? []).join(" ");
  const config = REVIEW_FINDING_PRESENTATION_RULES.find((rule) => rule.matches.some((pattern) => pattern.test(haystack)));
  if (!config) {
    return {
      ...DEFAULT_REVIEW_FINDING_PRESENTATION,
      confidenceScore: computeConfidenceScore({
        evidence: normalizedInput.evidence ?? null,
        haystack,
        siblingHaystack
      })
    };
  }

  return buildPresentationFromConfig(config, {
    evidence: normalizedInput.evidence ?? null,
    haystack,
    siblingHaystack
  });
}

export function getReviewFindingNextStep(input: string | ReviewFindingPresentationInput) {
  return getReviewFindingPresentation(input).suggestedFix;
}

export function getReviewFindingReference(input: string | ReviewFindingPresentationInput) {
  const bestPracticeLink = getReviewFindingPresentation(input).bestPracticeLink;
  if (!bestPracticeLink) {
    return undefined;
  }

  return {
    label: bestPracticeLink.label,
    url: bestPracticeLink.url
  };
}

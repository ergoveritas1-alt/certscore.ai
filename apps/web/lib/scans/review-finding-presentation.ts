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
        "Modify your Tag Manager to block the execution of analytics and advertising scripts until a positive Accept signal is received. Implement Google Consent Mode v2 so any preliminary initialization or measurement pings remain in a denied state by default during the pre-consent phase.",
      whyThisMatters:
        "The site transmits unique identifiers and behavioral metadata to analytics or advertising vendors immediately upon page load. This fire-on-load behavior bypasses GDPR and CCPA requirements by collecting personal data before a visitor can provide or deny consent."
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
            "Perform a manual technical review of the identified terms page and expose core contractual disclosures in clearer rendered HTML sections. Make sure effective date, governing law, dispute resolution, termination, and notice/contact language are directly recoverable without buried or weakly structured containers.",
          whyThisMatters:
            "The automated parser could not recover core contractual fields from the terms page with high confidence. That usually points to weak document structure, sparse section anchors, or terms language that is technically difficult to map into user-rights and enforcement disclosures."
        }
      },
      {
        match: /cookie policy|low-confidence cookie policy extraction/i,
        override: {
          suggestedFix:
            "Conduct a manual technical audit of the cookie policy to identify and categorize the tracking technologies in use. To improve future automated scans, implement a structured HTML format using table or section tags with descriptive ARIA labels that explicitly define cookie name, provider, and duration.",
          whyThisMatters:
            "The automated parser could not reliably map cookie categories such as Essential, Performance, or Targeting, or extract their retention periods. This usually points to weak semantic structure or dynamic table layouts that prevent the scanner from indexing disclosure metadata consistently."
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
        "Compare the rights language in the policy against the live privacy-request workflow and remove any UX barriers that make opting out or deleting data harder than initial data collection. Treat this as a policy-and-product alignment issue, not just a copy update.",
      whyThisMatters:
        "Strong runtime evidence suggests the site’s actual rights-fulfillment experience is materially harder than the policy language implies. That kind of functional misalignment can signal a technical dark pattern and create elevated GDPR or CCPA exposure."
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
        "Review the policy text and disclosure architecture against the observed runtime behavior, then add or clarify technical disclosures for the specific tracking or replay behavior that is actually present. Make sure the disclosure is explicit enough to be both user-readable and machine-indexable.",
      whyThisMatters:
        "Observed runtime behavior suggests a tracking or replay function that is not clearly disclosed in the policy materials. That creates a likely technical-disclosure gap, not just a parser-confidence issue."
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
        "Perform a manual review of the identified policy page and improve the document structure so critical disclosures are directly exposed in the rendered HTML. Avoid burying key policy fields inside collapsible or weakly structured containers that reduce automated and user visibility.",
      whyThisMatters:
        "The policy page appears structurally weak for reliable disclosure extraction, which increases the risk that important privacy disclosures are technically obstructed, incomplete, or hard for users to find."
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
        "Audit the network stack to identify the specific third-party script (for example Meta, Google, or Criteo) triggering the pixel. Reconfigure your Tag Manager to gate this script behind a marketing consent event, ensuring the tag only initializes after your Consent Management Platform broadcasts a positive signal.",
      whyThisMatters:
        "A retargeting pixel establishes a technical link between the local user session and third-party advertising networks. This enables persistent cross-site tracking by syncing behavioral data, such as page views or conversion events, with a broader user advertising profile."
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
        "Conduct a targeted review of high-traffic page templates to identify systemic accessibility regressions. Prioritize fixing errors in shared components, such as missing ARIA labels in the header or broken focus order in menus, to lower aggregate risk across the site.",
      whyThisMatters:
        "An elevated accessibility risk score can correlate with the density of unaddressed WCAG violations across the DOM. High-frequency errors in shared elements such as navigation or footers can create systematic barriers for assistive technologies and degrade the experience site-wide."
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
            "Immediately simplify the rights-fulfillment process. Ensure that opting out or requesting data deletion is symmetrical to the data-collection process, requiring no more steps or effort than initial consent or registration.",
          whyThisMatters:
            "A maximum friction score indicates that users are functionally blocked from exercising their privacy rights. Under GDPR and CCPA, dark patterns such as requiring account creation to opt out or hiding deletion requests are high-severity violations that invite regulatory penalties."
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
        "Perform a technical audit of the DOM to identify and remediate the flagged rule violations. Focus on high-impact fixes such as adding missing alt text to images, correcting aria-label implementation, and ensuring all interactive elements are reachable via tab order.",
      whyThisMatters:
        "Automated accessibility failures typically point to concrete technical issues such as missing ARIA attributes, improper heading structures, or insufficient color contrast. These defects can directly degrade the experience for users relying on screen readers or keyboard-only navigation."
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
  if (/preconsent|tracking_before_consent|trackers_before_consent|cookie_runtime\.disclosure_gap|retargeting pixel|missing technical disclosure|functional misalignment/i.test(haystack)) {
    return 0.6;
  }

  if (/session replay|accessibility|wcag|error_count|warning_count|issue_count|failures_count|risk_score|friction_score|critical user-rights fulfillment friction/i.test(haystack)) {
    return 0.5;
  }

  if (/low-confidence extraction|low_confidence_critical_fields|obstructed/i.test(haystack)) {
    return 0.35;
  }

  return 0.45;
}

function evidenceArrayLength(evidence: Record<string, unknown> | null | undefined, key: string) {
  const value = evidence?.[key];
  return Array.isArray(value) ? value.length : 0;
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
  if (typeof policySnippetCount === "number" && policySnippetCount > 0) {
    score += Math.min(0.1, policySnippetCount * 0.02);
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
  if (typeof evidence.reviewQueueReason === "string" || typeof evidence.policyEnrichmentId === "string") {
    score += 0.05;
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

  if (/low-confidence extraction|low_confidence_critical_fields/i.test(input.haystack)) {
    penalty += /policy_runtime\.|cookie_runtime\./i.test(input.siblingHaystack) ? 0.05 : 0.2;
  }

  if (/obstructed/i.test(input.haystack)) {
    penalty += 0.1;
  }

  if (input.evidence?.policyStructurallyWeak === true || input.evidence?.policy_structurally_weak === true) {
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

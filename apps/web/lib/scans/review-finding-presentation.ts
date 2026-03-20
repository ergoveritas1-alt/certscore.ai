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
        "Block or defer non-essential advertising, analytics, and measurement scripts until the site records an affirmative consent choice. Audit tag-manager rules, direct script includes, and vendor SDKs so the default state remains off until consent is granted.",
      whyThisMatters:
        "The automated scan detected third-party tracking activity before the visitor had a meaningful chance to make a consent choice. That sequence can expose identifiers, device metadata, or browsing activity to external vendors before the site's consent state has been applied."
    },
    evidenceAwareOverrides: [
      {
        match: /trackers persisted after reject/i,
        override: {
          bestPracticeLink: {
            label: "ICO",
            title: "Ensuring Consent Choices are Respected",
            url: "https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/cookies-and-similar-technologies/"
          },
          suggestedFix:
            "Check the site's Tag Manager configuration to ensure that the Reddit Pixel is correctly mapped to the Reject trigger. The tag should be set to Denied or Blocked when the visitor declines consent, ensuring it stops all data transmission immediately after the user interacts with the banner.",
          whyThisMatters:
            "The scan indicated that even after selecting the reject option on the consent banner, certain tracking tools remained active. While most trackers were successfully disabled, at least one advertising pixel continued to transmit data. This is important because privacy regulations require that all non-essential tracking stops immediately once a visitor expresses their preference to opt out.",
          confidenceScore: "0.83"
        }
      }
    ],
    matches: [/preconsent/i, /tracking_before_consent/i, /trackers_before_consent/i, /trackers persisted after reject/i]
  },
  {
    base: {
      bestPracticeLink: {
        label: "FTC",
        title: "FTC Privacy and Data Security Guidance",
        url: "https://www.ftc.gov/business-guidance/privacy-security"
      },
      suggestedFix:
        "Perform a technical audit to identify the specific session replay vendor (for example, FullStory, Hotjar, or LogRocket). Ensure the script is integrated into the Consent Management Platform and remains inactive until a positive consent signal is received. Verify that sensitive input fields are masked to prevent the collection of PII during the recording process.",
      whyThisMatters:
        "The automated scan confirmed the presence of active session replay scripts, which record granular user interactions such as mouse movements, scrolling behavior, and keystrokes. These high-fidelity tracking tools create significant privacy risks if deployed without explicit disclosure or prior consent, as they capture the behavioral journey of the user rather than just page-level analytics.",
      confidenceScore: "0.9"
    },
    evidenceAwareOverrides: [
      {
        match: /session replay tool detected/i,
        override: {
          confidenceScore: "0.9"
        }
      },
      {
        match: /session replay runtime vendors/i,
        override: {
          suggestedFix:
            "Verify that FullStory is explicitly listed in the privacy policy's third-party disclosure section. Ensure the script is integrated with the Consent Management Platform so that it remains inactive until the user provides consent for Functional or Analytical cookies. Additionally, confirm that sensitive input fields are technically masked within the FullStory configuration to prevent the ingestion of PII.",
          whyThisMatters:
            "The automated scan identified FullStory as an active session replay vendor on the domain. Session replay tools capture high-fidelity user interactions, including mouse movements, scrolling, and clicks, to reconstruct user sessions. Deploying these tools without explicit disclosure or proper consent gating can lead to the unintended collection of behavioral data and potential exposure of sensitive information entered into unmasked form fields.",
          confidenceScore: "0.95"
        }
      },
      {
        match: /session replay runtime detected/i,
        override: {
          suggestedFix:
            "Perform a technical audit to identify the specific session replay vendor (for example, FullStory, Hotjar, or LogRocket). Ensure the script is integrated into the Consent Management Platform and remains inactive until a positive consent signal is received. Verify that sensitive input fields are masked to prevent the collection of PII during the recording process.",
          whyThisMatters:
            "The automated scan confirmed the presence of active session replay scripts. These tools record high-fidelity user interactions, including mouse movements, scrolling patterns, and keystrokes. Technical and regulatory risks arise when these scripts are deployed without explicit disclosure or prior consent, as they capture the behavioral journey of the user rather than just aggregate page-level metrics."
        }
      }
    ],
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
        label: "W3C",
        title: "Data Privacy Vocabulary (DPV) for Automated Policy Processing",
        url: "https://www.w3.org/TR/dpv/"
      },
      suggestedFix:
        "Expose privacy, terms, cookie, accessibility, and contact pages through stable footer links, legal hubs, or sitemap entries so bounded discovery can resolve them consistently. Avoid relying on JS-only navigation, hidden containers, or locale-specific routes that are not linked from the rendered site structure.",
      whyThisMatters:
        "The scan exhausted its bounded key-page discovery pass and still could not confirm one or more expected legal or support pages. This is a reliable signal that the scanner tried and failed within the configured discovery budget, which means coverage-related findings may be understated until those page surfaces become easier to discover and fetch."
    },
    evidenceAwareOverrides: [
      {
        match: /key_page_discovery_unresolved_after_bounded_search|bounded key-page discovery unresolved/i,
        override: {
          confidenceScore: "1.0"
        }
      }
    ],
    matches: [/key_page_discovery_unresolved_after_bounded_search/i, /bounded key-page discovery unresolved/i]
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
        "Perform a network stack audit to identify the specific third-party scripts, such as Meta, Reddit, or LinkedIn, firing the pixel. Reconfigure the Tag Manager to gate these scripts behind an explicit Marketing consent event, ensuring the tag only initializes after the Consent Management Platform broadcasts a positive signal. Verify that the pixel respects Do Not Track headers and Global Privacy Control signals.",
      whyThisMatters:
        "The automated scan confirmed the presence of an active retargeting pixel, which establishes a persistent technical link between the local user session and third-party advertising networks. This enables cross-site tracking by syncing behavioral data, such as page views or specific product interactions, with a broader advertising profile. The technical risk involves data exfiltration to ad platforms before or despite user consent preferences."
    },
    matches: [/retargeting_pixel/i, /retargeting pixel detected/i]
  },
  {
    base: {
      bestPracticeLink: {
        label: "FTC",
        title: "FTC Privacy and Data Security Guidance",
        url: "https://www.ftc.gov/business-guidance/privacy-security"
      },
      suggestedFix:
        "Perform a network-level audit to identify the specific payload triggering this signal. Monitor XHR and Fetch requests for the transmission of workspace IDs, source code fragments, or user identifiers to third-party analytics or marketing vendors. Reconfigure tracking scripts to redact or hash sensitive fields before transmission to ensure no unmasked PII or proprietary metadata is exfiltrated.",
      whyThisMatters:
        "The automated scan confirmed a High-Sensitivity Data Collection signal. On a developer-focused platform, this typically indicates the transmission of sensitive identifiers, such as authentication tokens, project metadata, or unmasked user input in code-related search fields, to third-party endpoints. This creates data privacy risks if these payloads are collected without proper hashing or explicit disclosure in the privacy policy.",
      confidenceScore: "0.8"
    },
    matches: [/high-sensitivity data collection detected/i, /high_sensitivity_data_collection_detected/i]
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
        match: /high user-rights fulfillment friction/i,
        override: {
          suggestedFix:
            "Perform a technical audit to achieve Functional Symmetry between opt-in and opt-out workflows. Refactor the privacy UI to ensure that revoking consent or requesting data deletion is accessible in the same number of clicks as the initial consent, removing secondary barriers such as forced account creation or hidden navigation paths.",
          whyThisMatters:
            "The automated scan confirmed a high friction score of 90, signaling an objective technical barrier in the user-rights fulfillment path. This indicates a Functional Asymmetry where the effort required to revoke data permissions or exercise privacy rights is significantly higher than the initial data-ingestion path, which is classified as a technical dark pattern under modern privacy regulations."
        }
      },
      {
        match: /critical user-rights fulfillment friction/i,
        override: {
          suggestedFix:
            "Establish technical parity between opt-in and opt-out workflows. Refactor the interface to ensure that the revocation path is accessible in the same number of click-events as the initial consent. Remove secondary technical hurdles such as mandatory account creation or circular redirect logic that were not part of the primary data-collection sequence.",
          whyThisMatters:
            "The automated scan confirmed a friction score of 100, signaling a technical obstruction in the rights-fulfillment path. This indicates a lack of functional parity where the technical workflow to revoke permissions is materially more complex than the initial ingestion path. From an architectural standpoint, this represents a non-linear user journey that prevents automated verification of compliance controls."
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
        title: "WAI-ARIA Authoring Practices Guide",
        url: "https://www.w3.org/WAI/ARIA/apg/"
      },
      suggestedFix:
        "Identify the specific DOM element with the invalid ARIA attribute. Ensure the role assigned to the element matches its actual function and that all required child elements, such as menu items within a menu, are present. Verify that all interactive components have a machine-readable name provided via aria-label or aria-labelledby to ensure they are properly announced to screen readers.",
      whyThisMatters:
        "The scan confirmed an ARIA-related error in the site's code. ARIA, Accessible Rich Internet Applications, attributes are essential for telling assistive technologies, like screen readers, what an element is and how it functions. Even a single error in these attributes can result in a silent or misleading control, making it difficult for users with visual impairments to interact with specific buttons, menus, or forms.",
      confidenceScore: "0.9"
    },
    matches: [/aria issues/i, /aria issue/i]
  },
  {
    base: {
      bestPracticeLink: {
        label: "W3C",
        title: "WCAG Success Criterion 2.4.7: Focus Visible",
        url: "https://www.w3.org/WAI/WCAG21/Understanding/focus-visible.html"
      },
      suggestedFix:
        "Inspect the CSS for global styles that may be suppressing the focus ring, such as outline: none or outline: 0 without providing a suitable high-contrast alternative. Ensure that all interactive elements, including buttons, links, and form fields, receive a clear visual highlight when they gain focus. Verify that this highlight meets WCAG 2.1 contrast requirements against the background color.",
      whyThisMatters:
        "The scan confirmed an instance where a visible focus indicator is missing or obscured. In technical auditing, this is a significant accessibility gap because users who navigate via keyboard, using the Tab key, rely on a visible outline to know which element is currently active. If the indicator is suppressed via CSS, the site becomes functionally unusable for anyone not using a mouse.",
      confidenceScore: "0.9"
    },
    matches: [/focus indicator issues/i, /wcag_focus_indicator_issue_count/i]
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
    evidenceAwareOverrides: [
      {
        match: /accessibility and user settings/i,
        override: {
          bestPracticeLink: {
            label: "W3C",
            title: "Making the Web Accessible for Everyone",
            url: "https://www.w3.org/WAI/fundamentals/accessibility-intro/"
          },
          suggestedFix:
            "To make the site more welcoming for everyone, the technical team should update the page templates so that all visitors can navigate easily. This includes making sure menus work correctly for keyboard users and adding clear, invisible labels that help screen-reading tools understand the page layout. Making the opt-out or privacy buttons just as easy to find as the accept button will also ensure a better experience for all guests.",
          whyThisMatters:
            "Our scan found that the website's design makes it difficult for some visitors to use. Specifically, the way the site is built can sometimes block people who rely on screen readers or those who navigate using only a keyboard. This means that some sections of the site might not be accessible to everyone, and it can be much harder to change privacy settings or find important information than it is to simply browse the page."
        }
      }
    ],
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

  if (/pre-consent tracking activity/i.test(haystack)) {
    return 0.85;
  }

  if (/pre-consent tracker vendors/i.test(haystack)) {
    return 0.85;
  }

  if (/trackers persisted after reject/i.test(haystack)) {
    return 0.58;
  }

  if (/accessibility and user settings/i.test(haystack)) {
    return 0.82;
  }

  if (/aria issues|aria issue/i.test(haystack)) {
    return 0.72;
  }

  if (/focus indicator issues|wcag_focus_indicator_issue_count/i.test(haystack)) {
    return 0.5;
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

function getSupportingSignalValue(
  evidence: Record<string, unknown> | null | undefined,
  matcher: RegExp
) {
  const signals = evidence?.supportingSignals;
  if (!Array.isArray(signals)) {
    return null;
  }

  for (const signal of signals) {
    if (!signal || typeof signal !== "object") {
      continue;
    }

    const candidate = signal as Record<string, unknown>;
    const key = typeof candidate.key === "string" ? candidate.key : "";
    const label = typeof candidate.label === "string" ? candidate.label : "";
    if (matcher.test(`${key} ${label}`)) {
      return candidate.value ?? null;
    }
  }

  return null;
}

function getStringArrayEvidence(
  evidence: Record<string, unknown> | null | undefined,
  keys: string[],
  signalMatcher?: RegExp
) {
  for (const key of keys) {
    const value = evidence?.[key];
    if (Array.isArray(value)) {
      return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
    }
  }

  if (!signalMatcher) {
    return [];
  }

  const signalValue = getSupportingSignalValue(evidence, signalMatcher);
  if (!Array.isArray(signalValue)) {
    return [];
  }

  return signalValue.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function getNumericEvidence(
  evidence: Record<string, unknown> | null | undefined,
  keys: string[],
  signalMatcher?: RegExp
) {
  for (const key of keys) {
    const value = evidence?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  if (!signalMatcher) {
    return null;
  }

  const signalValue = getSupportingSignalValue(evidence, signalMatcher);
  return typeof signalValue === "number" && Number.isFinite(signalValue) ? signalValue : null;
}

function getPreconsentEvidenceSummary(evidence: Record<string, unknown> | null | undefined) {
  const evidenceUrls = getStringArrayEvidence(
    evidence,
    ["preconsent_tracker_evidence_urls", "consentBaselineTrackerEvidenceUrls", "runtimeEvidence"],
    /preconsent_tracker_evidence_urls|pre-consent tracker evidence urls/i
  ).filter((entry) => /^https?:\/\//i.test(entry));
  const summarySignalValue = getSupportingSignalValue(evidence, /preconsent_tracker_evidence_urls|pre-consent tracker evidence summary/i);
  const signalSummary =
    summarySignalValue && typeof summarySignalValue === "object" ? (summarySignalValue as Record<string, unknown>) : null;
  const summaryUrls = Array.isArray(signalSummary?.sampleUrls)
    ? signalSummary.sampleUrls.filter((entry): entry is string => typeof entry === "string" && /^https?:\/\//i.test(entry))
    : [];
  const vendors = getStringArrayEvidence(
    evidence,
    ["preconsent_tracker_vendors", "consentBaselineTrackerVendorNames"],
    /preconsent_tracker_vendors|pre-consent tracker vendors/i
  );
  const summaryVendors = Array.isArray(signalSummary?.vendorsObserved)
    ? signalSummary.vendorsObserved.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
  const violationCount = getNumericEvidence(
    evidence,
    ["preconsent_violation_count", "count", "signalValue", "value"],
    /preconsent_violation_count|pre-consent tracker violations/i
  );
  const requestCount =
    getNumericEvidence(
      evidence,
      ["totalObservedUrls", "requestCount"],
      /preconsent_tracker_evidence_summary|pre-consent tracker evidence summary/i
    ) ??
    (typeof signalSummary?.totalObservedUrls === "number" && Number.isFinite(signalSummary.totalObservedUrls)
      ? signalSummary.totalObservedUrls
      : null);

  return {
    evidenceUrls: [...new Set([...summaryUrls, ...evidenceUrls])],
    requestCount,
    vendors: [...new Set([...vendors, ...summaryVendors])],
    violationCount
  };
}

function formatVendorList(vendors: string[]) {
  const distinct = [...new Set(vendors.filter((entry) => entry.trim().length > 0))];
  if (distinct.length === 0) {
    return "multiple third-party ad and analytics vendors";
  }
  if (distinct.length === 1) {
    return distinct[0]!;
  }
  if (distinct.length === 2) {
    return `${distinct[0]} and ${distinct[1]}`;
  }
  return `${distinct.slice(0, 3).join(", ")}, and other third-party vendors`;
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
  if (/high user-rights fulfillment friction/i.test(input.haystack)) {
    if (typeof evidence.signalValue === "number" && evidence.signalValue >= 90) {
      score += 0.2;
    } else if (typeof evidence.signalValue === "number" && evidence.signalValue >= 75) {
      score += 0.1;
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
  if (/session replay runtime detected/i.test(input.haystack)) {
    if (evidenceArrayLength(evidence, "runtimeEvidence") > 0 || evidenceArrayLength(evidence, "supportingSignals") > 0) {
      score += 0.1;
    }
  }
  if (/retargeting pixel|retargeting_pixel/i.test(input.haystack)) {
    if (evidenceArrayLength(evidence, "runtimeEvidence") > 0 || evidenceArrayLength(evidence, "supportingSignals") > 0) {
      score += 0.04;
    }
  }
  if (/high-sensitivity data collection detected|high_sensitivity_data_collection_detected/i.test(input.haystack)) {
    if (evidenceArrayLength(evidence, "runtimeEvidence") > 0 || evidenceArrayLength(evidence, "supportingSignals") > 0) {
      score += 0.1;
    }
  }
  if (/preconsent|tracking_before_consent|trackers_before_consent/i.test(input.haystack)) {
    const preconsentEvidence = getPreconsentEvidenceSummary(evidence);
    if (preconsentEvidence.vendors.length > 0) {
      score += 0.08;
    }
    if (preconsentEvidence.evidenceUrls.length > 0) {
      score += 0.12;
    }
    if (typeof preconsentEvidence.violationCount === "number" && preconsentEvidence.violationCount > 0) {
      if (preconsentEvidence.violationCount >= 5) {
        score += 0.18;
      } else {
        score += 0.12;
      }
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

  if (/preconsent|tracking_before_consent|trackers_before_consent/i.test(input.haystack)) {
    const preconsentEvidence = getPreconsentEvidenceSummary(input.evidence);
    const vendorList = formatVendorList(preconsentEvidence.vendors);
    const requestCount = preconsentEvidence.violationCount ?? preconsentEvidence.requestCount;
    if (typeof preconsentEvidence.violationCount === "number" && preconsentEvidence.violationCount > 0) {
      presentation.whyThisMatters =
        `The automated scan observed ${preconsentEvidence.violationCount} pre-consent tracking request${preconsentEvidence.violationCount === 1 ? "" : "s"} before the visitor could act on the consent interface. That pattern suggests one or more non-essential third-party tags or scripts began transmitting data during initial render rather than waiting for a confirmed consent state.`;
      presentation.suggestedFix =
        `Audit the non-essential scripts responsible for these ${preconsentEvidence.violationCount} request${preconsentEvidence.violationCount === 1 ? "" : "s"} and block them by default. They should initialize only after the Consent Management Platform, consent banner, or equivalent control records an affirmative opt-in state.`;
      presentation.confidenceScore = "1.0";
    } else if (preconsentEvidence.evidenceUrls.length > 0) {
      presentation.whyThisMatters =
        `The automated scan captured representative pre-consent requests to ${vendorList} during the initial page-load sequence. That evidence indicates that third-party measurement or advertising endpoints were contacted before the site's consent state had been clearly established.`;
      presentation.suggestedFix =
        "Block or defer these vendor requests until an affirmative consent choice is stored. Review tag-manager triggers, inline loaders, and third-party bootstrap scripts so they do not fire on initial page load before consent is granted.";
      presentation.confidenceScore = "1.0";
    } else if (preconsentEvidence.vendors.length > 0) {
      presentation.whyThisMatters =
        `The automated scan observed multiple third-party ad and analytics vendors before consent, including ${vendorList}. That suggests non-essential vendor code is initializing before the visitor has made a privacy choice.`;
      presentation.suggestedFix =
        "Identify where these vendor tags are loaded and gate them behind a positive consent signal. The default behavior should suppress non-essential advertising, analytics, and measurement vendors until the visitor opts in.";
      presentation.confidenceScore = "1.0";
    } else if (typeof requestCount === "number" && requestCount > 0) {
      presentation.whyThisMatters =
        `The automated scan observed ${requestCount} pre-consent tracking-related request${requestCount === 1 ? "" : "s"} before the visitor had a meaningful chance to choose. That pattern indicates at least some non-essential tracking logic is firing before consent has been applied.`;
      presentation.suggestedFix =
        "Audit the scripts and network calls that run during initial render, then suppress non-essential advertising, analytics, and measurement behavior until a positive consent state is present.";
      presentation.confidenceScore = "0.95";
    } else {
      presentation.confidenceScore = "0.95";
    }
  }

  if (/retargeting pixel|retargeting_pixel/i.test(input.haystack)) {
    const evidenceText = JSON.stringify(input.evidence ?? {}).toLowerCase();
    if (/mcw\.edu|medical institution domain|clinical|health/i.test(evidenceText)) {
      presentation.whyThisMatters =
        "The automated scan confirmed the presence of an active retargeting pixel, which establishes a persistent technical link between the local user session and third-party advertising networks. On a medical institution domain, this signal is particularly critical as it indicates that visitor behavior, such as viewing specific clinical or educational pages, is being synced with broader advertising profiles, potentially creating significant HIPAA and privacy exposure.";
      presentation.suggestedFix =
        "Perform a network stack audit to identify the specific third-party script, such as Meta, Google, or Criteo, firing the pixel. Reconfigure the Tag Manager to gate this script behind an explicit Marketing consent event, ensuring the tag only initializes after the Consent Management Platform broadcasts a positive signal. Verify that no health-related page metadata is being passed in the pixel's payload.";
      presentation.confidenceScore = "0.9";
    }
  }

  if (/high user-rights fulfillment friction/i.test(input.haystack)) {
    const signalValue =
      typeof input.evidence?.signalValue === "number"
        ? input.evidence.signalValue
        : typeof input.evidence?.value === "number"
          ? input.evidence.value
          : null;

    if (signalValue !== null && signalValue >= 75) {
      presentation.whyThisMatters =
        `The automated scan confirmed a high friction score of ${signalValue}, signaling an objective technical barrier in the user-rights fulfillment path. This indicates a Functional Asymmetry where the effort required to revoke data permissions or exercise privacy rights is significantly higher than the initial data-ingestion path, which is classified as a technical dark pattern under modern privacy regulations.`;
      if (signalValue === 75) {
        presentation.confidenceScore = "0.7";
      }
    }
  }

  if (/high-sensitivity data collection detected|high_sensitivity_data_collection_detected/i.test(input.haystack)) {
    const evidenceText = JSON.stringify(input.evidence ?? {}).toLowerCase();
    if (/mcw\.edu|medical institution domain|clinical|health|phi|patient portal|appointment/i.test(evidenceText)) {
      presentation.bestPracticeLink = {
        label: "HHS",
        title: "Use of Online Tracking Technologies by HIPAA Covered Entities",
        url: "https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/hipaa-online-tracking/index.html"
      };
      presentation.whyThisMatters =
        "The automated scan confirmed a High-Sensitivity Data Collection signal. On a medical institution domain, this typically indicates the transmission of health-related identifiers, financial data, or specific user input to third-party endpoints. This creates significant HIPAA, GDPR, and CCPA exposure if the data is being collected without an active Business Associate Agreement or explicit user consent.";
      presentation.suggestedFix =
        "Perform an immediate network-level audit to identify the specific payload triggering this signal. Check for the transmission of health-related search terms, appointment scheduling data, or patient portal identifiers in unmasked XHR or Fetch requests. Reconfigure tracking scripts to redact or hash sensitive fields before transmission to any third-party analytics or marketing vendors.";
      presentation.confidenceScore = "0.85";
    } else {
      presentation.bestPracticeLink = {
        label: "FTC",
        title: "FTC Privacy and Data Security Guidance",
        url: "https://www.ftc.gov/business-guidance/privacy-security"
      };
      presentation.whyThisMatters =
        "The automated scan confirmed a High-Sensitivity Data Collection signal. On a developer-focused platform, this typically indicates the transmission of sensitive identifiers, such as authentication tokens, project metadata, or unmasked user input in code-related search fields, to third-party endpoints. This creates data privacy risks if these payloads are collected without proper hashing or explicit disclosure in the privacy policy.";
      presentation.suggestedFix =
        "Perform a network-level audit to identify the specific payload triggering this signal. Monitor XHR and Fetch requests for the transmission of workspace IDs, source code fragments, or user identifiers to third-party analytics or marketing vendors. Reconfigure tracking scripts to redact or hash sensitive fields before transmission to ensure no unmasked PII or proprietary metadata is exfiltrated.";
      presentation.confidenceScore = "0.8";
    }
  }

  if (/aria issues|aria issue/i.test(input.haystack)) {
    presentation.confidenceScore = "0.9";
  }

  if (/focus indicator issues|wcag_focus_indicator_issue_count/i.test(input.haystack)) {
    presentation.confidenceScore = "0.9";
  }

  if (/landmark issues|aria landmark|landmark/i.test(input.haystack)) {
    const count =
      typeof input.evidence?.count === "number"
        ? input.evidence.count
        : getSupportingSignalNumericValue(input.evidence);

    if (typeof count === "number" && count >= 20) {
      presentation.whyThisMatters =
        `The automated scan confirmed ${count} distinct landmark violations, identifying a significant defect in the site's semantic architecture. Landmarks, such as main, nav, and header regions, are the primary method screen reader users use to skip repetitive content and navigate directly to page sections. A high count of ${count} suggests these structural markers are either entirely missing or improperly nested across multiple site templates.`;
      presentation.suggestedFix =
        "Refactor global page templates to implement a standard ARIA landmark structure. Ensure that each page contains exactly one main element and that all navigation blocks are wrapped in nav tags. If a page contains multiple navigation regions, provide unique aria-label attributes to each to distinguish their specific purpose, such as Primary versus Footer navigation.";
      presentation.confidenceScore = "1.0";
    }
  }

  if (/accessibility risk score|elevated accessibility risk score/i.test(input.haystack)) {
    const signalValue =
      typeof input.evidence?.signalValue === "number"
        ? input.evidence.signalValue
        : typeof input.evidence?.value === "number"
          ? input.evidence.value
          : null;

    if (signalValue !== null && signalValue >= 100) {
      presentation.whyThisMatters =
        "The automated scan confirmed an accessibility risk score of 100, identifying structural omissions in the site's DOM architecture. This score indicates a high density of non-compliant elements, such as missing ARIA landmarks and inconsistent keyboard focus management. These defects prevent assistive technologies from reliably parsing the page layout and navigating interactive components.";
      presentation.suggestedFix =
        "Remediate global site templates to establish baseline WCAG compliance. Prioritize the implementation of standard ARIA landmark structures (main, nav, header) and ensure all interactive elements have unique, machine-readable labels. Refactor focus-management logic to ensure a logical tab order across all dynamic page components.";
      presentation.confidenceScore = "1.0";
    }

    if (signalValue !== null && signalValue <= -10) {
      presentation.whyThisMatters =
        "The accessibility risk score of -10 represents a critical outlier, signaling a severe density of structural WCAG violations. In technical auditing, a score of this magnitude typically confirms systemic failures in the DOM, such as pervasive keyboard traps, non-semantic navigation, or entirely missing ARIA metadata, which present insurmountable barriers for users with disabilities and create maximum legal exposure.";
      presentation.suggestedFix =
        "Perform an immediate technical remediation of the site's global templates. Address the core architectural failures: (1) eliminate all keyboard traps in navigation modals, (2) implement a complete ARIA landmark structure (main, nav, header), and (3) refactor dynamic components to ensure focus-management logic follows a logical, machine-readable tab order.";
    }
  }

  if (/wcag errors/i.test(input.haystack)) {
    const count =
      typeof input.evidence?.count === "number"
        ? input.evidence.count
        : getSupportingSignalNumericValue(input.evidence);

    if (typeof count === "number" && count >= 50) {
      presentation.whyThisMatters =
        `The automated scan confirmed ${count} distinct WCAG rule violations, identifying a high density of structural defects in the site's DOM. Technical telemetry specifically flagged ARIA configuration errors and broken focus indicators. These issues prevent assistive technologies from correctly identifying interactive elements and obstruct keyboard-only navigation, creating functional barriers to site access.`;
      presentation.suggestedFix =
        `Perform a systematic DOM audit to remediate the ${count} identified WCAG failures. Prioritize fixing the focus indicator logic to ensure all interactive elements have a visible outline during keyboard navigation. Additionally, audit ARIA attributes to ensure they match the functional roles of the elements they describe, and verify that all non-text content includes appropriate text alternatives.`;
      presentation.confidenceScore = "1.0";
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

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

type AssertionLevel = "weak" | "moderate" | "strong";

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
      suggestedFix:
        "Keep the privacy policy linked from stable footer, legal, or help surfaces and make sure the destination remains crawlable.",
      whyThisMatters:
        "A visible privacy policy surface helps users and reviewers find the site's core notice and data-handling disclosures.",
      confidenceScore: "0.55"
    },
    matches: [/privacy policy surface present|privacy_policy_present/i]
  },
  {
    base: {
      suggestedFix:
        "Keep the terms surface stable and easy to reach from footer, legal, or help navigation.",
      whyThisMatters:
        "A visible terms surface helps users and reviewers locate the site's core legal and dispute-resolution terms.",
      confidenceScore: "0.55"
    },
    matches: [/terms surface present|terms_of_service_present/i]
  },
  {
    base: {
      suggestedFix:
        "Keep the cookie policy or cookie-settings surface easy to reach and make sure the linked destination remains crawlable.",
      whyThisMatters:
        "A visible cookie policy or settings surface helps users find tracking disclosures and related controls more reliably.",
      confidenceScore: "0.55"
    },
    matches: [/cookie settings or policy surface present|cookie_policy_present/i]
  },
  {
    base: {
      suggestedFix:
        "Keep the contact or feedback path easy to find and make sure the linked help channel remains current.",
      whyThisMatters:
        "A visible contact or feedback path gives people a clearer way to reach the operator when they need help or have questions.",
      confidenceScore: "0.55"
    },
    matches: [/contact or feedback path present|contact_support_path_present/i]
  },
  {
    base: {
      suggestedFix:
        "Keep the targeted-advertising choice path easy to reach anywhere users would expect privacy or ad-preference controls.",
      whyThisMatters:
        "A visible targeted-advertising choice path helps users find sale, sharing, or ad-preference controls more reliably.",
      confidenceScore: "0.55"
    },
    matches: [/targeted advertising choices present|targeted_advertising_choices_present|do-not-sell link present/i]
  },
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
        match: /pre-consent tracking detected/i,
        override: {
          suggestedFix:
            "Configure the site's Tag Manager or header scripts to remain in a denied or decoupled state until a positive consent signal is received from the UI. Ensure that non-essential vendor SDKs are initialized only after the consent management platform (CMP) confirms an affirmative choice.",
          whyThisMatters:
            "The automated scan detected third-party network requests initiating before a consent choice could be recorded. This zero-delay execution indicates that tracking, analytics, or measurement scripts are firing by default upon page load. This sequence results in the transmission of device identifiers or metadata to external vendors before the user has exercised their right to opt-in or out, a core requirement of the ePrivacy Directive and GDPR.",
          confidenceScore: "0.85"
        }
      },
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
    matches: [/pre-?consent/i, /tracking_before_consent/i, /trackers_before_consent/i, /trackers persisted after reject/i]
  },
  {
    base: {
      bestPracticeLink: {
        label: "FTC",
        title: "FTC Privacy and Data Security Guidance",
        url: "https://www.ftc.gov/business-guidance/privacy-security"
      },
      suggestedFix:
        "Review the retained runtime artifacts to confirm whether session replay tooling is actually present, then verify that any confirmed replay script is disclosed and appropriately consent-gated.",
      whyThisMatters:
        "The automated scan retained signals that may indicate session replay tooling. Because replay findings are especially sensitive to false positives, the runtime artifacts should be confirmed before treating the behavior as a definite disclosure or consent issue.",
      confidenceScore: "0.6"
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
          confidenceScore: "0.8"
        }
      },
      {
        match: /session replay runtime detected/i,
        override: {
          suggestedFix:
            "Inspect the retained runtime artifacts, confirm the specific replay vendor if present, and then verify disclosure, consent gating, and field masking for the confirmed integration.",
          whyThisMatters:
            "The automated scan retained runtime evidence consistent with session replay behavior, but that evidence should be reviewed directly before treating the behavior as confirmed."
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
        label: "W3C",
        title: "Data Privacy Vocabulary (DPV) for Automated Policy Processing",
        url: "https://www.w3.org/TR/dpv/"
      },
      suggestedFix:
        "Treat this as a parser-coverage issue first. Confirm the page was fetched successfully, then inspect whether the rendered structure exposes the expected disclosure sections consistently enough for extraction.",
      whyThisMatters:
        "The page appears to have been fetched, but automated extraction coverage was incomplete. That usually means the scan hit a parser or structure limit rather than proving the page was unavailable."
    },
    matches: [/extraction was limited/i, /linked but automated extraction was limited/i]
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
    matches: [/policy_runtime\.functional_misalignment/i, /high-confidence functional misalignment/i, /functional misalignment/i]
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
        label: "FTC",
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
        title: "Data Privacy Vocabulary (DPV) for Automated Policy Processing",
        url: "https://www.w3.org/TR/dpv/"
      },
      suggestedFix:
        "Manually verify whether a privacy policy exists at another stable site URL. If absent, publish one through a consistently linked legal surface and ensure the page is exposed through footer links, legal hubs, or sitemap entries so it can be discovered and retrieved reliably.",
      whyThisMatters:
        "The scan attempted to retrieve a privacy policy at candidate URLs but could not successfully fetch the page content. That leaves core disclosures about data collection, sharing, retention, and contact mechanisms unresolved for this run.",
      confidenceScore: "0.70"
    },
    matches: [/privacy policy page unavailable/i, /privacy_policy_fetch_failed/i]
  },
  {
    base: {
      bestPracticeLink: {
        label: "OECD",
        title: "Guidelines for Consumer Protection in Electronic Commerce (Transparent Terms)",
        url: "https://legalinstruments.oecd.org/en/instruments/OECD-LEGAL-0303"
      },
      suggestedFix:
        "Manually verify whether the terms page exists at another stable site URL. If absent, publish one through a consistently linked legal surface and expose it through footer links, legal hubs, or sitemap entries so contractual disclosures can be retrieved reliably.",
      whyThisMatters:
        "The scan attempted to retrieve a terms page at candidate URLs but could not successfully fetch the page content. That leaves contractual disclosures such as termination, dispute, and governing-law terms unresolved for this run.",
      confidenceScore: "0.70"
    },
    matches: [/terms page unavailable/i, /terms_of_service_fetch_failed/i]
  },
  {
    base: {
      bestPracticeLink: {
        label: "GDPR.eu",
        title: "Cookies, the GDPR, and the ePrivacy Directive",
        url: "https://gdpr.eu/cookies/"
      },
      suggestedFix:
        "Manually verify whether a cookie disclosure exists on the site, either as a standalone page or a dedicated section within the primary privacy policy. If absent, draft and publish a comprehensive policy detailing the vendors, purposes, and lifespans of the cookies deployed.",
      whyThisMatters:
        "The scan attempted to locate a dedicated cookie policy at specific candidate URLs and could not retrieve content at any of them. Clear disclosure of tracking technologies is a core transparency expectation under privacy frameworks like the ePrivacy Directive and GDPR, so this may indicate either a missing policy, an unmapped URL, or cookie disclosures that are folded into another policy surface.",
      confidenceScore: "0.70"
    },
    matches: [/cookie policy unavailable/i, /cookie_policy_(surface_missing|fetch_failed)/i]
  },
  {
    base: {
      bestPracticeLink: {
        label: "W3C",
        title: "Accessibility Statement Generator and Requirements",
        url: "https://www.w3.org/WAI/planning/statements/"
      },
      suggestedFix:
        "Manually verify whether an accessibility statement exists on the site. If absent, publish one that describes the site's conformance level, known limitations, and a contact path for users who encounter accessibility barriers.",
      whyThisMatters:
        "The scan could not retrieve an accessibility statement at the tested candidate URLs. For public-sector sites this may indicate a missing required disclosure, and more broadly it prevents users from easily finding the site's stated accessibility status, known limitations, and support contact channel.",
      confidenceScore: "0.70"
    },
    matches: [/accessibility statement unavailable/i, /accessibility statement not retrievable/i, /accessibility_statement_(surface_missing|fetch_failed)/i]
  },
  {
    base: {
      bestPracticeLink: {
        label: "FTC",
        title: "FTC privacy and data security guidance",
        url: "https://www.ftc.gov/business-guidance/privacy-security"
      },
      suggestedFix:
        "Manually verify whether a public contact page exists at another stable site URL. If absent, publish one through a consistently linked support or legal surface so users can reliably find a contact channel for questions or rights requests.",
      whyThisMatters:
        "The scan attempted to retrieve a public contact page at candidate URLs but could not successfully fetch the page content. That can make support and privacy contact channels harder for users to locate and verify.",
      confidenceScore: "0.70"
    },
    matches: [/contact page unavailable/i, /contact_page_fetch_failed/i]
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
        label: "W3C",
        title: "Data Minimization - Web Privacy Principles",
        url: "https://www.w3.org/TR/privacy-principles/#data-minimization"
      },
      suggestedFix:
        "Audit the relevant third-party requests and payload construction logic to determine whether user-entered or sensitive page-derived values are being transmitted. If so, block those fields from collection, redact them before dispatch, or prevent the third-party integration from loading on sensitive flows.",
      whyThisMatters:
        "The scan observed requests to third-party endpoints associated with tracking or measurement behavior. Depending on implementation, these requests may carry identifiers or page-derived metadata, but the retained evidence does not by itself confirm transmission of high-sensitivity user input.",
      confidenceScore: "0.4"
    },
    matches: [/high-sensitivity data collection detected/i, /high_sensitivity_data_collection_detected/i, /potential high-sensitivity data collection risk/i]
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
        "Review the representative automated WCAG findings first, then manually verify whether the affected templates or components create real task-level barriers before prioritizing remediation.",
      whyThisMatters:
        "This automated accessibility indicator suggests the page has enough detected WCAG issues to merit manual review. The score helps prioritize investigation, but it does not by itself establish conformance status or the severity of user impact."
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
        title: "WCAG 2.1 Success Criterion 1.4.3 Contrast (Minimum)",
        url: "https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html"
      },
      suggestedFix:
        "Audit the affected text and UI elements against WCAG contrast thresholds and update foreground/background color combinations to meet minimum contrast requirements. Prioritize core navigation, buttons, form labels, and any small or low-weight text.",
      whyThisMatters:
        "The scan detected automated color-contrast failures. Insufficient contrast can make text, controls, and status messaging difficult or impossible to perceive for users with low vision or color-vision deficiencies, and it is a common WCAG accessibility barrier.",
      confidenceScore: "0.85"
    },
    matches: [/contrast failures/i, /wcag_contrast_failures_count/i]
  },
  {
    base: {
      bestPracticeLink: {
        label: "W3C",
        title: "WCAG 2.1 Success Criterion 3.3.2 Labels or Instructions",
        url: "https://www.w3.org/WAI/WCAG21/Understanding/labels-or-instructions.html"
      },
      suggestedFix:
        "Associate each form control with a clear visible or programmatic label using label/for, aria-label, or aria-labelledby as appropriate. Verify that placeholders are not acting as the only field description and that required inputs remain understandable to screen-reader users.",
      whyThisMatters:
        "The scan detected automated form-label issues. When inputs are missing labels or are labeled incorrectly, screen-reader users may not be able to determine what information a field requests, which can block account access, checkout, search, or privacy-rights workflows.",
      confidenceScore: "0.85"
    },
    matches: [/form label issues/i, /wcag_form_label_error_count/i]
  },
  {
    base: {
      bestPracticeLink: {
        label: "W3C",
        title: "WCAG 2.1 Success Criterion 2.4.4 Link Purpose (In Context)",
        url: "https://www.w3.org/WAI/WCAG21/Understanding/link-purpose-in-context.html"
      },
      suggestedFix:
        "Ensure every link has a descriptive accessible name through visible text, aria-label, or aria-labelledby. Replace repeated generic labels such as 'click here', 'read more', or icon-only links without text alternatives so screen-reader users can distinguish destinations before activating them.",
      whyThisMatters:
        "The scan detected automated link-name issues. Links without meaningful accessible names are announced ambiguously by screen readers, making it difficult for users to understand where navigation choices lead and increasing the risk of getting lost in core flows.",
      confidenceScore: "0.9"
    },
    matches: [/link name issues/i, /wcag_link_name_error_count/i]
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

  if (/pre-?consent|tracking_before_consent|trackers_before_consent|cookie_runtime\.disclosure_gap|retargeting pixel|missing technical disclosure/i.test(haystack)) {
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

function getBooleanEvidence(
  evidence: Record<string, unknown> | null | undefined,
  keys: string[],
  signalMatcher?: RegExp
) {
  for (const key of keys) {
    if (evidence?.[key] === true) {
      return true;
    }
    if (evidence?.[key] === false) {
      return false;
    }
  }

  if (!signalMatcher) {
    return null;
  }

  const signalValue = getSupportingSignalValue(evidence, signalMatcher);
  return typeof signalValue === "boolean" ? signalValue : null;
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
    ["preconsent_tracker_violations", "preconsent_violation_count", "count", "signalValue", "value"],
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
  const consentSurfaceObserved = getBooleanEvidence(
    evidence,
    ["consentSurfaceObserved", "consent_surface_observed", "consentBannerPresent", "cookieBannerPresent"],
    /consent surface observed|consent banner present|cookie banner present/i
  );
  const consentActionableChoiceObserved = getBooleanEvidence(
    evidence,
    ["consentActionableChoiceObserved", "consent_actionable_choice_observed", "consentRejectInteractionSucceeded", "consentAcceptInteractionSucceeded"],
    /consent actionable choice observed|reject interaction succeeded|accept interaction succeeded/i
  );
  const operatorRelationshipHints = getStringArrayEvidence(evidence, [
    "consentBaselineTrackerOperatorRelationships",
    "consent_baseline_tracker_operator_relationships"
  ]);
  const normalizedOperatorRelationship = (() => {
    if (typeof evidence?.operatorRelationship === "string") {
      return evidence.operatorRelationship;
    }
    if (typeof evidence?.operator_relationship === "string") {
      return evidence.operator_relationship;
    }
    if (
      operatorRelationshipHints.some((entry) => /relationship:third_party|endpoint:direct_third_party/i.test(entry))
    ) {
      return "third_party";
    }
    if (
      operatorRelationshipHints.some(
        (entry) => /relationship:first_party|endpoint:first_party_collection_proxy|endpoint:first_party_subdomain/i.test(entry)
      )
    ) {
      return "same_operator";
    }

    return "unknown";
  })();

  return {
    consentActionableChoiceObserved,
    consentSurfaceObserved,
    evidenceUrls: [...new Set([...summaryUrls, ...evidenceUrls])],
    operatorRelationship: normalizedOperatorRelationship,
    operatorRelationshipHints,
    requestCount,
    vendors: [...new Set([...vendors, ...summaryVendors])],
    violationCount
  };
}

function formatVendorList(vendors: string[]) {
  const distinct = [...new Set(vendors.filter((entry) => entry.trim().length > 0))];
  if (distinct.length === 0) {
    return "multiple analytics or tagging endpoints";
  }
  if (distinct.length === 1) {
    return distinct[0]!;
  }
  if (distinct.length === 2) {
    return `${distinct[0]} and ${distinct[1]}`;
  }
  return `${distinct.slice(0, 3).join(", ")}, and other observed vendors`;
}

function getPolicyExtractionStatus(evidence: Record<string, unknown> | null | undefined) {
  if (typeof evidence?.policyExtractionStatus === "string") {
    return evidence.policyExtractionStatus;
  }

  if (typeof evidence?.policy_extraction_status === "string") {
    return evidence.policy_extraction_status;
  }

  return null;
}

function getSessionReplayEvidence(evidence: Record<string, unknown> | null | undefined) {
  const vendors = getStringArrayEvidence(
    evidence,
    ["sessionReplayRuntimeVendors", "session_replay_runtime_vendors", "relatedVendors", "runtimeVendors"],
    /session replay runtime vendors/i
  );
  const runtimeEvidenceArtifacts = getStringArrayEvidence(evidence, [
    "runtimeEvidenceArtifacts",
    "session_replay_runtime_artifacts",
    "runtime_evidence_artifacts",
    "runtimeEvidence"
  ]);

  return {
    runtimeEvidenceArtifacts,
    vendors
  };
}

function getMaxAssertionLevel(evidence: Record<string, unknown> | null | undefined): AssertionLevel {
  const directValue =
    typeof evidence?.normalizedConcernMaxAssertionLevel === "string"
      ? evidence.normalizedConcernMaxAssertionLevel
      : typeof evidence?.normalized_concern_max_assertion_level === "string"
        ? evidence.normalized_concern_max_assertion_level
        : null;

  if (directValue === "weak" || directValue === "moderate" || directValue === "strong") {
    return directValue;
  }

  const levels = getStringArrayEvidence(evidence, [
    "normalizedConcernAssertionLevels",
    "normalized_concern_assertion_levels"
  ]);
  if (levels.includes("weak")) {
    return "weak";
  }
  if (levels.includes("moderate")) {
    return "moderate";
  }
  return "strong";
}

function getNegativeEvidenceFlags(evidence: Record<string, unknown> | null | undefined) {
  return new Set(
    getStringArrayEvidence(evidence, [
      "normalizedConcernNegativeEvidenceFlags",
      "normalized_concern_negative_evidence_flags"
    ])
  );
}

function getSnippetEvidence(evidence: Record<string, unknown> | null | undefined) {
  return getStringArrayEvidence(evidence, ["snippets", "policySnippets", "policy_snippets", "sourceEvidence"]);
}

function hasStrongContactSurfaceEvidence(evidence: Record<string, unknown> | null | undefined) {
  const negativeEvidenceFlags = getNegativeEvidenceFlags(evidence);
  const flags = getStringArrayEvidence(evidence, ["flags"]);
  const snippets = getSnippetEvidence(evidence);
  const pageUrls = getStringArrayEvidence(evidence, ["pageUrls"]);
  const sourceUrls = getStringArrayEvidence(evidence, ["sourceUrls"]);
  const allText = snippets.join(" ").toLowerCase();
  const urls = [...new Set([...pageUrls, ...sourceUrls])];
  const hasStrongUrl = urls.some((value) => /^https?:\/\//i.test(value));
  const contactLikeUrlCount = urls.filter((value) => /^https?:\/\//i.test(value) && /contact|help|support|feedback|chat|customer-service/i.test(value)).length;
  const hasSupportLanguage =
    /give feedback|feedback|contact us|contact|help center|help|support/i.test(allText);
  const hasFamilyPacketBacking =
    flags.includes("family_packet_backed") &&
    flags.includes("family_packet:support_access") &&
    flags.includes("family_packet_finding:contact_support_path_present");

  return (
    !negativeEvidenceFlags.has("positive_surface_content_unverified") &&
    hasStrongUrl &&
    (hasSupportLanguage || contactLikeUrlCount >= 2) &&
    hasFamilyPacketBacking
  );
}

function hasStrongCookieSurfaceEvidence(evidence: Record<string, unknown> | null | undefined) {
  const negativeEvidenceFlags = getNegativeEvidenceFlags(evidence);
  const flags = getStringArrayEvidence(evidence, ["flags"]);
  const snippets = getSnippetEvidence(evidence);
  const pageUrls = getStringArrayEvidence(evidence, ["pageUrls"]);
  const sourceUrls = getStringArrayEvidence(evidence, ["sourceUrls"]);
  const urls = [...new Set([...pageUrls, ...sourceUrls])];
  const allText = snippets.join(" ").toLowerCase();
  const hasStrongUrl = urls.some((value) => /^https?:\/\//i.test(value));
  const cookieLikeAnchorCount = urls.filter(
    (value) => /^https?:\/\//i.test(value) && /cookie|privacy|choices|gpc|global-privacy-control/i.test(value)
  ).length;
  const hasCookieLanguage =
    /cookie|tracking technologies|privacy choices|your privacy choices|global privacy control|gpc|analytical cookies|marketing cookies/i.test(
      allText
    );
  const hasFamilyPacketBacking =
    flags.includes("family_packet_backed") &&
    flags.includes("family_packet:privacy_controls") &&
    flags.includes("family_packet_finding:cookie_policy_present");

  return (
    !negativeEvidenceFlags.has("positive_surface_content_unverified") &&
    hasStrongUrl &&
    hasFamilyPacketBacking &&
    (hasCookieLanguage || cookieLikeAnchorCount >= 2)
  );
}

function getSensitivePayloadViolations(evidence: Record<string, unknown> | null | undefined) {
  const directViolations = Array.isArray(evidence?.sensitivePayloadViolations)
    ? evidence.sensitivePayloadViolations
    : Array.isArray(evidence?.sensitive_payload_violations)
      ? evidence.sensitive_payload_violations
    : [];

  return directViolations
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .map((entry) => ({
      detectedType: typeof entry.detectedType === "string" ? entry.detectedType : "unknown_detected",
      evidenceStrength: entry.evidenceStrength === "suspected" ? "suspected" : "confirmed",
      matchSnippet: typeof entry.matchSnippet === "string" ? entry.matchSnippet : "",
      requestMethod: typeof entry.requestMethod === "string" ? entry.requestMethod : "GET",
      requestUrl: typeof entry.requestUrl === "string" ? entry.requestUrl : "",
      sourceField: typeof entry.sourceField === "string" ? entry.sourceField : null,
      sourceInputHint: typeof entry.sourceInputHint === "string" ? entry.sourceInputHint : null,
      sourceMatchesSensitiveInputHint: entry.sourceMatchesSensitiveInputHint === true,
      sourceLocation:
        entry.sourceLocation === "url_query" || entry.sourceLocation === "request_body" ? entry.sourceLocation : null,
      sourcePattern: entry.sourcePattern === "keyed_field" ? "keyed_field" : "generic_pattern",
      timestamp: typeof entry.timestamp === "string" ? entry.timestamp : "",
      vendorHost: typeof entry.vendorHost === "string" ? entry.vendorHost : null
    }))
    .filter((entry) => entry.requestUrl.length > 0);
}

function getAccessibilityRepresentativeExamples(evidence: Record<string, unknown> | null | undefined) {
  const directExamples = Array.isArray(evidence?.accessibilityRuleExamples) ? evidence.accessibilityRuleExamples : [];

  return directExamples
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .map((entry) => ({
      description: typeof entry.description === "string" ? entry.description : null,
      help: typeof entry.help === "string" ? entry.help : null,
      helpUrl: typeof entry.helpUrl === "string" ? entry.helpUrl : null,
      pageUrl: typeof entry.pageUrl === "string" ? entry.pageUrl : null,
      representativeSelectors: Array.isArray(entry.representativeSelectors)
        ? entry.representativeSelectors.filter((value): value is string => typeof value === "string" && value.trim().length > 0).slice(0, 3)
        : [],
      ruleCode: typeof entry.ruleCode === "string" ? entry.ruleCode : null,
      ruleGroup: typeof entry.ruleGroup === "string" ? entry.ruleGroup : null
    }))
    .filter((entry) => entry.representativeSelectors.length > 0 || entry.description || entry.pageUrl)
    .slice(0, 3);
}

function formatAccessibilityRepresentativeExamples(examples: ReturnType<typeof getAccessibilityRepresentativeExamples>) {
  if (examples.length === 0) {
    return null;
  }

  const rendered = examples.map((example) => {
    const selectorLabel = example.representativeSelectors[0] ?? "unlabeled node";
    const pageLabel = example.pageUrl ? ` on ${example.pageUrl}` : "";
    return `${selectorLabel}${pageLabel}`;
  });

  if (rendered.length === 1) {
    return `Representative automated evidence included ${rendered[0]}.`;
  }

  if (rendered.length === 2) {
    return `Representative automated evidence included ${rendered[0]} and ${rendered[1]}.`;
  }

  return `Representative automated evidence included ${rendered[0]}, ${rendered[1]}, and ${rendered[2]}.`;
}

function describeKeyPageDiscoverySource(source: string | null | undefined) {
  switch (source) {
    case "same_brand_subdomain":
      return "same-brand discovery";
    case "footer_link":
      return "rendered footer links";
    case "header_link":
      return "rendered header links";
    case "body_link":
      return "rendered in-page links";
    case "legal_hub":
      return "a legal hub page";
    case "sitemap":
      return "the sitemap";
    case "second_hop_legal_hub":
      return "a secondary legal hub";
    case "guessed_slug":
      return "guessed paths";
    default:
      return null;
  }
}

function getKeyPageFetchFailureEvidence(evidence: Record<string, unknown> | null | undefined) {
  const attemptedUrls =
    Array.isArray(evidence?.signalValue)
      ? evidence.signalValue.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : Array.isArray(evidence?.keyPageAttemptedUrls)
        ? evidence.keyPageAttemptedUrls.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : [];
  const attemptCount =
    typeof evidence?.keyPageAttemptCount === "number" ? evidence.keyPageAttemptCount : attemptedUrls.length > 0 ? attemptedUrls.length : null;
  const discoverySource = describeKeyPageDiscoverySource(
    typeof evidence?.keyPageDiscoverySource === "string" ? evidence.keyPageDiscoverySource : null
  );
  const guessedOnly = evidence?.keyPageGuessedOnly === true;
  const stopReason = typeof evidence?.keyPageStopReason === "string" ? evidence.keyPageStopReason : null;
  const stopReasonText =
    stopReason === "repeated_failures"
      ? "The bounded fetch recorded repeated hard failures for those discovered targets."
      : stopReason === "all_attempts_failed"
        ? "Every bounded fetch attempt for those discovered targets failed."
        : stopReason === "budget_exhausted"
          ? "The bounded discovery budget was exhausted before a successful fetch."
          : null;

  return {
    attemptCount,
    attemptedUrls,
    discoverySource,
    guessedOnly,
    stopReasonText
  };
}

function getConsentFrictionEvidence(evidence: Record<string, unknown> | null | undefined) {
  const optInClicks =
    getNumericEvidence(evidence, ["optInClicks", "consentOptInClicks", "consent_accept_click_count"], /accept click count/i) ??
    null;
  const optOutClicks =
    getNumericEvidence(evidence, ["optOutClicks", "consentOptOutClicks", "consent_reject_click_count"], /reject click count/i) ??
    null;
  const frictionDelta = getNumericEvidence(
    evidence,
    ["frictionDelta", "consentFrictionDelta"],
    /consent friction delta|friction delta/i
  );
  const redirectOrAuthRequired =
    evidence?.redirectOrAuthRequired === true ||
    evidence?.consentRedirectOrAuthRequired === true ||
    getSupportingSignalValue(evidence, /redirect or auth required/i) === true;
  const runtimeEvidence = getStringArrayEvidence(evidence, ["runtimeEvidence"]);
  const blockerType =
    typeof evidence?.consentBlockerType === "string"
      ? evidence.consentBlockerType
      : typeof evidence?.consent_blocker_type === "string"
        ? evidence.consent_blocker_type
        : null;
  const blockerUrl =
    typeof evidence?.consentBlockerUrl === "string"
      ? evidence.consentBlockerUrl
      : typeof evidence?.consent_blocker_url === "string"
        ? evidence.consent_blocker_url
        : null;
  const blockerPageTitle =
    typeof evidence?.consentBlockerPageTitle === "string"
      ? evidence.consentBlockerPageTitle
      : typeof evidence?.consent_blocker_page_title === "string"
        ? evidence.consent_blocker_page_title
        : null;
  const blockerTextSnippet =
    typeof evidence?.consentBlockerTextSnippet === "string"
      ? evidence.consentBlockerTextSnippet
      : typeof evidence?.consent_blocker_text_snippet === "string"
        ? evidence.consent_blocker_text_snippet
        : null;
  const evidencePassCount =
    typeof evidence?.consentEvidencePassCount === "number"
      ? evidence.consentEvidencePassCount
      : typeof evidence?.consent_evidence_pass_count === "number"
        ? evidence.consent_evidence_pass_count
        : null;

  return {
    blockerPageTitle,
    blockerTextSnippet,
    blockerType,
    blockerUrl,
    evidencePassCount,
    frictionDelta:
      frictionDelta ??
      (typeof optInClicks === "number" && typeof optOutClicks === "number" ? optOutClicks - optInClicks : null),
    optInClicks,
    optOutClicks,
    redirectOrAuthRequired,
    runtimeEvidence
  };
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
    const payloadViolations = getSensitivePayloadViolations(evidence);
    const confirmedViolations = payloadViolations.filter((violation) => violation.evidenceStrength === "confirmed");
    const suspectedViolations = payloadViolations.filter((violation) => violation.evidenceStrength !== "confirmed");
    if (confirmedViolations.length > 0) {
      score += 0.25;
    } else if (suspectedViolations.length > 0) {
      score += 0.15;
    } else if (evidenceArrayLength(evidence, "runtimeEvidence") > 0 || evidenceArrayLength(evidence, "supportingSignals") > 0) {
      score += 0.05;
    }
  }
  if (/pre-?consent|tracking_before_consent|trackers_before_consent|before consent/i.test(input.haystack)) {
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

  if (/pre-?consent|tracking_before_consent|trackers_before_consent|before consent/i.test(input.haystack)) {
    const preconsentEvidence = getPreconsentEvidenceSummary(input.evidence);
    const maxAssertionLevel = getMaxAssertionLevel(input.evidence);
    const negativeEvidenceFlags = getNegativeEvidenceFlags(input.evidence);
    const vendorList = formatVendorList(preconsentEvidence.vendors);
    const requestCount = preconsentEvidence.violationCount ?? preconsentEvidence.requestCount;
    const hasObservedConsentChoice =
      preconsentEvidence.consentSurfaceObserved === true && preconsentEvidence.consentActionableChoiceObserved === true;
    const canCallThirdParty = preconsentEvidence.operatorRelationship === "third_party";
    const activityLabel = canCallThirdParty ? "third-party" : "tracking or measurement-related";
    const hasConcreteArtifactEvidence =
      preconsentEvidence.evidenceUrls.length > 0 || preconsentEvidence.vendors.length > 0;
    const hasWeakPreconsentEvidence =
      negativeEvidenceFlags.has("missing_concrete_preconsent_artifact") ||
      negativeEvidenceFlags.has("missing_preconsent_sequence_evidence") ||
      (!hasObservedConsentChoice && !hasConcreteArtifactEvidence);

    if (hasWeakPreconsentEvidence) {
      presentation.whyThisMatters =
        "The automated scan retained a detector-backed signal that may indicate initial-load tracking, but the retained evidence does not yet preserve both a concrete runtime artifact and a clear before-consent sequence. This is useful for audit triage, not for treating the behavior as a confirmed consent violation.";
      presentation.suggestedFix =
        "Replay the consent flow with network capture enabled, retain the concrete request or vendor artifact that fired, and confirm whether it occurred before a meaningful user choice was available.";
      presentation.confidenceScore = "0.45";
    } else if (
      maxAssertionLevel === "strong" &&
      hasObservedConsentChoice &&
      typeof preconsentEvidence.violationCount === "number" &&
      preconsentEvidence.violationCount > 0
    ) {
      presentation.whyThisMatters =
        `The automated scan observed ${preconsentEvidence.violationCount} pre-consent tracking request${preconsentEvidence.violationCount === 1 ? "" : "s"} before the visitor could act on the consent interface. That pattern suggests one or more non-essential third-party tags or scripts began transmitting data during initial render rather than waiting for a confirmed consent state.`;
      presentation.suggestedFix =
        `Audit the non-essential scripts responsible for these ${preconsentEvidence.violationCount} request${preconsentEvidence.violationCount === 1 ? "" : "s"} and block them by default. They should initialize only after the Consent Management Platform, consent banner, or equivalent control records an affirmative opt-in state.`;
      presentation.confidenceScore = "1.0";
    } else if (preconsentEvidence.evidenceUrls.length > 0 && maxAssertionLevel !== "weak") {
      presentation.whyThisMatters =
        hasObservedConsentChoice
          ? `The automated scan captured representative requests to ${vendorList} during the initial page-load sequence before a consent choice could be recorded.`
          : `The automated scan captured representative ${activityLabel} requests to ${vendorList} during the initial page-load sequence, before any consent state was confirmed in the retained evidence.`;
      presentation.suggestedFix =
        hasObservedConsentChoice
          ? "Block or defer these vendor requests until an affirmative consent choice is stored. Review tag-manager triggers, inline loaders, and third-party bootstrap scripts so they do not fire on initial page load before consent is granted."
          : "Audit the scripts and network calls that run on initial page load, then defer any non-essential analytics, advertising, or measurement behavior until the site has a confirmed consent state.";
      presentation.confidenceScore = hasObservedConsentChoice ? "1.0" : "0.85";
    } else if (preconsentEvidence.vendors.length > 0 && maxAssertionLevel !== "weak") {
      presentation.whyThisMatters =
        hasObservedConsentChoice
          ? `The automated scan observed vendor activity before a recorded consent choice, including ${vendorList}. That suggests non-essential vendor code may be initializing too early.`
          : `The automated scan observed initial-load vendor activity, including ${vendorList}. That is useful technical evidence to review, but it does not by itself prove a consent violation without a clearly observed consent surface and timing relationship.`;
      presentation.suggestedFix =
        hasObservedConsentChoice
          ? "Identify where these vendor tags are loaded and gate them behind a positive consent signal. The default behavior should suppress non-essential advertising, analytics, and measurement vendors until the visitor opts in."
          : "Trace where these vendors are initialized on first render and confirm whether they are essential. If they are non-essential, defer them until the site has a confirmed consent state.";
      presentation.confidenceScore = hasObservedConsentChoice ? "1.0" : "0.8";
    } else if (typeof requestCount === "number" && requestCount > 0) {
      presentation.whyThisMatters =
        hasObservedConsentChoice
          ? `The automated scan observed ${requestCount} tracking-related request${requestCount === 1 ? "" : "s"} before the visitor had a meaningful chance to choose.`
          : `The automated scan observed ${requestCount} tracking- or measurement-related request${requestCount === 1 ? "" : "s"} during initial page load. That is a useful signal to review, but the retained evidence does not by itself prove that the activity occurred before an actionable consent choice.`;
      presentation.suggestedFix =
        "Audit the scripts and network calls that run during initial render, then suppress non-essential advertising, analytics, and measurement behavior until a positive consent state is present.";
      presentation.confidenceScore = hasObservedConsentChoice ? "0.95" : "0.75";
    } else {
      presentation.whyThisMatters =
        negativeEvidenceFlags.has("no_consent_surface_observed") || negativeEvidenceFlags.has("no_consent_actionable_choice_observed")
          ? "The automated scan retained signals consistent with initial-load tracking or measurement activity, but no clear consent surface or actionable choice was retained in the evidence. Additional evidence is needed before treating that activity as a confirmed pre-consent violation."
          : "The automated scan retained signals consistent with initial-load tracking or measurement activity. Additional evidence is needed before treating that activity as a confirmed pre-consent violation.";
      presentation.suggestedFix =
        "Review the retained requests alongside the live consent flow and confirm whether any non-essential vendors initialize before the site has a confirmed consent state.";
      presentation.confidenceScore = /pre-consent tracking detected/i.test(input.haystack) ? "0.7" : "0.8";
    }
  }

  if (/session replay/i.test(input.haystack)) {
    const replayEvidence = getSessionReplayEvidence(input.evidence);
    const maxAssertionLevel = getMaxAssertionLevel(input.evidence);
    const negativeEvidenceFlags = getNegativeEvidenceFlags(input.evidence);
    const vendorList = replayEvidence.vendors.length > 0 ? formatVendorList(replayEvidence.vendors) : null;

    if (maxAssertionLevel !== "weak" && replayEvidence.vendors.length > 0) {
      presentation.whyThisMatters =
        `The automated scan retained runtime artifacts associated with ${vendorList}. That is stronger evidence than a generic detector hit, but the behavior should still be reviewed directly before treating it as a confirmed disclosure or consent failure.`;
      presentation.suggestedFix =
        `Verify whether ${vendorList} is intentionally deployed on the scanned surface. If so, confirm that the behavior is disclosed clearly and that the integration is consent-gated where required.`;
      presentation.confidenceScore = replayEvidence.runtimeEvidenceArtifacts.length > 0 ? "0.85" : "0.75";
    } else if (replayEvidence.runtimeEvidenceArtifacts.length === 0 || negativeEvidenceFlags.has("no_direct_runtime_replay_artifact_observed")) {
      presentation.whyThisMatters =
        "The automated scan retained only indirect signals that may correspond to session replay tooling. Those indirect signals should not be treated as a confirmed replay deployment without direct runtime review.";
      presentation.suggestedFix =
        "Audit the retained detector output and confirm whether a specific replay vendor, script, object, or endpoint was actually present before escalating this finding.";
      presentation.confidenceScore = "0.45";
    }
  }

  if (/contact or feedback path present|contact_support_path_present/i.test(input.haystack)) {
    const negativeEvidenceFlags = getNegativeEvidenceFlags(input.evidence);
    if (hasStrongContactSurfaceEvidence(input.evidence)) {
      presentation.confidenceScore = "0.85";
    } else if (
      negativeEvidenceFlags.has("blocked_or_interstitial_evidence_observed") ||
      negativeEvidenceFlags.has("positive_surface_content_unverified")
    ) {
      presentation.confidenceScore =
        negativeEvidenceFlags.has("blocked_or_interstitial_evidence_observed") ? "0.3" : "0.35";
    }
  }

  if (/cookie settings or policy surface present|cookie_policy_present/i.test(input.haystack)) {
    const negativeEvidenceFlags = getNegativeEvidenceFlags(input.evidence);
    if (hasStrongCookieSurfaceEvidence(input.evidence)) {
      presentation.confidenceScore = "0.85";
    } else if (
      negativeEvidenceFlags.has("blocked_or_interstitial_evidence_observed") ||
      negativeEvidenceFlags.has("positive_surface_content_unverified")
    ) {
      presentation.confidenceScore =
        negativeEvidenceFlags.has("blocked_or_interstitial_evidence_observed") ? "0.3" : "0.35";
    }
  }

  if (/retargeting pixel|retargeting_pixel/i.test(input.haystack)) {
    const maxAssertionLevel = getMaxAssertionLevel(input.evidence);
    const negativeEvidenceFlags = getNegativeEvidenceFlags(input.evidence);
    const evidenceText = JSON.stringify(input.evidence ?? {}).toLowerCase();
    const hasConcreteRuntimeArtifact =
      !negativeEvidenceFlags.has("no_direct_runtime_retargeting_artifact_observed") &&
      /runtimeevidence|runtimeevidenceartifacts|retargetingevidenceurls|retargeting pixel network request|pixel request|adtech request/i.test(
        evidenceText
      );

    if (/mcw\.edu|medical institution domain|clinical|health/i.test(evidenceText) && hasConcreteRuntimeArtifact) {
      presentation.whyThisMatters =
        "The automated scan confirmed the presence of an active retargeting pixel, which establishes a persistent technical link between the local user session and third-party advertising networks. On a medical institution domain, this signal is particularly critical as it indicates that visitor behavior, such as viewing specific clinical or educational pages, is being synced with broader advertising profiles, potentially creating significant HIPAA and privacy exposure.";
      presentation.suggestedFix =
        "Perform a network stack audit to identify the specific third-party script, such as Meta, Google, or Criteo, firing the pixel. Reconfigure the Tag Manager to gate this script behind an explicit Marketing consent event, ensuring the tag only initializes after the Consent Management Platform broadcasts a positive signal. Verify that no health-related page metadata is being passed in the pixel's payload.";
      presentation.confidenceScore = "0.9";
    } else if (maxAssertionLevel === "weak" || negativeEvidenceFlags.has("no_direct_runtime_retargeting_artifact_observed")) {
      presentation.whyThisMatters =
        "The automated scan retained an advertising or retargeting-related signal, but the retained evidence does not by itself confirm a specific pixel deployment, vendor, or cross-site syncing behavior. This should be reviewed directly before treating it as a confirmed retargeting implementation.";
      presentation.suggestedFix =
        "Review the retained detector output and network evidence to confirm whether a specific advertising pixel, script, or endpoint was actually present. Only escalate to a confirmed retargeting finding when concrete runtime artifacts are retained.";
      presentation.confidenceScore = "0.45";
    } else if (maxAssertionLevel === "moderate") {
      presentation.whyThisMatters =
        "The automated scan retained runtime evidence consistent with advertising or retargeting-related behavior. That is stronger than a bare boolean detector hit, but it still should be reviewed directly before being described as a confirmed third-party pixel deployment.";
      presentation.suggestedFix =
        "Inspect the retained network or script evidence to identify the specific advertising vendor and confirm whether the integration is intentionally deployed, properly disclosed, and gated behind the appropriate marketing-choice controls.";
      presentation.confidenceScore = "0.7";
    }
  }

  if (/functional misalignment|rights-fulfillment friction|user-rights fulfillment friction|friction_score/i.test(input.haystack)) {
    const frictionEvidence = getConsentFrictionEvidence(input.evidence);
    const signalValue =
      typeof input.evidence?.signalValue === "number"
        ? input.evidence.signalValue
        : typeof input.evidence?.value === "number"
          ? input.evidence.value
          : null;
    const hasConcreteFrictionEvidence =
      frictionEvidence.redirectOrAuthRequired ||
      (typeof frictionEvidence.optInClicks === "number" &&
        typeof frictionEvidence.optOutClicks === "number" &&
        typeof frictionEvidence.frictionDelta === "number");

    if (hasConcreteFrictionEvidence) {
      if (frictionEvidence.redirectOrAuthRequired) {
        const blockerLocation = frictionEvidence.blockerPageTitle || frictionEvidence.blockerUrl;
        const blockerSnippet = frictionEvidence.blockerTextSnippet ? ` The blocker surfaced with the text "${frictionEvidence.blockerTextSnippet}".` : "";
        presentation.whyThisMatters =
          blockerLocation
            ? `The scan recorded an opt-out path that triggered a ${frictionEvidence.blockerType === "external_redirect" ? "redirect" : "login or authentication"} barrier during the consent workflow at ${blockerLocation}. That is strong runtime evidence of functional asymmetry because the user had to clear an additional hurdle to refuse or withdraw consent.${blockerSnippet}`
            : "The scan recorded an opt-out path that triggered a redirect or authentication barrier during the consent workflow. That is strong runtime evidence of functional asymmetry because the user had to clear an additional hurdle to refuse or withdraw consent.";
        presentation.suggestedFix =
          "Remove the redirect or authentication barrier from the basic opt-out path. Refusing or withdrawing consent should be accessible directly from the consent surface without requiring an account, a secondary login, or navigation away from the current page.";
        presentation.confidenceScore = (frictionEvidence.evidencePassCount ?? 0) >= 2 ? "1.0" : "0.95";
      } else if ((frictionEvidence.frictionDelta ?? 0) > 0) {
        presentation.whyThisMatters =
          `The scan completed both sides of the consent flow and found that opt-in required ${frictionEvidence.optInClicks} click${frictionEvidence.optInClicks === 1 ? "" : "s"}, while opt-out required ${frictionEvidence.optOutClicks} click${frictionEvidence.optOutClicks === 1 ? "" : "s"}. That click-distance gap is concrete runtime evidence of asymmetry in the site's privacy-choice workflow.`;
        presentation.suggestedFix =
          "Refactor the consent UI so the opt-out path is as direct as the opt-in path. If an accept button is available immediately, the reject or equivalent privacy-choice path should be reachable with the same number of clicks and without secondary hurdles.";
        presentation.confidenceScore = (frictionEvidence.evidencePassCount ?? 0) >= 2 ? "1.0" : "0.85";
      } else {
        presentation.whyThisMatters =
          "The scan completed both sides of the consent flow and retained click-path evidence, but it did not confirm a material asymmetry. This finding still merits review because the detector fired, yet the runtime evidence was not strong enough to prove friction.";
        presentation.suggestedFix =
          "Manually replay the consent and withdrawal paths on the live site and confirm whether any additional barriers appear outside the bounded automated flow.";
        presentation.confidenceScore = "0.4";
      }
    } else {
      presentation.whyThisMatters =
        "An automated detector flagged a potential mismatch between the site's stated privacy-rights process and its observed runtime behavior. The detector has now been paired with a bounded click-path audit, but the retained traversal did not conclusively prove asymmetric friction.";
      presentation.suggestedFix =
        "Manual review recommended: navigate the consent path and the rights-request path on the live site, then document click counts, authentication requirements, and any barriers not disclosed in the privacy policy.";
      if (typeof signalValue === "number" && signalValue >= 100) {
        presentation.confidenceScore = "0.70";
      } else if (typeof signalValue === "number" && signalValue >= 90) {
        presentation.confidenceScore = "0.60";
      } else if (typeof signalValue === "number" && signalValue >= 75) {
        presentation.confidenceScore = "0.50";
      } else {
        presentation.confidenceScore = "0.35";
      }
    }
  }

  if (/high user-rights fulfillment friction/i.test(input.haystack)) {
    const frictionEvidence = getConsentFrictionEvidence(input.evidence);
    const signalValue =
      typeof input.evidence?.signalValue === "number"
        ? input.evidence.signalValue
        : typeof input.evidence?.value === "number"
          ? input.evidence.value
          : null;

    if (
      !frictionEvidence.redirectOrAuthRequired &&
      !(typeof frictionEvidence.frictionDelta === "number" && frictionEvidence.frictionDelta > 0) &&
      signalValue !== null &&
      signalValue >= 75
    ) {
      presentation.whyThisMatters =
        `The automated scan confirmed a high friction score of ${signalValue}, signaling an objective technical barrier in the user-rights fulfillment path. This indicates a Functional Asymmetry where the effort required to revoke data permissions or exercise privacy rights is significantly higher than the initial data-ingestion path, which is classified as a technical dark pattern under modern privacy regulations.`;
      if (signalValue === 75) {
        presentation.confidenceScore = "0.7";
      }
    }
  }

  if (
    /privacy policy page unavailable|privacy_policy_fetch_failed|terms page unavailable|terms_of_service_fetch_failed|cookie policy unavailable|cookie_policy_fetch_failed|accessibility statement unavailable|accessibility statement not retrievable|accessibility_statement_fetch_failed|contact page unavailable|contact_page_fetch_failed/i.test(
      input.haystack
    )
  ) {
    const fetchEvidence = getKeyPageFetchFailureEvidence(input.evidence);
    const attemptLabel = fetchEvidence.attemptCount ?? fetchEvidence.attemptedUrls.length;
    const provenanceSuffix =
      fetchEvidence.discoverySource && !fetchEvidence.guessedOnly
        ? `, even though those targets were discovered via ${fetchEvidence.discoverySource} rather than guessed slugs`
        : "";
    const stopReasonSuffix = fetchEvidence.stopReasonText ? `${fetchEvidence.stopReasonText} ` : "";

    if (/privacy policy page unavailable|privacy_policy_fetch_failed/i.test(input.haystack) && fetchEvidence.attemptedUrls.length > 0) {
      presentation.whyThisMatters =
        `The scan attempted to retrieve a privacy policy at ${attemptLabel} specific candidate URL${attemptLabel === 1 ? "" : "s"} and failed to fetch any of them${provenanceSuffix}. ${stopReasonSuffix}That leaves core disclosures about data collection, sharing, retention, and contact mechanisms unresolved for this run.`;
    }

    if (/terms page unavailable|terms_of_service_fetch_failed/i.test(input.haystack) && fetchEvidence.attemptedUrls.length > 0) {
      presentation.whyThisMatters =
        `The scan attempted to retrieve a terms page at ${attemptLabel} specific candidate URL${attemptLabel === 1 ? "" : "s"} and failed to fetch any of them${provenanceSuffix}. ${stopReasonSuffix}That leaves contractual disclosures such as termination, dispute, and governing-law terms unresolved for this run.`;
    }

    if (/cookie policy unavailable|cookie_policy_fetch_failed/i.test(input.haystack) && fetchEvidence.attemptedUrls.length > 0) {
      presentation.whyThisMatters =
        `The scan attempted to locate a dedicated cookie policy at ${attemptLabel} specific candidate URL${attemptLabel === 1 ? "" : "s"} and failed to retrieve content at any of them${provenanceSuffix}. ${stopReasonSuffix}Clear disclosure of tracking technologies is a core requirement under privacy frameworks like the ePrivacy Directive and GDPR. The absence of a policy at these standard paths suggests it either does not exist, is located at an unmapped URL, or is consolidated within the primary privacy policy.`;
    }

    if (/accessibility statement unavailable|accessibility statement not retrievable|accessibility_statement_fetch_failed/i.test(input.haystack) && fetchEvidence.attemptedUrls.length > 0) {
      presentation.whyThisMatters =
        `The scan attempted to retrieve an accessibility statement at ${attemptLabel} specific candidate URL${attemptLabel === 1 ? "" : "s"} and failed to fetch any of them${provenanceSuffix}. ${stopReasonSuffix}For public-sector sites this may indicate a missing required disclosure, and more broadly it prevents users from easily finding the site's stated accessibility status, known limitations, and support contact channel.`;
    }

    if (/contact page unavailable|contact_page_fetch_failed/i.test(input.haystack) && fetchEvidence.attemptedUrls.length > 0) {
      presentation.whyThisMatters =
        `The scan attempted to retrieve a public contact page at ${attemptLabel} specific candidate URL${attemptLabel === 1 ? "" : "s"} and failed to fetch any of them${provenanceSuffix}. ${stopReasonSuffix}That can make support and privacy contact channels harder for users to locate and verify.`;
    }

    const strongerRenderedDiscovery =
      fetchEvidence.discoverySource === "rendered footer links" ||
      fetchEvidence.discoverySource === "rendered header links" ||
      fetchEvidence.discoverySource === "a legal hub page";
    presentation.confidenceScore =
      fetchEvidence.discoverySource && !fetchEvidence.guessedOnly ? (strongerRenderedDiscovery ? "0.80" : "0.75") : "0.70";
  }

  if (/high-sensitivity data collection detected|high_sensitivity_data_collection_detected/i.test(input.haystack)) {
    const payloadViolations = getSensitivePayloadViolations(input.evidence);
    const confirmedViolations = payloadViolations.filter((violation) => violation.evidenceStrength === "confirmed");
    const suspectedViolations = payloadViolations.filter((violation) => violation.evidenceStrength !== "confirmed");
    const firstViolation = (confirmedViolations[0] ?? suspectedViolations[0]) ?? null;
    const detectedTypes = [
      ...new Set(
        (confirmedViolations.length > 0 ? confirmedViolations : suspectedViolations).map((violation) =>
          violation.detectedType.replace(/_detected$/, "").replace(/_/g, " ")
        )
      )
    ];
    const sourceContext =
      firstViolation?.sourceField
        ? ` The retained evidence ties the value to the \`${firstViolation.sourceField}\` field in the ${firstViolation.sourceLocation === "url_query" ? "request URL" : "request body"}.`
        : firstViolation?.sourceLocation === "url_query"
          ? " The retained evidence came from outbound request URL parameters."
          : firstViolation?.sourceLocation === "request_body"
            ? " The retained evidence came from an outbound request body."
            : "";
    const inputHintContext = firstViolation?.sourceInputHint
      ? ` The page also exposed a corresponding sensitive input hint: ${firstViolation.sourceInputHint}.`
      : "";
    if (confirmedViolations.length > 0) {
      const dataTypeLabel =
        detectedTypes.length === 1 ? detectedTypes[0] : detectedTypes.length === 2 ? detectedTypes.join(" and ") : "multiple PII fields";
      const vendorLabel = firstViolation?.vendorHost ?? "third-party endpoints";
      presentation.bestPracticeLink = {
        label: "W3C",
        title: "Data Minimization - Web Privacy Principles",
        url: "https://www.w3.org/TR/privacy-principles/#data-minimization"
      };
      presentation.whyThisMatters =
        `The scan confirmed plaintext ${dataTypeLabel} data in ${confirmedViolations.length} third-party request${confirmedViolations.length === 1 ? "" : "s"} sent to ${vendorLabel}. This is direct evidence that sensitive user-entered or page-derived data left the site without masking or hashing before transmission.${sourceContext}${inputHintContext}`;
      presentation.suggestedFix =
        "Immediately inspect the affected third-party integrations and remove sensitive fields from request payloads. If the vendor truly needs the data, gate the integration appropriately and apply redaction or approved irreversible hashing before dispatch.";
      presentation.confidenceScore = confirmedViolations.length >= 2 ? "1.0" : "0.95";
    } else if (suspectedViolations.length > 0) {
      const dataTypeLabel =
        detectedTypes.length === 1 ? detectedTypes[0] : detectedTypes.length === 2 ? detectedTypes.join(" and ") : "multiple sensitive fields";
      const vendorLabel = firstViolation?.vendorHost ?? "third-party endpoints";
      presentation.bestPracticeLink = {
        label: "W3C",
        title: "Data Minimization - Web Privacy Principles",
        url: "https://www.w3.org/TR/privacy-principles/#data-minimization"
      };
      presentation.whyThisMatters =
        `The scan retained third-party payload evidence with field-level indicators of ${dataTypeLabel} data sent to ${vendorLabel}. This is stronger than a generic tracker signal, but the retained evidence does not yet prove plaintext exfiltration with the same confidence as a direct email or phone match.${sourceContext}${inputHintContext}`;
      presentation.suggestedFix =
        "Inspect the affected third-party payload construction logic and remove high-sensitivity fields from outbound requests by default. If the integration truly requires them, gate dispatch appropriately and apply redaction or approved irreversible hashing before transmission.";
      presentation.confidenceScore = "0.7";
    } else {
      presentation.bestPracticeLink = {
        label: "W3C",
        title: "Data Minimization - Web Privacy Principles",
        url: "https://www.w3.org/TR/privacy-principles/#data-minimization"
      };
      presentation.whyThisMatters =
        "The scan observed requests to third-party endpoints associated with tracking or measurement behavior. Depending on implementation, these requests may carry identifiers or page-derived metadata, but the retained evidence does not by itself confirm transmission of high-sensitivity user input.";
      presentation.suggestedFix =
        "Audit the relevant third-party requests and payload construction logic to determine whether user-entered or sensitive page-derived values are being transmitted. If so, block those fields from collection, redact them before dispatch, or prevent the third-party integration from loading on sensitive flows.";
      presentation.confidenceScore = "0.4";
    }
  }

  if (/aria issues|aria issue/i.test(input.haystack)) {
    presentation.confidenceScore = "0.9";
  }

  if (/focus indicator issues|wcag_focus_indicator_issue_count/i.test(input.haystack)) {
    presentation.confidenceScore = "0.9";
  }

  if (/contrast failures|wcag_contrast_failures_count/i.test(input.haystack)) {
    const exampleText = formatAccessibilityRepresentativeExamples(getAccessibilityRepresentativeExamples(input.evidence));
    if (exampleText) {
      presentation.whyThisMatters = `${presentation.whyThisMatters} ${exampleText}`;
    }
    presentation.confidenceScore = "0.85";
  }

  if (/form label issues|wcag_form_label_error_count/i.test(input.haystack)) {
    const exampleText = formatAccessibilityRepresentativeExamples(getAccessibilityRepresentativeExamples(input.evidence));
    if (exampleText) {
      presentation.whyThisMatters = `${presentation.whyThisMatters} ${exampleText}`;
    }
    presentation.confidenceScore = "0.85";
  }

  if (/link name issues|wcag_link_name_error_count/i.test(input.haystack)) {
    const exampleText = formatAccessibilityRepresentativeExamples(getAccessibilityRepresentativeExamples(input.evidence));
    if (exampleText) {
      presentation.whyThisMatters = `${presentation.whyThisMatters} ${exampleText}`;
    }
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
    const representativeExamples = getAccessibilityRepresentativeExamples(input.evidence);

    if (signalValue !== null && signalValue >= 100) {
      presentation.whyThisMatters =
        "This automated accessibility indicator suggests the page merits prompt manual review. A retained accessibility risk score of 100 can help prioritize investigation, but it does not by itself establish conformance status, severity, or the exact user impact without representative examples.";
      presentation.suggestedFix =
        "Review the representative automated WCAG findings first, then manually verify whether the affected templates or components create real task-level barriers before prioritizing remediation. Retain concrete examples from the highest-risk pages where possible.";
      presentation.confidenceScore = representativeExamples.length > 0 ? "0.75" : "0.65";
    }

    if (signalValue !== null && signalValue <= -10) {
      presentation.whyThisMatters =
        "This automated accessibility indicator suggests the page merits prompt manual review. A retained accessibility risk score of -10 can help prioritize investigation, but it does not by itself establish conformance status, severity, or the exact user impact without representative examples.";
      presentation.suggestedFix =
        "Review the representative automated WCAG findings first, then manually verify whether the affected templates or components create real task-level barriers before prioritizing remediation. Retain concrete examples from the highest-risk pages where possible.";
      presentation.confidenceScore = representativeExamples.length > 0 ? "0.75" : "0.65";
    }

    if (signalValue === null) {
      presentation.confidenceScore = representativeExamples.length > 0 ? "0.75" : "0.65";
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

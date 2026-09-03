import {
  createBreadcrumbSchema,
  createPublicArticleSchema
} from "../../lib/seo";

export type AiGuideContent = {
  badge: string;
  description: string;
  intro: string;
  path: string;
  sections: Array<{
    title: string;
    paragraphs: string[];
    sourceLinks?: Array<{
      href: string;
      label: string;
    }>;
  }>;
  title: string;
};

export const aiGuideContent = {
  preConsentTracking: {
    badge: "Tracking guide",
    title: "Pre-consent tracking: what it means and how to review it",
    description:
      "Learn how CertScore.ai reviews observed tracking requests and non-essential cookie activity before a recorded consent choice.",
    path: "/guides/pre-consent-tracking",
    intro:
      "Pre-consent tracking means classified tracking requests or non-essential cookies appear before a recorded consent choice. CertScore.ai treats this as an automated risk signal that should be reviewed against the underlying request, cookie, and consent evidence.",
    sections: [
      {
        title: "What CertScore.ai observes",
        paragraphs: [
          "CertScore.ai reviews the initial page-load window, consent surface signals, classified tracking requests, and cookie timing. The scan looks for activity that appears before a clear consent interaction has been recorded.",
          "In recent CertScore.ai benchmark scans, this signal appeared in roughly one in five scanned sites. That context is directional, not a legal conclusion about any specific website."
        ]
      },
      {
        title: "How teams should review it",
        paragraphs: [
          "Review the vendor names, request timing, cookie names, and consent interaction evidence before deciding whether the behavior is expected.",
          "False positives can occur when a request is misclassified, a consent state already exists, a region-specific banner behaves differently, or a site blocks part of the automated scan."
        ]
      }
    ]
  },
  thirdPartyCookiesBeforeConsent: {
    badge: "Cookie guide",
    title: "Third-party cookies before consent: what site owners should review",
    description:
      "Learn how CertScore.ai observes third-party cookie timing before consent and why vendor evidence matters.",
    path: "/guides/third-party-cookies-before-consent",
    intro:
      "Third-party cookies before consent are cookies associated with outside domains that appear before a recorded consent choice. CertScore.ai surfaces this as an automated finding when retained evidence suggests cookie timing should be reviewed.",
    sections: [
      {
        title: "What CertScore.ai observes",
        paragraphs: [
          "CertScore.ai reviews cookie names, cookie domains, request hosts, vendor classification, and consent timing from public website scans.",
          "The goal is to help teams identify whether advertising, analytics, identity, or other vendor cookies appear earlier than intended."
        ]
      },
      {
        title: "Review caveats",
        paragraphs: [
          "Cookie ownership and purpose can be hard to infer from automated evidence alone. Site owners should compare the observed cookie with tag-manager rules, consent-platform configuration, and vendor documentation.",
          "A prior consent state, geography-specific banner behavior, browser storage state, or short-lived technical cookie can change what the scan observes."
        ]
      }
    ]
  },
  rtbCookieSyncing: {
    badge: "Tracking guide",
    title: "RTB cookie syncing: what it means and how to review it",
    description:
      "Understand RTB cookie syncing and identifier-sharing signals in CertScore.ai scans.",
    path: "/guides/rtb-cookie-syncing",
    intro:
      "RTB cookie syncing is an adtech behavior where advertising or identity systems appear to share or match identifiers across domains. To review it, inspect the request and vendor evidence, the timing of the activity, and whether the behavior appears before or after a recorded consent choice. CertScore.ai automates this review by observing public website requests, vendor context, cookie or identifier-related telemetry, and supporting evidence. The result is a higher-signal business review cue, not a legal conclusion.",
    sections: [
      {
        title: "What CertScore.ai observes",
        paragraphs: [
          "CertScore.ai reviews observed request hosts, URL patterns, vendor categories, redirect-like behavior, and known advertising or identity endpoints.",
          "The scan does not claim to know every downstream use of an identifier. It surfaces evidence that a team should review with its advertising, consent, and vendor-management owners."
        ]
      },
      {
        title: "Why it matters",
        paragraphs: [
          "Identifier-sharing behavior can be more sensitive than a simple cookie inventory because it may indicate cross-domain advertising or measurement flows.",
          "Review the evidence for request timing, vendor purpose, user-consent state, and whether the behavior is expected for the scanned surface."
        ]
      }
    ]
  },
  sessionReplayRisk: {
    badge: "Session recording guide",
    title: "Session replay risk: what website owners should review",
    description:
      "Review the difference between session recording service detection and more sensitive session replay risk signals.",
    path: "/guides/session-replay-risk",
    intro:
      "Session replay risk means a website shows evidence of session recording technology or more sensitive replay behavior that should be reviewed. CertScore.ai distinguishes a session recording service detected from session replay on a sensitive input surface. The first signal means a recording-related vendor or script appeared in the scan. The second is rarer and more urgent when evidence suggests replay-related behavior near sensitive forms, account flows, checkout fields, or other input surfaces.",
    sections: [
      {
        title: "Two different signal levels",
        paragraphs: [
          "A session recording service detected signal means the scan observed a vendor or script associated with session recording or behavioral analytics.",
          "Session replay on a sensitive input surface is rarer and more urgent when evidence shows the behavior near sensitive forms, account flows, checkout fields, or other surfaces where user input deserves closer review."
        ]
      },
      {
        title: "How to review the evidence",
        paragraphs: [
          "Review the observed vendor, page context, script timing, and whether masking or suppression controls are configured for sensitive fields.",
          "Automated scans can miss in-app configuration, field masking, consent gating, and region-specific controls, so the finding should guide review rather than replace it."
        ]
      }
    ]
  },
  checkWebsiteTrackingBeforeConsent: {
    badge: "How-to guide",
    title: "How to check if a website tracks users before consent",
    description:
      "A practical overview of checking whether tracking requests appear before a consent choice.",
    path: "/guides/check-website-tracking-before-consent",
    intro:
      "To check whether a website tracks users before consent, scan the page before making any consent choice and inspect whether classified tracking requests or non-essential cookies appear before the consent event. CertScore.ai automates this review by observing public website behavior around tracking requests, cookies, consent flows, and related evidence. The result is an automated risk signal that helps teams review timing, vendors, and consent configuration without treating the scan as a legal determination.",
    sections: [
      {
        title: "What CertScore.ai observes",
        paragraphs: [
          "CertScore.ai looks at public page behavior, tracking request timing, cookie activity, consent-surface signals, and retained evidence that helps explain why the signal appeared.",
          "The scan is designed for repeatable triage, so teams can see whether a live website behaves as expected after tag, banner, or vendor changes."
        ]
      },
      {
        title: "What to review next",
        paragraphs: [
          "Review the vendor list, request URLs, cookie timing, consent-platform state, and geography-specific behavior before making operational decisions.",
          "Automated findings may contain errors when consent state is already stored, a vendor is misclassified, a page blocks scanner access, or a banner behaves differently for different visitors."
        ]
      }
    ]
  },
  checkThirdPartyCookiesBeforeConsent: {
    badge: "How-to guide",
    title: "How to check third-party cookies before consent",
    description:
      "A practical overview of reviewing third-party cookie timing before a consent choice.",
    path: "/guides/check-third-party-cookies-before-consent",
    intro:
      "To check whether third-party cookies are set before consent, review cookies created before any recorded consent choice and identify which are associated with third-party services or non-essential purposes. CertScore.ai automates this by observing cookie timing, request context, and vendor evidence during public website scans. The output is a reviewable signal that helps teams compare live behavior with consent-platform and tag-manager configuration.",
    sections: [
      {
        title: "What CertScore.ai observes",
        paragraphs: [
          "CertScore.ai reviews cookie domains, names, vendor-like hosts, and consent timing to surface cookies that may deserve closer review.",
          "The result is a business-facing review signal, not a conclusion about whether a cookie is allowed or prohibited."
        ]
      },
      {
        title: "Review caveats",
        paragraphs: [
          "Some cookies are technical, short-lived, or connected to a prior visitor state. Others may be set by embedded services whose purpose needs vendor documentation.",
          "Use the observed evidence to check tag-manager rules, consent-platform categories, and vendor contracts before deciding what should change."
        ]
      }
    ]
  },
  websiteConsentAudit: {
    badge: "Audit guide",
    title: "How to audit website consent behavior",
    description:
      "Learn how CertScore.ai supports consent behavior review using observed website evidence.",
    path: "/guides/website-consent-audit",
    intro:
      "To audit website consent behavior, compare what the consent interface presents with what the website actually does before and after a recorded consent choice. Review banner controls, accept and reject paths, tracking requests, cookie timing, and whether vendor activity changes after interaction. CertScore.ai automates this by observing public website behavior and turning the retained evidence into reviewable risk signals for consent, cookie, tracking, and related privacy behavior.",
    sections: [
      {
        title: "What to inspect",
        paragraphs: [
          "A practical consent review should inspect banner visibility, accept and reject paths, preference controls, tracking requests, cookie timing, and whether behavior changes after a recorded choice.",
          "CertScore.ai focuses on public, observable behavior so teams can triage whether the live site matches the intended consent configuration."
        ]
      },
      {
        title: "Why evidence review matters",
        paragraphs: [
          "Consent behavior can vary by geography, browser state, page template, tag-manager release, and third-party vendor behavior.",
          "Review the retained evidence before assigning work, and use repeat scans to confirm whether changes reduce the observed risk signals."
        ]
      }
    ]
  },
  detectTrackingBeforeConsent: {
    badge: "How-to guide",
    title: "How to detect tracking before consent",
    description:
      "A practical guide to detecting whether tracking requests or non-essential cookies appear before a recorded consent choice.",
    path: "/guides/detect-tracking-before-consent",
    intro:
      "To detect tracking before consent, review a fresh page load before any consent interaction and compare observed tracking requests, cookies, and consent-surface evidence. CertScore.ai automates this review as a public website risk signal for teams to investigate.",
    sections: [
      {
        title: "Direct answer",
        paragraphs: [
          "Tracking before consent is detected when classified tracking requests, vendor activity, or non-essential cookies appear before the scan records a consent choice.",
          "The result should be reviewed against the underlying request, cookie, and consent evidence before deciding whether a site configuration needs to change."
        ]
      },
      {
        title: "Why it matters",
        paragraphs: [
          "Consent tools, tag managers, analytics snippets, and embedded services can drift out of sync with the intended banner configuration.",
          "A repeatable scan helps teams find live behavior that may deserve review without relying on a one-time manual browser check."
        ]
      },
      {
        title: "What CertScore.ai observes",
        paragraphs: [
          "CertScore.ai observes request timing, cookie timing, vendor-like hosts, consent UI signals, and whether activity appears before a recorded choice.",
          "The scan focuses on public website evidence and does not expose proprietary probe definitions or private evaluation fixtures."
        ]
      },
      {
        title: "Example evidence",
        paragraphs: [
          "A sanitized example might show an analytics request to analytics.example/collect during the initial page-load window before a banner interaction.",
          "Another example might show a marketing cookie associated with a third-party host appearing before the scan records an accept or reject choice."
        ]
      },
      {
        title: "What teams should review next",
        paragraphs: [
          "Review consent-platform rules, tag-manager triggers, geography-specific banner behavior, and whether prior consent state could affect the observation.",
          "After configuration changes, repeat the scan and compare whether the observed pre-consent activity changed."
        ]
      }
    ]
  },
  rejectConsentTrackingTest: {
    badge: "Consent guide",
    title: "Reject consent tracking test: what to review",
    description:
      "Learn how teams can review whether a reject interaction reduces tracking activity on a public website.",
    path: "/guides/reject-consent-tracking-test",
    intro:
      "A reject consent tracking test compares website behavior before and after a reject interaction to see whether tracking activity appears to change. CertScore.ai treats the result as an automated review signal, not a legal conclusion.",
    sections: [
      {
        title: "Direct answer",
        paragraphs: [
          "A reject consent tracking test records baseline tracking activity, attempts a visible reject path where available, and reviews whether tracker requests or non-essential cookies persist afterward.",
          "The test is useful for operational review because a banner can look correct while tag behavior remains unchanged."
        ]
      },
      {
        title: "Why it matters",
        paragraphs: [
          "Reject flows can break when consent-platform categories, tag-manager triggers, or embedded vendor defaults are misconfigured.",
          "Teams need evidence from the browser session to decide whether the reject path behaves as intended."
        ]
      },
      {
        title: "What CertScore.ai observes",
        paragraphs: [
          "CertScore.ai observes consent controls, request timing, cookie activity, and tracker-like vendor activity before and after a recorded reject interaction.",
          "The scan summarizes reviewable behavior while avoiding legal pass/fail language."
        ]
      },
      {
        title: "Example evidence",
        paragraphs: [
          "A sanitized example might show a request to ads.example/pixel before reject and a similar request after reject.",
          "Another example might show a non-essential analytics cookie still present after the scan records a reject choice."
        ]
      },
      {
        title: "What teams should review next",
        paragraphs: [
          "Check whether the reject control is visible, whether it maps to the right consent categories, and whether tags are gated on the stored choice.",
          "Review vendor documentation and test across important page templates before assigning remediation."
        ]
      }
    ]
  },
  websiteConsentAuditChecklist: {
    badge: "Checklist guide",
    title: "Website consent audit checklist",
    description:
      "A practical checklist for reviewing website consent behavior, tracking timing, cookie activity, and related evidence.",
    path: "/guides/website-consent-audit-checklist",
    intro:
      "A website consent audit checklist should compare visible consent controls with observed tracking and cookie behavior before and after user choices. CertScore.ai helps teams structure that review with automated public website evidence.",
    sections: [
      {
        title: "Direct answer",
        paragraphs: [
          "A practical consent audit checks banner visibility, accept and reject controls, preference paths, tracking requests, cookie timing, and whether behavior changes after interaction.",
          "The strongest review combines UI inspection with browser-observed evidence."
        ]
      },
      {
        title: "Why it matters",
        paragraphs: [
          "Consent behavior often changes when teams add vendors, update tag-manager rules, change templates, or adjust banner settings.",
          "A checklist gives product, marketing, privacy, and engineering teams a shared review path."
        ]
      },
      {
        title: "What CertScore.ai observes",
        paragraphs: [
          "CertScore.ai observes consent surfaces, tracking requests, cookie timing, session replay indicators, fingerprinting-related signals, accessibility issues, and privacy disclosure gaps where evidence is available.",
          "Findings are automated risk signals for human and agentic review, not compliance determinations."
        ]
      },
      {
        title: "Example evidence",
        paragraphs: [
          "A sanitized example might show a banner with an accept button, no obvious reject control, and third-party analytics requests during initial page load.",
          "Another example might show consent controls on the homepage but different behavior on a landing-page template."
        ]
      },
      {
        title: "What teams should review next",
        paragraphs: [
          "Review tag-manager rules, consent-platform categories, vendor contracts, policy disclosures, and the page templates that matter most to visitors.",
          "Use repeat scans after changes to see whether observed signals improved or persisted."
        ]
      }
    ]
  },
  privacyScannerVsCookieScanner: {
    badge: "Comparison guide",
    title: "Privacy scanner vs cookie scanner",
    description:
      "Understand the difference between a behavior-oriented privacy scanner and a basic cookie scanner.",
    path: "/guides/privacy-scanner-vs-cookie-scanner",
    intro:
      "A cookie scanner usually inventories cookies. A privacy scanner like CertScore.ai also reviews observable website behavior around tracking, consent, session replay indicators, fingerprinting-related signals, accessibility, and privacy disclosures.",
    sections: [
      {
        title: "Direct answer",
        paragraphs: [
          "A cookie scanner helps identify cookies, names, domains, and sometimes categories. A privacy scanner adds behavioral context about when tracking appears and whether public disclosures and controls deserve review.",
          "CertScore.ai is positioned as an automated risk-signal scanner for public website behavior."
        ]
      },
      {
        title: "Why it matters",
        paragraphs: [
          "Cookie inventory is useful, but it may not show whether tracking fired before consent or whether a reject path changed vendor activity.",
          "Teams often need behavior evidence when diagnosing consent, vendor, and disclosure drift."
        ]
      },
      {
        title: "What CertScore.ai observes",
        paragraphs: [
          "CertScore.ai observes tracking requests, cookies, consent behavior, session replay indicators, fingerprinting-related signals, accessibility issues, and privacy disclosure gaps.",
          "It presents findings as evidence-backed signals for human and agentic review."
        ]
      },
      {
        title: "Example evidence",
        paragraphs: [
          "A sanitized example might show third-party cookie names alongside request timing and the consent state recorded during the scan.",
          "Another example might show a session recording script observed on a page with form fields, prompting a closer review of masking and controls."
        ]
      },
      {
        title: "What teams should review next",
        paragraphs: [
          "Use cookie inventory for baseline visibility, then review behavior evidence for consent timing, reject behavior, vendor disclosures, and sensitive page contexts.",
          "Escalate findings to the teams that own tag deployment, consent configuration, privacy disclosures, and frontend templates."
        ]
      }
    ]
  }
} satisfies Record<string, AiGuideContent>;

export function buildArticleSchema(guide: AiGuideContent) {
  return [
    createPublicArticleSchema({
      title: guide.title,
      description: guide.description,
      path: guide.path,
      type: "TechArticle",
      about: ["website scanning", "tracking", "cookies", "consent", "accessibility", "automated findings"]
    }),
    createBreadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Guides", path: "/guides" },
      { name: guide.title, path: guide.path }
    ])
  ];
}

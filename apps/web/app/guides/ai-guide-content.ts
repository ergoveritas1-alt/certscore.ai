import { SITE_URL } from "../../lib/seo";

export type AiGuideContent = {
  badge: string;
  description: string;
  intro: string;
  path: string;
  sections: Array<{
    title: string;
    paragraphs: string[];
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
        title: "What CertScore observes",
        paragraphs: [
          "CertScore.ai reviews the initial page-load window, consent surface signals, classified tracking requests, and cookie timing. The scan looks for activity that appears before a clear consent interaction has been recorded.",
          "In recent CertScore benchmark scans, this signal appeared in roughly one in five scanned sites. That context is directional, not a legal conclusion about any specific website."
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
        title: "What CertScore observes",
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
        title: "What CertScore observes",
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
  accessibilityHomepageSignals: {
    badge: "Accessibility guide",
    title: "Accessibility homepage signals: what automated scans can surface",
    description:
      "Learn how CertScore.ai reviews automated homepage accessibility signals without implying a full WCAG audit.",
    path: "/guides/accessibility-homepage-signals",
    intro:
      "Automated homepage accessibility signals are review cues from the scanned public page, such as visual contrast, semantic labeling, text alternatives, and keyboard navigation indicators. They are not a full WCAG audit.",
    sections: [
      {
        title: "What CertScore observes",
        paragraphs: [
          "CertScore.ai can surface automated signals related to color contrast, form labels, image text alternatives, document structure, focus behavior, and keyboard-oriented navigation.",
          "These observations help prioritize review, especially when the same pattern appears across important public pages."
        ]
      },
      {
        title: "What automated scans cannot prove",
        paragraphs: [
          "Automated accessibility checks do not evaluate every user journey, assistive technology experience, content update, or design intent.",
          "Teams should use these findings as triage signals, then review affected components and flows with manual testing where risk or user impact is meaningful."
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
        title: "What CertScore observes",
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
        title: "What CertScore observes",
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
  }
} satisfies Record<string, AiGuideContent>;

export function buildArticleSchema(guide: AiGuideContent) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: guide.title,
    description: guide.description,
    url: `${SITE_URL}${guide.path}`,
    about: ["website scanning", "tracking", "cookies", "consent", "accessibility", "automated findings"]
  };
}

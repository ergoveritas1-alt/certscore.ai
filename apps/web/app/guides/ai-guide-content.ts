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
          "Historical calibration counts are available with explicit provenance limitations. Use the evidence from the website under review rather than treating those counts as current prevalence or a legal conclusion."
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
  rtbCookieSyncing: {
    badge: "Tracking guide",
    title: "RTB cookie syncing: what it means and how to review it",
    description:
      "Understand RTB cookie syncing with request-chain examples. Review identifier-sharing signals, vendor context and consent timing in CertScore.ai evidence.",
    path: "/guides/rtb-cookie-syncing",
    intro:
      "Trace possible identifier sharing back to the request chain that caused it. CertScore.ai helps DPOs, agencies and developers identify the tag or vendor to investigate and compare behavior before and after consent.",
    sections: [
      {
        "title": "1. Follow the request chain",
        "paragraphs": [
          "An illustrative chain might run from sync.vendor-a.example to match.vendor-b.example with an identifier-shaped parameter. These example domains explain the pattern; they are not scan findings.",
          "Inspect the initiator, redirects, vendor, timing and consent state. Two advertising hosts appearing together do not by themselves establish identifier sharing."
        ]
      },
      {
        "title": "2. Find the implementation owner",
        "paragraphs": [
          "Identify the tag, plugin or embed that started the chain. Ask its owner to review consent categories, tag triggers and vendor settings. Compare the observed destination with the site’s disclosures."
        ]
      },
      {
        "title": "3. Retest the affected behavior",
        "paragraphs": [
          "After an approved change, compare fresh sessions under matching page and region conditions. Share evidence references with sensitive values removed so the developer, agency and DPO can review the same observation."
        ]
      },
      {
        "title": "What the evidence can establish",
        "paragraphs": [
          "Cookie storage, network requests and identifier sharing are separate observations. A stored cookie does not prove it was transmitted; an endpoint name does not prove matching or downstream use. Inspect the retained chain and coverage before drawing conclusions."
        ]
      }
    ]
  },
  sessionReplayRisk: {
    badge: "Session replay guide",
    title: "Session replay risk: what website owners should review",
    description:
      "Review session-replay service signals, form context, masking and consent questions. Learn what CertScore.ai evidence shows and why it does not prove recording.",
    path: "/guides/session-replay-risk",
    intro:
      "Find session-replay services that deserve a closer look, then review consent gating, sensitive-page exclusions and masking with the implementation owner. CertScore.ai provides the vendor and page evidence to start that investigation.",
    sections: [
      {
        "title": "1. Identify the service and page",
        "paragraphs": [
          "Open the retained vendor, script or request evidence and note when it appeared. A service signal may be a library download; it does not establish that recording was enabled."
        ]
      },
      {
        "title": "2. Review sensitive-page settings",
        "paragraphs": [
          "Check masking, excluded fields, page suppression and consent settings in the replay tool. Give the owner the affected page and report reference. A form elsewhere in the scan is not evidence that the replay service appeared on that form’s page."
        ]
      },
      {
        "title": "3. Retest after the configuration change",
        "paragraphs": [
          "Repeat the scan with the same page and region. Compare service timing and available choice-path evidence. Review the tool’s internal configuration separately, since a public-page scan cannot establish every masking or recording setting."
        ]
      },
      {
        "title": "Read the original research",
        "paragraphs": [
          "The session-replay study distinguishes service detection from verified same-page form context. Neither observation proves that visitor inputs were entered, transmitted or recorded."
        ],
        "sourceLinks": [
          {
            "href": "/insights/session-replay-study-2026",
            "label": "Session-replay study and measurement limits"
          }
        ]
      }
    ]
  },
  checkThirdPartyCookiesBeforeConsent: {
    badge: "How-to guide",
    title: "How to check third-party cookies before consent",
    description:
      "Check third-party cookies before consent using a clean browser session. Review cookie timing, vendor purpose and request evidence with CertScore.ai.",
    path: "/guides/check-third-party-cookies-before-consent",
    intro:
      "Find which cookies and services appear before a visitor makes a choice. Use the timing and vendor evidence to review CMP categories and tag triggers, then retest the affected page.",
    sections: [
      {
        "title": "1. Start with a fresh session",
        "paragraphs": [
          "Record the URL, region, time and browser settings. Inspect cookie storage and network activity before making a banner choice. Prior consent and privacy extensions can change the result."
        ]
      },
      {
        "title": "2. Match cookies to service activity",
        "paragraphs": [
          "Review cookie name, domain, path, lifetime and first-seen time alongside request evidence. Keep sensitive values out of shared notes. A third-party service can use first-party storage, so domain ownership alone does not establish purpose."
        ]
      },
      {
        "title": "3. Review the category and trigger",
        "paragraphs": [
          "Give the CMP or tag-manager owner the observed vendor and timing. Check whether the category and trigger match the intended behavior. After a change, compare a fresh baseline and eligible choice sessions."
        ]
      },
      {
        "title": "Read storage and requests separately",
        "paragraphs": [
          "Blocked third-party cookies do not mean that no requests occurred. An unchanged cookie does not prove active use. Unsupported classifications, missing timestamps and inaccessible frames remain coverage limits."
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
        title: "1. Define a repeatable starting point",
        paragraphs: [
          "Record the exact public URL, date, browser, region, and the tag-manager or CMP version being reviewed. Use a fresh browser profile with no stored consent for each independent test. Do not log in, enter personal information, or interact with account or checkout controls.",
          "A baseline ends when a consent interaction occurs. Keep an untouched baseline separate from Accept and Reject sessions so a prior choice cannot explain later requests. Record unavailable pages or blocked access as limitations."
        ]
      },
      {
        title: "2. Observe the initial page load",
        paragraphs: [
          "For a manual check, open the browser Network panel before loading the target and keep the request log. Inspect requests, initiators, response timing, and cookies or storage while leaving the consent banner untouched. A third-party domain alone does not establish a tracking purpose.",
          "With CertScore, enter the public URL in the scanner and read the completed report. Confirm the scan context and coverage before interpreting the pre-consent findings. Use the retained evidence attached to each finding rather than inferring behavior from a banner screenshot."
        ]
      },
      {
        title: "3. Separate requests, stored values, and purpose",
        paragraphs: [
          "A request shows communication; a cookie snapshot shows stored state. Record the vendor classification, request timing, cookie name/domain/path or storage origin/key, and the evidence reference. Review unclear vendor purposes with the implementation owner.",
          "Check both the tag manager and scripts embedded directly in templates. Embedded media, analytics, advertising, and replay integrations can have different triggers. Do not classify every third-party service as non-essential solely because it is external.",
          "For replay integrations, distinguish a service request from evidence of active recording. Our session replay study measures observable service signals and same-page form context; it does not establish consent-gating effectiveness or capture of input values."
        ],
        sourceLinks: [{ href: "/insights/session-replay-study-2026", label: "See the session replay study’s evidence and limitations" }]
      },
      {
        title: "4. Build a useful evidence record",
        paragraphs: [
          "For each observation, record: target URL; date and region; baseline or action session; request or storage identity; observed purpose; timestamp; report evidence reference; coverage limitation; owner; and next action. Omit raw cookie values, personal data, and sensitive query strings from shared tickets.",
          "Open the sample report to see how evidence is presented. Its observations belong to that sample scan and should never be copied into a finding about a different site."
        ]
      },
      {
        title: "5. Diagnose the configuration and retest",
        paragraphs: [
          "Ask the implementation owner to compare the observed request with consent-category mappings, tag firing rules, consent defaults, and hard-coded integrations. Verify the intended behavior before changing a rule; an essential service may need different handling from advertising.",
          "After the change, repeat the same starting conditions in a fresh session. Compare the affected requests and storage activity, not just the overall score. Record a blocked or incomplete retest as inconclusive. Extend manual review to important templates and regions beyond the scanned surface."
        ]
      },
      {
        title: "Keep the conclusion within the evidence",
        paragraphs: [
          "No observed tracking means none was observed within the tested scope; it does not establish that tracking never occurs. A banner being visible is not proof that tags wait for consent. A scan is evidence for review, not a legal compliance determination."
        ]
      }
    ]
  },
  rejectConsentTrackingTest: {
    badge: "Consent guide",
    title: "How to test tracking after Reject: an evidence walkthrough",
    description:
      "Test tracking after Reject with a repeatable worksheet: verify the click, refusal state, request timing, storage evidence, and coverage limitations.",
    path: "/guides/reject-consent-tracking-test",
    intro:
      "Check what remains after a visitor clicks Reject. Inspect non-essential cookies and services, identify the configuration to review, and give your developer or agency a reproducible fix-and-retest task.",
    sections: [
      {
        "title": "1. Compare independent sessions",
        "paragraphs": [
          "Keep the untouched baseline and Reject test separate. Record the URL, region and time. Do not accept first and reuse that state for the Reject test."
        ]
      },
      {
        "title": "2. Check the completed action",
        "paragraphs": [
          "Confirm which eligible control was clicked and whether the observation completed. A completed click and a registered refusal are separate facts; a disappearing banner does not prove refusal was recorded."
        ]
      },
      {
        "title": "3. Inspect what remained",
        "paragraphs": [
          "After a completed authorized Reject path, retained non-essential cookies and classified service requests can support GDPR/ePrivacy review even when registration is unverified. Inspect the action, cookie snapshot and request evidence together.",
          "Separate requests started before the click from later activity. Cookie presence can support review without proving that the cookie was read or transmitted. California collection review uses its own request, purpose and choice-scope evidence."
        ]
      },
      {
        "title": "4. Assign a fix and retest",
        "paragraphs": [
          "Share the report, affected page, vendor, timing, expected behavior and coverage limits. Ask the owner to inspect CMP mappings, tag triggers, duplicate tags and embedded services. Preserve the original report and compare a fresh scan after the change."
        ]
      },
      {
        "title": "Keep incomplete checks open",
        "paragraphs": [
          "Unavailable controls, blocked pages and partial observations need follow-up. No eligible activity observed in a completed window describes that window; it does not establish that the website never tracks."
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
      "Turn a consent review into a practical worklist: inspect the page, identify the owner of each issue, agree on the expected behavior and retest after changes. Use retained evidence so DPOs, agencies and developers can work from the same facts.",
    sections: [
      {
        "title": "1. Define the review",
        "paragraphs": [
          "Record the URL, date, region, reviewer and implementation owner. List the pages and templates covered, plus any journeys left untested. Agree on the expected behavior for essential services, analytics, advertising and embeds."
        ]
      },
      {
        "title": "2. Inspect the untouched page",
        "paragraphs": [
          "Use a fresh session without stored consent. Review visible controls, pre-consent cookies, service requests and privacy disclosures. Keep evidence references for each observation and note missing coverage."
        ]
      },
      {
        "title": "3. Compare eligible Accept and Reject paths",
        "paragraphs": [
          "Use separate fresh sessions. Check the completed click, available choice-state evidence and observation window independently. After Reject, inspect retained non-essential cookies and services; distinguish presence from active collection. Test GPC separately for California review."
        ]
      },
      {
        "title": "4. Reconcile disclosures and behavior",
        "paragraphs": [
          "Match the target site’s retained policy passages with the relevant vendors, purposes and consent state. Ask the privacy owner to review unexplained differences. Missing policy evidence is not proof of a contradiction."
        ]
      },
      {
        "title": "5. Record the fix and retest",
        "paragraphs": [
          "For each issue record the observation, evidence link, expected behavior, owner, proposed change and retest date. Inspect consent mappings, tag triggers, plugins and vendor settings. Keep sensitive values out of tickets."
        ]
      },
      {
        "title": "6. Close only what the evidence supports",
        "paragraphs": [
          "Compare a fresh scan under matching conditions after the change. Keep blocked or incomplete checks open. Repeat the review when CMP settings, vendors or site templates change."
        ]
      }
    ]
  },
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

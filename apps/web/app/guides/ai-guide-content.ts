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
      "Understand RTB cookie syncing and identifier-sharing signals in CertScore.ai scans.",
    path: "/guides/rtb-cookie-syncing",
    intro:
      "RTB cookie syncing is an adtech behavior where advertising or identity systems appear to share or match identifiers across domains. To review it, inspect the request and vendor evidence, the timing of the activity, and whether the behavior appears before or after a recorded consent choice. CertScore.ai automates this review by observing public website requests, vendor context, cookie or identifier-related telemetry, and supporting evidence. The result is a higher-signal business review cue, not a legal conclusion.",
    sections: [
      {
        title: "A request-chain example (illustrative)",
        paragraphs: [
          "Consider a page that requests sync.vendor-a.example, receives a redirect to match.vendor-b.example, and passes an identifier-shaped value between the two. These reserved example domains illustrate a pattern; they are not a retained finding or a claim about real vendors.",
          "Retain the initiator, redirect status and destination, request start times, parameter names with values redacted, vendor classification, and consent state. A pair of advertising hosts appearing in the same session is weaker evidence than a directly retained redirect or identifier-transfer chain."
        ]
      },
      {
        title: "Distinguish syncing from neighboring behavior",
        paragraphs: [
          "An advertising auction, measurement pixel, ordinary redirect, and cookie synchronization are not identical. A suggestive endpoint name does not prove matching or downstream use. Compare the direct chain with vendor documentation and the retained classification.",
          "Cookie blocking can suppress storage while requests still occur. Conversely, a cookie already present does not prove it was sent in a sync request. Review transport and storage separately."
        ]
      },
      {
        title: "Turn the chain into an implementation check",
        paragraphs: [
          "Locate the tag or embedded service at the start of the initiator chain. Give its owner the consent context and redacted evidence, then inspect CMP gating and vendor settings. Compare fresh baseline and choice sessions under matching conditions after an authorized change."
        ]
      },
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
    badge: "Session replay guide",
    title: "Session replay risk: what website owners should review",
    description:
      "Understand observable session-replay service signals, form context and the limits of a bounded website scan.",
    path: "/guides/session-replay-risk",
    intro:
      "CertScore.ai identifies observable session-replay service signals and separately reviews input-surface context. A recognized vendor, script or request can help locate technology to review. It does not prove that recording was enabled or that visitor inputs were captured.",
    sections: [
      {
        title: "Two different signal levels",
        paragraphs: [
          "A session replay service signal means the scan observed evidence associated with a recognized replay or behavioral-analytics service. This can include a library download.",
          "Separate input-surface findings provide context for review. Same-scan evidence alone does not establish that the service and field appeared on the same page, or that values were entered, transmitted or recorded."
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
        title: "1. Start without a prior choice",
        paragraphs: [
          "Use a clean browser context and record page, region, browser settings, time, and capture window. Open Network and cookie storage before loading the page. Do not accept or reject during the baseline. Prior consent or privacy extensions can change the result."
        ]
      },
      {
        title: "2. Match storage to the request evidence",
        paragraphs: [
          "Record cookie name, domain, path, partition identity if present, lifetime, and when it appeared. Inspect Set-Cookie responses and requests carrying the cookie where available. Redact values. A third-party service can also use first-party storage, so domain ownership alone does not establish purpose.",
          "A browser may block third-party storage. Record that limitation and review network activity too; no stored cookie does not mean no request or tracking behavior."
        ]
      },
      {
        title: "3. Classify and hand off",
        paragraphs: [
          "Combine the observed request and cookie with vendor purpose and the intended consent category. Technical cookies, uncertain classifications, missing timestamps, and unavailable frames need review rather than automatic conclusions.",
          "Share the identity and timing with the CMP and tag-manager owner. Retest in fresh sessions after a change; compare an unchanged cookie separately from a new write or active transmission."
        ]
      },
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
          "Check both the tag manager and scripts embedded directly in templates. Embedded media, analytics, advertising, and replay integrations can have different triggers. Do not classify every third-party service as non-essential solely because it is external."
        ]
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
      "A reject consent tracking test compares website behavior before and after a reject interaction to see whether tracking activity appears to change. CertScore.ai treats the result as an automated review signal, not a legal conclusion.",
    sections: [
      {
        title: "1. Keep the baseline and Reject session separate",
        paragraphs: [
          "Record the exact URL, region, scan time, and the consent configuration under review. Begin the baseline without a stored choice. Start the Reject test in a separate fresh session; do not first accept and then reuse that state.",
          "CertScore performs eligible Accept and Reject observations independently. Its bounded automated test uses an eligible first-layer control. Deeper preference-center paths, unavailable controls, blocked pages, and changed targets can leave coverage limited."
        ]
      },
      {
        title: "2. Confirm which action actually happened",
        paragraphs: [
          "Read the control observation, click outcome, and semantic registration separately. A visible Reject label proves visibility only. A completed click proves activation only. A hidden banner or changed cookie does not by itself confirm refusal.",
          "Confirmed refusal requires evidence of a denied decision. If registration is unverified, preserve that status in the review. Do not rewrite it as successful refusal because the interface disappeared."
        ]
      },
      {
        title: "3. Distinguish new activity from work already in flight",
        paragraphs: [
          "Inspect the retained request timing and ancestry. A request or redirect chain that began before the click is not proof that new tracking started afterward. Review the vendor classification and distinguish analytics, advertising, or session replay from essential or CMP traffic.",
          "When refusal is unverified, a completed authorized Reject click can still support a review finding only if the report has verified qualifying tracking that started after the click and complete bounded capture. The registration status remains unverified. Missing timing, dropped activity, or incomplete capture cannot establish that result."
        ]
      },
      {
        title: "4. Do not confuse storage persistence with active use",
        paragraphs: [
          "An unchanged cookie can remain after Reject without being read or transmitted. Compare exact cookie name, domain, path and partition, or storage origin, type and key, within the same action session. A different value is not unchanged persistence.",
          "Storage presence alone is a factual review aid, not proof of active tracking. Give greater attention to directly observed eligible requests or writes and retained contradictions. Do not publish raw storage values in a ticket or report excerpt."
        ]
      },
      {
        title: "5. Use this interpretation checklist",
        paragraphs: [
          "Control unavailable or capture incomplete: record limited coverage and investigate manually if needed. No eligible activity observed in a completed window: state that bounded observation; do not claim the website never tracks.",
          "Completed Reject click with unverified refusal: keep the decision unverified and inspect any separately supported tracking review finding. Confirmed refusal with qualifying later activity: review the finding and its retained evidence with the responsible implementation team."
        ]
      },
      {
        title: "6. Prepare a reproducible handoff",
        paragraphs: [
          "Record the exact URL, date, region, report reference, baseline coverage, control clicked, action time, refusal status, request-chain start, classified vendor, evidence references, and capture limitations. Add the implementation owner and the expected tag behavior.",
          "After a configuration change, retest under matching conditions in a fresh session and compare the affected evidence. Check important regions and page templates separately. Avoid combining unrelated sessions into a single before-and-after proof."
        ]
      },
      {
        title: "Method and source of this walkthrough",
        sourceLinks: [
          { href: "/resources/consent-audit-worksheet.md", label: "Download the blank audit worksheet" },
          { href: "/methodology", label: "CertScore methodology" },
          { href: "/guides/consent-enforcement-testing", label: "Accept and Reject observation scope" }
        ],
        paragraphs: [
          "This walkthrough documents CertScore’s existing evidence distinctions: control visibility, completed action, semantic registration, bounded capture, request ancestry, and exact storage identity. It introduces no new scan results or population-wide statistics.",
          "Use the sample report for the report format and the downloadable audit worksheet for a review record. Findings remain automated risk signals for review, not legal determinations."
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
        title: "Scope and ownership",
        paragraphs: [
          "Record the URL, scan date, region, browser context, CMP version, tag-manager version, reviewer, and responsible implementation owner. List the public pages and templates included and the areas that remain untested.",
          "Document expected behavior for essential services, analytics, advertising, and embedded content. Keep legal interpretation with the appropriate reviewer; the technical audit records observations."
        ]
      },
      {
        title: "Untouched baseline",
        paragraphs: [
          "Use a fresh session without stored consent. Record whether Accept, Reject, and Options controls were observed, and whether the inventory was complete. Unknown is different from not observed.",
          "Review retained pre-consent requests, cookie/storage timing, vendor classifications, and policy evidence. Record a reference for each observation; do not derive tracking from a screenshot or third-party hostname alone."
        ]
      },
      {
        title: "Independent Accept and Reject checks",
        paragraphs: [
          "For each eligible action, record whether a unique control was actionable, whether the click completed, whether the decision was semantically verified, and whether the capture window completed. Preserve unverified and unavailable outcomes.",
          "Review request ancestry after Reject and separate pre-click work from later requests. Treat Accept as a comparison baseline. Cookie presence alone does not establish active tracking after refusal."
        ]
      },
      {
        title: "Policy and runtime comparison",
        paragraphs: [
          "Confirm that the retained policy belongs to the target site. Compare a specific disclosed claim with directly comparable runtime evidence in the same scope and consent state.",
          "Record missing or insufficient evidence as a limitation. Do not turn an inaccessible policy or an incomplete observation into a proven mismatch."
        ]
      },
      {
        title: "Remediation record",
        paragraphs: [
          "For each item record: observation, retained evidence reference, expected behavior, implementation owner, proposed change, status, and retest date. Keep cookie values and sensitive query parameters out of shared notes.",
          "Inspect consent-category mappings, tag triggers, embedded scripts, and vendor settings. Preserve the original report and compare the changed behavior under matching fresh-session conditions."
        ]
      },
      {
        title: "Closure and monitoring",
        paragraphs: [
          "Close an item only when its evidence and retest support the expected change. If the site is blocked or the capture is incomplete, keep the item open or explicitly inconclusive.",
          "Repeat review when CMP settings, tags, vendors, or templates change. A successful bounded observation is not certification and does not cover every region, visitor state, or future request."
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

export const WALKTHROUGH_CHAPTERS = [
  "Start with the evidence", "Trace cookies & tracking", "Test consent choices",
  "Review California privacy", "Inspect disclosures & forms", "Turn evidence into action"
] as const;

const REPORTS = {
  baseline: { date: "November 11, 2026", label: "EU baseline", href: "https://certscore.ai/scan/3220d49c-6ae7-4bbf-96e6-18afe8198ec1?reviewFocus=gdpr_eprivacy" },
  choices: { date: "November 10, 2026", label: "EU consent choices", href: "https://certscore.ai/scan/ef5b6d84-a6b5-48ec-9785-7c4929dc4994?reviewFocus=gdpr_eprivacy" },
  california: { date: "October 26, 2026", label: "California & GPC", href: "https://certscore.ai/scan/c4c071c6-9313-40b3-94de-23d50d24ba18?reviewFocus=ccpa_cpra" }
} as const;

type WalkthroughInput = {
  id: string;
  chapter: (typeof WALKTHROUGH_CHAPTERS)[number];
  title: string;
  description: string;
  takeaway: string;
  image: string;
  width: number;
  height: number;
  alt: string;
  report: keyof typeof REPORTS;
};

// Current UI captures of owned synthetic test pages. Dates describe retained scans.
const highlights: WalkthroughInput[] = [
  {
    id: "overview", chapter: "Start with the evidence", title: "Get the review picture in one view",
    description: "Start with the score, priority findings, services, forms and scan context. Give a DPO or client a clear starting point before investigating the underlying evidence.",
    takeaway: "Move from a website URL to a focused review agenda.",
    image: "01-executive-overview", width: 1150, height: 463, report: "baseline",
    alt: "CertScore.ai owned test-page report showing its score, priority counts and observed services, forms, requests and storage."
  },
  {
    id: "priorities", chapter: "Start with the evidence", title: "Know which findings to investigate first",
    description: "Review prioritized findings with their observed context. Decide which consent settings, tags, disclosures or page elements your team should inspect next.",
    takeaway: "Give developers and agencies a concrete investigation list.",
    image: "02-priority-findings", width: 1150, height: 522, report: "baseline",
    alt: "CertScore.ai priority findings with evidence summaries for the owned baseline test page."
  },
  {
    id: "timeline", chapter: "Start with the evidence", title: "Put website activity on a timeline",
    description: "See when services and browser events appeared during the observation window. Timing helps teams investigate what happened before consent and relate activity to the captured page state.",
    takeaway: "Understand the sequence behind the finding.",
    image: "03-event-timeline", width: 1108, height: 164, report: "baseline",
    alt: "CertScore.ai event timeline plotting observed website activity during the baseline scan."
  },
  {
    id: "inventory", chapter: "Start with the evidence", title: "See the services behind the page",
    description: "Explore observed services, their purposes and associated requests or storage. Start with the vendor inventory, then expand the evidence for the service you need to investigate.",
    takeaway: "Make a website’s third-party activity easier to review.",
    image: "04-service-inventory", width: 1108, height: 422, report: "baseline",
    alt: "CertScore.ai service inventory with vendor rows, purposes, requests and browser storage observations."
  },
  {
    id: "resource-evidence", chapter: "Trace cookies & tracking", title: "Inspect the evidence behind a resource",
    description: "Open structured evidence for an observed cookie or request. Retained technical details help a developer connect the report’s summary to the resource that needs investigation.",
    takeaway: "Go beyond a vendor name to the supporting facts.",
    image: "05-resource-evidence", width: 768, height: 556, report: "baseline",
    alt: "CertScore.ai resource evidence dialog with structured details for a retained Google Analytics cookie observation."
  },
  {
    id: "destinations", chapter: "Trace cookies & tracking", title: "Understand observed network destinations",
    description: "Inspect endpoint, country and network context alongside the service identity. Distinguish observed server locations from a vendor’s headquarters when preparing a data-flow review.",
    takeaway: "Give DPOs useful technical context for further investigation.",
    image: "06-destination-context", width: 576, height: 556, report: "baseline",
    alt: "CertScore.ai Google Analytics panel showing observed network countries and endpoint context separately from company location."
  },
  {
    id: "vendor-disclosures", chapter: "Trace cookies & tracking", title: "Connect a vendor to disclosure evidence",
    description: "Follow a service’s policy mention to the retained passage, source and capture context. Compare what the website discloses with the services actually observed during the scan.",
    takeaway: "Connect runtime activity with the privacy-policy review.",
    image: "07-vendor-disclosures", width: 576, height: 306, report: "baseline",
    alt: "CertScore.ai vendor disclosure panel with a matched policy passage and retained source information."
  },
  {
    id: "session-replay", chapter: "Trace cookies & tracking", title: "Investigate session-replay signals",
    description: "Review detected session-recording technology with its supporting observation and correction steps. Inspect consent gating, vendor settings and disclosures; a detected signal alone does not establish what was recorded.",
    takeaway: "Turn a session-replay signal into a targeted technical review.",
    image: "17-session-replay", width: 543, height: 522, report: "baseline",
    alt: "CertScore.ai session recording evidence for Microsoft Clarity with expanded correction steps."
  },
  {
    id: "fingerprinting", chapter: "Trace cookies & tracking", title: "Look beyond cookies for identification signals",
    description: "Inspect observed browser-API activity associated with fingerprinting review. Expand the evidence packet to understand what was captured before deciding whether a script’s behavior needs further investigation.",
    takeaway: "Review identification signals that a cookie list can miss.",
    image: "18-fingerprinting-signals", width: 543, height: 644, report: "baseline",
    alt: "CertScore.ai device identification and fingerprinting review with observed browser API signals and expanded JSON evidence."
  },
  {
    id: "cmp-audit", chapter: "Test consent choices", title: "Inspect the consent platform’s implementation",
    description: "Review the CMP evidence across individual criteria, including consent controls and activity after a choice. Help agencies investigate whether a banner’s implementation needs attention on a client site.",
    takeaway: "Your CMP manages choices. CertScore.ai checks observed behavior.",
    image: "08-cmp-audit", width: 568, height: 752, report: "choices",
    alt: "CertScore.ai CMP audit with thirteen implementation checks for an owned OneTrust test page."
  },
  {
    id: "consent-choices", chapter: "Test consent choices", title: "See which consent choices were available",
    description: "Inspect the observed Accept, Reject and settings controls alongside the outcome of each supported observation. Keep control discovery, the completed click and consent-state confirmation distinct.",
    takeaway: "Understand exactly which choice path the evidence covers.",
    image: "09-consent-choices", width: 568, height: 498, report: "choices",
    alt: "CertScore.ai consent choices panel showing observed controls and separate Accept and Reject outcomes."
  },
  {
    id: "accept", chapter: "Test consent choices", title: "See what appears after Accept",
    description: "Switch to the Accept observation to inspect its timeline and services. Eligible Accept and Reject checks use separate fresh browser sessions so each path has its own evidence.",
    takeaway: "Investigate activity revealed after the visitor’s choice.",
    image: "10-accept-observation", width: 1150, height: 652, report: "choices",
    alt: "CertScore.ai Accept observation showing its event timeline and services, with capture and confirmation status."
  },
  {
    id: "reject", chapter: "Test consent choices", title: "Check what remains after Reject",
    description: "Inspect retained non-essential cookies and service requests after an eligible Reject click, including request timing where available. Investigate tag firing and consent configuration for GDPR/ePrivacy review.",
    takeaway: "Answer a practical question: what did the site do after Reject?",
    image: "11-after-reject-evidence", width: 543, height: 444, report: "choices",
    alt: "CertScore.ai activity-after-choice evidence showing a retained non-essential cookie and request after Reject."
  },
  {
    id: "california-overview", chapter: "Review California privacy", title: "Bring a CCPA perspective to the report",
    description: "Review the California posture and its supported findings alongside the scan context. Give privacy teams a separate CCPA/CPRA review workflow while retaining the broader website evidence.",
    takeaway: "Support California review alongside GDPR/ePrivacy review.",
    image: "12-california-review", width: 1150, height: 483, report: "california",
    alt: "CertScore.ai owned test-site report with the California privacy review selected and its score and findings visible."
  },
  {
    id: "gpc", chapter: "Review California privacy", title: "Compare behavior with Global Privacy Control",
    description: "Inspect GPC delivery evidence and the baseline-versus-GPC comparison, including observed advertising and analytics activity. Open the details to see what the comparison supports and where coverage is limited.",
    takeaway: "Investigate the website’s response to an opt-out signal.",
    image: "13-gpc-evidence", width: 568, height: 1400, report: "california",
    alt: "CertScore.ai GPC panel with signal delivery, matched observation windows and baseline-versus-GPC activity."
  },
  {
    id: "california-notices", chapter: "Review California privacy", title: "Review California notices and opt-out routes",
    description: "Inspect retained sale/sharing choices, rights language, collection notices and policy topics. The detailed assessment separates discovered wording and links from tested functionality and opt-out effectiveness.",
    takeaway: "Make notice and choice gaps easier to investigate.",
    image: "14-california-notices", width: 568, height: 1500, report: "california",
    alt: "CertScore.ai California review with notice coverage, rights clauses, collection-purpose matching and opt-out inspection details."
  },
  {
    id: "policy-checklist", chapter: "Inspect disclosures & forms", title: "Work through privacy disclosures systematically",
    description: "Review policy and disclosure checks, from controller information to purpose, rights and other retained wording. Expand individual rows to connect GDPR/ePrivacy review questions with captured evidence.",
    takeaway: "Give DPOs a structured starting point for disclosure review.",
    image: "15-policy-checklist", width: 568, height: 1054, report: "baseline",
    alt: "CertScore.ai policies and disclosures checklist with expanded evidence and assessment details."
  },
  {
    id: "policy-excerpts", chapter: "Inspect disclosures & forms", title: "Read the policy passage captured at scan time",
    description: "Open the retained policy viewer to inspect highlighted text and its source. Review the actual passage behind a finding instead of relying only on a summary or the website’s current wording.",
    takeaway: "Keep the disclosure evidence attached to the review.",
    image: "16-retained-policy", width: 1024, height: 459, report: "baseline",
    alt: "CertScore.ai retained policy viewer highlighting controller and contact disclosure text from the owned test site."
  },
  {
    id: "forms", chapter: "Inspect disclosures & forms", title: "Inspect the personal data a form asks for",
    description: "Expand observed forms to review field labels, input types, data categories and required states. Investigate data minimization and the notices presented around collection.",
    takeaway: "Connect website privacy review to real collection fields.",
    image: "19-forms-fields", width: 1150, height: 350, report: "choices",
    alt: "CertScore.ai expanded form fields showing name, email, phone and postal code with data categories and required states."
  },
  {
    id: "form-screenshots", chapter: "Inspect disclosures & forms", title: "See the form in its visual context",
    description: "Open a verified masked form screenshot when capture is available. Give reviewers a visual reference alongside the field inventory without filling or submitting the form.",
    takeaway: "Show developers and clients the collection surface to inspect.",
    image: "20-form-screenshot", width: 576, height: 385, report: "choices",
    alt: "CertScore.ai form snapshot dialog displaying a masked screenshot of the owned demo enquiry form."
  },
  {
    id: "accessibility", chapter: "Turn evidence into action", title: "Locate accessibility issues with WCAG context",
    description: "Inspect automated accessibility findings with the affected element, observed values and WCAG reference. The example expands a text-contrast issue to support a focused developer fix and manual accessibility review.",
    takeaway: "Add accessibility evidence to the website review workflow.",
    image: "21-accessibility-evidence", width: 568, height: 1013, report: "baseline",
    alt: "CertScore.ai accessibility panel with an expanded contrast issue, element selector, measured ratio and WCAG reference."
  },
  {
    id: "hidden-links", chapter: "Turn evidence into action", title: "Investigate hidden outbound links",
    description: "Expand a site-integrity observation to inspect the destination and retained source evidence. Help developers trace unexpected links that deserve investigation on the scanned page.",
    takeaway: "Expose page details that can be easy to overlook visually.",
    image: "22-hidden-links", width: 568, height: 585, report: "choices",
    alt: "CertScore.ai site-integrity evidence with an expanded hidden outbound link destination from the owned test page."
  },
  {
    id: "connection-security", chapter: "Turn evidence into action", title: "Review how the page and forms connect",
    description: "Inspect HTTPS, certificate, redirect, mixed-content and form-destination observations together. Use the retained transport checks to identify which connection settings need attention.",
    takeaway: "Bring connection security into the same evidence review.",
    image: "23-connection-security", width: 568, height: 376, report: "baseline",
    alt: "CertScore.ai connection security checklist for HTTPS, certificates, redirects, mixed content and form destinations."
  },
  {
    id: "share-export", chapter: "Turn evidence into action", title: "Share the evidence and plan the retest",
    description: "Share a report link or export a Word report for a developer, DPO or agency client. Agree on the fixes to investigate, make the changes and run a new scan to review the updated behavior.",
    takeaway: "Turn a report into a practical remediation conversation.",
    image: "24-share-export", width: 1150, height: 467, report: "choices",
    alt: "CertScore.ai Share menu offering a report link, email sharing and Word export."
  }
];

export const HOW_IT_WORKS_HIGHLIGHTS = highlights.map(({ image, report, ...highlight }) => ({
  ...highlight, src: `/how-it-works/2026-11/${image}.jpg`, source: REPORTS[report]
}));

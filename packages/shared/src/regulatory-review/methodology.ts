export const INLINE_METHODOLOGY_SUMMARY =
  "CertScore reviews publicly observable website surfaces and browser behavior, retains reproducible evidence, applies deterministic confidence rules, and uses posture-based wording rather than legal conclusions.";

export const PUBLIC_METHODOLOGY_SECTIONS = [
  {
    heading: "What CertScore reviews",
    body:
      "CertScore reviews publicly observable website surfaces such as legal pages, privacy-choice interfaces, browser behavior after page load, and automated accessibility results on tested public pages. The system is designed to assess observable posture, not to issue legal conclusions."
  },
  {
    heading: "What counts as observable evidence",
    body:
      "Observable evidence includes screenshots, retained DOM excerpts, timestamped network requests, cookie and storage changes, session interaction logs, and automated accessibility results on tested pages. Findings are expected to cite concrete evidence rather than broad narrative statements."
  },
  {
    heading: "How scans are run",
    body:
      "Scans use a defined browser profile, test a bounded set of public pages and key flows, record methodology metadata, and retain timestamps for the evidence captured during the session. Repeatability is noted when behavior is rechecked across multiple pages or sessions."
  },
  {
    heading: "How privacy-choice testing works",
    body:
      "Privacy-choice testing looks for publicly visible rights and opt-out surfaces, observes whether tracking appears before or after a tested choice interaction, and records control-state evidence where it is externally visible during the scan."
  },
  {
    heading: "How browser-signal testing works",
    body:
      "Browser-signal testing compares signal-enabled and control conditions when configured, then looks for observable confirmation, persistence, or behavior changes that would indicate the site reacted to the tested browser-level preference."
  },
  {
    heading: "How accessibility testing works",
    body:
      "Accessibility testing uses automated checks on tested pages and flags barriers that were directly observed. Automated testing can reveal many important issues, but it does not by itself determine WCAG conformance or legal posture. Manual review remains important for complete evaluation."
  },
  {
    heading: "Confidence and severity methodology",
    body:
      "Confidence is assigned by deterministic rules based on evidence type count, repeatability, and the presence or absence of contradictory signals. Severity reflects the materiality of the observed gap on tested flows, not a legal penalty estimate."
  },
  {
    heading: "What “not detected” means",
    body:
      "Not detected means the expected public surface or behavior was not evident under the tested conditions. It does not mean the capability is absent in every environment, account state, or jurisdiction."
  },
  {
    heading: "Important limitations",
    body:
      "CertScore observes only what can be seen from the tested public conditions. Internal processing, server-side controls, private dashboards, and region-specific behavior can differ. Authenticated or geofenced flows may not be covered in the retained evidence."
  },
  {
    heading: "Why findings are posture-based and not legal conclusions",
    body:
      "Findings intentionally use conservative posture language because CertScore is not a legal conclusion engine. The product is built to support skeptical review with reproducible evidence, clear methodology, and limits on what automated scanning can defensibly determine."
  }
];

export const REVIEWER_METHODOLOGY_SECTIONS = [
  {
    heading: "Reviewer-oriented methodology notes",
    body:
      "Each scan stores browser profile settings, consent reset behavior, page-selection metadata, signal-testing conditions, and evidence-collection flags so reviewers can understand what was and was not tested before relying on a finding."
  },
  {
    heading: "Evidence and contradiction handling",
    body:
      "Claim-vs-behavior gaps are surfaced only when exact public claim text is retained, the claim is materially relevant, and concrete timestamped behavior evidence is also retained. Low-confidence findings are marked reviewer-only by default."
  },
  {
    heading: "Safety controls",
    body:
      "All findings and customer-facing output pass through prohibited-language validation and sanitization before they can be persisted or displayed. Outputs that cannot be safely rewritten are blocked."
  }
];

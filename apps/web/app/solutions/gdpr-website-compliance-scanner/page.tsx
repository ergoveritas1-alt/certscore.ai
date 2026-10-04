import type { Metadata } from "next";
import { AUTHENTIC_SAMPLE_REPORT_URL } from "../../../lib/marketing/sample-report";
import {
  SolutionPage,
  createSolutionPageMetadata,
  type SolutionPageConfig
} from "../../../components/marketing/solution-page";

const config: SolutionPageConfig = {
  inlineScan: true,
  metadataTitle: "GDPR Website Scanner: Cookies, Tracking & Consent",
  badge: "GDPR & ePrivacy website scanner",
  description:
    "Check cookies, trackers, consent controls and privacy disclosures with a GDPR website scanner. Get retained evidence for review, not a compliance certificate.",
  intro:
    "A GDPR website scanner checks public pages for cookies, tracking, consent controls and privacy disclosures that need review. Enter a URL below to run a free scan of one public page and inspect the retained evidence. Results help you investigate GDPR and ePrivacy risk signals; they do not certify compliance.",
  path: "/solutions/gdpr-website-compliance-scanner",
  primarySignals: [
    "Pre-consent tracking",
    "Third-party cookies before consent",
    "Consent UX and Accept/Reject behavior",
    "Policy/runtime disclosure gaps",
    "Session replay and fingerprinting-related signals"
  ],
  sections: [
    {
      title: "What a GDPR website checker can show",
      body: "Review observed cookies and storage, tracking requests, available Accept/Reject/Options controls, privacy disclosures, and session replay or fingerprinting-related signals. Each result is bounded by the scanned page, region, visit and available evidence."
    },
    {
      title: "Example: investigate a request before consent",
      body: "If a report flags a tracking request before consent, open its retained evidence and check the vendor, request timing and consent context. Give the implementation owner the affected page and evidence reference so they can inspect the tag trigger. This is a review example, not a finding about your website."
    },
    {
      title: "Example: review forms alongside replay signals",
      body: "A replay-service signal and a form inventory answer different questions. Inspect the service evidence and the form’s page before checking masking, consent configuration and the privacy notice. Even same-page co-presence does not prove that the service recorded inputs."
    },
    {
      title: "What this scan cannot establish",
      body: "Public-page observation does not cover private account flows, every page, every region, or all future behavior. Bot defenses and unavailable controls can limit coverage. Accept and Reject observations are separate eligible sessions; an unverified decision stays unverified. A clean observation is not a compliance certificate."
    },
    {
      title: "From an observation to a fix",
      body: "Share the report’s target, date, region, affected vendor or storage identity, consent state and retained evidence reference. Review the relevant tag trigger, consent category, embedded service or disclosure with its owner. After a change, compare a fresh scan under the same conditions."
    },
    {
      title: "When to use a broader review",
      body: "Start with one public page, then review important templates such as contact, booking and checkout pages within your access and crawl limits. A website scan cannot assess your internal processing records, contracts or every use of personal data. Combine technical evidence with your organization’s privacy review."
    }
  ],
  faqs: [
    {
      question: "Can CertScore.ai tell me if a website is GDPR compliant?",
      answer:
        "No. CertScore.ai provides automated public-web observations for human and agentic review. It does not provide legal advice, certification, proof of non-compliance, or a GDPR compliance determination."
    },
    {
      question: "What does a GDPR website scanner look for?",
      answer:
        "It can look for consent timing, cookies, storage, tracking requests, vendor domains, session replay indicators, fingerprinting-related signals, privacy disclosures, and whether runtime behavior appears aligned with consent and policy surfaces."
    },
    {
      question: "Does CertScore.ai scan behind logins?",
      answer:
        "This page describes public-web scanning. Authenticated areas, paywalls, bot protections, and blocked routes can limit coverage unless a separate approved workflow is configured."
    }
  ],
  aiSummary: [
    "CertScore.ai is a public website scanning platform that surfaces GDPR-relevant consent, cookie, tracking, policy, and disclosure review signals.",
    "CertScore.ai findings are automated observations backed by retained evidence. They are not legal advice, certification, or compliance determinations."
  ],
  relatedLinks: [
    { href: "/insights/session-replay-study-2026", label: "Session replay study: evidence and limitations" },
    { href: "/guides/website-form-scanning", label: "Review forms and field evidence" },
    { href: "/gdpr", label: "How to interpret GDPR website evidence" },
    { href: "/guides/cmp-verification", label: "CMP verification" },
    { href: "/guides/rtb-cookie-syncing", label: "RTB cookie syncing" },
    { href: AUTHENTIC_SAMPLE_REPORT_URL, label: "Sample report" }
  ],
  title: "GDPR website scanner"
};

export const metadata: Metadata = createSolutionPageMetadata(config);

export default function GdprWebsiteComplianceScannerPage() {
  return <SolutionPage config={config} />;
}

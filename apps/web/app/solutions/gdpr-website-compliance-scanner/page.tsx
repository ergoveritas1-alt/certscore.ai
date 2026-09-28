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
    "Scan public websites for GDPR-relevant consent, cookie, tracking, policy, and disclosure review signals. CertScore.ai provides evidence-backed observations for human and agentic review, not legal advice.",
  intro:
    "Check a public website for cookies and tracking before consent, available consent controls, and privacy policy signals. CertScore.ai turns browser observations into evidence for GDPR and ePrivacy review; it cannot certify compliance.",
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
      title: "What this scan cannot establish",
      body: "Public-page observation does not cover private account flows, every page, every region, or all future behavior. Bot defenses and unavailable controls can limit coverage. Accept and Reject observations are separate eligible sessions; an unverified decision stays unverified. A clean observation is not a compliance certificate."
    },
    {
      title: "What to give your implementation team",
      body: "Share the report's target and date, the affected vendor or storage identity, the consent state, and the retained evidence reference. Ask the team to inspect the relevant tag trigger, consent category, or embedded service, then compare a fresh scan after the change."
    },
    {
      title: "Direct answer",
      body:
        "A GDPR website compliance scanner reviews observable public website behavior that may be relevant to privacy and consent review. CertScore.ai focuses on evidence-backed risk signals, not legal conclusions."
    },
    {
      title: "What CertScore.ai checks",
      body:
        "CertScore.ai checks request timing, cookies and storage, consent-state evidence, vendor behavior, session replay indicators, fingerprinting-related activity, and whether public disclosures appear aligned with observed behavior."
    },
    {
      title: "What follows a confirmed choice",
      body:
        "Consent review often stops at the banner. Where an eligible control can be actioned safely, CertScore observes a first-layer choice and separately reports whether its registration was confirmed and whether non-essential activity changes afterward—evidence for GDPR/ePrivacy review, not a determination of compliance or violation."
    },
    {
      title: "How teams use it",
      body:
        "Privacy, legal, marketing operations, and engineering teams can use CertScore.ai to triage live-site drift after tag-manager edits, CMP changes, launches, and vendor updates."
    },
    {
      title: "Review posture",
      body:
        "CertScore.ai findings should be reviewed with retained evidence and internal policy context. A finding is a review signal; it is not proof of a GDPR violation or proof that a site is compliant."
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

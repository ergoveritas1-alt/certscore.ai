import type { Metadata } from "next";
import {
  SolutionPage,
  createSolutionPageMetadata,
  type SolutionPageConfig
} from "../../../components/marketing/solution-page";

const config: SolutionPageConfig = {
  badge: "GDPR website scanner",
  description:
    "Scan public websites for GDPR-relevant consent, cookie, tracking, policy, and disclosure review signals. CertScore.ai provides evidence-backed observations for review, not legal advice.",
  intro:
    "CertScore.ai helps teams review GDPR-relevant website behavior by observing public pages in a real browser and surfacing consent, cookie, tracking, policy, and disclosure signals that deserve follow-up.",
  path: "/solutions/gdpr-website-compliance-scanner",
  primarySignals: [
    "Pre-consent tracking",
    "Third-party cookies before consent",
    "Consent UX and reject-path behavior",
      "Policy/runtime disclosure gaps",
      "Session replay and fingerprinting-related signals"
  ],
  sections: [
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
        "No. CertScore.ai provides automated public-web observations for review. It does not provide legal advice, certification, proof of non-compliance, or a GDPR compliance determination."
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
    { href: "/gdpr", label: "GDPR privacy scanner" },
    { href: "/guides/cmp-verification", label: "CMP verification" },
    { href: "/guides/rtb-cookie-syncing", label: "RTB cookie syncing" },
    { href: "/sample-report", label: "Sample report" }
  ],
  title: "GDPR website compliance scanner"
};

export const metadata: Metadata = createSolutionPageMetadata(config);

export default function GdprWebsiteComplianceScannerPage() {
  return <SolutionPage config={config} />;
}

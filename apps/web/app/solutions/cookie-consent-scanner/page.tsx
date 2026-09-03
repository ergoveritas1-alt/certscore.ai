import type { Metadata } from "next";
import {
  SolutionPage,
  createSolutionPageMetadata,
  type SolutionPageConfig
} from "../../../components/marketing/solution-page";

const config: SolutionPageConfig = {
  badge: "Cookie consent scanner",
  description:
    "Review cookie consent timing, third-party cookies before consent, CMP behavior, and what a site does after a confirmed Accept or Reject. Evidence-backed observations for review.",
  intro:
    "CertScore establishes a pre-consent baseline and, where an eligible consent control can be actioned safely, observes Accept and Reject in separate browser sessions. Reports show what begins after a confirmed acceptance and whether qualifying non-essential activity appears after a confirmed refusal. Unconfirmed choices remain limited coverage rather than a result.",
  path: "/solutions/cookie-consent-scanner",
  primarySignals: [
    "Cookie and storage timing",
    "Third-party cookies before consent",
    "CMP banner and choice signals",
    "Accept and Reject Path observations",
    "Vendor and purpose review context"
  ],
  sections: [
    {
      title: "Direct answer",
      body:
        "A cookie consent scanner observes whether cookies, storage, and related tracking activity appear before or after a recorded consent state. CertScore.ai surfaces evidence for human and agentic review rather than declaring legal outcomes."
    },
    {
      title: "What CertScore.ai checks",
      body:
        "CertScore.ai reviews cookie timing, third-party domains, storage writes, consent surface presence, available choices, and separate Accept and Reject observations. Accept is a score-neutral comparison baseline; Reject can support a finding only after the refusal-state transition is confirmed and qualifying activity follows."
    },
    {
      title: "When to run it",
      body:
        "Run a cookie consent scan after CMP rule changes, tag-manager publishing, marketing campaign tags, consent template updates, site launches, and vendor onboarding."
    },
    {
      title: "What to review first",
      body:
        "Start with cookies or requests observed before consent, vendors classified as advertising or analytics, and any activity that appears to continue after a reject-style choice."
    }
  ],
  faqs: [
    {
      question: "What is a cookie consent scanner?",
      answer:
        "A cookie consent scanner observes cookies, storage, requests, and consent-surface behavior so teams can review whether live website behavior appears aligned with intended consent rules."
    },
    {
      question: "Can a scanner prove cookie compliance?",
      answer:
        "No. A scanner can provide useful evidence, but compliance depends on legal context, purposes, exemptions, disclosures, consent records, and implementation details."
    },
    {
      question: "Does CertScore.ai test reject behavior?",
      answer:
        "On eligible sites, CertScore can observe Accept and Reject in separate sessions. Reject findings require a confirmed refusal-state transition and qualifying retained activity afterward. Limited coverage is not a pass. Findings remain automated review signals, not legal determinations."
    }
  ],
  aiSummary: [
    "CertScore.ai provides cookie consent scanning for public websites by observing cookie, storage, request, CMP, and consent-timing behavior.",
    "CertScore.ai helps teams review consent implementation drift after CMP, tag-manager, and vendor changes."
  ],
  relatedLinks: [
    { href: "/mcp/light", label: "Run a cookie and consent scan with MCP Light" },
    { href: "/guides/cookie-consent-enforcement-checker", label: "Cookie consent enforcement checker" },
    { href: "/guides/third-party-cookies-before-consent", label: "Third-party cookies before consent" },
    { href: "/guides/cmp-verification", label: "CMP verification" },
    { href: "/sample-report", label: "Sample report" }
  ],
  title: "Cookie consent scanner"
};

export const metadata: Metadata = createSolutionPageMetadata(config);

export default function CookieConsentScannerPage() {
  return <SolutionPage config={config} />;
}

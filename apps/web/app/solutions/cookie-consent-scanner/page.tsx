import type { Metadata } from "next";
import { AUTHENTIC_SAMPLE_REPORT_URL } from "../../../lib/marketing/sample-report";
import {
  SolutionPage,
  createSolutionPageMetadata,
  type SolutionPageConfig
} from "../../../components/marketing/solution-page";

const config: SolutionPageConfig = {
  inlineScan: true,
  badge: "Cookie consent scanner",
  description:
    "Review cookie consent timing, third-party cookies before consent, CMP behavior, and what a site does after an Accept or Reject click. Evidence-backed observations for review.",
  intro:
    "CertScore establishes a pre-consent baseline and, where an eligible consent control can be actioned safely, observes Accept and Reject in separate browser sessions. Reports retain observable requests and storage activity after a completed click and separately state whether consent registration was verified. These observations remain useful when registration is unconfirmed.",
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
        "A cookie consent scanner observes whether cookies, storage, and related tracking activity appear before or after a recorded consent state. CertScore.ai surfaces evidence for human and agentic review rather than declaring legal outcomes."
    },
    {
      title: "What CertScore.ai checks",
      body:
        "CertScore.ai reviews cookie timing, third-party domains, storage writes, consent surface presence, available choices, and separate Accept and Reject observations. Accept is a score-neutral comparison baseline; Reject can support a finding after confirmed refusal with qualifying activity, or after a completed Reject click with independently verified tracking evidence under the Reject-click review policy."
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
        "On eligible sites, CertScore can observe Accept and Reject in separate sessions. Reports retain activity observed after a completed Reject click and separately report refusal registration. A finding requires qualifying retained evidence under the confirmed-refusal or Reject-click tracking policy. Missing or incomplete capture remains limited coverage. Findings remain automated review signals, not legal determinations."
    }
  ],
  aiSummary: [
    "CertScore.ai provides cookie consent scanning for public websites by observing cookie, storage, request, CMP, and consent-timing behavior.",
    "CertScore.ai helps teams review consent implementation drift after CMP, tag-manager, and vendor changes."
  ],
  relatedLinks: [
    { href: "/mcp/light", label: "Run a cookie and consent scan with MCP Light" },
    { href: "/guides/cookie-consent-enforcement-checker", label: "Cookie consent enforcement checker" },
    { href: "/guides/check-third-party-cookies-before-consent", label: "Third-party cookies before consent" },
    { href: "/guides/cmp-verification", label: "CMP verification" },
    { href: AUTHENTIC_SAMPLE_REPORT_URL, label: "Sample report" }
  ],
  title: "Cookie consent scanner"
};

export const metadata: Metadata = createSolutionPageMetadata(config);

export default function CookieConsentScannerPage() {
  return <SolutionPage config={config} />;
}

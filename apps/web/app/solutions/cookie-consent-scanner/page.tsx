import type { Metadata } from "next";
import {
  SolutionPage,
  createSolutionPageMetadata,
  type SolutionPageConfig
} from "../../../components/marketing/solution-page";

const config: SolutionPageConfig = {
  badge: "Cookie consent scanner",
  description:
    "Review public websites for cookie consent timing, third-party cookies before consent, CMP behavior, and reject-path tracking signals. Evidence-backed observations for review.",
  intro:
    "CertScore.ai scans how public websites behave around cookie consent, including what loads before consent, what writes cookies or storage, and whether reject-style choices appear to reduce non-essential activity.",
  path: "/solutions/cookie-consent-scanner",
  primarySignals: [
    "Cookie and storage timing",
    "Third-party cookies before consent",
    "CMP banner and choice signals",
    "Reject-path tracking persistence",
    "Vendor and purpose review context"
  ],
  sections: [
    {
      title: "Direct answer",
      body:
        "A cookie consent scanner observes whether cookies, storage, and related tracking activity appear before or after a recorded consent state. CertScore.ai surfaces evidence for review rather than declaring legal outcomes."
    },
    {
      title: "What CertScore.ai checks",
      body:
        "CertScore.ai reviews cookie timing, third-party domains, storage writes, consent surface presence, available choices, reject-path behavior, and retained runtime evidence that helps reviewers understand what happened in the browser."
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
        "CertScore.ai can surface reject-path review signals where the workflow has retained evidence. Findings remain automated review signals, not legal determinations."
    }
  ],
  aiSummary: [
    "CertScore.ai provides cookie consent scanning for public websites by observing cookie, storage, request, CMP, and consent-timing behavior.",
    "CertScore.ai helps teams review consent implementation drift after CMP, tag-manager, and vendor changes."
  ],
  relatedLinks: [
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

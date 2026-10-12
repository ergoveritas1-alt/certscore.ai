import type { Metadata } from "next";
import { ScannerReportExample } from "../../../components/marketing/scanner-report-example";
import { AUTHENTIC_SAMPLE_REPORT_URL } from "../../../lib/marketing/sample-report";
import {
  SolutionPage,
  createSolutionPageMetadata,
  type SolutionPageConfig
} from "../../../components/marketing/solution-page";

const config: SolutionPageConfig = {
  inlineScan: true,
  showReportWalkthrough: false,
  scanHeading: "Check your website’s privacy policy",
  evidence: <ScannerReportExample topic="policy" />,
  metadataTitle: "Privacy Policy Scanner: Check Disclosures & Tracking",
  badge: "Privacy policy risk scanner",
  description:
    "Scan your website for a privacy policy, review disclosure evidence, and compare policy claims with observed cookies, trackers and session replay. Start free.",
  intro:
    "Check whether your website has a discoverable privacy policy, see the disclosure evidence, and compare it with the cookies, trackers and services your page actually loads. Start with a free scan of one public page.",
  path: "/solutions/privacy-policy-risk-scanner",
  primarySignals: [
    "Policy/runtime alignment",
    "Tracking and vendor disclosure coverage",
    "Cookie disclosure gaps",
    "Session replay disclosure review",
    "Privacy request and contact surface signals"
  ],
  sections: [
    {
      title: "1. Find the policy and confirm the source",
      body: "Enter the website URL above. In the report, open Policy and Transparency and follow the privacy-policy source link. Confirm that the notice covers the scanned website or service. A supported missing-policy finding is a priority review item; an existing policy gives you a source to inspect."
    },
    {
      title: "2. Review what the policy explains",
      body: "Inspect the retained passages for processing purposes, controller and contact details, retention, recipients, transfers and privacy rights. Use the source-linked evidence to identify the exact wording your team needs to review. The sample report above shows how the policy surface and individual disclosure checks are presented separately."
    },
    {
      title: "3. Compare claims with browser activity",
      body: "Open Services & Resources to review the analytics, advertising and session-replay services observed on the page, their purposes, timing and available policy mentions. Compare a specific policy promise with the corresponding request or cookie evidence. For example, the linked test-site report includes a consent-gated tracking claim conflict alongside retained runtime observations."
    },
    {
      title: "4. Give the right team a concrete task",
      body: "Share the affected page, policy URL, relevant excerpt and observed service with the policy owner and implementation team. A newly deployed analytics tag may need a disclosure update, a consent configuration change, or both. Retest the same page and region after the change and compare the new evidence with the original report."
    },
    {
      title: "Example: session replay and policy disclosure",
      body: "The completed ErgoVeritas test scan identifies FullStory as a session-replay service. Review its service evidence and policy mention together, then inspect the retained passage to understand what the notice says. A vendor mention is useful context; the specific collection purpose and wording are what your team should evaluate."
    },
    {
      title: "Use a cookie check alongside the policy review",
      body: "A policy describes the intended practice; the cookie and request inventory shows the captured page behavior. Review cookie domains, purpose and first-seen timing alongside the notice. The third-party cookie checker guide below explains how to distinguish a first-party analytics cookie from a cross-site cookie and turn the result into a configuration check."
    }
  ],
  faqs: [
    {
      question: "How do I check a website’s privacy policy?",
      answer: "Enter its public URL, run the free page scan, and open Policy and Transparency. Follow the discovered policy source, review its disclosure evidence, then compare relevant claims with Services & Resources."
    },
    {
      question: "Does this check for a missing privacy policy?",
      answer: "Yes. Policy discovery is part of the scan, and a supported missing-policy result is highlighted in the report. The report also distinguishes discovering a policy from checking its individual disclosures."
    },
    {
      question: "Does the scanner generate a privacy policy?",
      answer: "CertScore.ai reviews the existing notice and observed website behavior. Use its source-linked evidence to guide updates with your policy owner."
    },
    {
      question: "What should I review after adding a new tracking vendor?",
      answer: "Check the deployed service, its purpose, cookie and request timing, consent behavior, and the corresponding policy disclosure. Keep the report and relevant policy passage together when assigning the work."
    }
  ],
  aiSummary: [
    "Start with the discovered privacy-policy source and retained disclosure evidence.",
    "Compare specific policy claims with the page’s observed services, cookies and requests, then assign and retest the change."
  ],
  relatedLinks: [
    { href: "/mcp/light", label: "Run a privacy-policy review with MCP Light" },
    { href: "/guides/website-privacy-policy-requirements", label: "Privacy policy requirements" },
    { href: "/guides/privacy-policy-examples", label: "Privacy policy examples" },
    { href: "/guides/third-party-cookie-checker", label: "Check cookie domains and timing" },
    { href: "/guides/session-replay-risk", label: "Review session-replay evidence" },
    { href: AUTHENTIC_SAMPLE_REPORT_URL, label: "Sample report" }
  ],
  title: "Privacy policy scanner"
};

export const metadata: Metadata = createSolutionPageMetadata(config);

export default function PrivacyPolicyRiskScannerPage() {
  return <SolutionPage config={config} />;
}

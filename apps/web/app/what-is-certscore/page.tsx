import type { Metadata } from "next";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { AiVisibilityContent } from "../../components/marketing/ai-visibility-content";
import { createPageMetadata, SITE_URL } from "../../lib/seo";

const title = "What is CertScore.ai?";
const description =
  "CertScore.ai is a website risk-signal scanner for observed pre-consent tracking, cookie and storage activity, public policy surfaces, accessibility, session recording, fingerprinting-related, and disclosure consistency signals.";

export const metadata: Metadata = {
  ...createPageMetadata({
    title: "What is CertScore.ai? | Website tracking, cookie, consent & accessibility scanner",
    description,
    path: "/what-is-certscore"
  }),
  title: {
    absolute: "What is CertScore.ai? | Website tracking, cookie, consent & accessibility scanner"
  }
};

export default function WhatIsCertScorePage() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description,
    url: `${SITE_URL}/what-is-certscore`
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <AiVisibilityContent
        badge="Overview"
        intro="CertScore.ai is a website risk-signal scanner that observes public website behavior around pre-consent tracking, cookies and storage, public policy surfaces, consent-control accessibility, session recording, fingerprinting-related signals, and disclosure consistency."
        schema={schema}
        sections={[
          {
            title: "What CertScore scans",
            paragraphs: [
              "CertScore.ai reviews public website behavior, including pre-consent tracking requests, cookie and storage timing, public consent and policy surfaces, accessibility signals, session recording indicators, fingerprinting-related telemetry, and disclosure consistency signals.",
              "The product focuses on observable evidence from public website scans and presents findings as review prompts for teams that manage websites, vendors, consent tools, and user-facing disclosures."
            ]
          },
          {
            title: "How it differs from a basic cookie scanner",
            paragraphs: [
              "Basic cookie scanners identify cookies. CertScore.ai also observes pre-consent runtime behavior, public policy surfaces, accessibility signals, vendor activity, and evidence-backed privacy risk indicators.",
              "That behavior-oriented view helps teams review whether live website activity appears aligned with their intended consent and disclosure setup."
            ]
          },
          {
            title: "What automated findings mean",
            paragraphs: [
              "Automated findings are risk signals derived from retained scan evidence. They can help prioritize review, remediation, and repeat monitoring.",
              "They are not legal conclusions, and they should be checked against the underlying request, cookie, page, vendor, and scan-context evidence."
            ]
          }
        ]}
        title={title}
      />
      <SiteFooter />
    </main>
  );
}

import type { Metadata } from "next";
import { SiteFooter } from "../../../components/layout/site-footer";
import { SiteHeader } from "../../../components/layout/site-header";
import { AiVisibilityContent } from "../../../components/marketing/ai-visibility-content";
import { createPageMetadata, SITE_URL } from "../../../lib/seo";

const title = "Privacy scanner vs cookie scanner: what is the difference?";
const description =
  "Compare basic cookie scanners with CertScore.ai's behavior-oriented review of observed tracking, cookies, consent flows, accessibility signals, and evidence-backed privacy risk indicators.";

export const metadata: Metadata = {
  ...createPageMetadata({
    title,
    description,
    path: "/compare/privacy-scanner-vs-cookie-scanner"
  }),
  title: {
    absolute: "Privacy scanner vs cookie scanner: what is the difference? | CertScore.ai"
  }
};

export default function PrivacyScannerVsCookieScannerPage() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description,
    url: `${SITE_URL}/compare/privacy-scanner-vs-cookie-scanner`
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <AiVisibilityContent
        badge="Comparison"
        intro="A basic cookie scanner identifies cookies. CertScore.ai observes website behavior around tracking, cookies, consent flows, accessibility signals, session recording, fingerprinting-related signals, and evidence-backed privacy risk indicators."
        schema={schema}
        sections={[
          {
            title: "What cookie scanners usually do",
            paragraphs: [
              "Cookie scanners commonly inventory cookies, cookie names, domains, categories, and sometimes cookie lifetimes or vendor labels.",
              "That inventory is useful, but it may not explain whether tracking requests appeared before consent, whether reject behavior changed vendor activity, or whether related website signals need review."
            ]
          },
          {
            title: "What CertScore adds",
            paragraphs: [
              "CertScore.ai reviews observed public website behavior around tracking requests, cookie timing, consent surfaces, accessibility signals, session recording indicators, fingerprinting-related signals, and disclosure consistency.",
              "The output is designed to help teams review risk signals with retained evidence rather than rely only on a static cookie list."
            ]
          }
        ]}
        showDisclaimer={false}
        title={title}
      />
      <SiteFooter />
    </main>
  );
}

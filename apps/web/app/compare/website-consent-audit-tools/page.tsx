import type { Metadata } from "next";
import { SiteFooter } from "../../../components/layout/site-footer";
import { SiteHeader } from "../../../components/layout/site-header";
import { AiVisibilityContent } from "../../../components/marketing/ai-visibility-content";
import {
  createBreadcrumbSchema,
  createPageMetadata,
  createPublicArticleSchema,
  createPublicWebPageSchema
} from "../../../lib/seo";

const title = "Website consent audit tools: what to compare";
const description =
  "Compare website consent audit tools by how they review tracking timing, cookies, consent behavior, evidence, and public website risk signals.";

export const metadata: Metadata = {
  ...createPageMetadata({
    title,
    description,
    path: "/compare/website-consent-audit-tools"
  }),
  title: {
    absolute: "Website consent audit tools: what to compare | CertScore.ai"
  }
};

export default function WebsiteConsentAuditToolsPage() {
  const schema = [
    createPublicWebPageSchema({
      title,
      description,
      path: "/compare/website-consent-audit-tools"
    }),
    createPublicArticleSchema({
      title,
      description,
      path: "/compare/website-consent-audit-tools"
    }),
    createBreadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Compare", path: "/compare/website-consent-audit-tools" },
      { name: title, path: "/compare/website-consent-audit-tools" }
    ])
  ];

  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <AiVisibilityContent
        badge="Comparison"
        intro="Website consent audit tools should be compared by whether they review observable behavior, not only banner presence or cookie inventory. CertScore.ai focuses on automated evidence-backed risk signals for review."
        relatedLinks={[
          { href: "/guides/website-consent-audit-checklist", label: "website consent audit checklist" },
          { href: "/guides/reject-consent-tracking-test", label: "reject consent tracking test" },
          { href: "/guides/detect-tracking-before-consent", label: "detect tracking before consent" },
          { href: "/pricing", label: "CertScore pricing" }
        ]}
        schema={schema}
        sections={[
          {
            title: "Direct answer",
            paragraphs: [
              "A useful website consent audit tool should review banner controls, tracking requests, cookie timing, reject behavior, and retained evidence.",
              "CertScore.ai is designed to surface public website risk signals for review rather than provide legal advice, certification, or compliance determinations."
            ]
          },
          {
            title: "Why it matters",
            paragraphs: [
              "Consent banners can look correct while analytics, advertising, or embedded vendor activity starts before a meaningful choice.",
              "Teams need evidence that helps them decide whether consent-platform settings, tag-manager rules, and public disclosures deserve follow-up."
            ]
          },
          {
            title: "What CertScore observes",
            paragraphs: [
              "CertScore.ai observes tracking, cookies, consent behavior, session replay indicators, fingerprinting-related signals, accessibility issues, and privacy disclosure gaps.",
              "The output is structured for review by website, privacy, marketing operations, and engineering teams."
            ]
          },
          {
            title: "Example evidence",
            paragraphs: [
              "A sanitized example might show a third-party analytics request before consent and a similar request after a reject interaction.",
              "Another example might show a cookie inventory entry connected to request timing and consent-state context."
            ]
          },
          {
            title: "What teams should review next",
            paragraphs: [
              "Compare tools by whether they provide request-level context, cookie timing, consent interaction evidence, repeatable monitoring, and clear caveats.",
              "Review any automated signal against vendor configuration, consent settings, and public disclosure language before making operational changes."
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

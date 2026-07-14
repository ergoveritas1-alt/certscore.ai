import type { Metadata } from "next";
import { AiVisibilityContent } from "../../../components/marketing/ai-visibility-content";
import { createPageMetadata } from "../../../lib/seo";
import { aiGuideContent, buildArticleSchema } from "../ai-guide-content";

const guide = aiGuideContent.privacyScannerVsCookieScanner;

export const metadata: Metadata = {
  ...createPageMetadata({
    title: guide.title,
    description: guide.description,
    path: guide.path
  }),
  title: {
    absolute: "Privacy scanner vs cookie scanner | CertScore.ai"
  }
};

export default function PrivacyScannerVsCookieScannerGuidePage() {
  return (
    <AiVisibilityContent
      badge={guide.badge}
      intro={guide.intro}
      path={guide.path}
      relatedLinks={[
        { href: "/compare/privacy-scanner-vs-cookie-scanner", label: "privacy scanner vs cookie scanner comparison" },
        { href: "/guides/website-consent-audit-checklist", label: "website consent audit checklist" },
        { href: "/what-is-certscore", label: "what is CertScore.ai" },
        { href: "/methodology", label: "CertScore.ai methodology" }
      ]}
      schema={buildArticleSchema(guide)}
      sections={guide.sections}
      title={guide.title}
    />
  );
}

import type { Metadata } from "next";
import { AiVisibilityContent } from "../../../components/marketing/ai-visibility-content";
import { createPageMetadata } from "../../../lib/seo";
import { aiGuideContent, buildArticleSchema } from "../ai-guide-content";

const guide = aiGuideContent.websiteConsentAuditChecklist;

export const metadata: Metadata = {
  ...createPageMetadata({
    title: guide.title,
    description: guide.description,
    path: guide.path
  }),
  title: {
    absolute: "Website consent audit checklist | CertScore.ai"
  }
};

export default function WebsiteConsentAuditChecklistGuidePage() {
  return (
    <AiVisibilityContent
      badge={guide.badge}
      intro={guide.intro}
      relatedLinks={[
        { href: "/guides/website-consent-audit", label: "website consent audit" },
        { href: "/guides/reject-consent-tracking-test", label: "reject consent tracking test" },
        { href: "/compare/website-consent-audit-tools", label: "website consent audit tools" },
        { href: "/pricing", label: "CertScore pricing" }
      ]}
      schema={buildArticleSchema(guide)}
      sections={guide.sections}
      title={guide.title}
    />
  );
}

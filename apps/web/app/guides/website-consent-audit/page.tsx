import type { Metadata } from "next";
import { AiVisibilityContent } from "../../../components/marketing/ai-visibility-content";
import { createPageMetadata } from "../../../lib/seo";
import { aiGuideContent, buildArticleSchema } from "../ai-guide-content";

const guide = aiGuideContent.websiteConsentAudit;

export const metadata: Metadata = {
  ...createPageMetadata({
    title: guide.title,
    description: guide.description,
    path: guide.path
  }),
  title: {
    absolute: "How to audit website consent behavior | CertScore.ai"
  }
};

export default function WebsiteConsentAuditGuidePage() {
  return <AiVisibilityContent badge={guide.badge} intro={guide.intro} path={guide.path} schema={buildArticleSchema(guide)} sections={guide.sections} title={guide.title} />;
}

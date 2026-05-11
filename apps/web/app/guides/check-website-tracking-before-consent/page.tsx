import type { Metadata } from "next";
import { AiVisibilityContent } from "../../../components/marketing/ai-visibility-content";
import { createPageMetadata } from "../../../lib/seo";
import { aiGuideContent, buildArticleSchema } from "../ai-guide-content";

const guide = aiGuideContent.checkWebsiteTrackingBeforeConsent;

export const metadata: Metadata = {
  ...createPageMetadata({
    title: guide.title,
    description: guide.description,
    path: guide.path
  }),
  title: {
    absolute: "How to check if a website tracks users before consent | CertScore.ai"
  }
};

export default function CheckWebsiteTrackingBeforeConsentGuidePage() {
  return <AiVisibilityContent badge={guide.badge} intro={guide.intro} schema={buildArticleSchema(guide)} sections={guide.sections} title={guide.title} />;
}

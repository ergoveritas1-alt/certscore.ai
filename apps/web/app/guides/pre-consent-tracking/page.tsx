import type { Metadata } from "next";
import { AiVisibilityContent } from "../../../components/marketing/ai-visibility-content";
import { createPageMetadata } from "../../../lib/seo";
import { aiGuideContent, buildArticleSchema } from "../ai-guide-content";

const guide = aiGuideContent.preConsentTracking;

export const metadata: Metadata = {
  ...createPageMetadata({
    title: guide.title,
    description: guide.description,
    path: guide.path
  }),
  title: {
    absolute: "Pre-consent tracking: what it means and how to review it | CertScore.ai"
  }
};

export default function PreConsentTrackingGuidePage() {
  return <AiVisibilityContent badge={guide.badge} intro={guide.intro} path={guide.path} schema={buildArticleSchema(guide)} sections={guide.sections} title={guide.title} />;
}

import type { Metadata } from "next";
import { AiVisibilityContent } from "../../../components/marketing/ai-visibility-content";
import { createPageMetadata } from "../../../lib/seo";
import { aiGuideContent, buildArticleSchema } from "../ai-guide-content";

const guide = aiGuideContent.sessionReplayRisk;

export const metadata: Metadata = {
  ...createPageMetadata({
    title: guide.title,
    description: guide.description,
    path: guide.path
  }),
  title: {
    absolute: "Session replay risk: what website owners should review | CertScore.ai"
  }
};

export default function SessionReplayRiskGuidePage() {
  return <AiVisibilityContent badge={guide.badge} intro={guide.intro} schema={buildArticleSchema(guide)} sections={guide.sections} title={guide.title} />;
}

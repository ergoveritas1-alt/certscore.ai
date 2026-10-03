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
  return <AiVisibilityContent relatedLinks={[{ href: "/insights/session-replay-study-2026", label: "Original study: session replay signals across 5,000 scans" }, { href: "/releases/session-replay-detection", label: "Session Replay Detection release" }]} badge={guide.badge} intro={guide.intro} path={guide.path} schema={buildArticleSchema(guide)} sections={guide.sections} title={guide.title} />;
}

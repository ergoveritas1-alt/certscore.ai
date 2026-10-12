import type { Metadata } from "next";
import { AiVisibilityContent } from "../../../components/marketing/ai-visibility-content";
import { createPageMetadata } from "../../../lib/seo";
import { aiGuideContent, buildArticleSchema } from "../ai-guide-content";

const guide = aiGuideContent.checkThirdPartyCookiesBeforeConsent;

export const metadata: Metadata = {
  ...createPageMetadata({
    title: guide.title,
    description: guide.description,
    path: guide.path
  }),
  title: {
    absolute: "How to check third-party cookies before consent | CertScore.ai"
  }
};

export default function CheckThirdPartyCookiesBeforeConsentGuidePage() {
  return <AiVisibilityContent showEvidenceExamples={false} relatedLinks={[{ href: "/guides/third-party-cookie-checker", label: "Check cookie domains and read a report example" }, { href: "/guides/google-analytics-meta-pixel-before-consent", label: "Trace analytics and pixel activity" }, { href: "/guides/reject-consent-tracking-test", label: "Compare the Reject path" }]} badge={guide.badge} intro={guide.intro} path={guide.path} schema={buildArticleSchema(guide)} sections={guide.sections} title={guide.title} />;
}

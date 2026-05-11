import type { Metadata } from "next";
import { AiVisibilityContent } from "../../../components/marketing/ai-visibility-content";
import { createPageMetadata } from "../../../lib/seo";
import { aiGuideContent, buildArticleSchema } from "../ai-guide-content";

const guide = aiGuideContent.rejectConsentTrackingTest;

export const metadata: Metadata = {
  ...createPageMetadata({
    title: guide.title,
    description: guide.description,
    path: guide.path
  }),
  title: {
    absolute: "Reject consent tracking test | CertScore.ai"
  }
};

export default function RejectConsentTrackingTestGuidePage() {
  return (
    <AiVisibilityContent
      badge={guide.badge}
      intro={guide.intro}
      relatedLinks={[
        { href: "/guides/website-consent-audit-checklist", label: "website consent audit checklist" },
        { href: "/guides/detect-tracking-before-consent", label: "detect tracking before consent" },
        { href: "/guides/check-third-party-cookies-before-consent", label: "third-party cookies before consent" },
        { href: "/how-it-works", label: "how CertScore works" }
      ]}
      schema={buildArticleSchema(guide)}
      sections={guide.sections}
      title={guide.title}
    />
  );
}

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
      path={guide.path}
      relatedLinks={[
        { href: "/findings/reject_tracking_persists_after_reject", label: "reject tracking persists finding" },
        { href: "/findings/pre_consent_tracking_detected", label: "tracking started before consent finding" },
        { href: "/guides/website-consent-audit-checklist", label: "website consent audit checklist" },
        { href: "/guides/detect-tracking-before-consent", label: "detect tracking before consent" },
        { href: "/guides/check-third-party-cookies-before-consent", label: "third-party cookies before consent" }
      ]}
      schema={buildArticleSchema(guide)}
      sections={guide.sections}
      title={guide.title}
    />
  );
}

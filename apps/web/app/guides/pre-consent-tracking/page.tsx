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
  return (
    <AiVisibilityContent
      badge={guide.badge}
      intro={guide.intro}
      path={guide.path}
      relatedLinks={[
        { href: "/findings/pre_consent_tracking_detected", label: "tracking started before consent finding" },
        { href: "/findings/reject_tracking_persists_after_reject", label: "reject tracking persists finding" },
        { href: "/guides/cookie-consent-enforcement-checker", label: "cookie consent enforcement" },
        { href: "/benchmarks/pre-consent-tracking-2026", label: "pre-consent tracking benchmark" }
      ]}
      schema={buildArticleSchema(guide)}
      sections={guide.sections}
      title={guide.title}
    />
  );
}

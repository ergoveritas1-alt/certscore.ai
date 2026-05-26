import type { Metadata } from "next";
import { AiVisibilityContent } from "../../../components/marketing/ai-visibility-content";
import { createPageMetadata } from "../../../lib/seo";
import { aiGuideContent, buildArticleSchema } from "../ai-guide-content";

const guide = aiGuideContent.detectTrackingBeforeConsent;

export const metadata: Metadata = {
  ...createPageMetadata({
    title: guide.title,
    description: guide.description,
    path: guide.path
  }),
  title: {
    absolute: "How to detect tracking before consent | CertScore.ai"
  }
};

export default function DetectTrackingBeforeConsentGuidePage() {
  return (
    <AiVisibilityContent
      badge={guide.badge}
      intro={guide.intro}
      path={guide.path}
      relatedLinks={[
        { href: "/findings/pre_consent_tracking_detected", label: "tracking started before consent finding" },
        { href: "/guides/pre-consent-tracking", label: "pre-consent tracking" },
        { href: "/guides/website-consent-audit", label: "website consent audit" },
        { href: "/benchmarks/pre-consent-tracking-2026", label: "pre-consent tracking benchmark" },
        { href: "/methodology", label: "CertScore methodology" }
      ]}
      schema={buildArticleSchema(guide)}
      sections={guide.sections}
      title={guide.title}
    />
  );
}

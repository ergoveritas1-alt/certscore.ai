import type { Metadata } from "next";
import { AiVisibilityContent } from "../../../components/marketing/ai-visibility-content";
import { createPageMetadata } from "../../../lib/seo";
import { aiGuideContent, buildArticleSchema } from "../ai-guide-content";

const guide = aiGuideContent.websiteConsentAuditChecklist;

export const metadata: Metadata = {
  ...createPageMetadata({
    title: guide.title,
    description: guide.description,
    path: guide.path
  }),
  title: {
    absolute: "Website consent audit checklist | CertScore.ai"
  }
};

export default function WebsiteConsentAuditChecklistGuidePage() {
  return (
    <AiVisibilityContent
      scanPrompt={{
        title: "Start your consent review with a website scan",
        description: "Enter a public page URL to gather observations for this checklist. Review visible controls, runtime activity, and available action evidence separately, then record unresolved questions in the worksheet."
      }}
      showEvidenceExamples={false}
      badge={guide.badge}
      intro={guide.intro}
      path={guide.path}
      relatedLinks={[
        { href: "/resources/consent-audit-worksheet.md", label: "Download the consent audit worksheet (Markdown)" },
        { href: "/sample-report", label: "Explore the sample report" },
        { href: "/findings/pre_consent_tracking_detected", label: "tracking started before consent finding" },
        { href: "/findings/reject_tracking_persists_after_reject", label: "reject tracking persists finding" },
        { href: "/findings/cookie_disclosure_gap", label: "cookie disclosure gap finding" },
        { href: "/findings/policy_behavior_contradiction_detected", label: "policy/runtime alignment finding" },
        { href: "/guides/website-consent-audit", label: "website consent audit" },
        { href: "/guides/reject-consent-tracking-test", label: "reject consent tracking test" }
      ]}
      schema={buildArticleSchema(guide)}
      sections={guide.sections}
      title={guide.title}
    />
  );
}

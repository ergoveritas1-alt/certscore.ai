import { AiVisibilityContent } from "../../../components/marketing/ai-visibility-content";
import { createPageMetadata } from "../../../lib/seo";
import { buildArticleSchema } from "../ai-guide-content";
import { practicalGuides } from "../practical-guide-content";

const guide = practicalGuides.analytics;
export const metadata = createPageMetadata({ title: guide.title, description: guide.description, path: guide.path });

export default function PracticalGuidePage() {
  return <AiVisibilityContent {...guide} schema={buildArticleSchema(guide)} showEvidenceExamples={false}
    scanPrompt={{
      title: "Check your site’s GA and Meta activity",
      description: "Scan a public page, then inspect the observed analytics and advertising requests and their consent context. Use the steps below to investigate tag triggers and consent settings; a request alone does not establish what data was collected."
    }}
    relatedLinks={[
      { href: "/guides/test-global-privacy-control", label: "Test GPC response" },
      { href: "/guides/google-analytics-meta-pixel-before-consent", label: "Investigate analytics before consent" },
      { href: "/guides/reject-consent-tracking-test", label: "Test the Reject path" },
      { href: "/guides/consent-report-example", label: "Annotated report example" },
      { href: "/resources/consent-audit-worksheet.md", label: "Download the review worksheet" },
      { href: "/ccpa", label: "CCPA evidence review" }
    ].filter((link) => link.href !== guide.path)} />;
}

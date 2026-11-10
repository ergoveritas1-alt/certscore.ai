import { AiVisibilityContent } from "../../../components/marketing/ai-visibility-content";
import { createPageMetadata } from "../../../lib/seo";
import { buildArticleSchema } from "../ai-guide-content";
import { practicalGuides } from "../practical-guide-content";

const guide = practicalGuides.gpc;
export const metadata = createPageMetadata({ title: guide.title, description: guide.description, path: guide.path });

export default function PracticalGuidePage() {
  return <AiVisibilityContent {...guide} schema={buildArticleSchema(guide)} showEvidenceExamples={false}
    relatedLinks={[
      { href: "/releases/one-in-three-websites-gpc-ad-services", label: "GPC study: 1 in 3 websites contacted ad services" },
      { href: "/guides/test-global-privacy-control", label: "Test GPC response" },
      { href: "/guides/google-analytics-meta-pixel-before-consent", label: "Investigate analytics before consent" },
      { href: "/guides/reject-consent-tracking-test", label: "Test the Reject path" },
      { href: "/guides/consent-report-example", label: "Annotated report example" },
      { href: "/resources/consent-audit-worksheet.md", label: "Download the review worksheet" },
      { href: "/ccpa", label: "CCPA evidence review" }
    ].filter((link) => link.href !== guide.path)} />;
}

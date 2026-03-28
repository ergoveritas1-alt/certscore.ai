import type { Metadata } from "next";
import { InsightTemplate } from "../../../components/marketing/insight-template";
import { createPageMetadata } from "../../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Common Accessibility Issues",
  description:
    "Educational insights page covering typical accessibility issues on public websites and how automated scanners surface related signals.",
  path: "/insights/common-accessibility-issues"
});

export default function CommonAccessibilityIssuesInsightPage() {
  return (
    <InsightTemplate
      eyebrow="Accessibility insights"
      title="Common Accessibility Issues"
      intro="Accessibility issues on public websites often repeat in predictable ways, especially after redesigns, CMS edits, and marketing updates. Understanding those patterns helps teams prioritize what to review first."
      commonPatterns={[
        "Missing alt text, contrast problems, label issues, and structural heading or landmark gaps are among the most repeatable signals.",
        "Accessibility issues often spread through templates, so one problem pattern may affect a homepage, services page, blog page, and contact form at the same time.",
        "Teams frequently fix visible issues while missing the underlying template or component that keeps reintroducing them."
      ]}
      scannerSignals={[
        "Automated scanners can evaluate markup, labels, contrast rules, and structural semantics across selected public pages.",
        "They can also group recurring rule failures into structured findings so repeated issues do not get lost in raw output.",
        "This makes accessibility scanning useful for both first-pass review and repeat monitoring."
      ]}
      examples={[
        "Generic alt text across multiple image-heavy pages.",
        "Contrast failures on primary buttons or secondary navigation links.",
        "Form fields that rely on placeholders rather than real labels."
      ]}
      relatedLinks={[
        { href: "/guides/ada-website-compliance", label: "ADA guide" },
        { href: "/guides/wcag-website-checklist", label: "WCAG checklist" }
      ]}
    />
  );
}

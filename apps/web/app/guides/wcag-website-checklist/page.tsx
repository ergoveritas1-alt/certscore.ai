import type { Metadata } from "next";
import { GuideTemplate } from "../../../components/marketing/guide-template";
import { createPageMetadata } from "../../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "WCAG Website Checklist",
  description:
    "Use this educational guide to understand a practical WCAG website checklist, common accessibility issues, and how CertScore.ai helps surface related signals.",
  path: "/guides/wcag-website-checklist"
});

export default function WcagWebsiteChecklistPage() {
  return (
    <GuideTemplate
      eyebrow="Accessibility guide"
      title="WCAG Website Checklist"
      intro="A WCAG website checklist helps teams review common accessibility patterns in a consistent way. It is most useful when it focuses on repeatable issue types such as text alternatives, contrast, labels, headings, keyboard access, and page structure."
      pagePath="/guides/wcag-website-checklist"
      questionTitle="What should a WCAG website checklist include?"
      whyItMatters={[
        "Teams often know accessibility matters but still struggle to turn broad standards into a practical review workflow.",
        "A checklist helps reduce missed basics across templates, forms, navigation, and content-heavy pages.",
        "It also makes it easier to compare scans over time after redesigns or CMS changes."
      ]}
      commonIssues={[
        "Checklist reviews often miss repeated patterns such as button contrast, heading order, alt text quality, and form labeling.",
        "Teams may review a homepage closely while ignoring interior pages where service forms, blog templates, or ecommerce elements live.",
        "Manual reviews become inconsistent when multiple people interpret the checklist differently."
      ]}
      examples={[
        "A site may pass a quick visual review while still failing keyboard navigation or label association checks.",
        "A blog template may introduce contrast issues that do not appear on the homepage.",
        "A contact workflow may use placeholder text instead of labels, creating repeated form-accessibility problems."
      ]}
      automatedScanningHelp={[
        "Automated scanning can check many of the technical signals that appear on a WCAG-oriented checklist, especially around semantics, labels, contrast, and structural markup.",
        "It is useful for quickly identifying which checklist items recur across multiple public pages.",
        "Automated scanning does not replace manual accessibility testing, but it helps teams start with a clearer issue map."
      ]}
      certScoreHelp={[
        "CertScore.ai uses automated accessibility checks to surface repeatable WCAG-related issue patterns.",
        "It groups those findings into structured signal summaries with issue counts and recurring categories.",
        "That makes the checklist easier to operationalize across one site or a set of websites."
      ]}
      certScoreFlagExample="The scan could flag repeated contrast issues, missing alt text, or unlabeled form inputs across public templates."
      relatedGuides={[
        { href: "/guides/ada-website-compliance", label: "ADA accessibility guide" },
        { href: "/guides/website-signal-check", label: "Website signal review checklist" },
        { href: "/insights/common-accessibility-issues", label: "Common accessibility issues" }
      ]}
    />
  );
}

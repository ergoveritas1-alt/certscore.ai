import type { Metadata } from "next";
import { GuideTemplate } from "../../../components/marketing/guide-template";
import { createPageMetadata } from "../../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Website Signal Review Checklist Guide",
  description:
    "Learn how to think about a website signal review checklist across accessibility, privacy, cookies, policy pages, and disclosure basics.",
  path: "/guides/website-signal-check"
});

export default function WebsiteLegalComplianceChecklistGuidePage() {
  return (
    <GuideTemplate
      eyebrow="Checklist guide"
      title="Website Signal Review Checklist"
      intro="A website signal review checklist is most useful when it covers the recurring issue areas teams actually miss in production: accessibility, privacy and cookies, public policy pages, and disclosure-related content. The goal is not a formal legal memo. The goal is a repeatable way to review and monitor the public site."
      questionTitle="How can you review website signals consistently?"
      whyItMatters={[
        "Website issues often span several overlapping areas, and teams tend to review them separately or inconsistently.",
        "Without a repeatable checklist, teams often rely on memory, scattered notes, or one-off opinions that quickly go stale.",
        "A practical checklist helps teams prioritize what to review first and what should be monitored over time."
      ]}
      commonIssues={[
        "Missing policy pages, limited disclosure coverage, tracker-related consent gaps, and recurring accessibility findings often appear together.",
        "Teams may check the site once after launch but fail to revisit it after content, plugin, analytics, or design changes.",
        "Many organizations have no consistent record of what was checked, when it was checked, and what changed later."
      ]}
      examples={[
        "A site may have a privacy policy and terms page but still show accessibility issues and limited cookie-preference controls.",
        "A team may launch a site with good QA, then lose visibility as plugins, tracking tags, or marketing content change later.",
        "A business may fix one visible issue but miss related patterns across service pages, policy pages, and forms."
      ]}
      automatedScanningHelp={[
        "Automated scanning is useful for building a repeatable checklist because it can review the same categories the same way every time.",
        "It helps identify which issue types recur across pages and where obvious gaps should be escalated for manual review.",
        "It is especially helpful when the real need is monitoring drift over time rather than performing one perfect one-off review."
      ]}
      certScoreHelp={[
        "CertScore.ai combines accessibility, privacy, and disclosure-focused checks in one scan flow so the checklist is easier to operationalize.",
        "It stores structured signals and change comparisons from the same scan pipeline.",
        "It helps teams turn a loose checklist into a repeatable monitoring process for public websites."
      ]}
      certScoreFlagExample="The scan could flag a mix of missing policy pages, weak consent controls, recurring accessibility issues, and tracker-related contradictions in one pass."
      relatedGuides={[
        { href: "/guides/ada-website-compliance", label: "ADA accessibility guide" },
        { href: "/guides/website-privacy-policy-requirements", label: "Privacy policy requirements" },
        { href: "/guides/website-disclosure-requirements", label: "Website disclosure requirements" }
      ]}
    />
  );
}

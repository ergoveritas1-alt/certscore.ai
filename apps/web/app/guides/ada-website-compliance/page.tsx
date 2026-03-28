import type { Metadata } from "next";
import { GuideTemplate } from "../../../components/marketing/guide-template";
import { createPageMetadata } from "../../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "ADA Website Compliance Guide",
  description:
    "Learn what ADA website compliance usually refers to, which accessibility issues commonly appear on business websites, and how CertScore.ai surfaces related accessibility signals.",
  path: "/guides/ada-website-compliance"
});

export default function AdaWebsiteComplianceGuidePage() {
  return (
    <GuideTemplate
      eyebrow="Accessibility guide"
      title="ADA Website Compliance"
      intro="ADA website compliance usually refers to whether a public website creates accessibility barriers that may require remediation or closer review. In practice, teams often look at WCAG-oriented issues because they surface many of the technical patterns that make sites harder to use."
      questionTitle="What is ADA website compliance?"
      whyItMatters={[
        "Accessibility problems can affect real visitors who rely on screen readers, keyboard navigation, readable contrast, or clear form labeling.",
        "Website accessibility issues often accumulate gradually through content edits, redesigns, plugin changes, or rushed marketing updates.",
        "Even when a team plans to do deeper manual review later, automated scanning is useful for surfacing obvious technical patterns quickly."
      ]}
      commonIssues={[
        "Missing alt text, insufficient contrast, poor form labeling, broken heading structure, and confusing ARIA usage are common first-pass findings.",
        "Sites often ship inaccessible patterns on contact pages, service pages, and ecommerce flows where forms or interactive elements are added quickly.",
        "Teams frequently lack a repeatable way to document what was observed, which pages were involved, and whether issues improved later."
      ]}
      examples={[
        "A homepage hero image may be missing meaningful alt text while decorative images use the same generic file-name label.",
        "A contact form may look complete visually but still fail because labels are missing or error states are not announced properly.",
        "A redesign may introduce lower-contrast buttons or navigation text that becomes harder to read on mobile or bright screens."
      ]}
      automatedScanningHelp={[
        "Automated scanning can detect many recurring accessibility signals such as color contrast concerns, missing labels, image-alt gaps, and structural issues.",
        "It can highlight which public pages show repeatable problem patterns so remediation starts with the right areas.",
        "Automated analysis is a strong first pass for triage, monitoring, and documentation, but it does not determine full accessibility conformance on its own and still needs manual review."
      ]}
      certScoreHelp={[
        "CertScore.ai runs automated accessibility checks across selected public pages and surfaces recurring issue patterns in structured scan output.",
        "It helps show which issue types recur and which pages appear to need attention first.",
        "It also preserves scan history so teams can see whether accessibility-related signals improved, persisted, or worsened over time."
      ]}
      certScoreFlagExample="The scan could flag repeated missing form labels, low-contrast buttons, or image-alt gaps across key public pages."
      relatedGuides={[
        { href: "/guides/wcag-website-checklist", label: "WCAG website checklist" },
        { href: "/guides/website-signal-check", label: "Website signal review checklist" },
        { href: "/guides/website-disclosure-requirements", label: "Website disclosure requirements" }
      ]}
    />
  );
}

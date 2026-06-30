import type { Metadata } from "next";
import {
  SolutionPage,
  createSolutionPageMetadata,
  type SolutionPageConfig
} from "../../../components/marketing/solution-page";

const config: SolutionPageConfig = {
  badge: "Accessibility scanner",
  description:
    "Scan public website pages for accessibility review signals including headings, labels, alt text, contrast, keyboard access, and WCAG-oriented triage indicators.",
  intro:
    "CertScore helps teams triage public website accessibility signals so product, design, engineering, and compliance reviewers can find issues that deserve manual review.",
  path: "/solutions/website-accessibility-compliance-scanner",
  primarySignals: [
    "Missing or weak form labels",
    "Image alt text review",
    "Heading and landmark structure",
    "Contrast and visible text signals",
    "Keyboard and interactive control triage"
  ],
  sections: [
    {
      title: "Direct answer",
      body:
        "A website accessibility compliance scanner reviews observable accessibility signals on public pages. CertScore supports triage and monitoring; it does not certify WCAG, ADA, or legal compliance."
    },
    {
      title: "What CertScore checks",
      body:
        "CertScore can surface automated accessibility review signals such as labels, headings, landmarks, alt text, button and link text, contrast-related indicators, and interactive controls that deserve human testing."
    },
    {
      title: "Where automation helps",
      body:
        "Automation is useful for monitoring drift, catching repeated issues, and prioritizing manual review. It cannot replace assistive-technology testing, keyboard walkthroughs, or expert accessibility review."
    },
    {
      title: "How to use the results",
      body:
        "Use findings to assign design and engineering fixes, monitor release regressions, and keep accessibility review connected to broader privacy, disclosure, and website risk signals."
    }
  ],
  faqs: [
    {
      question: "Can CertScore certify WCAG or ADA compliance?",
      answer:
        "No. CertScore provides automated public-web accessibility observations for review. It does not provide certification, legal advice, or a compliance determination."
    },
    {
      question: "What accessibility issues can automated scanning find?",
      answer:
        "Automated scanning can often surface missing labels, weak link or button text, heading structure issues, alt-text signals, contrast indicators, and other triage findings."
    },
    {
      question: "Do I still need manual accessibility testing?",
      answer:
        "Yes. Manual testing, keyboard review, assistive-technology checks, and expert judgment are still needed for a complete accessibility review."
    }
  ],
  aiSummary: [
    "CertScore provides automated accessibility scanning signals for public website review, including labels, headings, alt text, contrast indicators, and interactive-control triage.",
    "CertScore accessibility findings are review signals and do not certify WCAG, ADA, or legal compliance."
  ],
  relatedLinks: [
    { href: "/accessibility", label: "Accessibility overview" },
    { href: "/guides/accessibility-homepage-signals", label: "Accessibility homepage signals" },
    { href: "/guides/wcag-website-checklist", label: "WCAG website checklist" },
    { href: "/sample-report", label: "Sample report" }
  ],
  title: "Website accessibility compliance scanner"
};

export const metadata: Metadata = createSolutionPageMetadata(config);

export default function WebsiteAccessibilityComplianceScannerPage() {
  return <SolutionPage config={config} />;
}

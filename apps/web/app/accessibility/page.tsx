import type { Metadata } from "next";
import { RegulatoryPage } from "../../components/marketing/regulatory-page";
import { absoluteUrl, createPageMetadata } from "../../lib/seo";

const pageTitle = "ADA Website Accessibility Scanner | WCAG Review Signals | CertScore.ai";
const pageDescription =
  "Evidence-based ADA and WCAG website accessibility review signals for public pages. Review contrast, labels, alt text, heading structure, keyboard-sensitive patterns, and accessibility triage signals. Automated observations for review, not legal advice.";
const pagePath = "/accessibility";
const disclaimer =
  "CertScore findings are automated public-web observations for review, not legal advice, certification, or a compliance determination.";

export const metadata: Metadata = {
  ...createPageMetadata({
    title: pageTitle,
    description: pageDescription,
    path: pagePath
  }),
  title: {
    absolute: pageTitle
  },
  openGraph: {
    title: pageTitle,
    description: pageDescription,
    url: absoluteUrl(pagePath),
    siteName: "CertScore.ai",
    type: "website",
    images: [
      {
        url: absoluteUrl("/certscore-header-logo.png"),
        width: 512,
        height: 512,
        alt: "CertScore.ai"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: pageTitle,
    description: pageDescription,
    images: [absoluteUrl("/certscore-header-logo.png")]
  }
};

export default function AccessibilityPage() {
  return (
    <RegulatoryPage
      config={{
        badge: "ADA accessibility scanner",
        description: pageDescription,
        disclaimer,
        faqs: [
          {
            question: "What is an ADA website accessibility scanner?",
            answer:
              "An ADA website accessibility scanner reviews public web pages for accessibility signals that may deserve manual review, such as contrast, labels, image alternatives, heading structure, form semantics, and keyboard-sensitive interface patterns."
          },
          {
            question: "Can CertScore tell me if my website is ADA compliant?",
            answer:
              "No. CertScore provides automated public-web observations for review. It does not provide legal advice, certification, proof of non-compliance, or an ADA compliance determination."
          },
          {
            question: "How does this relate to WCAG?",
            answer:
              "WCAG is commonly used as technical accessibility guidance. CertScore surfaces automated WCAG-oriented signals where public-page evidence is available, but manual testing remains necessary for user flows, assistive-technology behavior, and context-specific judgment."
          },
          {
            question: "Why do automated accessibility checks need manual review?",
            answer:
              "Automated checks can find common issues quickly, but they cannot reliably judge all interactive behavior, reading order, content meaning, alternative-text quality, keyboard usability, or assistive-technology experience."
          },
          {
            question: "What does not detected mean for an accessibility signal?",
            answer:
              "Not detected means the signal was not observed in the scan scope. It is not proof of absence, and results can vary by page coverage, responsive state, dynamic content, personalization, blocked scans, and timing."
          }
        ],
        heroChips: ["ADA context", "WCAG-oriented signals", "Public pages", "Not legal advice"],
        path: pagePath,
        primaryCtaLocation: "accessibility_hero",
        reviewContexts: [
          {
            title: "ADA web accessibility context",
            body:
              "DOJ guidance explains that web accessibility can be relevant for businesses open to the public and state or local government services under the ADA.",
            links: [
              { href: "https://www.ada.gov/resources/web-guidance/", label: "ADA.gov web accessibility guidance" },
              { href: "https://www.justice.gov/opa/pr/justice-department-issues-web-accessibility-guidance-under-americans-disabilities-act", label: "DOJ accessibility guidance release" }
            ]
          },
          {
            title: "WCAG-oriented technical review",
            body:
              "Automated checks can help triage WCAG-oriented topics such as names, roles, labels, contrast, headings, image alternatives, and form structure.",
            links: [
              { href: "https://www.w3.org/WAI/standards-guidelines/wcag/", label: "W3C WCAG overview" },
              { href: "https://www.w3.org/TR/WCAG21/", label: "WCAG 2.1" }
            ]
          },
          {
            title: "Manual testing still matters",
            body:
              "Keyboard operation, screen-reader experience, focus management, alternative-text quality, and complete task flows usually need human and assistive-technology testing.",
            links: []
          },
          {
            title: "Public-page prioritization",
            body:
              "Homepage and public conversion-flow observations can help teams decide which templates, components, or page types should move into a deeper accessibility audit.",
            links: []
          }
        ],
        schemaAbout: ["ADA", "web accessibility", "WCAG", "accessibility scanning", "public website review"],
        signalCards: [
          {
            title: "Common accessibility signals",
            body:
              "CertScore can surface automated observations for contrast, missing labels, missing image alternatives, heading structure, document language, and semantic page structure."
          },
          {
            title: "Template and component clues",
            body:
              "Repeated issues on navigation, forms, cards, buttons, modals, or landing-page templates can point teams toward fixes with broad impact."
          },
          {
            title: "Triage, not certification",
            body:
              "Automated results help prioritize manual review, remediation, and user testing. They are not a complete accessibility audit or legal conclusion."
          }
        ],
        steps: [
          "Load public pages in browser states that reflect common public access.",
          "Run automated checks for visible and semantic accessibility signals.",
          "Group repeated observations by issue type, page, and likely component pattern.",
          "Use the evidence to prioritize remediation and deeper manual testing."
        ],
        summary:
          "CertScore scans public websites for ADA and WCAG-oriented accessibility review signals, including contrast, labels, image alternatives, heading structure, form semantics, and repeated component patterns that may deserve manual review.",
        title: "ADA website accessibility signals for public pages"
      }}
    />
  );
}

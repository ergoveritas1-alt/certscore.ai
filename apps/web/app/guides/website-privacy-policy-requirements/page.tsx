import type { Metadata } from "next";
import { GuideTemplate } from "../../../components/marketing/guide-template";
import { createPageMetadata } from "../../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Website Privacy Policy Requirements Guide",
  description:
    "Learn what a website privacy policy typically needs to cover, which gaps are common, and how CertScore.ai helps identify policy-related signals on public websites.",
  path: "/guides/website-privacy-policy-requirements"
});

export default function WebsitePrivacyPolicyRequirementsGuidePage() {
  return (
    <GuideTemplate
      eyebrow="Policy guide"
      title="Website Privacy Policy Requirements"
      intro="A website privacy policy usually explains what information a site collects, how that information is used, which third parties may be involved, and how visitors can contact the site operator. For many teams, the first challenge is simply confirming that a meaningful public-facing policy is present."
      questionTitle="What should a privacy policy include?"
      whyItMatters={[
        "Privacy expectations often become more important as a site adds analytics, embedded tools, lead forms, email capture, or ecommerce behavior.",
        "Sites that collect visitor information without clear public disclosures may create unnecessary confusion for visitors and internal teams.",
        "Many businesses inherit privacy policy gaps from old templates, generic copy, or platform defaults that no longer reflect current site behavior."
      ]}
      commonIssues={[
        "No obvious privacy policy page is detected from the main navigation, footer, or selected scan pages.",
        "A privacy policy exists, but expected topic signals such as personal data, cookies, contact details, or sharing language appear limited.",
        "Tracking-related behavior is present while public disclosure of those technologies remains unclear or hard to locate."
      ]}
      examples={[
        "A site may collect lead form submissions and use analytics tools while the policy still reads like a generic one-page placeholder.",
        "A footer may link to a privacy page, but that page may omit cookies, third-party tools, or a contact channel for user questions.",
        "An ecommerce site may discuss orders and returns elsewhere while leaving privacy disclosures disconnected from actual data collection behavior."
      ]}
      automatedScanningHelp={[
        "Automated scanning can detect likely privacy policy pages through URL patterns, link text, and selected scan-page structure.",
        "It can also perform shallow content checks for common topic signals such as personal data, cookies, contact information, and third-party references.",
        "This kind of analysis helps teams decide whether a policy review should move higher on the remediation list."
      ]}
      certScoreHelp={[
        "CertScore.ai detects likely privacy policy pages and checks whether common topic signals appear to be present.",
        "It surfaces scan findings when key policy pages are not detected or when observed content signals appear limited.",
        "It also connects privacy-policy gaps to the rest of the scan so teams can compare disclosure coverage against tracker and cookie findings."
      ]}
      relatedGuides={[
        { href: "/guides/privacy-policy-examples", label: "Privacy policy examples" },
        { href: "/guides/cookie-consent-laws", label: "Cookie consent laws" },
        { href: "/guides/website-signal-check", label: "Website signal review checklist" }
      ]}
    />
  );
}

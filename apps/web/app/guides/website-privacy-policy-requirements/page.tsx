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
      intro="Compare the site’s privacy disclosures with the cookies, services and forms observed in the report. Give the privacy owner specific passages and vendor evidence to review for purposes, recipients, retention, rights and contact information."
      pagePath="/guides/website-privacy-policy-requirements"
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
        "Review retained policy passages and their source links for processing purposes, legal-basis language, retention, recipients, transfers and privacy rights. Compare specific disclosures with relevant observed website behavior.",
        "This kind of analysis helps teams decide whether a policy review should move higher on the remediation list."
      ]}
      certScoreHelp={[
        "CertScore.ai detects likely privacy policy pages and checks whether common topic signals appear in the detected content.",
        "It surfaces scan findings when key policy pages are not detected or when observed content signals appear limited.",
        "It also connects privacy-policy gaps to the rest of the scan so teams can compare disclosure coverage against tracker and cookie findings."
      ]}
      certScoreFlagExample="The scan could flag a missing privacy policy link, thin policy-topic coverage, or tracking signals that outpace the site’s disclosures."
      sources={[{"href": "https://eur-lex.europa.eu/eli/dir/2002/58/2009-12-19/eng", "label": "ePrivacy Directive, Article 5(3)"}, {"href": "https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng", "label": "GDPR, consent and transparency"}, {"href": "https://www.oag.ca.gov/privacy/ccpa", "label": "California Attorney General: CCPA"}]}
      relatedGuides={[
        { href: "/solutions/privacy-policy-risk-scanner", label: "Scan your website’s privacy policy" },
        { href: "/findings/cookie_disclosure_gap", label: "Cookie disclosure gap finding" },
        { href: "/findings/policy_behavior_contradiction_detected", label: "Policy/runtime alignment finding" },
        { href: "/guides/privacy-policy-examples", label: "Privacy policy examples" },
        { href: "/guides/cookie-consent-laws", label: "Cookie consent laws" },
        { href: "/guides/website-consent-audit-checklist", label: "Website consent audit checklist" }
      ]}
    />
  );
}

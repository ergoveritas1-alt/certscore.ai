import type { Metadata } from "next";
import { GuideTemplate } from "../../../components/marketing/guide-template";
import { createPageMetadata } from "../../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Cookie Consent Laws Guide",
  description:
    "Learn how cookie consent laws are commonly interpreted in practice, which tracker and consent issues websites often have, and how CertScore.ai surfaces privacy-related signals.",
  path: "/guides/cookie-consent-laws"
});

export default function CookieConsentLawsGuidePage() {
  return (
    <GuideTemplate
      eyebrow="Privacy guide"
      title="Cookie Consent Laws"
      intro="Start with the applicable jurisdiction, then inspect what the website does. EU ePrivacy rules address device storage and access, subject to exceptions, while GDPR governs personal-data processing. California’s CCPA includes sale/sharing opt-out rights, including GPC for covered businesses. Use the scan to collect evidence for the relevant review."
      pagePath="/guides/cookie-consent-laws"
      questionTitle="How do cookie consent laws work?"
      whyItMatters={[
        "Privacy-related issues often come from operational drift rather than a deliberate decision to ignore consent requirements.",
        "A site may display a banner that looks reassuring while still firing trackers immediately on page load.",
        "Teams need a practical way to spot whether banner design, reject controls, and actual tracker behavior appear aligned."
      ]}
      commonIssues={[
        "Trackers observed during the initial load before any visible user action has occurred.",
        "Cookie banners that offer an accept button but no obvious reject or manage-preferences option.",
        "Pages where tracking-related behavior is present while policy or consent disclosures remain thin or hard to find."
      ]}
      examples={[
        "A site may show a banner, but marketing pixels still fire on the first page view before a visitor has clicked anything.",
        "A banner may include an accept button while burying preferences behind ambiguous text or omitting reject controls entirely.",
        "Different templates across the same site may show inconsistent banner behavior, especially after plugin or tag-manager changes."
      ]}
      automatedScanningHelp={[
        "Automated scanning can observe which tracker requests appear during the initial page load and whether obvious consent UI signals are present.",
        "It can also identify when reject or preferences controls appear limited from the controls visible during the visit.",
        "This type of analysis is useful for triage because it creates a concrete list of observed privacy signals without claiming legal certainty."
      ]}
      certScoreHelp={[
        "CertScore.ai detects common trackers during real page loads and surfaces them as privacy-relevant findings by tracker type.",
        "It checks for consent UI signals such as banners, reject options, and preferences controls from the visible page and retained control evidence.",
        "It uses observed-signal language so teams can decide what needs deeper review."
      ]}
      certScoreFlagExample="The scan could flag pre-consent tracker activity, weak visible consent controls, or a reject path that does not reduce tracking."
      sources={[{"href": "https://eur-lex.europa.eu/eli/dir/2002/58/2009-12-19/eng", "label": "ePrivacy Directive, Article 5(3)"}, {"href": "https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng", "label": "GDPR, consent and transparency"}, {"href": "https://www.oag.ca.gov/privacy/ccpa", "label": "California Attorney General: CCPA"}]}
      relatedGuides={[
        { href: "/guides/cookie-banner-requirements", label: "Cookie banner requirements" },
        { href: "/guides/website-privacy-policy-requirements", label: "Privacy policy requirements" },
        { href: "/guides/privacy-policy-examples", label: "Privacy policy examples" }
      ]}
    />
  );
}

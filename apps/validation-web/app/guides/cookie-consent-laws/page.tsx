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
      intro="Cookie consent questions usually turn on what tracking technologies run on a site, when they run, and whether users are given understandable controls. Public business websites often add analytics, ad pixels, and third-party scripts without revisiting how those tools behave together."
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
        "It can also identify when reject or preferences controls appear limited based on what is visible in the DOM.",
        "This type of analysis is useful for triage because it creates a concrete list of observed privacy signals without claiming legal certainty."
      ]}
      certScoreHelp={[
        "CertScore.ai detects common trackers during real page loads and surfaces them as privacy-relevant findings by tracker type.",
        "It checks for consent UI signals such as banners, reject options, and preferences controls using bounded DOM and text heuristics.",
        "It uses observed-signal language so teams can decide what needs deeper review."
      ]}
      certScoreFlagExample="The scan could flag pre-consent tracker activity, weak visible consent controls, or a reject path that does not reduce tracking."
      relatedGuides={[
        { href: "/guides/cookie-banner-requirements", label: "Cookie banner requirements" },
        { href: "/guides/website-privacy-policy-requirements", label: "Privacy policy requirements" },
        { href: "/guides/privacy-policy-examples", label: "Privacy policy examples" }
      ]}
    />
  );
}

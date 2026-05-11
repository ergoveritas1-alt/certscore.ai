import type { Metadata } from "next";
import { GuideTemplate } from "../../../components/marketing/guide-template";
import { createPageMetadata } from "../../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Cookie Banner Requirements",
  description:
    "Learn the practical elements teams look for in cookie banners, common consent-control gaps, and how CertScore.ai helps surface privacy signals.",
  path: "/guides/cookie-banner-requirements"
});

export default function CookieBannerRequirementsPage() {
  return (
    <GuideTemplate
      eyebrow="Privacy guide"
      title="Cookie Banner Requirements"
      intro="Cookie banner requirements are usually discussed in terms of clarity, control, and alignment between what the interface offers and what the site actually does. A banner that appears polished can still create risk if the control options are limited or if trackers run before any visible choice."
      pagePath="/guides/cookie-banner-requirements"
      
      questionTitle="What should a cookie banner include?"
      whyItMatters={[
        "Cookie banners are often treated as a visual checkbox even though their actual behavior matters more than their design.",
        "A missing reject option or weak preferences flow can turn a polished banner into an issue worth review.",
        "Teams need to review both the banner surface and the underlying tracker behavior."
      ]}
      commonIssues={[
        "Accept-focused banners with no obvious reject option or meaningful preferences control.",
        "Cookie disclosures that are vague, buried, or disconnected from the site’s actual trackers and policy pages.",
        "Inconsistent banner behavior across templates, geographies, or page types."
      ]}
      examples={[
        "A banner may say users can manage preferences, but the preference center may be missing or difficult to find.",
        "A site may show a banner on some pages but not on landing pages where marketing scripts still load.",
        "A footer may mention cookies generally while ad-tech and analytics behavior remain underexplained."
      ]}
      automatedScanningHelp={[
        "Automated scanning can look for visible banner text, accept or reject buttons, and preference-control language.",
        "It can also compare those visible signals against observed tracker behavior during the same page load.",
        "That combination helps teams decide when the banner experience needs a closer review."
      ]}
      certScoreHelp={[
        "CertScore.ai detects cookie banner and consent-control signals using bounded DOM and text heuristics.",
        "It also surfaces common tracker requests so visible consent controls can be compared against observed behavior.",
        "That makes it easier to prioritize which pages or templates deserve the next round of manual review."
      ]}
      certScoreFlagExample="The scan could flag a visible banner with no reject control, or trackers that appear to load before any consent choice."
      relatedGuides={[
        { href: "/guides/cookie-consent-laws", label: "Cookie consent laws" },
        { href: "/guides/privacy-policy-examples", label: "Privacy policy examples" },
        { href: "/insights/common-cookie-consent-issues", label: "Common cookie consent issues" }
      ]}
    />
  );
}

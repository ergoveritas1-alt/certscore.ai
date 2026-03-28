import type { Metadata } from "next";
import { InsightTemplate } from "../../../components/marketing/insight-template";
import { createPageMetadata } from "../../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Common Cookie Consent Issues",
  description:
    "Educational insights page covering typical cookie banner and tracker timing issues found on public websites and how scanners surface related signals.",
  path: "/insights/common-cookie-consent-issues"
});

export default function CommonCookieConsentIssuesInsightPage() {
  return (
    <InsightTemplate
      eyebrow="Privacy insights"
      title="Common Cookie Consent Issues"
      intro="Cookie consent issues often appear when banner design, visible controls, and actual tracker behavior fall out of sync. That makes them a strong category for repeated automated monitoring."
      commonPatterns={[
        "Trackers appear to fire before consent interaction.",
        "Accept options are obvious while reject or preferences controls are weak or absent.",
        "Consent interfaces vary across templates, landing pages, or locale-specific versions of the site."
      ]}
      scannerSignals={[
        "Scanners can observe network requests during real page load and map them to common tracker signatures.",
        "They can inspect the DOM for banner, reject, and preference-control signals after the page loads.",
        "They can combine those observations into conservative findings that point teams to likely problem pages."
      ]}
      examples={[
        "Google Tag Manager firing on initial load while the banner is still visible.",
        "A banner with clear accept text but no visible reject button.",
        "A preference center link that exists in markup but is hidden or not discoverable."
      ]}
      relatedLinks={[
        { href: "/guides/cookie-consent-laws", label: "Cookie consent laws" },
        { href: "/guides/cookie-banner-requirements", label: "Cookie banner requirements" }
      ]}
    />
  );
}

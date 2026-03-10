import type { Metadata } from "next";
import { InsightTemplate } from "../../../components/marketing/insight-template";
import { createPageMetadata } from "../../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Common Privacy Policy Gaps",
  description:
    "Educational insights page covering typical privacy policy gaps found on public websites and how scanners detect policy-related signals.",
  path: "/insights/common-privacy-policy-gaps"
});

export default function CommonPrivacyPolicyGapsInsightPage() {
  return (
    <InsightTemplate
      eyebrow="Policy insights"
      title="Common Privacy Policy Gaps"
      intro="Privacy policy gaps usually become visible when the public policy does not appear to match how the site actually behaves. That makes policy scanning more useful when paired with tracker and cookie observations."
      commonPatterns={[
        "No obvious privacy policy page is linked from public navigation or footer areas.",
        "A privacy policy exists, but common topic signals such as cookies, contact details, or third-party references appear limited.",
        "The site shows tracking or lead capture behavior that does not appear to be explained clearly in public disclosures."
      ]}
      scannerSignals={[
        "Scanners can look for likely policy pages using link text and URL patterns.",
        "They can run shallow content checks for common topic signals such as personal data, cookies, third parties, and contact language.",
        "They can relate those policy observations to the privacy behavior detected elsewhere in the scan."
      ]}
      examples={[
        "A footer has no privacy-policy link at all.",
        "A privacy page exists but reads like a generic placeholder with limited detail.",
        "The site uses analytics and marketing tools while public policy disclosures remain thin."
      ]}
      relatedLinks={[
        { href: "/guides/website-privacy-policy-requirements", label: "Privacy policy requirements" },
        { href: "/guides/privacy-policy-examples", label: "Privacy policy examples" }
      ]}
    />
  );
}

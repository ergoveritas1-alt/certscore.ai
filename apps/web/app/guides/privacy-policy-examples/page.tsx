import type { Metadata } from "next";
import { GuideTemplate } from "../../../components/marketing/guide-template";
import { createPageMetadata } from "../../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Privacy Policy Examples",
  description:
    "Educational guide covering what privacy policy examples often include, common website disclosure gaps, and how CertScore.ai helps identify public policy signals.",
  path: "/guides/privacy-policy-examples"
});

export default function PrivacyPolicyExamplesPage() {
  return (
    <GuideTemplate
      eyebrow="Policy guide"
      title="Privacy Policy Examples"
      intro="Privacy policy examples are most useful when they show structure rather than just reusable legal text. Teams usually want to understand what topics should appear, how those topics relate to actual site behavior, and what obvious gaps a public review can detect."
      questionTitle="What can privacy policy examples teach you?"
      whyItMatters={[
        "Many businesses copy generic privacy text that does not reflect the real data collection happening on the site.",
        "Examples help teams understand the topic areas a policy usually needs to address, even before legal review begins.",
        "They also make it easier to compare public disclosures against analytics, forms, cookies, or ecommerce flows."
      ]}
      commonIssues={[
        "Examples are copied without updating contact details, cookie language, or third-party service references.",
        "Policies mention broad data collection but omit how marketing tools or analytics actually operate on the site.",
        "Teams use a template once and rarely revisit it after site features change."
      ]}
      examples={[
        "A local business site may need to explain contact-form submissions, booking tools, analytics, and customer communication.",
        "An ecommerce site may need broader coverage for account creation, order processing, refunds, tracking, and third-party platforms.",
        "A content site with affiliate links may need policy and disclosure language that aligns with how promotions appear."
      ]}
      automatedScanningHelp={[
        "Automated scanning can identify whether a likely privacy policy page exists and whether it appears to mention common topic signals such as personal information, cookies, contact details, and third parties.",
        "It can also compare those disclosures to visible privacy and tracking signals elsewhere on the site.",
        "That helps teams decide whether a policy review is merely cosmetic or operationally important."
      ]}
      certScoreHelp={[
        "CertScore.ai surfaces policy-page detection and limited-content findings alongside tracker and cookie observations.",
        "It helps teams see whether the site appears to disclose what its public behavior suggests.",
        "That makes privacy-policy examples easier to use as a review reference instead of generic filler."
      ]}
      relatedGuides={[
        { href: "/guides/website-privacy-policy-requirements", label: "Privacy policy requirements" },
        { href: "/guides/cookie-banner-requirements", label: "Cookie banner requirements" },
        { href: "/insights/common-privacy-policy-gaps", label: "Common privacy policy gaps" }
      ]}
    />
  );
}

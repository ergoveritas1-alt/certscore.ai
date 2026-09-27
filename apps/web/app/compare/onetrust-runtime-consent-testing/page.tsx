import type { Metadata } from "next";
import {
  GrowthContentPage,
  createGrowthPageMetadata,
  type GrowthContentPageConfig
} from "../../../components/marketing/growth-content-page";

const config: GrowthContentPageConfig = {
  badge: "Comparison",
  description:
    "Compare OneTrust's consent configuration and preferences with CertScore.ai observations of public website behavior in a chosen scan region.",
  intro:
    "OneTrust offers consent banners, preference controls, and regional configuration. CertScore.ai gives teams a separate browser observation to inspect what appeared on a public page in a chosen region and scan window.",
  path: "/compare/onetrust-runtime-consent-testing",
  relatedLinks: [
    { href: "/compare/cmp-vs-runtime-consent-scanner", label: "CMP vs runtime scanner" },
    { href: "/guides/cmp-verification", label: "CMP verification" },
    { href: "/guides/cookie-consent-enforcement-checker", label: "Cookie consent enforcement checker" },
    { href: "/methodology", label: "CertScore.ai methodology" },
    { href: "/guides/test-global-privacy-control", label: "How to test GPC response" }
  ],
  sections: [
    {
      title: "Different jobs in the same review",
      paragraphs: [
        "OneTrust's consent platform can configure regional notices, preference centers, consent signals, and cookie and tracker categories. It is useful for operating visitor choices and maintaining a consent inventory.",
        "CertScore.ai records public-page requests, cookies, storage, controls, and supported consent-path evidence from a specific visit. It helps reviewers compare that evidence with the intended OneTrust setup; the scan does not establish how OneTrust was configured internally."
      ],
      sourceLinks: [{ href: "https://www.onetrust.com/products/consent-management/", label: "OneTrust consent-management capabilities" }]
    },
    {
      title: "Check regional behavior",
      paragraphs: [
        "Choose the report's scan region and timestamp before comparing it with an intended regional notice or rule. Check which first-layer controls appeared and which requests and cookies were recorded before a choice.",
        "Where eligible, separate Accept and Reject sessions can retain completed-click, confirmed-choice, and after-action evidence. A click is not proof that consent registered; coverage limitations remain visible."
      ]
    },
    {
      title: "Read GPC and refusal results carefully",
      paragraphs: [
        "A GPC assessment records whether signal delivery was verified and what a paired passive comparison observed. Unverified delivery remains indeterminate. No observable response in that window does not establish every downstream use of data or a legal conclusion.",
        "After Reject, distinguish a verified refusal from a completed click with unconfirmed registration. Review supported findings and their evidence rather than treating a banner dismissal as a confirmed choice."
      ]
    }
  ],
  title: "OneTrust runtime consent testing",
  type: "Comparison"
};

export const metadata: Metadata = createGrowthPageMetadata(config);

export default function OneTrustRuntimeConsentTestingPage() {
  return <GrowthContentPage config={config} />;
}

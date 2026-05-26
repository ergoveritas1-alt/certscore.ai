import type { Metadata } from "next";
import {
  GrowthContentPage,
  createGrowthPageMetadata,
  type GrowthContentPageConfig
} from "../../../components/marketing/growth-content-page";

const config: GrowthContentPageConfig = {
  badge: "Guide",
  description:
    "Review how a cookie consent enforcement checker can compare consent choices with observed browser behavior.",
  intro:
    "A cookie consent enforcement checker helps teams review whether cookie and tracking behavior appears aligned with expected consent choices in the browser.",
  path: "/guides/cookie-consent-enforcement-checker",
  relatedLinks: [
    { href: "/findings/reject_tracking_persists_after_reject", label: "Reject tracking persists finding" },
    { href: "/findings/pre_consent_tracking_detected", label: "Tracking started before consent finding" },
    { href: "/guides/reject-consent-tracking-test", label: "Reject consent tracking test" },
    { href: "/guides/pre-consent-tracking-detection", label: "Pre-consent tracking detection" },
    { href: "/compare/cmp-vs-runtime-consent-scanner", label: "CMP vs runtime scanner" }
  ],
  sections: [
    {
      title: "Direct answer",
      paragraphs: [
        "Cookie consent enforcement review compares what the consent interface presents with what the browser appears to do before and after a consent interaction.",
        "Automated observations can surface whether cookies or third-party tracking continue when a reject path is selected, but the findings still need evidence review."
      ]
    },
    {
      title: "What to review",
      paragraphs: [
        "Review initial cookies, third-party cookie timing, vendor requests, accept behavior, reject behavior, and whether consent state persists across reloads.",
        "Teams should also account for geography, stored consent state, tag-manager sequencing, and functional services that may be necessary for the site."
      ]
    },
    {
      title: "Why runtime checks matter",
      paragraphs: [
        "A consent platform can be configured correctly while a tag, pixel, or embedded service still starts too early because of deployment drift.",
        "Runtime scanning helps verify what actually happens in the browser rather than relying only on policy text or configuration screens."
      ]
    }
  ],
  title: "Cookie consent enforcement checker",
  type: "Guide"
};

export const metadata: Metadata = createGrowthPageMetadata(config);

export default function CookieConsentEnforcementCheckerPage() {
  return <GrowthContentPage config={config} />;
}

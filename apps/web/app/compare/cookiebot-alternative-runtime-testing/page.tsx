import type { Metadata } from "next";
import {
  GrowthContentPage,
  createGrowthPageMetadata,
  type GrowthContentPageConfig
} from "../../../components/marketing/growth-content-page";

const config: GrowthContentPageConfig = {
  badge: "Comparison",
  description:
    "Learn how CertScore.ai can complement Cookiebot-style consent management with runtime behavior testing.",
  intro:
    "Cookiebot-style consent platforms help manage choices and cookie declarations. CertScore.ai complements that by observing whether runtime behavior appears aligned with expected consent behavior.",
  path: "/compare/cookiebot-alternative-runtime-testing",
  relatedLinks: [
    { href: "/compare/cmp-vs-runtime-consent-scanner", label: "CMP vs runtime scanner" },
    { href: "/guides/cmp-verification", label: "CMP verification" },
    { href: "/guides/third-party-cookie-checker", label: "Third-party cookie checker" },
    { href: "/guides/pre-consent-tracking-detection", label: "Pre-consent tracking detection" }
  ],
  sections: [
    {
      title: "Direct answer",
      paragraphs: [
        "CertScore.ai is not positioned as a hostile replacement for Cookiebot. It is useful when teams want runtime evidence about what tags, cookies, and third-party requests appear to do in the browser.",
        "That makes it a complementary review layer for consent programs that already use a CMP."
      ]
    },
    {
      title: "Why teams add runtime testing",
      paragraphs: [
        "Cookie declarations and banner configuration can become stale when marketing tags, embeds, or tag-manager rules change.",
        "Runtime testing can surface whether observed website behavior appears to match the intended consent setup."
      ]
    },
    {
      title: "What to review in CertScore.ai",
      paragraphs: [
        "Review pre-consent tracking signals, third-party cookie timing, vendor domains, and the separately observed Accept and Reject paths. CertScore.ai requires a confirmed consent-state transition before interpreting post-choice activity; Accept is a score-neutral baseline and limited coverage is not reported as clean.",
        "For Reject, review whether qualifying non-essential activity was retained after confirmed refusal, along with temporal and attribution limitations.",
        "Use the retained evidence as a practical checklist for engineering, marketing operations, and privacy review."
      ]
    }
  ],
  title: "Cookiebot alternative for runtime testing",
  type: "Comparison"
};

export const metadata: Metadata = createGrowthPageMetadata(config);

export default function CookiebotAlternativeRuntimeTestingPage() {
  return <GrowthContentPage config={config} />;
}

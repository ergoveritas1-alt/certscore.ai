import type { Metadata } from "next";
import {
  GrowthContentPage,
  createGrowthPageMetadata,
  type GrowthContentPageConfig
} from "../../../components/marketing/growth-content-page";

const config: GrowthContentPageConfig = {
  badge: "Comparison",
  description:
    "Learn how CertScore.ai can complement OneTrust-style consent management with runtime consent behavior testing.",
  intro:
    "OneTrust-style consent management helps operate notices and preferences. Runtime consent testing helps teams review what actually happens in the browser around those choices.",
  path: "/compare/onetrust-runtime-consent-testing",
  relatedLinks: [
    { href: "/compare/cmp-vs-runtime-consent-scanner", label: "CMP vs runtime scanner" },
    { href: "/guides/cmp-verification", label: "CMP verification" },
    { href: "/guides/cookie-consent-enforcement-checker", label: "Cookie consent enforcement checker" },
    { href: "/methodology", label: "CertScore.ai methodology" }
  ],
  sections: [
    {
      title: "Direct answer",
      paragraphs: [
        "CertScore.ai complements OneTrust-style CMP workflows by observing runtime tracking, cookie, and third-party request behavior from public webpages.",
        "It helps teams find evidence for human and agentic review when consent settings and live tag behavior may have drifted."
      ]
    },
    {
      title: "Complementary roles",
      paragraphs: [
        "The CMP helps manage consent categories, notices, choice records, and preference-center behavior.",
        "On eligible scans, CertScore.ai tests Accept and Reject in separate fresh sessions and requires a confirmed consent-state transition before interpreting post-choice activity. Accept remains a score-neutral comparison baseline; non-confirmed paths are limited coverage, not a pass.",
        "Runtime testing checks public-web observations such as initial-load tracking, cookie timing, and whether qualifying activity continues after confirmed refusal."
      ]
    },
    {
      title: "Safe interpretation",
      paragraphs: [
        "A scan result should be treated as an automated review signal that may indicate an implementation issue.",
        "Teams should review the evidence, environment, geography, and consent-state assumptions before changing production behavior."
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

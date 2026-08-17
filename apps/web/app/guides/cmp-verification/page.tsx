import type { Metadata } from "next";
import {
  GrowthContentPage,
  createGrowthPageMetadata,
  type GrowthContentPageConfig
} from "../../../components/marketing/growth-content-page";

const config: GrowthContentPageConfig = {
  badge: "Guide",
  description:
    "Learn how CMP verification uses runtime observations to review whether consent choices appear to affect tracking behavior.",
  intro:
    "CMP verification reviews whether the consent management platform's presented choices appear to line up with runtime tracking, cookie, and third-party request behavior.",
  path: "/guides/cmp-verification",
  relatedLinks: [
    { href: "/compare/cmp-vs-runtime-consent-scanner", label: "CMP vs runtime consent scanner" },
    { href: "/guides/cookie-consent-enforcement-checker", label: "Cookie consent enforcement checker" },
    { href: "/guides/reject-consent-tracking-test", label: "Reject consent tracking test" },
    { href: "/contact-sales", label: "Talk to CertScore.ai" }
  ],
  sections: [
    {
      title: "Direct answer",
      paragraphs: [
        "CMP verification helps review what happens in the browser before consent, after accept, and after reject where those interactions are observable.",
        "It is complementary to CMP configuration. Runtime observations can surface drift between intended consent rules and live website behavior."
      ]
    },
    {
      title: "Signals to compare",
      paragraphs: [
        "Compare banner presence, available choices, request timing, cookie timing, vendor domains, and whether reject appears to reduce non-essential tracking.",
        "A scan can surface evidence for human and agentic review, but it should not be treated as proof of a legal outcome."
      ]
    },
    {
      title: "Operational use",
      paragraphs: [
        "Run checks after tag-manager changes, CMP template updates, marketing rollouts, and site redesigns.",
        "Use repeated scans to watch for drift rather than relying on one point-in-time review."
      ]
    }
  ],
  title: "CMP verification for runtime consent behavior",
  type: "Guide"
};

export const metadata: Metadata = createGrowthPageMetadata(config);

export default function CmpVerificationPage() {
  return <GrowthContentPage config={config} />;
}

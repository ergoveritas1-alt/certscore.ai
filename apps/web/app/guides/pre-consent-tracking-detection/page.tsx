import type { Metadata } from "next";
import {
  GrowthContentPage,
  createGrowthPageMetadata,
  type GrowthContentPageConfig
} from "../../../components/marketing/growth-content-page";

const config: GrowthContentPageConfig = {
  badge: "Guide",
  description:
    "Learn how pre-consent tracking detection helps teams review whether third-party activity appears before a visitor gives consent.",
  intro:
    "CertScore.ai helps teams review whether a website appears to start third-party tracking before a visitor gives consent. It uses automated runtime observations, not policy text alone.",
  path: "/guides/pre-consent-tracking-detection",
  relatedLinks: [
    { href: "/guides/detect-trackers-before-cookie-consent", label: "Detect trackers before cookie consent" },
    { href: "/guides/cookie-consent-enforcement-checker", label: "Cookie consent enforcement checker" },
    { href: "/benchmarks/pre-consent-tracking-2026", label: "Pre-consent tracking benchmark" },
    { href: "/methodology", label: "Methodology" }
  ],
  sections: [
    {
      title: "Direct answer",
      paragraphs: [
        "Pre-consent tracking detection reviews whether tracking requests, classified vendors, or cookies appear before the scan observes a visitor consent choice.",
        "The result is a review signal. It may indicate consent timing drift, tag-manager configuration issues, or geography-specific behavior that should be reviewed with retained evidence."
      ]
    },
    {
      title: "What runtime behavior can surface",
      paragraphs: [
        "Automated scanning can surface third-party requests, cookie timing, vendor-like domains, and consent-surface observations from a public webpage.",
        "A useful review compares what happened on initial page load with what should happen under the site's consent configuration."
      ]
    },
    {
      title: "How teams use the evidence",
      paragraphs: [
        "Teams can review the affected domains, request timing, and consent-state context before changing tag rules or banner settings.",
        "After remediation, a repeat scan can help show whether the observable behavior changed."
      ]
    }
  ],
  title: "Pre-consent tracking detection",
  type: "Guide"
};

export const metadata: Metadata = createGrowthPageMetadata(config);

export default function PreConsentTrackingDetectionPage() {
  return <GrowthContentPage config={config} />;
}

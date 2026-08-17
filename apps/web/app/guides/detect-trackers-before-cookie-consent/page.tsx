import type { Metadata } from "next";
import {
  GrowthContentPage,
  createGrowthPageMetadata,
  type GrowthContentPageConfig
} from "../../../components/marketing/growth-content-page";

const config: GrowthContentPageConfig = {
  badge: "Guide",
  description:
    "A practical guide to detecting trackers before cookie consent using automated public-web runtime observations.",
  intro:
    "Detecting trackers before cookie consent means reviewing whether analytics, advertising, pixels, or other third-party services appear before a visitor makes a consent choice.",
  path: "/guides/detect-trackers-before-cookie-consent",
  relatedLinks: [
    { href: "/guides/detect-tracking-before-consent", label: "Detect tracking before consent" },
    { href: "/guides/third-party-cookie-checker", label: "Third-party cookie checker" },
    { href: "/guides/cmp-verification", label: "CMP verification" },
    { href: "/benchmarks/pre-consent-tracking-2026", label: "Benchmark notes" }
  ],
  sections: [
    {
      title: "Direct answer",
      paragraphs: [
        "A runtime scan can help detect whether tracker-like requests or third-party cookie activity appears before a cookie consent decision is observed.",
        "This is evidence for human and agentic review, not a legal conclusion. The affected requests, vendors, and timing should be checked before relying on findings."
      ]
    },
    {
      title: "Common signals",
      paragraphs: [
        "Common review signals include advertising domains on initial load, analytics collection endpoints, third-party cookies before a banner interaction, or vendor scripts that do not wait for consent state.",
        "Some services may be functional or consent-management infrastructure, so classification and context matter."
      ]
    },
    {
      title: "Next steps after a signal",
      paragraphs: [
        "Review consent categories, tag triggers, CMP event listeners, geography rules, and whether prior consent state affected the scan.",
        "Then rescan after changes to see whether the observed runtime behavior moved in the expected direction."
      ]
    }
  ],
  title: "Detect trackers before cookie consent",
  type: "Guide"
};

export const metadata: Metadata = createGrowthPageMetadata(config);

export default function DetectTrackersBeforeCookieConsentPage() {
  return <GrowthContentPage config={config} />;
}

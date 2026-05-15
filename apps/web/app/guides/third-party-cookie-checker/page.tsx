import type { Metadata } from "next";
import {
  GrowthContentPage,
  createGrowthPageMetadata,
  type GrowthContentPageConfig
} from "../../../components/marketing/growth-content-page";

const config: GrowthContentPageConfig = {
  badge: "Guide",
  description:
    "Learn how a third-party cookie checker helps review cookie timing, domains, and consent-related browser observations.",
  intro:
    "A third-party cookie checker helps teams review whether cookies from outside the first-party site appear during public webpage loading and consent interactions.",
  path: "/guides/third-party-cookie-checker",
  relatedLinks: [
    { href: "/guides/check-third-party-cookies-before-consent", label: "Check third-party cookies before consent" },
    { href: "/guides/third-party-cookies-before-consent", label: "Third-party cookies before consent" },
    { href: "/guides/pre-consent-tracking-detection", label: "Pre-consent tracking detection" },
    { href: "/methodology", label: "Methodology" }
  ],
  sections: [
    {
      title: "Direct answer",
      paragraphs: [
        "A third-party cookie checker reviews cookies set by domains other than the site being scanned and helps identify timing, domain, and consent-state context.",
        "Third-party cookies can be useful evidence for review, especially when they appear before a consent choice or persist after a reject interaction."
      ]
    },
    {
      title: "What CertScore can surface",
      paragraphs: [
        "CertScore.ai can surface cookie counts, third-party domains, timing context, and related tracking or consent observations from public website scans.",
        "The report should be read as automated observations that may require human review, especially when browser restrictions, geography, or stored state affect cookie behavior."
      ]
    },
    {
      title: "Review checklist",
      paragraphs: [
        "Check the cookie domain, purpose, first-seen timing, consent category, vendor owner, and whether the cookie is needed for the page to function.",
        "Where cookie behavior looks unexpected, review tag deployment and consent-mode settings before treating the result as resolved."
      ]
    }
  ],
  title: "Third-party cookie checker",
  type: "Guide"
};

export const metadata: Metadata = createGrowthPageMetadata(config);

export default function ThirdPartyCookieCheckerPage() {
  return <GrowthContentPage config={config} />;
}

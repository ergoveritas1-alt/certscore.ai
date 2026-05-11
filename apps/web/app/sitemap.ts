import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/seo";

const staticPaths = [
  "",
  "/how-it-works",
  "/methodology",
  "/what-is-certscore",
  "/press",
  "/pricing",
  "/guides",
  "/benchmarks",
  "/benchmarks/website-consent-tracking-2026",
  "/benchmarks/pre-consent-tracking-2026",
  "/benchmarks/session-replay-risk-2026",
  "/compare/privacy-scanner-vs-cookie-scanner",
  "/compare/website-consent-audit-tools",
  "/llms.txt",
  "/faq",
  "/terms",
  "/privacy",
  "/privacy-request",
  "/guides/pre-consent-tracking",
  "/guides/third-party-cookies-before-consent",
  "/guides/rtb-cookie-syncing",
  "/guides/session-replay-risk",
  "/guides/accessibility-homepage-signals",
  "/guides/check-website-tracking-before-consent",
  "/guides/check-third-party-cookies-before-consent",
  "/guides/website-consent-audit",
  "/guides/detect-tracking-before-consent",
  "/guides/reject-consent-tracking-test",
  "/guides/website-consent-audit-checklist",
  "/guides/privacy-scanner-vs-cookie-scanner",
  "/guides/ada-website-compliance",
  "/guides/cookie-consent-laws",
  "/guides/wcag-website-checklist",
  "/guides/cookie-banner-requirements",
  "/guides/privacy-policy-examples",
  "/guides/website-disclosure-requirements",
  "/guides/website-privacy-policy-requirements",
  "/guides/website-signal-check",
  "/insights",
  "/insights/common-accessibility-issues",
  "/insights/common-cookie-consent-issues",
  "/insights/common-privacy-policy-gaps"
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return staticPaths.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now
  }));
}

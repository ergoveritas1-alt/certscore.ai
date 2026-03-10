import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/seo";

const staticPaths = [
  "",
  "/how-it-works",
  "/pricing",
  "/guides",
  "/faq",
  "/terms",
  "/privacy",
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

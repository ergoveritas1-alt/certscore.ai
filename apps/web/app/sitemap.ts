import type { MetadataRoute } from "next";
import { getEditorialDates } from "../lib/marketing/editorial-metadata";
import { getFindingReferenceItems } from "../lib/marketing/finding-atlas";
import { getPublishedReleases, releasePath } from "../lib/releases";
import { SITE_URL } from "../lib/seo";
import type { InsightPage } from "../lib/insights/contract";

export const dynamic = "force-dynamic";

const staticPaths = [
  "",
  "/how-it-works",
  "/methodology",
  "/what-is-certscore",
  "/press",
  "/pricing",
  "/monitor-site",
  "/guides",
  "/guides/test-global-privacy-control",
  "/guides/google-analytics-meta-pixel-before-consent",
  "/guides/consent-report-example",
  "/editorial-policy",
  "/ccpa",
  "/guides/mcp-website-privacy-scanner",
  "/regulatory",
  "/gdpr",
  "/benchmarks",
  "/benchmarks/website-consent-tracking-2026",
  "/benchmarks/pre-consent-tracking-2026",
  "/benchmarks/session-replay-risk-2026",
  "/compare",
  "/compare/privacy-scanner-vs-cookie-scanner",
  "/compare/website-consent-audit-tools",
  "/compare/cmp-vs-runtime-consent-scanner",
  "/compare/cookiebot-alternative-runtime-testing",
  "/compare/onetrust-runtime-consent-testing",
  "/developers",
  "/developers/quickstart",
  "/developers/reference",
  "/developers/sdk",
  "/developers/mcp",
  "/mcp/light",
  "/api-pulse",
  "/api-pulse/agent",
  "/releases",
  "/guides/website-form-scanning",
  "/claude",
  "/muse",
  "/developers/examples",
  "/faq",
  "/contact-sales",
  "/book-demo",
  "/sample-report",
  "/browser-extension",
  "/browser-extension/privacy",
  "/solutions",
  "/solutions/gdpr-website-compliance-scanner",
  "/solutions/cookie-consent-scanner",
  "/solutions/privacy-policy-risk-scanner",
  "/terms",
  "/trust",
  "/security",
  "/privacy",
  "/privacy-request",
  "/findings",
  "/guides/pre-consent-tracking",
  "/guides/cookie-consent-enforcement-checker",
  "/guides/third-party-cookie-checker",
  "/guides/cmp-verification",
  "/guides/rtb-cookie-syncing",
  "/guides/session-replay-risk",
  "/guides/check-third-party-cookies-before-consent",
  "/guides/website-consent-audit",
  "/guides/detect-tracking-before-consent",
  "/guides/reject-consent-tracking-test",
  "/guides/consent-enforcement-testing",
  "/guides/website-consent-audit-checklist",
  "/guides/website-fingerprinting",
  "/guides/website-scanning-basics",
  "/guides/cookie-consent-laws",
  "/guides/cookie-banner-requirements",
  "/guides/privacy-policy-examples",
  "/guides/website-disclosure-requirements",
  "/guides/website-privacy-policy-requirements",
  "/guides/website-signal-check",
  "/insights",
  "/insights/ai-lab-privacy-leaderboard-2026",
  "/insights/session-replay-study-2026",
  "/insights/common-cookie-consent-issues",
  "/insights/common-privacy-policy-gaps"
];

export function buildSitemap(published: Pick<InsightPage, "path" | "dateModified">[] = []): MetadataRoute.Sitemap {
  const findingPaths = getFindingReferenceItems().map((finding) => `/findings/${finding.id}`);
  const releasePaths = getPublishedReleases().map(releasePath);

  return [...new Set([...staticPaths, ...releasePaths, ...findingPaths, ...published.map((page) => page.path)])].map((path) => {
    const editorial = getEditorialDates(path);
    const release = getPublishedReleases().find((item) => releasePath(item) === path);
    const lastModified = published.find((page) => page.path === path)?.dateModified ?? editorial?.dateModified ?? release?.modifiedDate ?? release?.publicationDate;
    return { url: `${SITE_URL}${path}`, ...(lastModified ? { lastModified } : {}) };
  });
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { getPublishedInsightPages } = await import("../server/insights/store");
  return buildSitemap(await getPublishedInsightPages());
}

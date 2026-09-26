// Explicit editorial dates. Never substitute deployment time or infer first publication.
export const EDITORIAL_AUTHOR = {
  "@type": "Organization",
  name: "CertScore.ai",
  url: "https://certscore.ai/editorial-policy"
} as const;

type EditorialDates = { datePublished?: string; dateModified: string };
const dates: Record<string, EditorialDates> = {
  "/guides/website-form-scanning": { datePublished: "2026-09-21", dateModified: "2026-09-21" },
  "/how-it-works": { dateModified: "2026-09-21" },
  "/": { dateModified: "2026-09-21" },
  "/guides": { dateModified: "2026-09-21" },
  "/methodology": { dateModified: "2026-09-23" },
  "/solutions/gdpr-website-compliance-scanner": { dateModified: "2026-09-20" },
  "/solutions/cookie-consent-scanner": { dateModified: "2026-09-20" },
  "/solutions/privacy-policy-risk-scanner": { dateModified: "2026-09-20" },
  "/guides/reject-consent-tracking-test": { dateModified: "2026-09-20" },
  "/guides/rtb-cookie-syncing": { dateModified: "2026-09-20" },
  "/guides/check-third-party-cookies-before-consent": { dateModified: "2026-09-20" },
  "/guides/pre-consent-tracking": { dateModified: "2026-09-20" },
  "/compare/privacy-scanner-vs-cookie-scanner": { dateModified: "2026-09-20" },
  "/benchmarks": { dateModified: "2026-09-20" },
  "/benchmarks/website-consent-tracking-2026": { dateModified: "2026-09-20" },
  "/benchmarks/pre-consent-tracking-2026": { dateModified: "2026-09-20" },
  "/benchmarks/session-replay-risk-2026": { dateModified: "2026-09-20" },
  "/guides/test-global-privacy-control": { datePublished: "2026-09-20", dateModified: "2026-09-20" },
  "/guides/google-analytics-meta-pixel-before-consent": { datePublished: "2026-09-20", dateModified: "2026-09-26" },
  "/guides/third-party-cookie-checker": { dateModified: "2026-09-26" },
  "/guides/website-consent-audit-checklist": { dateModified: "2026-09-26" },
  "/guides/consent-report-example": { datePublished: "2026-09-20", dateModified: "2026-09-20" },
  "/editorial-policy": { datePublished: "2026-09-20", dateModified: "2026-09-20" },
  "/ccpa": { datePublished: "2026-09-20", dateModified: "2026-09-20" },
};

export function getEditorialDates(path: string): EditorialDates | undefined {
  return dates[path === "" ? "/" : path];
}

export function getSocialImage(path: string) {
  const images: Record<string, string> = {
    "/guides/test-global-privacy-control": "gpc-testing",
    "/guides/google-analytics-meta-pixel-before-consent": "tracking-before-consent",
    "/guides/reject-consent-tracking-test": "reject-testing",
    "/guides/consent-report-example": "reject-testing"
  };
  return {
    path: `/images/social/${images[path] ?? "website-privacy-scanner"}.png`,
    alt: "CertScore.ai — website privacy evidence and consent testing",
    width: 1200,
    height: 630
  };
}

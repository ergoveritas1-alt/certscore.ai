# CertScore.ai search submission checklist

Use this checklist before manually submitting CertScore.ai to Google Search Console or Bing Webmaster Tools.

## Verification options

The web app supports environment-driven verification meta tags:

- `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` emits `google-site-verification`.
- `NEXT_PUBLIC_BING_SITE_VERIFICATION` emits `msvalidate.01`.

Do not commit verification tokens. Set them in the deployed web runtime environment.

File-based verification is also available because Next.js serves static files from `apps/web/public`. If Google or Bing provides an HTML verification file, the site owner can place that exact file in `apps/web/public` and deploy it. Do not add placeholder verification files.

## Pre-submit live checks

Run:

```bash
curl -I https://certscore.ai/robots.txt
curl -I https://certscore.ai/sitemap.xml
curl -I https://certscore.ai/llms.txt
curl -I https://certscore.ai/
curl -I https://certscore.ai/what-is-certscore
curl -I https://certscore.ai/methodology
curl -I https://certscore.ai/guides
curl -I https://certscore.ai/benchmarks
curl -I https://certscore.ai/benchmarks/website-consent-tracking-2026
curl -I https://certscore.ai/guides/check-website-tracking-before-consent
curl -I https://certscore.ai/guides/check-third-party-cookies-before-consent
curl -I https://certscore.ai/guides/pre-consent-tracking
curl -I https://certscore.ai/compare/privacy-scanner-vs-cookie-scanner
curl -I https://certscore.ai/press
```

Expected:

- 200 for public pages/assets
- no redirects to auth
- no x-robots-tag noindex on public marketing/content pages
- scan result pages remain noindex/nofollow for now

## Google Search Console manual steps

1. Add and verify property for https://certscore.ai.
2. Prefer Domain property if DNS access is available; otherwise URL-prefix property is acceptable.
3. Submit sitemap:
   https://certscore.ai/sitemap.xml
4. Use URL Inspection for these priority URLs and request indexing:
   - https://certscore.ai/
   - https://certscore.ai/what-is-certscore
   - https://certscore.ai/methodology
   - https://certscore.ai/guides
   - https://certscore.ai/guides/check-website-tracking-before-consent
   - https://certscore.ai/guides/check-third-party-cookies-before-consent
   - https://certscore.ai/guides/pre-consent-tracking
   - https://certscore.ai/benchmarks
   - https://certscore.ai/benchmarks/website-consent-tracking-2026
   - https://certscore.ai/compare/privacy-scanner-vs-cookie-scanner
   - https://certscore.ai/press
5. Do not request indexing for:
   - private scans
   - failed scans
   - /app routes
   - /api routes
   - /auth routes
   - dashboards/account/admin routes
   - thin or blocked scan pages

## Bing Webmaster Tools manual steps

1. Add and verify https://certscore.ai.
2. Submit sitemap:
   https://certscore.ai/sitemap.xml
3. Submit the same priority URLs through Bing URL Submission if available.
4. Do not submit private, failed, app, auth, API, or thin scan pages.

## Post-submit monitoring

Check after 24-72 hours and again after 1-2 weeks:

- sitemap discovered/processed
- crawl errors
- excluded/noindex pages
- duplicate/canonical issues
- indexed priority pages
- impressions/clicks for:
  - CertScore.ai
  - website tracking before consent
  - third-party cookies before consent
  - privacy scanner vs cookie scanner
  - RTB cookie syncing
  - website consent audit

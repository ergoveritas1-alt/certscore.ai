# Search Submission Checklist

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
curl -I https://certscore.ai/what-is-certscore
curl -I https://certscore.ai/benchmarks
curl -I https://certscore.ai/benchmarks/website-consent-tracking-2026
curl -I https://certscore.ai/guides/check-website-tracking-before-consent
curl -I https://certscore.ai/compare/privacy-scanner-vs-cookie-scanner
curl -I https://certscore.ai/press
```

Expected:

- `200` for public pages and public assets.
- No accidental redirects to auth.
- No `x-robots-tag: noindex` on public marketing/content pages.
- Public scan pages remain `noindex,nofollow` for now.

## Google Search Console manual steps

1. Add and verify a property for `https://certscore.ai`.
2. Prefer a Domain property if DNS access is available; otherwise a URL-prefix property is acceptable.
3. Submit the sitemap: `https://certscore.ai/sitemap.xml`.
4. Use URL Inspection for these priority URLs:

- `https://certscore.ai/`
- `https://certscore.ai/what-is-certscore`
- `https://certscore.ai/methodology`
- `https://certscore.ai/guides`
- `https://certscore.ai/guides/check-website-tracking-before-consent`
- `https://certscore.ai/guides/check-third-party-cookies-before-consent`
- `https://certscore.ai/guides/pre-consent-tracking`
- `https://certscore.ai/benchmarks`
- `https://certscore.ai/benchmarks/website-consent-tracking-2026`
- `https://certscore.ai/compare/privacy-scanner-vs-cookie-scanner`
- `https://certscore.ai/press`

Request indexing only for useful public pages. Do not request indexing for private scans, failed scans, dashboards, auth routes, or thin pages.

## Bing Webmaster Tools manual steps

1. Add and verify `https://certscore.ai`.
2. Submit the sitemap: `https://certscore.ai/sitemap.xml`.
3. Submit the same priority URLs through Bing URL Submission if available.

Do not submit private, failed, or thin scan pages.

## Post-submit monitoring

Check after 24-72 hours and again after 1-2 weeks:

- Sitemap discovered/processed.
- Crawl errors.
- Excluded/noindex pages.
- Duplicate/canonical issues.
- Indexed priority pages.
- Impressions/clicks for:
  - CertScore.ai
  - website tracking before consent
  - third-party cookies before consent
  - privacy scanner vs cookie scanner
  - RTB cookie syncing
  - website consent audit

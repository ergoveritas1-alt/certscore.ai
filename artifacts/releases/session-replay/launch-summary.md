# Session Replay launch package

Prepared October 3, 2026 on `codex/session-replay-launch`. Local preparation only: no deployment, main push, social post or external publication. Publication metadata is set to October 3; if approval/publication happens later, update the release date, study editorial date and social-card month before publishing.

## Pages and copy

- Release: `/releases/session-replay-detection`
  - Headline: **See when session-replay technology appears on a website**
  - Subheadline: Identify observable session-replay service signals, inspect the retained evidence, and give your privacy review a clearer starting point.
- Study: `/insights/session-replay-study-2026`
  - Headline: **Session replay signals appeared on nearly 1 in 8 websites we analyzed**
  - Subheadline: Across 5,000 production scans, 3,199 distinct destination domains had usable evidence. Of those, 383 showed an observable session-replay service signal.
- Updated discovery: `/releases`, `/releases/feed.xml`, `/insights`, `/guides/session-replay-risk`, `/sitemap.xml`, `/llms.txt`, `/llms-full.txt`. Existing data-driven homepage release teaser picks up the new entry.
- Inline scan prompts: `/insights/session-replay-study-2026#scan` and `/releases/session-replay-detection#try-release`. Both use the existing homepage `DomainScanForm` in full mode: URL input, Scan from selector, and scan button.
- Public image: `/images/releases/session-replay-social-card.png` (1200 × 630).

The release and study link to each other. The study includes three native HTML/CSS visuals: main statistic, service bars and contextual forms comparison. No chart dependencies or client-side chart JavaScript were added. The expandable report-style example is explicitly labeled illustrative; it is not fabricated scan evidence and identifies no third-party target.

## Verified public findings

1. **383 / 3,199 = 12.0%** of usable destination domains had an observable replay-service signal.
2. **Microsoft Clarity: 265 / 383 = 69.2%** of replay-positive domains, the most commonly observed service in this sample. Not market share.
3. **191 / 380 = 50.3%** of evaluable replay-positive domains had same-page forms/input surfaces. The comparison is **1,331 / 2,781 = 47.9%** without an observed replay signal. No unusual association, statistical significance or causality is claimed.

Other service counts: Hotjar 116, Contentsquare 18, FullStory 8, Quantum Metric 5. Counts overlap. Email detail: 55 / 191 = 28.8%. Co-presence does not establish entry, transmission or recording of values.

Population: 5,000 selected production bot executions; 4,988 completed; 3,244 usable executions; 3,199 distinct usable destination domains; 1,756 unknown/insufficient executions excluded, never negatives. Latest selected executions before October 1, 2026 08:30 UTC; creation range September 18 18:30:48 UTC–October 1 08:27:40 UTC. California scanner location, most recent usable visit per destination registrable domain, production convenience sample.

## Data and wording audit

`python3 artifacts/releases/session-replay/verify-data.py` reproduces frozen domain, service, form and statistics outputs byte-for-byte; independently aggregates the CSVs; compares originals to the shareable ZIP; removes every date-of-birth label in a temporary copy and confirms primary, service and forms results are unchanged. See `data-verification.json`.

The known “Birthday variant option” false positive is excluded from public aggregate claims. No combined sensitive-field statistic or “100% before consent” hook is published. The full research ZIP is not served publicly. Only aggregate launch data enters the web bundle.

The terminology audit found an existing executive-report limitation claiming that a collection endpoint indicates transmission. The launch makes a small copy-only correction: retained service-associated requests can include library downloads and do not establish successful transmission, recording or field capture. The corresponding summary/basis and regression assertion were updated. Eligibility, confidence, scoring, source evidence and all scanner behavior are unchanged. The guide now also distinguishes same-scan context from same-page evidence.

Remaining measurement concerns: library/unsuccessful requests can qualify; recognized services are not exhaustive; bounded visits may miss later activity; field classification is heuristic; agent spot-checks are not independent human validation. The public study states these limits. Existing specialized first-party proxy wording still says “session recording appears proxied”; the underlying proxy detection/other wording was not broadly redesigned in this task.

## SEO

Study title: **Session replay detection: findings from 5,000 scans | CertScore.ai**

Study description: Across 5,000 production scans, 383 of 3,199 domains with usable evidence showed a session-replay service signal. Explore the services, context and methodology.

Release title: **Session replay detection and evidence | CertScore.ai**

Release description: Identify session-replay service signals with CertScore.ai. Explore our study of 5,000 scans, the observed services and the evidence behind the findings.

Both have canonical URLs, OpenGraph and X summary-large-image metadata. Article/Breadcrumb structured data follows the existing helpers. The release is included in the existing sitemap, RSS feed and release index. The study is added to the sitemap and Insights index.

## Launch copy and visual assets

- Final LinkedIn and X posts: `social-copy.md`. X conservatively counts 264 characters including the full unshortened URL and double-weighting ≠; below 280.
- Reproducible social artwork source: `social-card.svg`.
- Desktop/mobile screenshots and verification files are in this directory.

## Cost and deployment

No new infrastructure, scan work, model calls, third-party chart service or evidence retention. Estimated incremental static delivery: $0–$0.20/month at up to 10,000 additional launch-page views, principally the 66.8 KB image. Higher traffic changes the transfer estimate; no paid capacity is provisioned.

After review and explicit publication approval, use the canonical AWS path from the clean committed launch branch:

```sh
pnpm deploy:web
```

This script runs the repository preflight, pushes the current committed branch, and dispatches the AWS web workflow. It is a production action and has NOT been run. Pushing/merging to main also triggers AWS deployment; do not do that merely to share this draft. A later launch must use the actual publication date.

## Verification results

- Frozen-data reproduction, independent CSV checks, ZIP comparison and classification-removal test: **PASS**.
- Release/study tests: **12 passed**. Focused replay projection tests: **5 passed**.
- Web typecheck: **PASS**.
- Production build: **PASS**, 207 static pages. The first attempt exhausted the default 8 GB Node heap; a local-only 14 GB heap override completed successfully. No production heap/configuration change.
- Canonical AWS `pnpm preflight:fast`: **PASS**, 1,656 tests across its selected groups and web typecheck.
- HTTP checks against built pages: **PASS**, 5 primary pages and 47 internal link targets, plus canonical/OG/X metadata, structured data, sitemap, RSS and 1200×630 PNG.
- Visual checks: desktop 1440 px, mobile 390 px; study also checked at 320 px. No horizontal overflow. Native disclosure works with click and Space. One h1, chart labels in text, meaningful link labels and image alt text verified. Original colors follow the existing high-contrast slate/sky palette. No new production browser errors/warnings; an earlier dev-only LCP warning concerned the existing forms release card.
- Formatting: Prettier 3.6.2 passed for new TSX/test/JSON; `git diff --check` passed. No standalone lint command is configured; Next's lint/type build phase completed.
- The broader executive projection suite still has **11 existing failures**, independently reproduced against the unchanged base implementation/test. None is introduced by this launch. See `test-baseline-comparison.json`; the canonical preflight remains green.
- Existing unrelated environment warnings: stale Browserslist data; local build skips live DB/S3 validation because those runtime variables are absent; local production preview reports the existing Better Auth plugin-order warning. No live scans were run for this content release.

**Readiness:** the launch implementation is verified and ready for publication approval. The repository is not globally test-clean because of the 11 documented baseline failures. Publication date must match the eventual launch. No production deployment or social publishing has occurred. The existing development server was restored on localhost:3000 after testing the production build.

## Files changed

- `apps/web/app/guides/ai-guide-content.ts`
- `apps/web/app/guides/session-replay-risk/page.tsx`
- `apps/web/app/insights/page.tsx`
- `apps/web/app/insights/session-replay-study-2026/page.tsx`
- `apps/web/app/releases/[slug]/page.tsx`
- `apps/web/app/sitemap.ts`
- `apps/web/components/marketing/session-replay-evidence-example.tsx`
- `apps/web/lib/marketing/editorial-metadata.ts`
- `apps/web/lib/marketing/session-replay-study-data.json`
- `apps/web/lib/marketing/session-replay-study.test.ts`
- `apps/web/lib/releases.test.ts`
- `apps/web/lib/releases.ts`
- `apps/web/lib/scans/executive-findings-projection.test.ts`
- `apps/web/lib/scans/executive-findings-projection.ts`
- `apps/web/public/images/releases/session-replay-social-card.png`
- `apps/web/public/llms-full.txt`
- `apps/web/public/llms.txt`
- `artifacts/releases/session-replay/check-local-pages.py`
- `artifacts/releases/session-replay/data-verification.json`
- `artifacts/releases/session-replay/launch-summary.md`
- `artifacts/releases/session-replay/local-page-verification.json`
- `artifacts/releases/session-replay/release-desktop.jpg`
- `artifacts/releases/session-replay/release-mobile.jpg`
- `artifacts/releases/session-replay/releases-desktop.jpg`
- `artifacts/releases/session-replay/scan-form-mobile.jpg`
- `artifacts/releases/session-replay/social-card.svg`
- `artifacts/releases/session-replay/social-copy.md`
- `artifacts/releases/session-replay/study-desktop.jpg`
- `artifacts/releases/session-replay/study-mobile-hero.jpg`
- `artifacts/releases/session-replay/study-mobile.jpg`
- `artifacts/releases/session-replay/study-services.jpg`
- `artifacts/releases/session-replay/test-baseline-comparison.json`
- `artifacts/releases/session-replay/verification-summary.json`
- `artifacts/releases/session-replay/verify-data.py`

## Inline scan prompt follow-up

Owner requested the standard URL/region/button experience. Both new pages now reuse the canonical homepage form rather than a link to the homepage. Existing releases retain their previous CTA behavior. URL entry enabled the scan button; selecting California updated the selector; 390 px layout had no overflow. No scan was submitted. Shared form, region selector and launch/release tests: 34 passed; web typecheck passed. The in-app browser intermittently crashed during inspection, including before this change; verification succeeded in a fresh tab.

Follow-up production build: **PASS**. Both forms hydrated with the URL field, region selector and scan button in the built release and study. HTTP/link/metadata checks passed again. No deployment performed. Updated mobile proof: `scan-form-mobile.jpg`.

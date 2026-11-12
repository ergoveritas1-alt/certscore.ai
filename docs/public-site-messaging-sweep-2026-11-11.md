# CertScore.ai public-site messaging sweep — November 11, 2026

## Status

Local implementation only. No deployment, production flag change, live scan, form submission or infrastructure change. The existing deployment hold remains in force.

## Scope and decisions

- Inventoried 177 page routes: 97 public/editorial candidates and 80 application, authentication, report or test routes preserved.
- Read-only local HTTP crawl covered 89 static public routes; all resolved successfully. Dynamic templates and action-oriented application flows were not submitted or exercised.
- Retained distinct product, integration, research, accessibility, methodology, security and legal destinations. Historical research/release claims were not rewritten as current product promises.
- Consolidated seven overlapping or outdated pages with permanent redirects. Removed their direct listings from the sitemap/robots route lists and updated internal links to the canonical destinations.
- The previously requested Trust page removal remains in place; Privacy and Security remain available.

## Consolidations

| Retired page | Destination | Reason |
| --- | --- | --- |
| `/homepage-trial` | `/` | Old alternate homepage; consolidate into the current regional homepage. |
| `/guides/cmp-verification` | `/compare/cmp-vs-runtime-consent-scanner` | Overlaps the stronger CMP versus observed-runtime comparison. |
| `/guides/cookie-consent-enforcement-checker` | `/guides/consent-enforcement-testing` | Overlaps the refreshed Accept/Reject enforcement guide. |
| `/guides/website-consent-audit` | `/guides/website-consent-audit-checklist` | Duplicate intent and checklist destination. |
| `/guides/website-signal-check` | `/guides/website-consent-audit-checklist` | Generic checklist overlaps the focused consent audit checklist. |
| `/insights/common-cookie-consent-issues` | `/solutions/cookie-consent-scanner` | Short evergreen article overlaps the current cookie-consent solution. |
| `/insights/common-privacy-policy-gaps` | `/solutions/privacy-policy-risk-scanner` | Short evergreen article overlaps the current privacy-policy evidence solution. |

## Messaging changes

- Aligned the shared positioning, overview, FAQs, press boilerplate, metadata and AI discovery text around an Evidence-led Website Privacy Scanner for DPOs, agencies and developers reviewing GDPR/ePrivacy and CCPA concerns.
- Balanced CCPA/California and GDPR/ePrivacy entry points in Solutions, Guides, regulatory navigation and Resources.
- Made free browser scanning and the sample report the shared marketing CTA pair; retained the API, TypeScript SDK and MCP integration path.
- Updated consent-testing and methodology copy to distinguish completed eligible Reject actions, retained non-essential presence, active collection, and California-specific choice/purpose evidence. No change to scanner behavior, evidence eligibility or scoring.
- Replaced outdated MVP framing, fixed plan-allowance duplication in FAQs by directing readers to Pricing, and removed unsupported blanket claims about automatic comparisons.
- Standardized CertScore.ai product naming in evergreen prose while retaining technical identifiers.
- Removed redundant related links and the unused duplicate audit-guide content entry. Resources now chooses the most specific active link/group.

## Validation

- 89/89 static public-route requests resolved to HTTP 200, following existing and new redirects.
- 66/66 focused marketing, Trust-removal and MCP/SEO checks passed.
- `pnpm exec tsc --noEmit --incremental false -p apps/web/tsconfig.json` passed.
- Scoped diff whitespace checks and related-link duplication audit passed.
- Chrome visual checks: overview and Solutions on desktop/mobile; mobile Resources accordion and CCPA destination; consolidated consent guide redirect and mobile layout. Checked 390px mobile width without horizontal overflow on the reviewed views.
- This is a source/content sweep and static-route reachability check, with representative visual checks. It is not a full external-link audit, authenticated-flow test or scan-execution test.

## Public route inventory

| Route | Review disposition | Local response |
| --- | --- | --- |
| `/black-friday/activate` | retain/review | Not crawled: dynamic template / functional flow |
| `/black-friday/apply` | retain/review | Not crawled: dynamic template / functional flow |
| `/black-friday` | retain/review | 200 |
| `/homepage-trial` | consolidate → / | 200 → `/` |
| `/` | retain/review | 200 |
| `/pricing` | retain/review | 200 |
| `/api-pulse/agent` | retain/review | 200 |
| `/api-pulse` | retain/review | 200 |
| `/benchmarks` | retain/review | 200 |
| `/benchmarks/pre-consent-tracking-2026` | retain/review | 200 |
| `/benchmarks/session-replay-risk-2026` | retain/review | 200 |
| `/benchmarks/website-consent-tracking-2026` | retain/review | 200 |
| `/book-demo` | retain/review | 200 |
| `/book-demo/schedule` | existing redirect | Not crawled: dynamic template / functional flow |
| `/browser-extension` | retain/review | 200 |
| `/browser-extension/privacy` | retain/review | 200 |
| `/ccpa` | retain/review | 200 |
| `/claude` | retain/review | 200 |
| `/compare/cmp-vs-runtime-consent-scanner` | retain/review | 200 |
| `/compare/cookiebot-alternative-runtime-testing` | retain/review | 200 |
| `/compare/onetrust-runtime-consent-testing` | retain/review | 200 |
| `/compare` | retain/review | 200 |
| `/compare/privacy-scanner-vs-cookie-scanner` | retain/review | 200 |
| `/compare/website-consent-audit-tools` | retain/review | 200 |
| `/contact` | existing redirect | 200 → `/contact-sales` |
| `/contact-sales` | retain/review | 200 |
| `/developers/examples` | retain/review | 200 |
| `/developers/mcp` | retain/review | 200 |
| `/developers` | retain/review | 200 |
| `/developers/quickstart` | retain/review | 200 |
| `/developers/reference` | retain/review | 200 |
| `/developers/sdk` | retain/review | 200 |
| `/editorial-policy` | retain/review | 200 |
| `/faq` | retain/review | 200 |
| `/findings/[findingId]` | retain/review | Not crawled: dynamic template / functional flow |
| `/findings` | retain/review | 200 |
| `/gdpr` | retain/review | 200 |
| `/guides/check-third-party-cookies-before-consent` | retain/review | 200 |
| `/guides/check-website-tracking-before-consent` | existing redirect | 200 → `/guides/detect-tracking-before-consent` |
| `/guides/cmp-verification` | consolidate → /compare/cmp-vs-runtime-consent-scanner | 200 → `/compare/cmp-vs-runtime-consent-scanner` |
| `/guides/consent-enforcement-testing` | retain/review | 200 |
| `/guides/consent-report-example` | retain/review | 200 |
| `/guides/cookie-banner-requirements` | retain/review | 200 |
| `/guides/cookie-consent-enforcement-checker` | consolidate → /guides/consent-enforcement-testing | 200 → `/guides/consent-enforcement-testing` |
| `/guides/cookie-consent-laws` | retain/review | 200 |
| `/guides/detect-trackers-before-cookie-consent` | existing redirect | 200 → `/guides/detect-tracking-before-consent` |
| `/guides/detect-tracking-before-consent` | retain/review | 200 |
| `/guides/disclosure-signals` | existing redirect | 200 → `/guides/website-disclosure-requirements` |
| `/guides/findings/[findingId]` | existing redirect | Not crawled: dynamic template / functional flow |
| `/guides/findings` | existing redirect | 200 → `/findings` |
| `/guides/google-analytics-meta-pixel-before-consent` | retain/review | 200 |
| `/guides/mcp-website-privacy-scanner` | retain/review | 200 |
| `/guides` | retain/review | 200 |
| `/guides/pre-consent-tracking` | retain/review | 200 |
| `/guides/pre-consent-tracking-detection` | existing redirect | 200 → `/guides/detect-tracking-before-consent` |
| `/guides/privacy-policy-examples` | retain/review | 200 |
| `/guides/privacy-policy-signals` | existing redirect | 200 → `/guides/website-privacy-policy-requirements` |
| `/guides/privacy-scanner-vs-cookie-scanner` | existing redirect | 200 → `/compare/privacy-scanner-vs-cookie-scanner` |
| `/guides/reject-consent-tracking-test` | retain/review | 200 |
| `/guides/rtb-cookie-syncing` | retain/review | 200 |
| `/guides/session-replay-risk` | retain/review | 200 |
| `/guides/test-global-privacy-control` | retain/review | 200 |
| `/guides/third-party-cookie-checker` | retain/review | 200 |
| `/guides/third-party-cookies-before-consent` | existing redirect | 200 → `/guides/check-third-party-cookies-before-consent` |
| `/guides/website-consent-audit` | consolidate → /guides/website-consent-audit-checklist | 200 → `/guides/website-consent-audit-checklist` |
| `/guides/website-consent-audit-checklist` | retain/review | 200 |
| `/guides/website-disclosure-requirements` | retain/review | 200 |
| `/guides/website-fingerprinting` | retain/review | 200 |
| `/guides/website-form-scanning` | retain/review | 200 |
| `/guides/website-privacy-policy-requirements` | retain/review | 200 |
| `/guides/website-scanning-basics` | retain/review | 200 |
| `/guides/website-signal-check` | consolidate → /guides/website-consent-audit-checklist | 200 → `/guides/website-consent-audit-checklist` |
| `/how-it-works` | retain/review | 200 |
| `/insights/common-cookie-consent-issues` | consolidate → /solutions/cookie-consent-scanner | 200 → `/solutions/cookie-consent-scanner` |
| `/insights/common-privacy-policy-gaps` | consolidate → /solutions/privacy-policy-risk-scanner | 200 → `/solutions/privacy-policy-risk-scanner` |
| `/insights` | retain/review | 200 |
| `/insights/session-replay-study-2026` | retain/review | 200 |
| `/mcp/light` | retain/review | 200 |
| `/methodology` | retain/review | 200 |
| `/monitor-site` | retain/review | 200 |
| `/monitor-site/status/[token]` | retain/review | Not crawled: dynamic template / functional flow |
| `/monitor-site/thanks` | retain/review | Not crawled: dynamic template / functional flow |
| `/muse` | retain/review | 200 |
| `/press` | retain/review | 200 |
| `/privacy` | retain/review | 200 |
| `/privacy-request` | retain/review | 200 |
| `/regulatory` | retain/review | 200 |
| `/releases/[slug]` | retain/review | Not crawled: dynamic template / functional flow |
| `/releases` | retain/review | 200 |
| `/sample-report` | retain/review | 200 |
| `/security` | retain/review | 200 |
| `/solutions/cookie-consent-scanner` | retain/review | 200 |
| `/solutions/gdpr-website-compliance-scanner` | retain/review | 200 |
| `/solutions` | retain/review | 200 |
| `/solutions/privacy-policy-risk-scanner` | retain/review | 200 |
| `/terms` | retain/review | 200 |
| `/what-is-certscore` | retain/review | 200 |

## Follow-up cleanup — November 11, 2026

- Retired `/editorial-policy` with a permanent redirect to `/methodology#evidence`; retained concise sourcing/corrections guidance there and directed author links to the product overview.
- Removed the generic GPT Store search promotion from the footer, Findings and Pulse marketing. Preserved supported developer API/Action contracts.
- Reduced the footer to 15 main links in four groups, plus persistent legal/privacy controls. Verified desktop and 390px mobile US/EU views.
- Aligned Compare, GDPR, regulatory templates and sample-report scan CTAs with “Run free scan”; Compare and regulatory CTAs now pair this with “View sample report.”
- Removed undated, partly incomplete percentage highlights from GDPR and derivative benchmark highlights from Press. Retained dated original research destinations.
- Removed the stale “23 findings” count and comparison self-link; aligned comparison Reject wording with current retained-evidence distinctions.
- Remaining editorial opportunities: reduce repeated caveats/jargon in longer guides and give the authentic sample report a clearer primary route than the illustrative report layout. External regulatory and competitor-source claims were not comprehensively revalidated in this local copy pass.


## Sample report and guide follow-up

Implemented the real-report destination and practical guide simplification. See [the focused source and verification record](public-guides-and-source-review-2026-11-11.md). This supersedes the earlier remaining-opportunities note for these items; the source review scope is explicitly bounded. No deployment.

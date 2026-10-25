# CMS security MVP

October 24 informational extension: [Tech stack observed](technology-inventory-mvp.md)
preserves this CMS/plugin/advisory evidence and adds bounded supplemental technology
observations, including explicit PHP declarations. Existing CMS rules are unchanged.

## Scope

Passive detection of Joomla, Drupal, Magento / Adobe Commerce, PrestaShop,
TYPO3 and OpenCart, alongside WordPress detection and lifecycle review. Shopify, Wix and
Squarespace stay informational. There are no endpoint probes, exploit tests,
live CVE feeds, model calls, additional browser sessions or score deductions.

The existing runtime DOM metadata read retains up to eight generator declarations
and six same-origin CMS-specific asset URLs (512 characters each, no queries or
fragments). Assets identify a product only; plugin/theme versions and cache-busting
query parameters never become CMS core versions. Detection coverage is the starting
page, including in a site-wide report. Historical scans are not backfilled or
silently reinterpreted; a fresh scan supplies new evidence.

## Canonical path

Verified runtime metadata artifact → `projectCmsSecurity` → persisted
`cmsSecurity` projection → normalized CMS security concern → concern policy →
unified finding → executive summary, Top priorities and collapsed Detailed evidence.
The original bundle hash, document token, capture time and snapshot artifact ID
are retained. Missing verification, invalid timestamps, wrong-document metadata or
malformed references fail closed. Report code does not create findings.

Versions are **declared**, never confirmed runtime versions. Asset-only product
identification is **inferred**, with no version. Conflicting products/versions,
partial releases, prerelease and unrecognized vendor suffixes cannot match vulnerabilities. Catalogue v4 separately permits exact whole-major declarations for fully covered lifecycle intervals, as specified below.
Magento `-pN` patches and OpenCart / legacy PrestaShop four-part releases are compared
numerically. Match confidence describes the retained declaration, not exploitability.

## Reproducible references

Within each scan/document:

- `site_integrity:dom:<n>` resolves to the generator string, page URL and DOM artifact ID.
- `site_integrity:asset:<n>` resolves to the path, sanitized same-origin asset URL and DOM artifact ID.
- `site_integrity:cms:<n>` resolves to the product, exact observed version strings,
  confidence, declaration/inference basis and source-signal references.
- `site_integrity:vuln:<n>` / `site_integrity:lifecycle:<n>` resolve to the matched
  declaration, exact affected range, match result, versioned source record and
  authoritative advisory/lifecycle URL.

`resolveCmsEvidence` resolves these references from the persisted projection.
No header reference or confirmed-runtime proof is manufactured: this MVP does not
retain CMS HTTP headers. The report's JSON evidence carries the full projection;
Detailed evidence links the version and source records directly.

## Catalogue maintenance and limitations

`packages/certscore-contracts/src/cms-security-catalog.ts` is the reviewed, offline
catalogue (reviewed September 17, 2026). It contains selected core advisories for all
six requested families, not comprehensive vulnerability coverage. Each record has
product scope, publication/effective date, exact ranges, source URL, severity,
fixed releases where documented, and prerequisite/backport qualifications.
A matched vulnerable release is outdated against that documented security fix,
not necessarily against today's latest release. No match is not a clean bill of health.

Catalogue v2 adds the documented end of WordPress 4.1–4.6 security updates,
effective July 2025, matching exact declared versions from 4.1.0 up to (excluding)
4.7.0. WordPress 4.5.33 produces an unsupported-branch review, not an inferred CVE.
The rule uses the [WordPress security announcement](https://wordpress.org/news/2025/06/dropping-security-updates-for-wordpress-versions-4-1-through-4-6/).
Persisted v1 assessments continue to validate against the unchanged v1 rules.

Lifecycle notices cover only documented branches. Paid/third-party extended support
is explicitly unverified. OpenCart has no authoritative EOL record in this catalogue;
its support status remains unknown. Magento asset evidence cannot identify the
commercial edition; edition-specific claims require an Adobe Commerce declaration.
PrestaShop 1.7 expiry follows the vendor's maintenance announcement and the June 10,
2025 [PrestaShop 9 release](https://build.prestashop-project.org/news/2025/prestashop-9-0-available/).

Catalogue revisions require reviewed primary sources and tests at affected/fixed
boundaries. Preserve this catalogue version for historical projections; introduce
a new version and explicit compatibility handling rather than changing old records
in place. The schema recomputes the deterministic assessment to reject altered
advisories, ranges or references and tolerates JSONB object-key reordering.

## Verification and cost

Focused tests cover the capture bound and navigation drift; all CMS families;
fixed boundaries; numeric patch comparisons; unsupported lifecycle branches;
partial/conflicting/SaaS/asset-only neutrality; provenance; reference resolution;
tampering and JSONB ordering; policy → unified findings → single/site priorities.
The development-only `/dev-fixtures/cms-security` route uses synthetic evidence
through the production pipeline and components, without modifying customer scans.

Incremental cost estimate: below $1/month at 100,000 scans/month and 30-day retention,
from bounded metadata and assessment storage. No additional scan/network/model calls
or provisioned capacity. No deployment performed.

## October 7, 2026 version capture and simpler presentation

New runtime metadata optionally retains at most eight typed version observations:
explicit WordPress generator comments, numeric `ver` values on the already-loaded
`/wp-includes/js/wp-embed.min.js` and `wp-emoji-release.min.js` core assets, and
one WordPress generator from a page-linked RSS/Atom feed. Comments are inspected
in the existing DOM read (at most 500 comments); plugin, theme, library, arbitrary
query parameters and cache filenames never become core versions. Asset versions
remain labelled candidates and cannot produce catalogue warnings on their own.

When the starting-page baseline identifies WordPress without a declared version,
it may retrieve one observed same-origin feed link, only if a budget remains.
This October 7 owner-approved exception to the original passive-only scope uses
the existing guarded proxy transport, preserves the crawler HTTP identity, sends
no visitor cookies/credentials, follows no redirects and performs no retry.
The complete attempt, including DNS and body reads, is bounded to one second
inside the existing module/parent deadline. The body is bounded to 256 KiB; only
the generator excerpt, numeric version, body SHA-256, source URL and linking
document are retained. Invalid, ambiguous, oversized, unavailable, cancelled or
unbound evidence remains unknown. GPC, additional-page and consent-proof lanes
never make this request. No lane, browser run, model call or timeout extension
is added. Estimated incremental AWS compute and bounded evidence storage is up
to **$8/month at 100,000 affected scans**, approved by the owner October 7.

`certscore.cms-security-projection.v2` consumes these typed observations through
the existing verified projection → normalized concern → policy → unified finding
path. Explicit WordPress major/minor declarations such as `6.8` are valid release
numbers; comparisons use the release's zero patch component without rewriting
the retained version. Conflicting declarations fail closed. All warnings remain
score-neutral. V1 projections and metadata without the new observation field
retain the original three-component interpretation and historical catalogue.

The CMS card shows the version once (for example, **WordPress 6.8**) or a neutral
**WordPress · Version not detected**. The stacked Limited/unavailable messages
and general disclaimer paragraph are removed. Actual catalogue warnings and
vendor links remain visible; source observations sit under **How we identified
this**. No new customer disclaimer is added.

Verification covers local browser capture and guarded feed retrieval, a full
runtime-lane fixture with GPC isolation, deadline/abort/redirect/body-size
bounds, declaration/source tampering, major/minor releases, historical V1
compatibility, canonical score neutrality and rendered CMS presentation.
No deployment is authorized by this implementation.

## October 7, 2026 informational plugin inventory

The owner requested detected plugins inside the CMS & version box. The verified
CMS projection now optionally includes `certscore.cms-plugin-inventory.v1`,
reproduced from its retained generator declarations and same-origin plugin asset
paths. Known declarations identify WPML, WP Rocket and WPBakery Page Builder;
plugin directories identify Borlabs Cookie, SVG Support and other observed slugs.
Only explicit numeric plugin declarations supply versions. Unknown versions
display as an em dash; conflicting declarations remain conflicting. Plugin
versions never become core versions, advisory matches, concerns or score effects.
The report consumes this typed inventory, without parsing raw observations.
`site_integrity:plugin:<n>` resolves to the inventory row and its retained source
references. Stored projections without an inventory remain readable unchanged;
the local retained SITS replay rematerializes it without writing customer records.

No site request, browser capture, model call or timeout is added. Estimated
incremental compute and bounded projection storage is **below $0.50/month at
100,000 scans/month and 30-day retention**, disclosed before proceeding under
the below-$1 pre-approval. Deployment remains on hold.

## October 11, 2026 versioned Drupal 7 catalogue maintenance

Catalogue `certscore.cms-catalogue.2026-10-11.v3` adds the Drupal 7 community
security support lifecycle entry, effective January 5, 2025, reviewed October 11,
2026. The [official June 7, 2023 announcement](https://www.drupal.org/psa-2023-06-07)
supplies that effective date. Paid or third-party extended support and independently
maintained patches remain unobservable; this entry makes no patch-status claim.

Drupal 7 uses complete two-component core releases, as described in the official
[version scheme](https://www.drupal.org/docs/7/choosing-drupal-version/version-numbers)
and exemplified by [release 7.98](https://www.drupal.org/project/drupal/releases/7.98).
Only v3 accepts exact `7.N` numeric declarations, preserving the original string
and using a comparison-only numeric component internally. Lone `7`, `7.x`,
`7.98.1`, leading-zero components and development/vendor suffixes remain neutral.
Conflicts, asset-only observations and unverifiable source evidence remain neutral.
The first broken stage was exact-release validation; extraction already retains
`7.98`, so no new capture or extraction fallback is added.

Stored catalogue v1 and v2 assessments retain their original September 17, 2026
review dates, grammars, rules and conclusions. Validation selects the explicitly
stored catalogue; it does not reinterpret historical records using v3. New
materializations use v3 through the existing canonical projection and score-neutral
lifecycle review path. No stored record, calibration label or inventory is changed.
No invocation, model call, browser capture, timeout or deployment is added. The
bounded extra lifecycle record has an estimated incremental compute/storage cost
below $0.01/month at 100,000 scans/month and 30-day retention, within the existing
below-$1 pre-approval.

## October 11, 2026 lifecycle branch granularity correction

Catalogue `certscore.cms-catalogue.2026-10-11.v4` preserves the v3 source records
and corrects the shared release gate for lifecycle proof. A fully anchored,
unambiguous numeric major declaration can establish community lifecycle status
only when its entire interval `[major.0.0, (major+1).0.0)` is contained in one
already-effective lifecycle rule. Thus Drupal 7, 8 and 9 can qualify; Drupal 10
alone cannot establish the catalogue's pre-10.3 lifecycle condition. Existing
Joomla 3 and TYPO3 11 lifecycle ranges use the same containment rule. This adds
no advisory or lifecycle record.

Branch detections retain `version: null`, the original major in `branchVersion`,
and `versionGranularity: declared_branch`. Match evidence retains that original
major. No missing patch is synthesized and no branch can match a vulnerability
record. Wildcards such as `7.x`, development/vendor suffixes, conflicting
products or declarations, asset-only evidence and invalid provenance remain
neutral. Only Drupal's exact official parenthesized homepage may follow its
branch declaration. Installed release, backports and paid support remain unknown.

Explicit catalogue v1/v2/v3 reads preserve their original output shapes,
grammars, rules, dates and conclusions; v3 retains the October 11 review date and
complete Drupal `7.N` release grammar. New materializations use v4 through the
existing typed projection, normalized concern, concern policy and score-neutral
unified review path. This is a contract correction under the existing evidence-
bound fix authorization, not a new vulnerability or scoring policy. No retained
review response, label, gate, production integration or deployment is changed.

Official branch-wide evidence is retained in the existing catalogue sources:
[Drupal 7 support announcement](https://www.drupal.org/psa-2023-06-07) and
[Drupal 8/9 end-of-life statement](https://www.drupal.org/sa-core-2025-001).
The existing Joomla and TYPO3 lifecycle source records remain unchanged.

There is no additional request, callback, capture, wait, model call or invocation.
Additional assessment metadata is bounded below 512 bytes per qualifying case;
the disclosed incremental storage/transfer estimate is **below $0.01/month at
100,000 scans/month and 30-day retention**. With the root task's prior $0.9674
estimate, expected aggregate incremental cost remains below $0.9774/month.

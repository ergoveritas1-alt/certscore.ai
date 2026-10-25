# CertScore.ai technology inventory MVP

Local implementation, October 24, 2026. No deployment, production flag change,
public scan, historical rewrite, new paid service, or capacity change.

## Product and contract

The existing CMS evidence box becomes **Tech stack observed**. Existing CMS,
plugin, version, lifecycle, advisory and source evidence stays intact. Supplemental
observations carry category, confidence, scope, explicitly declared version (or
unknown/conflicting), rule IDs and retained evidence references. CMS, technology and
plugin entries share one compact table, with confidence and scope kept explicit and
supporting evidence behind a keyboard-accessible `...` expander at each row's end.
High-confidence cells read “High.” Existing plugin contracts do not assess
confidence, so that cell remains unassessed. CMS advisory warnings stay visible.
This table-only presentation revision adds no recurring cost.
The same information is available in the detailed-evidence API, JSON and PDF.
The existing `cmsSecurity` contract key and `cms-security-evidence` anchor remain.

This is a passive informational inventory, following the existing plugin-inventory
pattern: baseline runtime observation → verified bundle/document projection →
persisted optional `technologyInventory` → report/export. It creates no concerns,
findings, checklist failures or score effects. Existing CMS advisory concerns still
use the unchanged normalized concern → concern policy → unified finding pipeline.
Neither California nor EU scoring changes.

## Coverage target: 29 identities, plus existing plugins

| Group | Identities | Positive evidence accepted |
| --- | --- | --- |
| Existing CMS / commerce | WordPress, Joomla, Drupal, Magento, Adobe Commerce, PrestaShop, TYPO3, OpenCart, Shopify, Wix, Squarespace | Existing rules and evidence, unchanged |
| Supplemental CMS / builders | Ghost, Hugo, Webflow, HubSpot, Contentful | Exact generator declaration; Webflow also has a tentative document marker |
| Commerce | WooCommerce | Exact generator declaration or tentative plugin asset path |
| Frameworks / libraries | Next.js, React, Vue, Nuxt | Exact generator declaration or specific asset paths; Next.js/Nuxt document markers; Next.js response declaration |
| Web servers | nginx, Apache HTTP Server, Microsoft IIS | Original main-document Server declaration |
| Backend runtime | PHP | Explicit X-Powered-By declaration, optionally with a numeric version |
| CDN / delivery | Cloudflare, CloudFront, Fastly, Akamai | Reviewed original main-document response declarations; CloudFront requires its Via signature and header presence together |

The target counts reviewed identities, not guaranteed detection on every website.
Several products are supported only when explicitly declared. PHP is never inferred
from WordPress, another CMS, cookies or a `.php` URL. PHP can suppress its identifying
header through [`expose_php`](https://www.php.net/manual/en/ini.core.php#ini.expose-php).
Observed delivery headers do not establish the origin host, a cloud account or the
complete server stack. There is no hosting-provider inference from a generic CDN,
DNS name, tag manager or embedded third-party asset.

Asset filenames supply no versions. Same-origin assets identify a page component;
cross-origin assets remain external assets with ownership unresolved, including
first-party CDN deployments. Neither becomes a site platform. Only independent
same-origin asset and exact document-marker evidence corroborates Next.js/Nuxt.
Declarations are high-confidence evidence of what the page/server declares, not
authenticated installation or runtime-version proof. Conflicting versions remain
explicit; bounded projection keeps each identity/scope evidence group atomically
so truncation cannot erase a known conflict and promote the remaining version.

## Capture, verification and bounds

- Reuse the existing baseline metadata evaluate and its first 500 asset elements.
  The supplemental DOM loop runs after existing privacy-context reads, with a 2 ms
  cooperative deadline, at most six observations and a 600-byte DOM allowance.
  This is a cooperative processing limit, not a hard browser execution deadline.
- Reuse synchronous headers already available on the original navigation response.
  No new request, response-body read, async header retrieval, visit, wait, click,
  SDK call, cookie read or model call. Existing WordPress linked-feed behavior is
  unchanged. Supplemental capture is disabled for GPC and inventory-only lanes.
- The optional capture capsule is at most 1,024 serialized UTF-8 bytes and eight
  observations, including bounded request ID/document-token provenance. Retain
  reviewed header declarations only, never header identifier values or cookie values.
  Asset URLs lose queries/fragments and reject embedded credentials.
- The existing verified bundle hash, original starting-page identity, timestamp,
  document token and metadata artifact are prerequisites. Headers additionally
  join exactly one original main-frame document request and one successful response,
  with exact URLs and pre-consent timing. No join scans more than 2,048 requests or
  responses; unavailable or ambiguous proof omits the header observation.
- The persisted inventory is at most 4,096 serialized UTF-8 bytes, 16 source signals
  and 18 supplemental detections. Limits set `truncated`; this is a positive-evidence
  inventory, not a complete-stack claim. Source signals and ruleset version support
  later controlled reprocessing without altering historical records automatically.
  Schema validation recomputes detections and rejects tampering or mismatched sources.

Masked headers, arbitrary bundled/minified JavaScript, framework execution state,
child-frame platforms, unsupported signatures and undisclosed versions remain
unknown. Raw HTML/script bodies and cookie contents are not newly retained.

## Local validation

Focused tests cover all 18 supplemental identities, PHP non-inference, false-positive
lookalikes, external assets, conflicting versions, bounded conflict handling,
schema tampering, original document/request/response joins, existing CMS/plugin
preservation and unchanged unified findings. Local Playwright fixtures exercise
actual DOM and runtime capture, verify no additional requests, and verify GPC
exclusion. Report tests exercise informational-only API output and PDF preservation.
Desktop and mobile previews use the production component and Tailwind configuration.
All 76 focused capture, contract, projection, UI and export tests passed, plus six
SDK evidence tests. The 13 detailed-evidence export tests also passed again after
regenerating SDK/OpenAPI types; the generated-contract drift check passed.
Contracts, API contracts and SDK builds, scan-core and web TypeScript checks passed.

Retained replay covered 20 distinct hosts from recent local verified bundles: all
remained compatible, with five existing CMS detections (three WordPress, two Drupal).
No supplemental detections occurred in that historical sample; the new header/DOM
capsules were absent. This is compatibility evidence, not a real-world accuracy
benchmark. Synthetic rule tests are not population precision/recall estimates.
Live detection accuracy and total production scan-latency impact remain unmeasured.

A local 1,000-iteration warm benchmark of five-signal projection plus schema
verification measured p50 0.075 ms, p95 0.117 ms, p99 0.753 ms, with a 1,959-byte
inventory, including the atomic-truncation safeguard. This measures only pure
projection/validation, not an entire scan. Existing scan budgets remain unchanged.

## Cost estimate and approval boundary

Local implementation/tests add no recurring AWS charge. At 100,000 scans/month
and 30-day retention, the planning estimate for future activation is approximately
**$0.75/month incremental**, below the repository's pre-approved $1 threshold:

- At most 1 KiB capture plus 4 KiB projection; allowing six equivalent retained
  copies is about 3.1 GB, or $0.46/month at a conservative $0.15/GB-month allowance.
- Two extra payload deliveries per scan at $0.12/GB allow about $0.12/month.
- A 10 ms incremental compute allowance at 3 GB and $0.00002/GB-second allows
  about $0.06/month, plus roughly $0.11 contingency for serialization/processing.

These are planning assumptions, not an observed bill or a change to AWS pricing.
They assume unchanged retention, request counts and capacity, and no unusually
high report-read amplification. Existing AWS storage, transfer and compute prices
and actual replication/read volume should be checked before any future activation.
No additional storage objects, invocations, dependencies, paid APIs, models or
workers are introduced. If the reasonable estimate reaches $1/month, obtain owner
approval before expanding the implementation or deploying. The lower-cost fallback
is to display only already-retained generator/asset evidence, omitting new capsules.

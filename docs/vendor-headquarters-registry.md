# Provider headquarters reference data

The canonical registry lives in `packages/certscore-vendor-resolver/src/vendor-headquarters.ts`.
It is reviewed company metadata, not scanner evidence, legal advice, a transfer
mechanism assessment, a data residency assertion, or a scoring input.

## Resolution and presentation

Use an exact canonical legal-entity match. Do not strip entity suffixes, match
loosely on brand names, follow a parent company, or infer HQ from a domain, IP,
ASN, incorporation country, mailing address, or regional contracting office.
Each reference retains its entity scope, verified/unverified status, country
(or null), source URLs/titles, source-check date, registry version and review note.

`resolveCanonicalVendorLegalContext` combines verified HQ reference data with
existing separately maintained transfer context. Newly added HQ entries always
receive an unknown transfer mechanism. Existing transfer assessment dates and
conclusions are unchanged; HQ research must never verify a transfer arrangement.

Resources and Services use the same Provider HQ disclosure, with the source and
review date one click away. Country values are built from the current registry
when the inventory response is assembled, so retained scans benefit on refresh
without new browser observation. Historic stored evidence and scores are not
rewritten. Source references are resolved from the same bundled registry in the
UI rather than repeated in every resource row's response.

## Maintenance

Review official headquarters statements, principal executive office filings, or
an explicitly identified principal place of business. A company's own maintained
company profile can support its HQ statement; pair it with an entity-specific
source where needed. An issuer's current, corroborated LEI headquarters record
can support that exact entity, distinct from its legal address. Third-party
company aggregators, investor locations and ordinary contact addresses cannot.
Retain exact source URLs and the date actually checked. A site's headquarters
claim is reference data, not proof of the entity contracting with its customers.

For acquisitions, reorganizations, contradictory sources, or sources proving
only a registered office, keep the country null and explain the limitation.
The initial review explicitly leaves Hotjar Ltd, Segment.io, Inc., TikTok
Technology Limited and X Corp. unverified for these reasons. Do not assign a
parent/successor HQ to make coverage appear complete. Add distinct, sourced
entity records when those identities are verified upstream.

Review entries at least every six months and when a merger or relocation is
reported. Update checkedAt only after rereading the source; bump the registry
version for changes. No scheduled research, remote lookups, model calls or
automatic network updates are enabled. Run the vendor-headquarters and existing
legal-context tests plus the web resource-context/disclosure tests after changes.

## Cost

No extra scan invocations, paid services, storage retention or per-scan API calls.
The small bundled reference dataset adds less than 21 KiB of HQ source before
compression (shared across resources, with no repeated per-row source payload).
Estimated incremental bandwidth is below $1/month at 100,000 first-time report
loads; ordinary application caching reduces this further. Research maintenance
is manual and outside the scan's latency path.

## September 7 corpus expansion

The v2 reference release adds seven verified entities: Amazon.com, HubSpot,
Comscore, Usercentrics A/S (Denmark), The Trade Desk, Functional Software/Sentry,
and Akamai. That release contained 20 verified entities. AWS and PubMatic remain explicitly
unverified: the reviewed AWS source establishes a contact address, while the
current PubMatic filing marks principal executive office address not applicable.
Do not promote either from older or parent-company headquarters references.

The canonical resolver v2 corrects jsDelivr's owner label to Volentio JSD Limited,
as named in its official DPA, and removes npm ownership from UNPKG. The latter is
represented as `UNPKG (operator unverified)`, not a verified corporation. Existing
frozen entity/vendor/service IDs remain stable for these isolated label corrections;
product names, detection patterns, classifications and observation IDs are unchanged.
Official source review is included in the rule manifest. Historical retained v1
attribution fixtures remain intact; v2 fixtures retain identical evidence and IDs
with the new resolver version. Stored historical evidence is not rewritten.

### Frequency-prioritized v3 expansion

The second September 7 batch reviewed 30 more entities and added 26 verified HQ
countries, bringing the registry to 46 verified and 12 explicitly unverified
entities. All references retain their sources, actual check date, and a review
note. This changes only the HQ reference version, not frozen entity identifiers,
vendor detection, network evidence, transfer conclusions or scoring.

Replaying the same retained 750-scan sample (738 distinct site labels) gives:

| Measure | Before v3 | After v3 |
| --- | ---: | ---: |
| Recognized entity candidates | 157 | 157 |
| Verified HQ entities | 20 | 46 |
| Matched entity/site pairs with verified HQ | 1,383 | 1,724 |
| Total matched entity/site pairs | 2,376 | 2,376 |
| HQ coverage of those pairs | 58.2% | 72.6% |
| Explicitly unverified entities | 8 | 12 |
| Entities still awaiting research | 129 | 99 |

This is a sample-weighted reference-coverage measure, not the percentage of all
network requests or all production reports with verified HQ. Each entity counts
once per distinct sampled site; repeated scans and requests do not multiply its
weight. No new scan or production database query was needed for this replay.

The newly verified entities are Yandex, Magnite, Reddit, Lotame, New Relic,
Marfeel, OpenX, Index Exchange, Siteimprove, Webflow, Wingify, Automattic,
Sourcepoint, ZoomInfo Technologies LLC, TrustArc, Vimeo, Chartbeat, Didomi,
Trustpilot A/S, Tealium, Wistia, Ketch Kloud, Osano, Pinterest, Spotify AB and
Blockthrough. Exact legal names and sources remain in the canonical registry.

OpenJS Foundation, CookieYes Limited, ID5 Technology, Inc. and Fonticons, Inc.
remain explicitly unverified. Their reviewed sources establish mailing/contact
addresses, team locations, or a different legal entity rather than HQ for the
detected entity. In particular, ID5's reviewed agreement names ID5 Technology
Limited; its London address must not be assigned to ID5 Technology, Inc.

Company and functional headquarters are kept distinct: Index Exchange's company
profile identifies Toronto HQ while its offices page labels New York commercial
HQ. Sourcepoint retains its own US HQ rather than Didomi's French HQ, and
Blockthrough retains its own Canadian HQ rather than its acquirer's location.
Automattic explicitly publishes a US HQ despite having a distributed workforce.

The entire HQ source is approximately 20.4 KiB (6.0 KiB gzip). This batch adds
about 11 KiB of source before compression, no remote lookups, and no runtime
observation or persistence. Estimated incremental static bandwidth remains below
$1/month at 100,000 first-time report loads, with no material lookup CPU/memory
change. The next missing entities each occur on at most nine distinct sites in
this sample; prioritize fresh cohort frequency and clear sources over reaching
an arbitrary entity count. Production release remains separate.

## Documented service regions

`service-regions.ts` is a separate local reference registry. Exact HTTPS ingestion
URLs can match Sentry US/Germany, and Google's exact `/mp/collect` EU endpoint.
Undocumented Google `/g/collect` paths, generic regional-looking hosts, assets,
nonstandard ports, credentials and lookalike domains do not match. Reference
sources and actual check dates are retained once in the shared registry.

Both Resources and Services show this optional context inside their existing
Data transfer disclosure, with a small explicitly documented region label.
Only retained request URLs are supplied. It never replaces a missing observed
IP, sets a network destination, verifies a transfer mechanism, or enters the
finding/scoring pipeline. No column or nested table is added. HQ and documented
service-region references add no browser runs, remote calls, or persistence.

## Production readiness

On September 7 all three production regional Lambdas remained on the September 6
image digest `be177bc9164a7baf0a119429aa23c34406c7e9b1241b7b32ec537852c948e5ba`,
with 3008 MiB allocation. The previous read-only cohort check found no destination
IPs in 299 report projections or 12 checksum-verified raw bundles. This does not
claim the new local IP capture is deployed.

The image and ZIP packaging paths now run `node scripts/verify-iplocate.mjs`.
Missing, wrong-type, future-dated or older-than-30-day Country/ASN databases fail
packaging. The image takes the validated database files from its build stage.
Install the files before a clean build; they remain Git-ignored and are never
fetched during scans. Follow `config/iplocate/README.md` for manual installation.

Production promotion remains a separate canonical AWS release: AGENTS.md requires
a clean committed worktree and preflight against the live revision. This task does
not commit or publish the broad existing worktree. No production capacity changed,
no new production scan was created, and no recurring updater was enabled. Verify
ordinary post-release artifacts for retained IP and database provenance before
claiming production coverage. Runtime capture/enrichment already present locally
continues to use bounded caches and the existing memory allocation.

Incremental cost for this reference/guard change is estimated below $1/month
(mainly small static response assets, at 100,000 first-time report loads). Build-time
validation runs locally in existing release builds; it adds no provisioned capacity,
API usage, or recurring scan cost. The production inspection used read-only Lambda
metadata calls and no new Fargate audit task.

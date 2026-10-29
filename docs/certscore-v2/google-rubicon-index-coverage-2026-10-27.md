# CertScore.ai Google, Rubicon and Index Exchange coverage

Owner-authorized local implementation and helpful bounded re-scans on October
27, 2026. No deployment, production report creation, flag change or historical
rewrite. The daily audit remains focused on incremental data/dashboard upkeep.

## Google browser collection

`bounded_ca_request_proof.v8` covers the new reviewed browser event parser at
five exact HTTPS `/g/collect` origins: `www.google-analytics.com`,
`google-analytics.com`, `analytics.google.com`, `region1.analytics.google.com`
and `region1.google-analytics.com`. This is not `/mp/collect` server-side
Measurement Protocol support. Canonical resolver v18 adds the two previously
unattributed exact apex/regional endpoints to the existing Analytics identity.
It creates no vendor-wide or arbitrary subdomain match.

Google's retrieved tag source uses CRLF between event records and `ep.`/`epn.`
for custom event parameters. The parser supports bounded scalar metadata and
at most sixteen event records within the unchanged total 32,768-byte and
128-field limits, counting the URL and every record. Repeated fields within a
record, query/body collisions, malformed framing/encoding and unknown fields
stay unsupported. A transmitted identity or privacy field is projected across
a batch only when every record agrees on its presence and value. Separate
records cannot supply parts of an invented combined event.

Only `cid` is newly projected as body identity by this parser. Event names,
publisher/property identifiers, custom parameters and session IDs do not become
advertising visitor identity. Values remain ephemeral and supported identifiers
are hashed. Existing flat JSON and body-only non-event proof decoding retains
its earlier path and proof version.

`google_analytics_property.v2-browser` binds an inspected request at the three
additional origins to its exact transmitted property and identified collection.
Existing v1 bindings remain under v1. This is metadata, not purpose proof.
Ordinary Analytics activity stays unresolved; any independently supported
target-owned exact-property declaration must still pass the existing verified
property/collection assessment and canonical concern pipeline. No declaration,
purpose, finding or scoring weight is invented here.

Positively parseable `rdp`, `npa`, `ltd`, GPP and US Privacy declarations remain
available when unrelated event metadata is unsupported. Partial reads preserve
duplicates/conflicts rather than removing them or inventing one effective state.
They return no identity. Existing restriction treatment and NPA context policy
remain unchanged.

## Magnite/Rubicon

`bounded_ca_request_proof.v9` is limited to POST
`https://fastlane.rubiconproject.com/a/api/prebid-exchange.json`. The reviewed
Magnite adapter confirms this endpoint and its `dvplus` bidder routing and
`prebid.channel` metadata. The older Rubicon adapter uses different transports;
it is not a substitute for this source.

The new closed banner-auction subset accepts bounded site, device, impression,
user/EID, supply-chain and reviewed routing metadata. It preserves supported
US Privacy/GPP locations, including top-level and legacy extension forms.
Duplicate/conflicting carriers fail closed. Publisher-defined visitor/inventory
maps, unknown extensions, video/native formats and other unreviewed shapes stay
unsupported. The accepted subset is not exhaustive coverage of the adapter.

Supported EIDs retain hashed identity on the exact request; the request's
qualification remains purpose-unresolved. The new contract forbids relabeling
v9 as fully qualified advertising collection. Shape, routing and EID presence
alone do not create a full California recipient finding or score effect.

## Index Exchange and proof/event retention

The existing exact `/openrtb/pbjs` v7 parser and its purpose boundary are
unchanged. Its offline tests pass. The four old WOWT proofs whose source network
events are missing cannot be reconstructed from their hashes or field names.

Canonical compaction now gives already-selected GPC proofs' exact source
requests and available unique response pairs priority over ordinary duplicate
traffic. It checks event/request uniqueness, method, time, URL hash, origin/path
and main-document token before assigning priority. It creates no event and
changes no proof or observation. Navigation, complete comparison windows and
existing distinct-recipient selection retain higher priority. Existing
140/100 and 80/60 request/response caps remain unchanged; caps can still prevent
some joins, which remain explicit source-binding limitations in audit triage.

The regression fixture demonstrates ordinary compaction dropping selected
source rows and the new priority retaining them within the same caps. Wrong
document/request/method/time/URL and ambiguous event/request identities cannot
gain priority. This is local verification, not closure of historical or
production evidence-binding issues.

## Live checks and evidence limits

Three passive local canonical runtime/GPC visits used the normal 15-second
internal module budget, with an 18-second outer abort guard, no privacy actions,
no policy/model reviewer and no AWS invocation or production report. Local
origin is not verified as a production scan region. A temporary offline wrapper
compared existing in-memory capture inputs with the earlier parser without
adding browser reads or retaining raw body values. The earlier-parser baseline
uses current canonical recipient resolution and is not a historical build.

| Site | Elapsed including setup/cleanup | Outcome |
| --- | ---: | --- |
| AIOSEO | 12,588 ms | 144 requests; one target Google request, body absent; GPC session completed |
| Bournemouth Echo | 16,924 ms | 118 requests; no target Rubicon request; GPC session incomplete |
| WOWT | 14,366 ms | 84 requests; no target Index request; GPC session completed |

The new Google POST and Rubicon/Index payload paths were not reproduced. These
visits do not establish a live decoder fix, honoring, permanent traffic absence
or ordinary production progress. No repeat visits were made. One earlier local
script import failed before scanner loading or network contact; its zero-visit
setup failure and original claim are retained separately.

All twelve original parent/worker files verify and all 53 historical request
proofs parse byte-equivalently as data, without metadata backfill. The six-case
review still has six bound unresolved requests, one already-qualified Lotame
request and four missing-event proofs. Original raw payload values are absent;
synthetic source-informed fixtures cannot prove how those historical bodies
would decode. Keep C2 capture diagnostics separate from protocol coverage.

## Sources, validation and cost

Retrieved, hashed primary sources are saved in the immutable manual run:
[Google tag](https://www.googletagmanager.com/gtag/js?id=G-JXZYNSEYPH),
[Magnite adapter](https://github.com/prebid/Prebid.js/blob/master/modules/magniteBidAdapter.js),
[Index adapter](https://github.com/prebid/Prebid.js/blob/master/modules/ixBidAdapter.js),
and [IAB OpenRTB](https://github.com/InteractiveAdvertisingBureau/openrtb2.x/blob/main/2.6.md).
Source snapshots demonstrate the reviewed current formats, not the exact
historical publisher build.

Validation includes the Google/Rubicon/Index, compaction, GPC discovery and
assessment, request diagnostics, Reject policy, full contracts and vendor
regression tests; package and focused new-test TypeScript checks; original-byte
receipt checks; and source-informed synthetic before/after comparisons.
The manual run's final checks receipt records authoritative counts and exits.

No body/header read, browser wait, inspection/proof cap, score family or capture
budget is increased. Estimated incremental parsing/retained metadata cost is
below $0.50/month at 100,000 scans, disclosed before proceeding; actual extra
paid cloud/model usage is $0. A future release needs compatible producer and
consumer schemas together. The checkpoint, issues, release watch, model ledger,
automation configuration, cost ledger and published dashboard remain unchanged.

# CertScore.ai retained audit corrections — October 25, 2026

The owner authorized local implementation of the three recommendations from the
October 25 daily audit: D14 runtime error-page recognition, D12 failure-decision
retention, and selective C2 collector-envelope coverage. This is implementation
and offline verification scope. Deployment and ordinary-production verification
remain separate stages. The daily audit checkpoint and model-transition ledger
retain their existing meanings.

## Runtime error pages (D14)

The devtodev original runtime document contains a branded soft 404 beyond the
first 360 characters because navigation precedes the error component. The Joybuy
runtime document contains a temporary service interruption returned with HTTP
200. The separate consent sessions do not establish runtime usability.

`classifyRuntimeErrorPage` recognizes the two reviewed bounded templates. It
requires the combined error heading, explanation and recovery controls; quoted
examples, explanatory prefixes and unrelated error mentions remain neutral.
Recognition examines at most 4,096 retained characters, adds no capture, and
keeps the evidence quote bounded. The terminal DOM snapshot supplies the new
classification, so an earlier error does not invalidate a recovered document.

The same classification is used by scan-core's typed no-go assessment and the
original-runtime eligibility guard. Another lane's positive screenshot or page
cannot provide that eligibility. Existing canonical no-go publication stays
unscored; an independently usable consent session with an unusable runtime can
end as the existing failed attempt. No new finding, score weight, display
fallback or historical rewrite is introduced.

## Runtime rejection diagnostics (D12)

The seven prior `original_runtime_visit_unavailable` attempts have no persisted
passive source inventory. The coordinator sent it, but the validation result
parser omitted the typed field. The original v2 failure artifacts also omit the
runtime decision context. Their correct disposition remains unadjudicated from
available local evidence; do not infer seven false rejections or recovered scans.

New failures use `certscore.failed-terminal-lane-evidence.v2` with a bounded
`runtime_visit_eligibility.v1` reason derived by the same function that checks
eligibility. Optional selected-snapshot facts contain hashes, capture time and
presence flags, without raw document text, URLs or loader tokens. These facts
require the verified original runtime bundle pointer. Both result consumers
retain valid, matching failed-attempt evidence, and the validation event persists
it. Completed, mismatched, malformed or projectable summaries are omitted.

The existing failure upload carries this inventory in
`certscore.v2_lambda_failure_diagnostic.3`. Original v1 summaries and v2 failure
artifacts remain readable. There is no additional source download, upload,
invocation, wait, retry or relaxation of report eligibility.

## Selective collector coverage (C2)

The retained unsupported inventory ranks exact endpoints by distinct ordinary
sites, with repeated events counted separately. Lotame `/6/map` appeared on five
sites, TikTok `/api/v2/pixel` on four, and Index Exchange `/openrtb/pbjs` on three.
Unsupported historical bodies were not retained, so endpoint incidence alone
cannot identify their actual envelopes or prove a missing recipient.

This change supports a closed subset of the Index Exchange Prebid banner
request envelope at `https://htlb.casalemedia.com/openrtb/pbjs` with POST only.
The reviewed primary source is
[Prebid's ixBidAdapter](https://github.com/prebid/Prebid.js/blob/31645f9964e04ff85b7672010c5927dfd0e4d785/modules/ixBidAdapter.js),
notably its request construction, regulation, EID and banner branches. Its
retained source SHA-256 is
`7b5277b411c228dd3bfde016382980052fff529e582548c58e3e6358cdd25d1e`.

`bounded_ca_request_proof.v7` binds this new inspection to the exact endpoint.
Reviewed GPP/US Privacy locations feed the existing processing-signal decoder.
Known restrictions survive unsupported sibling metadata through a separate
bounded read. Existing reviewed EIDs retain hashes only. The body reader shares
the existing 32,768-byte, 128-member and eight-depth caps; capture still uses
48 inspections, 32 retained proofs and the same header reads. Duplicate decoded
keys, conflicting query/body declarations, repeated EID sources, unknown fields,
prototype properties and unsupported video/native envelopes fail closed.

The new proof remains purpose-unresolved. Neither an auction shape nor an EID
creates a full California sale/sharing qualification. Historical v1–v6 proofs,
independently qualifying URL evidence, request-local restrictions, EU presence
policy and the canonical concern/policy/finding pipeline remain intact.

The reviewed Lotame Prebid module does not specify `/6/map` request bodies.
TikTok Events API documentation does not establish the exact unsupported browser
variant. Those formats remain unsupported pending source review. This change
does not claim historical payload recovery or production coverage success.

## Verification and cost

Use the two original checksum-verified runtime worker bundles, a frozen-cohort
eligibility comparison and historical report/API parity, plus the focused
template, coordinator, failed-result and parser tests. Required full preflight
results and source receipts belong under
`artifacts/daily-audit-fixes-2026-10-25/`. Production verification must use eligible
ordinarily occurring evidence after a separately authorized release.

The combined incremental processing and metadata estimate is below $0.75/month
at 100,000 scans and 30-day retention. This is a conservative estimate, including
bounded failure metadata in existing artifacts/events and parser work within the
existing caps; local benchmark receipts record measured processing separately.
There is no new capacity, capture time, retention duration, paid service or model
call. Local implementation and verification incur $0 incremental AWS usage.

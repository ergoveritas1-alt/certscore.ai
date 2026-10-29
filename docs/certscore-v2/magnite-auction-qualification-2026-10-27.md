# CertScore.ai Magnite/Rubicon auction qualification — October 27, 2026

The owner authorized the Magnite/Rubicon follow-up after Index Exchange. This
adds local qualification and tests, with one ledger-selected live diagnostic,
unchanged capture limits and no deployment or historical report rewrite.

## Reviewed request and witness

The official Magnite adapter uses the exact HTTPS POST endpoint
`fastlane.rubiconproject.com/a/api/prebid-exchange.json`. It moves publisher
parameters into `imp.ext.prebid.bidder.dvplus`, groups by account/site/media type,
and sends the account/site pair, media type and bid count as `as`, `m` and `s`.
See the [official adapter](https://github.com/prebid/Prebid.js/blob/master/modules/magniteBidAdapter.js)
and [bidder documentation](https://docs.prebid.org/dev-docs/bidders/magnite.html).
The retained source snapshot is protocol review evidence, not proof of a prior
publisher's adapter build.

New captures use `bounded_ca_request_proof.v13`. A completed existing bounded
JSON inspection can retain `magnite_banner_auction.v1` under OpenRTB context.
The witness requires:

- The exact endpoint and POST method, a nonempty auction ID and distinct nonempty
  impression IDs, a valid HTTP(S) page and the reviewed `pbjs` channel.
- Positive integer banner geometry on every impression, with all retained format
  dimensions valid. Video, native and unreviewed envelopes remain unsupported.
- One complete positive account/site/zone tuple in the same impression's exact
  `dvplus` carrier. Account and site must agree across impressions and with the
  single `as` query value; zones may differ between impressions.
- Exactly one `m=banner` value and one `s` value matching the impression count.
  Duplicate or conflicting routing cannot supply the witness. Legacy/snake-case
  carriers, aliases and several partial tuples are not merged.
- Complete header/body inspection and a supported body EID from pubcid.org,
  sharedid.org, id5-sync.com or liveramp.com. Mirrored EID inventories must match
  exactly under the existing contract. A query ID cannot replace body identity.

New witness metadata contains no raw account/site/zone IDs, page URL, payload,
cookie or visitor identifier. Original body, URL and header hashes and existing
source/document/request ancestry remain the evidence binding.

## Versioned analysis and safeguards

The new role is `magnite_exchange_bid_user_identifier`, with
`ca_sale_sharing_qualification.v5-magnite-auction`. Observations carrying it use
`gpc_sale_sharing_evidence.v7-auctions`; mixed observations preserve Index v4 and
other v3 request policies. WC01 uses `california-gpc-response.v12-auctions` and
`california-post-reject.v6-auctions`. Older Index and Rubicon contracts and
historical assessment versions retain their meanings.

Classified advertising purpose is distinct from full finding eligibility.
Invalid/unsupported GPP, opt-out or restricted-processing declarations, invalid
or conflicting privacy signals, missing source/signal/action proof and
failed/unverified responses remain safeguards. An enabled transmitted GPC flag
does not prove honoring. A disabled flag conflicts with independently verified
delivered GPC; an invalid flag remains unresolved.

The canonical typed assessment → normalized concern → concern policy → unified
finding → score path is preserved. The shared recipient family deduplicates
across repeated requests and GPC/Reject paths, including mixed Index/Magnite
traffic. Its weights and cap, the independent once-per-scan GPP family, and EU
policy are unchanged. Existing runtime-link and frictionless-GPC consumers accept
the new version without losing other supported recipients. Reports contain
factual findings and evidence without deduction explanations.

## Limits and verification boundary

All existing limits remain: 32,768 body bytes, 128 members/fields, depth 8,
existing array/EID limits, 48 inspections and 32 detailed proofs. No browser read,
wait, choice action or model call is added by the parser. The estimated recurring
metadata/compute increment is below $0.50/month at 100,000 scans, disclosed before
implementation. The optional one-visit diagnostic's central contact export and
idempotent persistence were estimated below $0.10 total before running.

Deterministic tests cover correct and conflicting routing, complete and partial
tuples, geometry, identity carriers, duplicate keys, privacy declarations, limits,
old proof versions, failed responses, missing GPC, source hashes, canonical
findings and cross-vendor/cross-path deduplication. Retained body derivatives are
explicitly synthetic/redacted structural fixtures, never original-body replay.
Old unsupported or incomplete requests are not upgraded or written back.

Live evidence, source receipts, checks and limitations are recorded separately
in the immutable manual audit run. A successful local request does not establish
deployed behavior or close an ordinary-production verification issue. Diagnostic
visits do not enter the Mac mini dashboard cohort or advance the scheduled audit
checkpoint. No deployment or flag change is authorized.

Final verification passed 1,273 tests, seven package typechecks, strict changed-test
types and generated-contract parity. Twelve original parent/worker files verified;
53 historical proofs and the prior Index capture's 13 proofs parse unchanged.
Nine synthetic retained comparisons also pass.

The successful central history export and canonical selector chose TasteAtlas
from three hash-verified retained candidates, excluding Bournemouth. The sole
11.3-second local diagnostic encountered a corroborated HTTP 403 challenge and
retained zero matching auction requests. No retry, alternate identity, region
change or fallback target followed. This is an access no-go, not a parser failure,
vendor-absence finding or successful live qualification. Live payload verification
remains open. The contact was persisted idempotently and recorded as blocked in
the repository contact ledger; only that operational ledger receipt was committed.
Product edits remain local and undeployed. Immutable artifacts are under
`20261027T200534Z-manual-magnite-auction-qualification`.

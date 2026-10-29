# CertScore.ai Index Exchange auction qualification — October 27, 2026

The owner authorized the exact Index Exchange auction/EID qualification follow-up.
This is local implementation and offline verification only. No deployment,
public visit, model call, paid cloud task, flag change or historical rewrite is
part of this follow-up.

New exact HTTPS POST requests to `htlb.casalemedia.com/openrtb/pbjs` use
`bounded_ca_request_proof.v12`. A completed bounded JSON inspection may retain
`index_banner_auction.v1` under the existing OpenRTB context. The witness requires
the reviewed Prebid source, nonempty auction/impression IDs, distinct impression
IDs, a valid HTTP(S) page, positive integer banner geometry, and consistent
positive numeric site routing on the same request. Every impression needs the
common single `s` query route or its own reviewed site-ID route. Conflicting,
duplicated, invalid or missing routing cannot create the witness.

The exact recipe also requires complete header inspection and a supported
body-sourced EID from pubcid.org, sharedid.org, id5-sync.com or liveramp.com.
Mirrored EID inventories retain their existing exact comparison; conflicting or
incomplete mirrors cannot be merged. Query identifiers cannot replace a missing
body EID. Raw payloads, site IDs, page URLs and visitor identifiers are not added
to the new retained witness.

The new request role is `index_exchange_bid_user_identifier`, with
`ca_sale_sharing_qualification.v4-index-auction`. New observations carrying that
role use `gpc_sale_sharing_evidence.v6-index-auction`; other rows keep v3 semantics.
WC01 uses `california-gpc-response.v11-index-auction` and
`california-post-reject.v5-index-auction` for this evidence. Old proof and policy
versions retain their meanings. An old request cannot acquire this role from a
redacted fixture, a parser upgrade or a version-label edit.

Purpose classification and finding eligibility are separate. A supported auction
role remains factual when GPP is invalid. Invalid/unsupported GPP, opt-out or
restricted-processing declarations, privacy conflicts and missing source or
response proof continue to prevent full California recipient eligibility. A
disabled transmitted GPC value conflicts with independently verified GPC
delivery; an invalid value remains unresolved. Neither an enabled GPC value nor
an HTTP success establishes honoring.

The canonical typed assessment → normalized concern → concern policy → unified
finding → score flow is preserved. GPC and Reject share recipient deduplication;
the 47-point family and separate once-per-scan GPP family are unchanged. Existing
runtime-link and frictionless-GPC proof consumers accept the new qualified policy
version without dropping other already supported recipients. Reports continue
to show factual findings without deduction explanations.

All original limits remain: 32,768 bytes, 128 members/fields, depth 8, existing
array/EID limits, 48 candidate inspections and 32 retained detailed proofs. The
additional bounded tree walk performs no browser reads or waits. Estimated
recurring parsing/metadata increment is below $0.50/month at 100,000 scans,
disclosed before implementation; this follow-up incurred no cloud/model spend.

Primary review sources: [official Index adapter](https://github.com/prebid/Prebid.js/blob/master/modules/ixBidAdapter.js)
and [official bidder documentation](https://docs.prebid.org/dev-docs/bidders/ix.html).
The retained adapter snapshot SHA-256 is
`7b5277b411c228dd3bfde016382980052fff529e582548c58e3e6358cdd25d1e`.
It documents the reviewed protocol, not the exact publisher build used by an
earlier scan.

Deterministic tests cover valid and conflicting routing, geometry, EID sources
and mirrors, missing headers, query substitution, invalid GPP, privacy
restrictions, old versions, wrong document/hash bindings, missing delivered GPC,
failed responses, canonical findings and cross-path deduplication. The prior
two retained Index v10 requests remain unresolved under their original contract;
their raw bodies were not retained and no new v12 witness is retrofitted. The
new recipe is not yet live-verified or production-verified. Immutable results
are under the manual `20261027T195144Z-manual-index-auction-qualification` run.

The next retained coverage gap is Magnite/Rubicon's exact
`/a/api/prebid-exchange.json` auction envelope. Its structural decoder is tested,
but the two latest bounded visits emitted no matching request. Earlier retained
requests lacked verified successful response evidence. Neither result proves
the vendor is absent or that collection succeeded. A future exact auction/EID
rule needs its own source review and version; live acceptance must use an
original matching payload, response and document/signal joins. Do not broaden
host matching, infer purpose from the vendor label, repeatedly visit the same
publisher, or increase capture limits to manufacture coverage.

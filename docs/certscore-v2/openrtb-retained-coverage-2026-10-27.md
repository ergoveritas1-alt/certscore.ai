# CertScore.ai bounded OpenRTB coverage follow-up

Owner-authorized local work on October 27, 2026: expand reviewed Index Exchange
and Rubicon metadata, handle mirrored identities safely, improve limit
diagnostics, and test retained evidence plus bounded live re-scans. No deploy.

## New inspection contracts

New Index inspections use `bounded_ca_request_proof.v10`; new Rubicon inspections
use v11. Their exact HTTPS POST endpoints, successful-response requirements and
unresolved-purpose constraints remain separate from parsing. Historical v7/v9
records retain their original data and policy versions. No historical report is
rewritten or upgraded on read.

Index coverage adds reviewed diagnostic fields, the two observed feature flags,
banner-size extensions, ad-server/ad-slot metadata, selected site metadata and
structured device/client hints. Rubicon adds reviewed Prebid bidder routing,
floor, targeting, channel, alias, ad-slot and device metadata. Only explicitly
reviewed keys and bounded shapes are accepted. Publisher-defined arbitrary
visitor/inventory maps, unknown extensions and unreviewed media formats remain
unsupported.

`bounded_openrtb_context.v1` records the identity carrier and optional transmitted
GPC flag state. Both `user.eids` and `user.ext.eids` are checked in memory on the
same original request. Each source must be unique, contain one supported UID
tuple and match across mirrored inventories, including metadata. Object key and
source ordering are immaterial; conflicting IDs, source sets, tuple metadata,
duplicate sources and incomplete mirrored inventories fail closed. Identical
mirrors produce one digest per supported identity. No raw UID is retained.

`regs.ext.gpc` is a transmitted browser-preference setting in Prebid first-party
data, not an opt-out acknowledgment. Enabled/disabled/invalid states are bounded
context only. They cannot create a purpose determination, honoring claim or new
scoring effect. Known US Privacy/GPP declarations are read independently when
unrelated metadata is unsupported.

## Limits and diagnostics

All current ceilings remain: 32,768 input bytes, 128 total parsed members/fields
including URL fields, depth eight, existing sixteen/eight array limits, eight
retained identifier digests, 48 candidate inspections and 32 detailed proofs.
Mirrored identities do not discount their parsed members. No JSON truncation,
unknown-subtree bypass, added read, wait, browser action or larger worker.

New `bounded_ca_body_diagnostic.v2` distinguishes bytes, members, depth, array
items, flat fields and event records. Legacy `body_limit` error messages remain
compatible; an untyped legacy limit has an explicit unspecified reason. Input
and decoder limits keep their distinct stages. Diagnostics retain no rejected
values, payloads, arbitrary key paths or exception text. Old v1 diagnostics stay
valid without new reasons, and are not backfilled.

## Retained and live verification

Redacted derivatives of the prior JTA and Bournemouth bodies provide structural
regressions. Their substituted values cannot establish original identity equality
or original privacy states. Separate fixtures test exact mirrors, conflicting
carriers, duplicate decoded JSON keys, unknown privacy metadata, bounds,
historical contracts and no purpose promotion.

Twelve original parent/worker files verify; all 53 historical request proofs parse
unchanged. Nine source-informed synthetic comparisons pass. Original unsupported
body bytes remain unavailable; no replay of those historical bytes is claimed.

Current local canonical GPC visits used the existing standard profile and ordinary
guards, with no choices/actions, policy/model reviewer or production scan API:

- JTA: 18,032 ms; two exact Index POSTs returned HTTP200 and changed from
  unsupported under the prior decoder to complete v10 on the same original
  in-memory request/body digests. Both real mirrored EID inventories matched;
  source joins survived compaction. Purpose remained unresolved. The overall
  observation remains limited by `semantic_probe_incomplete`.
- Bournemouth: 16,618 ms and one 17,011 ms same-profile follow-up; both visits
  completed but emitted no exact target Rubicon collector. Its expanded schema
  is retained-structure tested; live payload verification remains open. No
  further visit was made, and no limit reason is inferred for the older body.

These are explicitly owner-authorized diagnostics, not a rotating release
acceptance sample or verified deployed improvement. Local origin is not a
verified production region. The registry passed; central contact history was
successfully exported and the canonical selector recorded the owner's scoped
cooldown exception. Three contacts were persisted idempotently through the
repository helper and added as contact-only history to the repository ledger.
The operations-only ledger receipt commit does not contain product code.

## GPP versus purpose: independent analysis

The two current Index bodies declared section 7 applicable, while their decoded
GPP headers contained no sections. The exact retained reason is
`applicable_section_missing`. Section 7 is US National. Successful JSON decoding
cannot invent a missing privacy section or establish honoring.

The typed request proof already retained those facts. An additional retained
analysis defect was found: when supplemental purpose was unresolved, the GPC
selector used URL-only qualification and replaced the body's GPP detail with
`not_present`, while retaining the unresolved flag. The fix preserves positively
observed GPP detail and processing signals from a complete, exactly bound
supplemental inspection independently of purpose. Wrong document/hash, incomplete
headers and absent supplemental proof cannot supply those facts. Independent
eligible URL evidence retains its existing fallback behavior.

An offline replay of the same sealed current worker bytes now retains the exact
Index GPP inconsistency in canonical collection review and the existing
`gpp_propagation_evidence.v1` path. It does not qualify an Index recipient for the
full sale/sharing family, change weights/caps, or alter stored production reports.
This deterministic handoff fix was applied after the visits; it needs no new
browser capture. Execution-time parser snapshots and final analysis sources are
retained separately.

The Index endpoint remains purpose-unresolved because no approved exact Index
auction/EID recipe exists in the current qualification classifier. A future
source-reviewed, versioned recipe could classify advertising activity while
preserving success, identity and provenance requirements. GPP inconsistency and
other restrictions would remain independent safeguards. No such qualification
expansion is authorized or implemented by this decoding change.

## Sources, cost and preservation

Primary references: [Index adapter](https://github.com/prebid/Prebid.js/blob/master/modules/ixBidAdapter.js),
[Magnite adapter](https://github.com/prebid/Prebid.js/blob/master/modules/magniteBidAdapter.js),
[Prebid first-party data](https://docs.prebid.org/features/firstPartyData),
[IAB section registry](https://github.com/InteractiveAdvertisingBureau/Global-Privacy-Platform/blob/main/Sections/Section%20Information.md).
Current source snapshots are review evidence, not historical publisher-build proof.

Estimated recurring parsing/metadata increment is below $0.50/month at 100,000
scans. The eligibility export and idempotent operational contact persistence use
two existing ECS DB helpers, estimated below $0.10 total for this manual run.
Both estimates were disclosed before proceeding. Local scans incur no AWS
scanner or model charges. These contact records are operational bookkeeping;
no customer scan, report or historical product record was changed.

Final test counts, source receipts, negative-binding assertions, cost estimates,
the ledger commit and preserved-state hashes are recorded in the immutable run
summary. The daily audit checkpoint, issues, release watch, model-transition,
automation settings, cost ledger and published dashboard remain unchanged. Local
diagnostics do not enter the Mac mini dashboard cohort or close production issues.

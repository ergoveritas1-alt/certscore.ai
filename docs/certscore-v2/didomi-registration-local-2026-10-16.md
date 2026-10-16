# Didomi Accept/Reject registration

Local changes only. No deployment, Options/Customize interaction, partner-link
interaction, historical report update or scoring-weight change.

## Retained evidence audit

The starting report was
`didomi-first-layer-local-didomi-88c60ada-9835-4290-924f-6c07ef58229f`.
Accept and Reject clicks completed and changed Didomi consent records, but both
semantic registration outcomes remained unconfirmed. The old canonical recipe
used a default TCF purpose set or a changed `didomi_token` cookie. The canonical
cookie decoder intentionally cannot interpret that opaque token. Its mutation,
a closed banner and a completed click are not registration proof.

The retained packets contain safe hashes rather than raw tokens or the new
native API proof. Read-only replay therefore leaves their conclusions intact.
The prior local work note incorrectly described one earlier Reject as confirmed;
that sentence was corrected against the original packets. No report was changed.

## Canonical fixes

Didomi Accept and Reject recipe v3 now use `didomi_documented_status.v1` through
the shared CMP API confirmation path. Recipe sets advance to Accept v12 and
Reject v27. Typed recipe schemas accept the Didomi provider. Resolver provenance
identifies the CMP API recipe rather than implying that it reads TCF directly.

The decoder uses documented SDK readiness, current status, configured purpose
IDs, configured vendor identities, partial-status readback and the
`consent.changed` event. It requires a complete corresponding decision, a fresh
click-associated event after dispatch and an exact match between event state
and live readback. Configuration and SDK identity must remain stable. Missing,
malformed, partial, mixed, stale or opposite states cannot confirm the action.
Event time is used for freshness only; retained registration timestamps remain
honest observation upper bounds, not invented cookie-write times.

Vendor status binding accepts exactly one of the identities explicitly published
in its SDK definition: its IAB/custom ID or its Didomi ID. No prefix stripping or
inferred alias is used. Missing, duplicated, shared or changed identities fail
closed. Nested statuses require an own boolean `enabled` data field; arbitrary
objects, accessors and absent values cannot become a decision.

Current global status includes essential purposes as enabled. The documented
compatibility getter `getUserStatus().purposes.essential` supplies their explicit
identities. This deprecated getter is used only for essentiality metadata;
current decisions still come from `getCurrentUserStatus()`. If essentiality is
unavailable or malformed, confirmation fails closed. Essential purposes and
vendors requiring only those purposes do not vote as optional consent. A changed
essential inventory invalidates the event. Enabled values alone never establish
essentiality.

Primary documentation:
- https://developers.didomi.io/cmp/web-sdk/reference/api
- https://developers.didomi.io/cmp/web-sdk/reference/events
- https://developers.didomi.io/cmp/web-sdk/reference/api/deprecated#getuserstatus

Opt-in `CERTSCORE_CMP_STATUS_DIAGNOSTICS=1` records only bounded readiness flags,
validation flags and counts through the existing browser read. It does not log
SDK objects, IDs, raw state, tokens or visitor identity. It is off by default.
No setter, reset, preferences opening, added lane, timeout increase, model call
or extra browser round trip was introduced.

## Fresh EU-Ireland verification

Five separately retained local runs isolated native decoding, vendor binding
and essentiality. One early Reject had an actionability timeout and stayed
limited; none of the incomplete runs was promoted or overwritten. Each run used
canonical selection with an explicit owner-requested cooldown exception and its
own idempotent central contact record. These are targeted diagnostics, not a
release acceptance cohort or a provider-wide success-rate estimate.

Final scan:
`didomi-registration-local-didomi-0ba3ad24-abef-4552-a726-189d0e379863`.
Browser and HTTP egress both verified `63.33.9.201`, country IE, AWS eu-west-1.
All six evidence workers completed; no preference worker or packet was present.

| Action | Registration | Semantic decision | Confirmation read time |
| --- | --- | --- | --- |
| Accept | Confirmed | Granted | 40 ms |
| Reject | Confirmed | Denied | 68 ms |

The live SDK declared 21 purposes, including two essential and 19 optional,
plus 26 vendors. Both decisions have a retained `cmp_api_state` witness, exact
state hash and `verified_state_observed` timestamp provenance. Each action ran
once in its own fresh session. Configure and partner links remained unclicked.
The existing three-second Accept allowance and eight-second Reject allowance
were unchanged; confirmation did not restart an observation window.

The canonical local materialization preserved both confirmations. Six of 13
CMP checks remain unresolved because passive capture did not retain category,
service, declaration-comparison, cookie-information or privacy-link access
proof. Confirmation quality improved without reclassifying those unknowns.
The fresh Reject capture observed no requests classified as non-essential in
its eight-second window. Exact unchanged classified storage produced the
existing score-neutral review signal; storage presence did not become active
use or a purpose-specific after-Reject deduction.

## Validation and preservation

All 117 focused contract, semantic/TCF, terminal-decision, native Didomi,
identity/essentiality and action-recipe tests passed. Both complete action
observer suites passed all 105 tests. New loopback fixtures exercise one-click
Accept and Reject, missing events, external updates, partial/opposite decisions,
configuration drift and zero Options clicks. Identity and essentiality fixtures
reject malformed, duplicated, shared and changed data. Contracts, shared and
scanner-core built; scanner-core and Lambda typechecks passed.

Historical assessment replay was byte-equivalent. All 784 retained source files
remained byte-identical. Fresh bundle and manifest bytes passed terminal size
and SHA-256 verification before canonical local materialization and concern,
policy and CMP projection. No production report was persisted. All five contacts
were recorded, the reviewed Didomi ledger entry returns to cooldown, and the
SSH tunnel and temporary ingress rule were removed.

Artifacts: `/Users/benmasek/WC01/outputs/didomi-registration-local-2026-10-16/`.
Expected incremental SDK/selector CPU is below $0.75/month at 100,000 scans;
bounded verification and operational helpers are estimated below $1 total.
There is no new standing capacity, paid model call, lane, wait or retention
policy.

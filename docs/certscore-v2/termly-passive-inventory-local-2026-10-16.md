# Termly passive cookie-response inventory

Local implementation and one fresh EU-Ireland verification, October 16, 2026.
No deploy, push, Options action, new browser lane, request, model call, retry,
wait or timeout increase. Historical reports and score policy are unchanged.

## Retained lead and source audit

The retained Termly visit requested its public cookie-list response before any
consent action, but no declaration inventory was retained. The runtime lane had
usable coverage and a completed, document-bound pre-consent cookie snapshot.
This supports a factual declaration/snapshot comparison when the declaration
source is captured. It does not establish an exhaustive missing-declaration test.

The distributed SDK calls its cookie endpoint independently of opening Options.
The response includes several technology types. The engineering reference has
95 entries, but only 68 HTTP/server-cookie entries, representing 42 distinct
cookie names. Local/session storage and pixels are not cookie declarations.
The internal SDK object is not used as a public getter. Consent APIs, visitor
state, private objects and whitelists are not read.

Provider engineering references:
- https://support.termly.io/hc/en-us/articles/30710543895697-Consent-API-documentation
- https://docs.termly.io/endpoints/cookies-get/

The saved public response reference is a separate deterministic engineering
fixture, not a reconstruction of a historical session or EU-Ireland proof.
Historical replay remains byte-identical and adds no missing observations.

## Canonical capture and safeguards

`KNOWN_CMP_REGISTRY` registers `termly_cookie_response.v1`. The consent-proof
lane reuses its existing CDP Network session to observe the page's own script
and cookie-list request. One main-frame Termly script, exact script tenant,
GET request, frame, current document URL and loader token must agree. Only the
registered HTTPS origin and cookie-list path with an optional bounded language
parameter qualify. Redirects, duplicate scripts/requests, foreign tenants,
foreign documents, service-worker responses, failed/non-200/non-JSON responses
and unverifiable captures remain unavailable. No request is created or modified.

A loading-finished event and positive decoded-byte accounting are required.
A response over 65,536 decoded bytes is rejected before the single read of
Chrome's existing response buffer. Returned bytes must match that accounting.
There is no read retry, polling or await added to report readiness. Late output,
producer closure and document drift cannot reopen a terminal packet. Completed
bound data may survive the end of the existing work budget.

The parser inspects at most 256 records, retains at most 100 cookie details and
16,000 text characters, and bounds the separate name manifest to 256 names /
8,192 characters. It extracts only explicitly typed `http_cookie` and
`server_cookie` rows. Known non-cookie technologies are excluded; unknown types,
malformed records, missing categories and prefix-list semantics remain limited.
Cookie values, provider domains, visitor identifiers and raw response bodies
are not retained. Source byte count/hash and request/frame/document references
are retained with sanitized declarations. The hash identifies the transient
source; it does not pretend that a raw response body was retained for later replay.

Basic evidence v5 requires the exact `CmpNetworkCookieInventory` projection,
Termly provider, matching document binding, completed checkpoint, manifest and
source version. Old packets cannot borrow this source. The existing canonical
materialization uses `independent_cmp_basic_facts.v8`, then persisted assessment,
normalized concerns, concern policy and the shared CMP projection. There is no
UI fallback or new scoring rule. `completeConfiguredCmpNames` remains false
for Termly: this response cannot establish a complete missing-declaration finding.

## Fresh verification and measured effect

Scan: `termly-passive-inventory-local-termly-3b12ca63-84e0-4c76-a867-b3a40443b6c5`.
Browser and HTTP egress both verified 63.33.9.201, Ireland, AWS eu-west-1. Local
code used the existing Ireland proxy. Six required/enabled workers completed,
with no preference worker or packet. The already-requested 27,036-byte response
was captured in the consent-proof document and verified in the canonical bundle.

The source has 68 cookie records / 42 distinct names. The declaration projection
removes identical repeated name/purpose/duration triples, retaining 47 entries,
37 nonempty purposes and 47 durations. Missing purposes stay blank. No service
names are inferred from provider domains.

| Check | Same visit without this source | With this source |
| --- | --- | --- |
| Pre-consent declaration comparison | Not assessed | Observed |
| Unmatched cookie names | Not assessed | Partially assessed |
| Cookie information | Not assessed | Partially assessed |
| Total unresolved checks | 9 of 13 | 8 of 13 |

Exactly one whole check is resolved by the inventory source. The same-visit
comparison is an in-memory diagnostic ablation, not a historical or published
report rewrite. All other evidence is held fixed for that comparison.

Against the prior retained report, total unresolved checks increased from 7 to 8.
The inventory comparison improved from Incomplete to Observed, but privacy-link
reachability went from Observed to Not assessed and visual prominence from
Observed to Incomplete. The fresh visual pair did not complete safety review;
no image was promoted or timeout extended. Passive root capture did not retain
privacy-link access, unlike the historical preference-worker visit. Categories
and services changed from Incomplete to Not assessed and remain unresolved.
Fresh after-Reject activity also produced an existing-policy Review recommended
row; this is fresh evidence, not an inventory-scoring change. These differences
are recorded honestly; this run is not a net reduction or provider-wide benchmark.

## Validation and preservation

95 focused tests passed, including the real Chromium consent-proof fixture,
exact single requested-response capture, malformed/version/source binding,
non-cookie exclusion, resource bounds, ambiguous tenants, document drift, late
completion, canonical persisted projection, score-neutral inventory concerns and
historical contract compatibility. Contracts, scanner-core, web and Lambda
TypeScript checks passed. Registry validation and whitespace checks passed.
All 279 preserved historical artifact hashes and historical replay output are
unchanged. Fresh bundle/manifest hashes and sizes were verified against terminal
metadata before separate local materialization. No customer report was written.

Successful central contact-history export and canonical scoped target selection
preceded the owner-requested cooldown exception. The contact was persisted with
idempotent key `termly-passive-inventory-local-2026-10-16-3b12ca63`. The reviewed
repository ledger candidate changes only Termly and restores normal cooldown.
Temporary Ireland SSH access was removed and the tunnel stopped.

Estimated additional bounded text storage is below $0.50/month at 100,000 scans,
assuming 10% Termly share, one-year retention and multiple retained projections.
There is no new standing capacity, browser/model call, retention policy or lane.
The one-time verification and operational ledger helpers are estimated below $1.

Artifacts: `/Users/benmasek/WC01/outputs/termly-passive-inventory-local-2026-10-16/`.
See `comparison.json`, `same-visit-ablation.json`, `configuration-fixture-replay.json`,
`preservation.json`, `fresh/egress.json` and `fresh/termly/cmp-projection.json`.

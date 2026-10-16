# Termly passive privacy-link reachability

Local implementation and one fresh EU-Ireland verification on October 16, 2026.
No deployment, push, Options action, new lane, model call, retry, timeout increase
or historical report rewrite. Existing score policy is unchanged.

## Retained failure and classification correction

The latest retained visit captured no privacy-policy links from inside Termly's
banner. Its basic capture finished in 141 ms but the existing after-visual public
page inspection was restricted to Cookiebot. Termly's actual privacy policy was
already discovered elsewhere on the page; that discovery alone cannot prove a
click target was reachable in the consent-proof session.

An older preference-worker visit reported reachable access for
`https://termly.io/products/privacy-policy-generator/`, not Termly's governing
privacy policy. Read-only audit of that original packet confirms the URL. This
was a product-page false positive, not evidence that the real policy was reachable.
The historical report remains unchanged.

The shared canonical privacy-surface classifier now excludes explicit terminal
privacy/cookie-policy generator and template slugs. This applies to all domains,
not a Termly hostname exception. Real notices below a product path and ordinary
`/products/privacy-policy` notices remain eligible. Marketing text alone does
not veto a governing notice. The classifier fix prevents those product/template
links from satisfying policy discovery or consuming the single policy-link scroll.

## Canonical passive capture and diagnostics

`KNOWN_CMP_REGISTRY` now declares `same_origin_after_visual.v1` for Termly and
Cookiebot. The early basic read defers public privacy-link work for those providers.
After consent visuals complete, the existing shared reader inspects canonically
classified, same-origin public page links using only the unused part of the
original 350 ms passive-read allowance and the remaining module budget.

It may scroll once and restores the viewport. The link is not opened, no consent
control is clicked, and no policy retrieval or browser lane is introduced. Exact
URL/document-token binding, bounded candidate/style/hit testing, restoration,
expiry and source contracts remain enforced. A miss stays Not assessed, without
a missing-link finding, blame attribution or score effect.

The canonical assessment previously discarded a completed passive hit-test miss
and replaced its explanation with "Evidence was not retained for this check."
`independent_cmp_basic_facts.v9` now preserves the typed unresolved diagnostic
only when a document-bound, completed public-link inspection supplies it and no
other lane's retained diagnostic would be overwritten. It stays Not assessed.
The existing persisted assessment -> normalized concerns -> concern policy ->
shared CMP report projection carries the status, explanation and source reference.
There is no UI fallback or confidence upgrade. Historical stored assessments are
not rewritten. The latest historical replay remains byte-identical.

## Fresh EU-Ireland result

Scan: `termly-privacy-link-local-termly-a1944af8-f6a0-489e-820f-4734f045e132`.
Browser and HTTP egress both verified 63.33.9.201, Ireland, AWS eu-west-1. Local
code used the existing Ireland proxy. All six enabled workers completed, with
no preference worker or packet.

The real `https://termly.io/our-privacy-policy/` link was captured. The reader
scrolled from 0 to 6,716 pixels, tested the target and restored the original
viewport. Its outcome was `hit_target_missed`; no unobstructed click target was
verified. This is not proof of what obscured the link, nor proof that every access
method is unavailable. No banner blocker or legal conclusion was inferred.

| Check | Prior retained visit | Fresh result |
| --- | --- | --- |
| Privacy-link access | Not assessed, no link evidence | Not assessed, typed failed hit test retained |
| Visual prominence | Incomplete | Observed |
| Total unresolved CMP checks | 8 of 13 | 7 of 13 |

The privacy fix resolves zero additional whole checks in this visit. The overall
count improved because visual prominence completed on this visit; that recovery
is not attributed to the privacy-link change. All 47 projected cookie entries,
42 distinct declaration names, 37 nonempty purposes and 47 durations remain.
The initial safe screenshot was inspected, but it does not show the scrolled
footer and was not treated as proof of the failed target's occluder.

Basic capture took 29 ms and deferred privacy inspection 59 ms, totaling 88 ms
inside the existing 350 ms allowance. The new canonical explanation identifies
that inspected links remained unverified and points to the retained typed packet;
it no longer states that no evidence was retained.

## Verification, preservation and cost

118 focused classification, passive capture, privacy hit-test, network inventory
and canonical assessment/projection tests passed. Chromium fixtures verify the
real-policy selection, product/template exclusion, no Options or policy navigation,
restored scrolling, covered links, foreign origins, stale documents, bounded
scheduling and neutral unresolved diagnostics. A retained inspection from another
lane is not overwritten. Contracts, scanner-core, web and Lambda TypeScript
checks passed; registry and whitespace checks passed.

Fresh bundle and manifest size/SHA-256 metadata were verified before separate local
materialization. All 273 preserved source artifact hashes and historical replay
bytes are unchanged. No customer report was persisted. Central contact-history
export and canonical scoped selection preceded the owner-requested cooldown
exception. The contact was persisted with idempotent key
`termly-privacy-link-local-2026-10-16-a1944af8`; the reviewed repository ledger
candidate changes only Termly and restores normal cooldown. Temporary Ireland
SSH access was removed and the tunnel stopped.

Estimated incremental bounded compute and retained metadata are below $0.50/month
at 100,000 scans/month, assuming 10% Termly share, 4 GB workers, one-year retention
and multiple retained projections. No new capacity, model calls, lane or retention
policy was introduced. One-time verification and ledger helpers are below $1.

Artifacts: `/Users/benmasek/WC01/outputs/termly-privacy-link-local-2026-10-16/`.
See `comparison.json`, `retained-link-audit.json`, `preservation.json`,
`fresh/egress.json` and `fresh/termly/cmp-projection.json`.

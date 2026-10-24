# CertScore.ai Gimbal six-second category diagnostic

October 23, 2026. Owner-approved local implementation/tests and one original-
route passive visit, permitting at most one reviewed `GetDomainData` call.
The visit is consumed, even though the getter was not available and was never
called. No retry or replacement visit occurred.

## Outcome

The document was still loading and its own OneTrust global absent at the single
5,852 ms snapshot. The category reader returned `api_unavailable`, visited zero
groups and made **zero SDK calls**. No category-ID/state binding was obtained.
This is a bounded availability limitation, not permanent API absence or a
privacy-choice failure. Diagnostic capture status `observed` does not mean
category state was observed.

| Event | Host elapsed time |
| --- | ---: |
| Navigation start / original request | 544 / 545 ms |
| Original public guard pending / validated | 2,420 / 2,424 ms |
| Original HTTP 301 redirect | 2,699 ms |
| Final HTTP 200 commit / HTML completed | 3,188 / 3,273 ms |
| Collector freeze / snapshot start | 5,852 ms |
| Snapshot verified / capture plus cleanup | 5,864 / 5,891 ms |

The original request was observed 1,875 ms before the public guard's pending
notification; that interval is not a measured DNS lookup or proven scanner
handler delay. Guard validation itself spanned four milliseconds. No matched
DOMContentLoaded/load event or selected CMP resource request was observed.

Compared with the previous six-second visit, final commit was 1,986 ms later.
That earlier session's object presence cannot be substituted into this one.
The five exact CMP resource slots remain unknown, with only 14 of 32 candidates
consumed; candidate truncation did not cause this result. This visit provides
no new category semantics or justification for a state adapter, production
budget increase or flag activation. Stop live iteration rather than retrying.

## Local implementation

Sources are in `artifacts/gimbal-category-six-second-2026-10-23/`.
The new terminal reader permits at most one `OneTrust.GetDomainData` invocation
through a bounded three-object, data-descriptor-only method lookup. Accessor
shadowing is not bypassed. The single getter is never replaced with another
method or retried, and an atomic overrun is discarded.

The reader examines at most 64 total group/subgroup entries using descriptor-
safe array and field access, cycle/duplicate checks and exact label matching for
`Allow Sale/Sharing/Targeted Advertising`. It retains at most one unique match:
ID (up to 64 characters), raw configured Status (boolean or bounded string),
and membership booleans/unknown for that exact ID in already-loaded
`OnetrustActiveGroups` and `OptanonActiveGroups`. Membership reads are bounded
to 4,096 characters and 64 distinct valid IDs; full lists are not retained.
Ambiguous labels, malformed/duplicate IDs, accessors, invalid inventories and
processing/byte overruns do not become verified state.

The request collector and category snapshot share the original **10 ms and
2,048-byte diagnostic caps** within the 32,000-byte packet. SDK-call accounting
is preserved even in limited output; a lost/failed evaluation cannot claim a
verified zero-call result. Existing seven exact request slots, 32-candidate
cap, six-second diagnostic-only deadline, terminal/cleanup reserves, native
TLS, public-network/contact/redirect guards and same-document verification
remain unchanged. No action, panel opening, cookie read, GPP call, new SDK,
external form, body/header read or configuration dump was added.

## Verification and cost

**44 offline tests pass**, including the existing capture/guard/provenance/cap
checks and new one-call behavior, exact binding, inherited/shadowed getters,
field/index accessors, duplicate labels/IDs, cycles, membership limits, atomic
overruns and combined collector/snapshot budgets. Focused TypeScript checking
passes. Evidence/source/test hashes are retained in `verification.json`.

The live capture used approximately **1.09 ms** shared processing and stayed
within the existing evidence byte caps. The original route and native-TLS
one-hop redirect were verified, with the same final loader before/after the
snapshot. Raw output is `visit-gimbal-category-six-second.json` alongside its
exclusive attempt receipt and verification script.

Actual SDK calls, privacy actions, external-form visits and AWS invocations:
**zero**. Incremental recurring AWS cost: **$0**. Production helper, contract and
Lambda handler hashes remain unchanged; existing Lambda configuration, six
lanes, production time budgets and shared $10/month within $50 allowance are
preserved. No deployment or flag change occurred.

No further implementation approval was needed for this authorized diagnostic.
Another visit, more time, a new SDK/state read, semantic adapter, action trial,
external form or rollout would require separate authorization. The unused
getter allowance does not leave the consumed visit grant available for reuse.

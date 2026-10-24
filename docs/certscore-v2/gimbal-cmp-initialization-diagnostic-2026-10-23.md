# CertScore.ai Gimbal CMP initialization diagnostic

October 23, 2026. Owner-approved local implementation/tests and one bounded
passive original-route visit. The visit is consumed; no retry occurred.

## Outcome

The diagnostic completed within its limits, but the visit did not expose the
selected CMP initialization requests before the checkpoint. The page was still
loading, and its own OneTrust global was absent. This is inconclusive for the
initialization gap; it does not establish failed requests or permanent absence.

| Event | Host elapsed time |
| --- | ---: |
| Navigation start | 541 ms |
| Verified exact final HTTP 200 commit | 1,459 ms |
| Final HTML completion | 1,668 ms |
| Collector freeze / terminal snapshot start | 2,602 ms |
| Snapshot verified | 2,610 ms |
| Capture plus cleanup finished | 2,630 ms |

The original Gimbal URL followed its one verified HTTP 301 to the exact Infillion
target under native TLS and existing public-network/redirect guards. The loader
remained verified across the terminal snapshot.

None of the five selected CMP request roles—stub, site configuration,
geolocation, exact banner, exact regional/language JSON—was observed. No matching
DOMContentLoaded/load event was retained. All five roles remain `unknown`; the
collector's `observed` status describes diagnostic capture validity, not CMP
initialization or privacy-choice success. Only 14 of 32 candidate inspections
were consumed, so these unknowns were not caused by candidate truncation.

The earlier visit reached a complete page and downloaded the stub. This visit
did not reproduce that stage within the same allowance. Do not borrow its
timeline or infer that the current unretained first-party requests were pending:
those slots were deliberately replaced. The original action-readiness cutoff
was not extended, and this visit committed after the nominal 1,350 ms cutoff.

## Local implementation and verification

`artifacts/gimbal-cmp-init-diagnostic-2026-10-23/collector.ts` replaces the three
first-party script roles with the three exact reviewed configuration/geolocation/
regional URLs. It requires GET and exact HTTPS URL matching, with no tenant,
query, locale or version expansion. Document, Script, XHR and Fetch events share
one 32-candidate allowance and seven slots. The earlier route-handler probes
are omitted. Guard callbacks only classify the selected requests; enforcement
and DNS behavior are unchanged.

The collector preserves Network request identity and redirect ordinals, unique
guard URL/Request correlations, frame/loader provenance, first response/terminal
events, two lifecycle checkpoints, deadline/cap teardown and a single terminal
readyState/own-OneTrust descriptor read. No SDK/accessor calls, bodies, headers,
configuration values, cookies, forms or privacy actions are inspected or invoked.

All **32 offline tests pass**, including exact endpoint/type/method restrictions,
delayed configuration/geo/region, absent global after completed downloads,
duplicate/mismatched provenance, one shared four-type candidate cap, processing/
byte/deadline limits, late events and zero SDK/accessor execution. The focused
TypeScript check passes. Production helper hashes remain unchanged.

Measured cooperative processing was approximately **0.77 ms**, below the shared
10 ms allowance. Diagnostic and packet byte sizes are verified below 2,048 and
32,000 respectively in `verification.json`. The 2,750 ms absolute capture,
150 ms terminal reserve and existing 250 ms cleanup reserve remain unchanged.
Evidence is in `visit-gimbal-cmp-init.json`, with an exclusive attempt receipt,
source/evidence/test hashes and verification script alongside it.

## Cost and authorization

Zero SDK calls/actions, external-form visits and AWS invocations. No deployment,
flag change or production instrumentation. Incremental recurring AWS cost is
**$0**. Keep the current Lambda, six lanes, all scan budgets and existing shared
$10/month within $50 allowance.

No initialization fix or flag change is justified by this result. Repeated
identical visits may simply reproduce page-loading variability; stopping with
the retained coverage limitation is reasonable. Any further visit, expanded
capture, budget change, state read, action, external form or rollout requires
separate authorization. This single-visit grant is consumed.

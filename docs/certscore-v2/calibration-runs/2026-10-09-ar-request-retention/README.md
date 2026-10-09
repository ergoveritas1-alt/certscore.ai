# Bounded action-request retention (local only)

Accept and Reject retain the existing 192-request capacity. `priority_bounded_action_requests.v1` lazily prioritizes overflow using the canonical vendor resolver and resource type. Known delivery assets can be displaced by tracking, consent, document or unknown requests. A new host can displace duplicate known-tracker samples while preserving the earliest one. Unknown images are protected; image type alone does not establish low priority or safety. CDN attribution is a retention priority, not evidence of necessity or absence of tracking.

Prioritization considers at most 256 overflow arrivals and caches classifications only against weak request-row references. Later loss is explicitly `unclassified`. Bounded typed diagnostics account for observed, retained, replaced and omitted rows. Existing drop counts remain exact, and every omitted request still makes capture Limited/non-projectable. No scoring gate, consent registration, action window, lane, retry, retained-row capacity or model call changes. Historical packets remain readable. Deploy contract readers before the new writer in any separately authorized release.

## Verification

The complete 223-event deterministic stream retained three late requests (an unknown pixel and two tracking hosts) that first-192 retention omitted, while retaining 192 rows and reporting 31 omissions. The old FullStory packets contain only censored first-192 rows; their missing traffic was not reconstructed or used to claim recovery. Browser fixtures cover Accept/Reject with both confirmed and unconfirmed decisions, asset floods, late unknown/redirected tracker traffic, and an omitted redirect root whose retained child preserves ancestry. All overflow cases stay Limited. Unknown-full-cap late tracking is explicitly still omitted; protection is not universal retention.

All 264 focused/predeploy action regression tests and 566 contract tests passed; scan-core and contracts typechecks passed. An initial regression exposed a pre-existing Reject lifecycle-cancellation gap; a final authorization/abort guard now runs after the callback and before dispatch. Both cancellation tests pass. Type-only schema aliases bound declaration size without changing validation. The initial full-contract invocation used the wrong cwd; its three fixture-path failures were resolved by running from the contracts package, without changing fixtures or test expectations.

A fresh, one-pair FullStory diagnostic used the prior working frozen source (not last deployment) followed by candidate, same ConsentCheckBot HTTP identity/native Chromium navigator, local California egress, en-IE/Europe-Dublin, fresh isolated consent/Accept/Reject sessions, and existing search/result/A3s/R8s windows. Central history was successfully exported and the canonical selector recorded the owner-authorized same-day cooldown waiver. Holds/no-go were not waived. No retry, forms submission or deployment occurred.

| Source / action | Observed post-click | Retained | Omitted | Replacements | Execution |
| --- | ---: | ---: | ---: | ---: | --- |
| Baseline Accept | 249 | 192 | 57 | — | Limited |
| Baseline Reject | 147 | 147 | 0 | — | Succeeded, unconfirmed |
| Candidate Accept | 243 | 192 | 51 | 25 | Limited |
| Candidate Reject | 228 | 192 | 36 | 20 | Limited |

All four clicks completed; no consent registration was confirmed. Candidate omissions were classified delivery assets in the producer diagnostics. Candidate retained 25/20 later rows by displacing assets, but different live streams do not support claiming reduced overflow or improved execution success. The original omitted identities are not available for independent reclassification. Luna's model-assisted review verified four packet schemas, exact-byte hash-bound projections and two same-visit geometry screenshots matching A/R inventory. This is not independent human review or a population/release sample.

Six attempted lane contacts were centrally persisted under idempotent run key `ar-request-retention-pair-20261009`; the reviewed one-row ledger candidate was merged only into FullStory, preserving all other entries. Source hashes remain verified and product changes remain local/uncommitted. Calibration records and bookkeeping alone are committed here.

## Cost and remaining limit

Local warm-loop medians were about 12 ms for 320 requests and 15–16 ms for 1,000–10,000 requests; classification stops at the fixed bound. These are not Lambda latency measurements. Estimated added recurring compute plus small diagnostic counters remain below $0.50/month at 100,000 affected scans, assuming up to two 20 ms prioritizations and coordinator overlap at the repository's 3008 MB Lambda size (about $0.39 compute plus small metadata storage). One-time contact bookkeeping is estimated below $0.10. No additional waiting or evidence capacity is purchased.

This improves useful evidence selection but does not make overflowed captures complete. Allowing compacted delivery evidence to satisfy completeness would require a separate evidence-policy decision and validation; it has not been implemented or silently inferred here. A production release still needs the normal owned-canary and rotating-cohort readiness checks. No deployment is authorized by this record.

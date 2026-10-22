# CertScore.ai Reject collection and response proof

Owner-authorized bounded capture fixes and five verification scans, October 22, 2026. No Options panels or production deployment.

## Capture correction

New producer classifications use canonical resolver v13 and collection endpoint policy v9. Exact supported endpoints now include Reddit `https://alb.reddit.com/rp` and `/rp.gif`, StackAdapt `https://tags.srv.stackadapt.com/js_tracking`, and the documented Clarity single-letter load-balanced hosts on `/collect`. Reuse the existing canonical recipient entities. Library/configuration resources, host lookalikes and unrelated paths do not become eligible collectors. This changes observed endpoint coverage, not full California sale/sharing-purpose qualification.

Primary verification comes from Reddit's vendor-distributed pixel (`https://www.redditstatic.com/ads/pixel.js`), StackAdapt's vendor-distributed SDK (`https://tags.srv.stackadapt.com/events.js`), Microsoft's load-balancing documentation (`https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-csp`) and its open-source upload implementation. Receipts, hashes and original/decoded source bytes are retained under `artifacts/reject-proof-five-sites-2026-10-22/`. Source inspection did not execute the SDKs or send collector events.

An exception reading an existing Request body no longer prevents capture of independently available URL/recipient facts. A POST body that cannot be read remains explicitly unavailable; it never becomes absent, inspected or identifier-free. The measurement inspector is skipped when the body is opaque rather than handed fabricated empty input. California request proof can still retain collector identity, exact request binding, response status and bounded proof limitations. No raw payload or identifier is added to retained proof.

Existing same-Response status capture is preserved before asynchronous response-header work and propagated through the worker packet, after-action request list and scoring evidence. A completed/failed request timestamp is not used as a substitute for a successful response. Missing, failed, late or mismatched responses remain unknown for eligibility. The supported collector tests now verify exact response identity/status and completion through this projection for Reddit, Clarity and StackAdapt.

## Eligibility and budgets

Full and potential California assessment continue through the versioned retained Reject scope and canonical persisted assessment -> normalized concern -> concern policy -> unified finding/checklist -> score pipeline. Full recipient and potential-risk schedules, processing restrictions, cross-path deduplication, mixed-family headroom, the GPP family and EU presence policy remain unchanged. Recognizing a vendor or endpoint does not establish a legal violation or full sale/sharing purpose. Historical packets are not rewritten or supplied with invented metadata.

The shared 48 inspection / 32 detailed-proof caps, original profile, 8-second Reject observation, 14-second action search, worker memory and absolute deadlines remain unchanged. No additional header/body reads, waits, retries, browser lanes, model tiers or retention periods are introduced. Estimated additional bounded metadata storage below $0.50/month at 100,000 scans and 30-day retention, disclosed before live verification. Expected one-time verification/ledger/model cost below $1; no recurring capacity is provisioned.

## Verification execution

The five explicitly requested domains are Squadhelp, Observe.ai, HyperDX, LaCrosse Technology and Gimbal. Central contact history and original scan configurations were verified; a one-run owner-directed cooldown exception was recorded without rewriting eligibility or permitting automatic site retries. Registry/contact-hold checks passed.

The production proxy cannot be reached from the Mac. Verification therefore uses a temporary isolated Lambda with current source on the verified existing production base image in us-west-1, preserving production VPC, proxy/egress, credentials, architecture, 3008 MB memory and 75-second function timeout. Actual S3 Put/Get/readback and SQS delivery preflight precede site contact. Options and Accept lanes are disabled. Results use an isolated queue and `synthetic_verification`; no customer reports are written. Temporary endpoint grants and resources are removed after evidence retrieval, and production code/configuration parity is checked.

## Retained five-site verification results

All five original-region invocations completed; Observe.ai, HyperDX, LaCrosse Technology and Gimbal retained valid joined Reject packets. All 266 downloaded JSON artifacts were hash/size checked, including original merged, GPC-worker and Reject-packet bytes. Assessments were JSON-round-tripped and verified through normalized concerns and unified findings. These internal comparisons concern choice-enforcement/potential-risk/GPP family amounts, not complete customer California scores.

| Site | Earlier retained CA families | Fresh CA families | Fresh Reject increment after GPC deduplication | Eligible fresh Reject potential-risk recipients |
| --- | ---: | ---: | ---: | --- |
| Observe.ai | 11 | 15 | +4 | Reddit; Microsoft Clarity |
| HyperDX | 0 | 11 | 0 | Heap, already represented on GPC |
| LaCrosse Technology | 32 | 32 | 0 | None; retained Shopify telemetry has unresolved purpose |
| Gimbal | 0 | 7 | +7 | Google Analytics |
| Squadhelp | 0 | Reject unresolved | Unconfirmed | No usable Reject packet from first attempt |

Fresh evidence confirms +22 aggregate CA potential-risk points across three sites compared with earlier retained scans. The incremental Reject contribution, after unioning/deduplicating against fresh GPC, is +11 across Observe.ai and Gimbal. No additional full sale/sharing recipient qualification is established by these rows. Fresh-versus-historical differences can also reflect site/session variation; they are not a controlled attribution of every change solely to capture code. EU Reject presence policy remains unchanged.

The first Squadhelp Reject worker failed packet validation shortly after dispatch. Safe diagnostic instrumentation now emits fixed allowlisted invariant codes without rejected values or arbitrary custom error messages. One further original-region attempt was separately approved by the owner; its results and resource cleanup are retained under `artifacts/squadhelp-reject-validation-2026-10-22/`. No automatic third attempt is authorized.

Resolver (238), capture/contract (121), scoring (26) and safe-diagnostic (6) test groups passed, plus resolver, scan-core, web and Lambda typechecks. Smaller overlapping test logs are excluded from those totals. Temporary infrastructure for the first five attempts was removed, its owned endpoint grant removed, and production code/configuration parity verified. Five contacts were persisted in central contact history; the repository-ledger candidate preserves the attempts without overwriting unrelated ledger work.

## Separately authorized Squadhelp follow-up

The owner authorized one additional Squadhelp attempt with safe diagnostics. Central history was checked again before contact. Exact temporary-function S3 Put/Get/readback and SQS Send/receipt passed before that attempt. The original us-west-1 region, production VPC/proxy/egress, required credential, profile, worker and action budgets were preserved. No Options or Accept action ran.

This attempt retained a valid joined Reject packet (`97d6c037255c96b0f75844a5354d9c431fe88d672a67ce9efb2d13f3227e7f58`). Squadhelp redirected to Atom.com; the authorized Decline click completed and its 8-second action capture completed without dropped requests. Registration remained unconfirmed, separately from positive request evidence. Successful retained requests included Microsoft Clarity at +48 ms (204), Google conversion at +194 ms (200), LinkedIn at +269 ms (204), and Google audience collection at +443 ms (200). Identified conversion and audience collection qualify Google once for 15 full-recipient points. Clarity and LinkedIn qualify for 11 potential-risk points. The complete fresh Reject contribution is 26 CA points after GPC deduplication; EU Reject presence family is 30.

Across the latest verified result for each of the five sites, additional CA families total 48 versus earlier retained scans (15 full-recipient plus 33 potential-risk points), with 37 attributable to fresh Reject evidence after deduplicating against fresh GPC. Four of five sites have additional CA effects; LaCrosse remains unchanged. Both attempts' evidence is retained. The original Squadhelp validation failure did not recur and its exact failed invariant remains unresolved; diagnostic instrumentation is not claimed to have repaired that intermittent cause. No third site attempt was made.

An additional 54 JSON artifacts were integrity checked, bringing the two run inventories to 320. The follow-up temporary function, role, queue, image tag and log group were removed, its owned endpoint grant removed, and exact endpoint restoration plus unchanged production code/configuration verified. The sixth contact is recorded separately under `owner-reject-proof-squadhelp-20261022`. See `artifacts/reject-proof-five-sites-2026-10-22/combined-assessment.json`, `verification.json` and `review.html`.

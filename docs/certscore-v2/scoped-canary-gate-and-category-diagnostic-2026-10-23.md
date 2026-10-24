# CertScore.ai scoped canary gate and Gimbal category diagnostic

October 23, 2026. Owner-approved local gate implementation/tests and one bounded
Gimbal category-state diagnostic. No deployment, flag changes, AWS invocation,
production campaign creation, external-form visit or privacy action occurred.

## Local gate behavior

`sale_sharing_canary.v1` is a strict authorization bound to the scan ID, original
target, ordered route grant, region, reviewed release identity, build Git SHA,
qualified immutable Lambda version and Settings recipe version. Only the exact
Gimbal and ReadCube routes qualify. A campaign has exactly two distinct scan IDs
and targets, one region (`us-west-1`), a common expiry within 24 hours and a $0.25
preflight cap within the existing allowance. There is no active campaign:
`activeSaleSharingCanaryCampaign()` returns null. No public scan option or
environment flag can supply the trusted campaign.

Ordinary web dispatches now preserve the checked-in HEAD's v1 exact-target
selection. The local apex/www and ten-route implementations remain available
and tested, but do not automatically become broadly dispatched on a later
deployment. Only the two canary grants can select v3 through this gate. This is
policy-selection parity with HEAD, not a claim that the deployed artifact or
every other dirty-tree change has been audited.

An active, listed canary ID with a wrong target/region or expired authorization
fails closed; it cannot fall back to an ordinary paid scan. Existing global and
persisted rollout gates still apply. Unlisted ordinary scans use their existing
v1 eligibility. The selected canary pins the function version for the coordinator
and workers. Coordinator and worker preflight additionally require the expected
runtime build SHA, actual AWS region, qualified version and exactly 3,008 MB.
Unscoped v2/v3 coordinator requests stop before lane dispatch, and unscoped
sale/sharing workers stop before browser work.

## Replay, ordering and cancellation

Claims use the existing S3 service, with a trusted campaign bucket and fixed
`sale-sharing-canary/<campaign>/<slot>/` keys. Conditional `If-None-Match: *`
creates are required. There is no memory-only replay protection, overwrite,
automatic retry or reset. Reads are capped at 8 KiB; malformed data, permissions
errors and transport failures fail closed. Only a definite missing-key response
means absence. SDK retries are disabled for canary ledger calls and canary
Lambda clients.

1. Web dispatch consumes `dispatch.json` before invoking the coordinator.
2. Coordinator preflight checks that reservation, then consumes
   `coordinator.json` before starting any evidence lane. It records the original
   canonical parent-dispatch hash, which includes the canary authorization.
3. Sale/sharing worker preflight requires that same hash and consumes
   `worker.json` before browser work. A duplicate invocation cannot act again.
4. The second dispatch also requires the first slot's operator review receipt,
   with its reviewed release identity, terminal scan ID and canonical-result
   hash. `recordSaleSharingCanaryReview` is an operator-only primitive; it is not
   exposed through a public API or invoked automatically by any worker. The
   operator must verify the persisted canonical terminal result and completed
   worker before attesting that it is safe to continue. The ledger verifies the
   attestation and claims; it does not independently infer terminal completion
   from a worker-start claim. A failed review blocks the second slot and writes
   a campaign revocation marker. Each stage checks revocation.

An uncertain reservation burns that attempt even if no browser starts. No
automatic replacement scan is authorized. This deliberately favors a missed
canary over a repeated privacy action. Revocation prevents subsequent work at
the next gate; it cannot undo an already completed choice. AWS asynchronous
redelivery may still produce rejected coordinator invocations, so preflight must
include the configured bounded redelivery policy in the cost estimate. The gate
prevents repeated lane work, not AWS billing for delivery of a rejected event.

The gate's I/O spends existing time: coordinator/worker preflight is capped at
500 ms and the worker also uses its original absolute scanner deadline. Web
claims use the existing dispatch timeout. There is no added tail wait, capture
time, retry, lane, larger worker or late publication. Gate overhead can reduce
the browser time available; this is not a readiness improvement. Existing GPP,
geometry, field/form, action-count, document and evidence-verification checks
remain in place. Retention and historical packet validation are unchanged.

## One bounded Gimbal diagnostic

The observation-only diagnostic used the original `https://gimbal.com/` route
and its exact approved redirect to `https://infillion.com/`, native TLS,
public-network validation, contact-hold checks and same-loader verification.
It allowed one snapshot of already-loaded category IDs, labels, configured
status and bounded active-group membership, using only the already-reviewed
read-only `OneTrust.GetDomainData` method. No new SDK method, cookie-value read,
Settings opening, toggle, form or submission was permitted.

The reader skips accessor properties, caps traversal at 64 groups, bounds rows
and strings, and shares one 10 ms processing allowance. An atomic SDK call cannot
be interrupted mid-call; an overrun is discarded, without a second read. A hard
capture timer closes the context. The packet remains below 32,000 bytes.

| Retained measurement | Result |
| --- | --- |
| Effective capture deadline | 2,750 ms including browser setup, within the 3,000 ms scanner allowance |
| Launch complete | 461 ms |
| Navigation start / final commit | 626 / 1,872 ms |
| Snapshot start / same-document verification complete | 2,601 / 2,608 ms |
| Total local duration including cleanup | 2,625 ms |
| HTTP and route proof | 200; exact one-hop 301, native TLS |
| Snapshot result | `api_unavailable`; zero getter calls, zero rows |
| Privacy actions / AWS invocations | 0 / 0 |

The safe reviewed getter was unavailable at the sampled checkpoint. This does
not establish that OneTrust is absent, that it never becomes ready, that the
category is missing, or that a choice was registered. No retry was made. The
earlier retained category label remains a research lead, but there is still no
category-ID/current-state mapping or same-session transition sufficient for a
non-GPP adapter. No non-GPP capture or decision reader was added to production
scanner logic.

## Verification and cost

Evidence, test logs, the diagnostic source/receipt, and a hash manifest are in
`artifacts/scoped-canary-category-diagnostic-2026-10-23/`.

Final verification: **48 focused checks plus 28 handler regressions passed (76
total)**. Typecheck outcomes and exact source hashes are recorded in
`verification.json` alongside the test and diagnostic logs.

The focused suites cover default deny, exact targets and recipes, expiry,
region/build/version/memory mismatches, ignored public option injection,
conditional-write races, replay rejection, wrong parent hashes, manual review,
revocation, uncertain writes, malformed/oversized records and deadline exhaustion.
Handler regressions preserve canonical packet verification, bad ancestry/hash
rejection, bounded joins and historical retention. V3 coordinator fixtures now
use an explicitly injected offline ReadCube canary; unscoped v2 cases correctly
stop at the new gate. The diagnostic reader has independent no-mutation and
bounded-read fixtures. All fixtures are local; none contacts the public sites.

Current local work adds **$0 recurring AWS spend**. No campaign or cloud ledger
object was written. A future two-attempt campaign adds a bounded handful of small
S3 records and reads/writes: allow **under $0.01 total ledger overhead** under the
prior planning rates, included in the proposed $0.25 campaign cap, itself inside
the existing $10 within $50 allowance. This is a planning estimate, not a current
regional price check or a measured remaining balance. Ordinary v1 scans do no
canary S3 I/O. No new service, capacity or retention extension is proposed.

## Still requires approval before action

- **Deployment and campaign activation:** separately approve the exact release,
  two scan IDs, ordering and expiry. Freeze the reviewed diff, verify the actual
  deployed baseline and immutable candidate version/digest, and supply the
  trusted campaign only through the reviewed internal activation path. The null
  campaign source is intentionally not an activation mechanism. Do not treat a
  caller-supplied manifest or the existing global flags as approval. The reviewed
  release identity must be externally defined, not an impossible self-hash of a
  bundle containing its own digest.
- **Production preflight:** verify the remaining shared allowance, current
  regional pricing and full-scan/redelivery cost bound under $0.25. Verify the
  existing bucket's claim-prefix permissions, conditional-create behavior and
  retention beyond authorization expiry/redelivery. Any required IAM, bucket,
  lifecycle or release-workflow change must be separately reviewed and approved;
  none was made here. Do not activate if isolation or the cap cannot be proved.
- **Further non-GPP work:** another live attempt, a longer diagnostic, a new
  capture/read method, state adapter or different action controls needs explicit
  scope. The one approved diagnostic is consumed. Existing retained evidence
  still does not justify implementing a non-GPP verification adapter.
- **External forms:** remain excluded. Neither visiting the Gimbal form nor
  supplying identity data or submitting it is authorized.

Recommendation: keep the gate inactive while these evidence and release checks
remain unresolved. The local safety gate is ready for review; useful live opt-out
recovery on these routes has not been demonstrated.

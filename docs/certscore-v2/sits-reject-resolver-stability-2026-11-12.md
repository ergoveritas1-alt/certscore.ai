# CertScore.ai SITS Reject resolver stability

## Retained incident

Scan `003f35b3-ec32-45a1-ab7c-33336cd141c9`, scanner revision
`9aa149f09ce06cdd83d10cacfb8488c2583f8f51`, retained a joined Reject packet
with no click and no observation. Packet SHA-256:
`46fab4740efd192dbcdf2b9e5f9aa721c63a9e9bc7397efaed296fb330c15262`.
The worker completed before the passive barrier; this was not a missing lane
result. Resolver time was 12,187 ms. Canonical geometry repeatedly saw the
essential-only control and a close control. Named discovery saw one actionable
control at 10,688 ms, followed by binding-budget exhaustion at 11,166 ms.
The diagnostic snapshots were truncated, so their sequence is not exhaustive.

Prior SITS success is documented in `after-accept-form-snapshot-proposal.md`,
including confirmed refusal on scan `078379ab-8ed9-48b8-b490-267675876cef`.
This incident does not establish that the site removed or broke Reject.

## Reproduced mechanism and local correction

Named discovery receives 750 ms slices. A complete uniqueness sweep can find
one actionable control but leave insufficient time for the second stability
sweep. Returning to canonical geometry resets named stability progress. Earlier
canonical ambiguity survives into the final reason, masking this starvation.
The scheduling code predates this incident; a newly introduced commit or the
specific source of production latency has not been established.

Once a named candidate has passed a complete uniqueness sweep, allow the same
invocation to finish stability checks under the existing outer search deadline.
Keep live uniqueness, label/actionability, cancellation and dispatch checks.
Do not choose the first of two matching named controls or treat close-button
wording as proof of equivalent behavior.

## Regression coverage and release evidence

`reject-named-stability.test.ts` uses real local Chromium, two generic Reject
candidates, one exact named target, and delayed cross-frame reads. With the
correction removed it reproduces single-actionable / binding-budget-exhausted
cycles, zero clicks and the production ambiguity reason. With the correction
it retains exactly one click and completed post-click capture. A duplicate
named-target variant retains zero clicks. The normal scan-core test glob
includes this file.

All 17 focused binding, ambiguity, TLS and new stability tests pass; scan-core
TypeScript checking passes. This is a mechanism reproduction, not a full replay
of the live Borlabs DOM. No production deployment, new public visit or historical
report rewrite was performed. Local work adds no recurring AWS cost; maximum
worker/search/capture budgets and storage are unchanged. Realized production
compute impact is not measured. Release verification should compare action
completion and resolver failure diagnostics on an authorized SITS canary, not
merely overall scan completion or initial Reject detection.

## Follow-up: both action paths and post-click boundaries

Owner authorized local reproductions/fixes for all three reviewed failure modes,
with both-action tests, unchanged budgets and an explicit deployment hold.

- Injecting a cookie-read exception after dispatch caused Accept to throw instead
  of retaining its packet. Reject already retained its completed click. Accept
  now treats this boundary failure as unknown confirmation, records
  `acceptance_confirmation_read_failed`, and retains bounded after-click facts.
- Injecting a same-origin request and storage write during terminal storage
  collection admitted late evidence in unconfirmed Reject. Accept already froze
  collection. Reject now sets the same observation cutoff used by its confirmed
  branch before terminal reads, closes origin-storage diagnostics, and filters
  instrumented writes against that cutoff. Terminal snapshots remain separately
  timed readbacks; they do not prove when a cookie or storage value was written.
- With two 450 ms cross-frame reads, both named resolvers exhausted their 750 ms
  slices before proving uniqueness. Both failed the positive regression before
  correction. A live actionable candidate now permits completion of the entire
  named sweep using the existing outer deadline, including Reject stability.
  This supersedes the narrower completed-sweep-only change above. Every remaining
  recipe/frame check must finish; no partial inventory can authorize a click.

`action-boundary-regression.test.ts` exercises confirmation exceptions and
late terminal requests/writes for both actions. `reject-named-stability.test.ts`
now covers both actions under slow uniqueness reads, duplicate targets,
cancellation and exhausted deadlines. Fixtures use loopback servers and block
external requests. Both files are included by the normal scan-core test glob.

No scan/action budget, worker configuration, production flag, historical record,
or deployment changed. Local recurring infrastructure cost remains $0. The change
reallocates already permitted search time; production timing/cost impact has not
been measured. Live verification remains outstanding under the deployment hold.

The Reject freeze uses an internal collection-closed flag, matching Accept.
It deliberately preserves the existing packet distinction: terminal capture
completion includes snapshot work, while network/write collection ends before
that work. Reusing the registered-observation timing field for an unconfirmed
capture violated existing source/timing joins; report-projection tests caught
that and the final implementation preserves those contracts without relaxing
validation.

Final validation: 23 boundary, both-action resolver and recovery tests passed
with the final implementation; the 18 related binding/cohort/window tests passed
in the broader run. Scan-core TypeScript and `git diff --check` passed.

## Real localhost verification — November 13, 2026

Owner authorized real localhost scans and waived cooldown for this targeted SITS
check. Registry validation and the central contact-history export passed before
contact. Built scan-core with the patches and used the localhost full-scan API,
local simulated sharded coordinator, full profile, and both eligible action
workers. The web dev server required webpack because Turbopack failed resolving
an existing `.js` specifier to a TypeScript contract module. No production
scanner deployment or production flag change occurred.

| Input | Local scan | Accept | Reject |
| --- | --- | --- | --- |
| `https://sits.com/en/` | `de638073-11c3-412b-a725-2a9ca853b1ed` | Confirmed; 3,009 ms observation; packet joined | Confirmed; 1,680 ms observation; packet joined |
| `https://sits.com/` | `99e0ffa0-4ab9-4013-8cc9-a169c852d133` | Action dispatch checkpoint retained; final packet absent at coordinator deadline | Confirmed after one redirect; 873 ms observation; packet joined |

Both report snapshots reached `ready` with no projection error. Both retained
Reject executions project `succeeded_with_confirmation`, including completed
click, confirmed consent and completed observation. The first retained four
HubSpot activity rows and the second two. Reject's early exit on positive
non-essential activity followed the existing observation policy; an eight-second
configured maximum is not a claim that eight seconds were observed.

The second Accept worker recorded dispatch at 9,863 ms but did not deliver a
packet by the coordinator's passive barrier plus 6,000 ms allowance (18,772 ms
from Accept invocation). This establishes a remaining post-dispatch lane
completion limit, not a repeated ambiguous-control result, and does not establish
completed clicking or semantic registration. No timeout was extended and no late
packet was used to rewrite the published report. Its exact delayed stage remains
unresolved with these checkpoints.

These two scans support Reject reliability on this target and one successful
Accept path. They do not establish universal reliability or live execution of
the injected confirmation-exception and terminal-storage cases. Those fixes
remain validated by deterministic fault-injection tests. No further public
retry was performed. Run receipts and central contact-history export are under
`artifacts/sits-local-action-verification/`. Local scans incur no recurring AWS
infrastructure increment; bounded central ledger inspection/recording has small
one-off AWS task cost, estimated below $0.05 total.

## Accept timeout follow-up — November 13, 2026

Owner requested reproduction, a canonical correction and another localhost
verification, preserving budgets and the deployment hold. The second scan's
last retained checkpoint is dispatch, so its exact final blocked stage cannot
be recovered. A concrete scheduling defect was reproduced: a retained form
bootstrap unconditionally held Accept open to the optional form deadline even
after positive forms and images had settled. The earlier successful `/en/`
packet spent until 19,750 ms in that lifecycle (19,764 ms total), while the failed
apex scan's coordinator cutoff was 18,772 ms from invocation.

The shared Accept observer now ends that optional form follow-up once bounded
positive samples are stable across at least 500 ms, all selected frames have
fresh same-document samples, no structured sample is pending, and image work
is done. Absence does not trigger early completion. The original activity
window remains intact; network/storage writes remain frozen at its boundary.
The structured and image artifacts retain one shared shortened lifecycle end,
with unchanged packet/projection validation. This applies to all eligible
Accept form follow-ups; it contains no SITS-specific branch. Reject has no
equivalent optional form wait and retains its existing budgets and behavior.

The first implementation's real check (`1c3a04a9-975a-4789-b9d3-5e7897034f22`)
exposed a shared-deadline mismatch: structured capture ended early while images
retained the old deadline. Validation correctly rejected that packet. An offline
image-enabled fixture reproduced the same validation error; the final change
joins both artifacts under their actual common end without weakening validation.

Final tests: 16 form-follow-up, structured-capture and both-action boundary tests,
plus three relevant snapshot lifecycle tests passed. The fast positive fixture
failed before the scheduling correction (about 8.3 seconds versus a required
under-five-second completion); it now completes in about two seconds. Coverage
also retains forms arriving at five seconds, validates image/form deadline
equality and report projection, and excludes late activity evidence. Scan-core
TypeScript, the build and `git diff --check` passed.

Final real localhost apex verification:
`48ff621d-d4b5-4a3e-be11-9dc0e0766da4`.

- Accept: dispatch 9,644 ms, confirmed 9,759 ms, full observation 3,003 ms,
  packet ready 13,385 ms and worker result joined at 13,433 ms from invocation.
  Structured follow-up ended at 13,373 ms instead of its 19,750 ms maximum.
  Two forms (eight and one fields) and two available images were retained.
  Frame-cap coverage remains explicitly limited; no sitewide completeness is
  claimed.
- Reject: confirmed, 830 ms observation before the existing positive-activity
  early exit, packet ready 10,059 ms; joined successfully.
- Both saved report coverage records are `complete`, with `evidenceJoined: true`
  and no limitation code. Report projection is `ready`, with no error.

The final run's passive policy lane was slower than the failed scan's, so merely
joining is not a controlled recreation of the earlier coordinator race. Accept's
13.4-second result is independently earlier than the prior 18.8-second cutoff,
and the offline test proves removal of the unnecessary wait. Other readiness,
navigation or resource failures can still produce honest limited results.
This is targeted verification, not a population-wide reliability guarantee.

No worker, search, activity, optional form or coordinator budget was increased.
No deployment, production flag change or historical rewrite occurred. The local
work adds $0 recurring infrastructure cost; the contact-ledger follow-up is a
small one-off AWS task cost, estimated below $0.05. Receipts, history and contact
summaries are retained under `artifacts/sits-local-action-verification/`.
The two follow-up contacts were persisted centrally with idempotent run key
`sits-local-accept-followup-2026-11-13`. The reviewed repository ledger records
all four authorized visits; registry validation passed and global holds remain.

## Two additional localhost consistency checks — November 13, 2026

Owner explicitly requested two more SITS localhost scans with unchanged budgets
and no deployment. Registry validation, the central history export and a specific
`sits.com` contact-history read succeeded before dispatch. The existing owner
cooldown waiver applied. Exactly two full-profile scans ran sequentially on the
same rebuilt code and apex URL; no scanner code or budget changed for these runs.

| Local scan | Accept packet ready | Accept observation | Reject packet ready | Reject observation |
| --- | --- | --- | --- | --- |
| `6c2ebb84-2f6f-4d28-9e7d-d9927c6f20b6` | 13,285 ms | 3,000 ms | 10,832 ms | 952 ms |
| `29462053-9121-4ff9-a997-8715071c9784` | 14,443 ms | 3,002 ms | 10,654 ms | 917 ms |

All four clicks completed, all four registrations were confirmed and both action
packets joined in each scan with no worker error. Both persisted reports are
`ready`, without projection errors; Accept and Reject coverage are `complete`,
with `evidenceJoined: true` and no limitation code. Accept retained its full
three-second activity observation. Reject retained the existing positive-activity
early exit. Coordinator tail limits remain 6,000 ms for Accept and 8,000 ms for
Reject; the form worker deadline remains 20,000 ms.

Each Accept packet and persisted report retained two forms with eight and one
fields, plus two available images. Image/structured lifecycle ends agree at
13,274 ms and 14,432 ms respectively. Structured form coverage remains `limited`:
the first retained `capture_limit`, `document_loading`, `window_ended`; the second
retained `capture_limit`, `window_ended`. Neither claimed a complete terminal
sample or exhaustive form inventory. These coverage limits did not discard the
positively captured forms/images or invalidate completed action observations.

Together with the preceding final-fix run, this is three consecutive successful
localhost action checks retaining the same form fields and two images. It is
targeted consistency evidence, not a guarantee against future site/runtime
failures. Per-run receipts, saved-report verification and contact summaries are
under `artifacts/sits-local-action-verification/` (`run-5-repeat.json`,
`run-6-repeat.json`, `repeat-verification-results.json`). Central recording uses
idempotent run key `sits-local-consistency-two-2026-11-13`; the repository ledger
candidate changes only the apex contact and update time. Global holds remain.
No deployment or production flag change occurred. Local recurring infrastructure
increment is $0; bounded contact-ledger tasks are estimated below $0.05 one-off.

## Production timing follow-up — November 13, 2026

Production scan `4e354564-0683-4f7b-a6e1-2eb368b96eef` ran deployed revision
`0ddf727a5`. Both action packets joined and both choices confirmed. The Accept
packet recorded roughly 3.74 seconds through document commit and 10.78 seconds
in the resolver, including document readiness and repeated geometry/named
probes. Navigation itself took 79 ms. Accept dispatched at 15,103 ms and
confirmed at 15,974 ms. The 3,006 ms activity observation began after additional
corroboration work and ended at 19,764 ms. Terminal storage returned at
20,873 ms and the packet was ready at 20,934 ms.

The Lambda image trace shows 2,681 ms waiting for inventory. It found two forms
with nine fields, then exhausted the remaining 320 ms on the first form's
control binding. No image reached pixel capture or safety review. The saved
report retained a six-field form from the independently verified structured
sample and no images.

The exact-URL passive Borlabs reveal was armed for the request URL, so the
authorized redirected document could miss that early checkpoint. The retained
packet cannot attribute the full resolver delay to this path. A local browser
fixture reproduces it using a redirected, deferred Borlabs banner. Both action
workers now arm the existing passive reveal on the exact authorized document
after redirect binding, including when the CMP initializes later. The fixture
fails to confirm either action on the deployed source and confirms each once
on the corrected source.

Accept starts form capture and activity observation without waiting on optional
banner corroboration. It skips request classification and storage-write
polling used solely for early exit when it must observe the full window. Network
and write retention, semantic checks and the terminal read still apply.
Terminal storage and write readbacks share the existing 250 ms finalization
reserve. A stalled channel is reported unavailable while independent evidence
can still be retained. Optional image cleanup no longer waits for a CDP detach
acknowledgement before returning evidence. Image masking, safety review and
same-document proofs still apply.

The final intercepted Chromium fixture injects 3.5 seconds of setup, an
11-second delayed CMP script, forms arriving 2.3 seconds after click and a
terminal storage read that exceeds the deadline. Accept confirmed at 15,108 ms,
observed the full 3,000 ms, and returned a projectable packet at 19,773 ms under
the 20,000 ms budget. Both forms (six and three fields) and both masked images
survived projection. Reject confirmed once in an independent context. The
fixture intercepts all browser traffic and uses a deterministic safety reviewer.
The form release gate passed 60 checks, the broader targeted set passed 22,
and scan-core typechecking and build passed. These runs validate the controlled
failure paths. No deployment or additional SITS contact was made.

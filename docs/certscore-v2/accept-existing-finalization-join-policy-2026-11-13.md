# CertScore.ai Accept/Reject completion during required finalization

November 13, 2026. Local implementation authorized by the owner's request to improve actual action completion within existing budgets. Deployment remains held. This extends the existing Reject finalization behavior to Accept; it supersedes only the Accept-checkpoint exception in `reject-existing-finalization-join-policy-2026-10-22.md`.

## Reproduced defect and canonical fix

An already-invoked Accept worker was canceled immediately when the passive lanes finished under complete-empty or limited consent inspection. The coordinator then performed required downloads, verification, merge, auxiliary mirroring and GPC comparison. A valid Accept result arriving during that work was discarded. The equivalent Reject result already survived.

Two deterministic coordinator fixtures deliver a valid Accept result during the existing runtime-artifact GetObject I/O turn. Both failed before the change (`failed`, missing evidence instead of `joined`) under complete-empty and limited passive inspection. The corrected code joins both through normal hash/size/schema/parent/target/document verification, with confirmed registration and one publication. Passive first-layer observations remain unchanged.

`action_join_existing_work.v1` freezes both action lanes once after required passive finalization, before any action join. Unfinished passive-disagreement work is canceled immediately. A result already returned by this point follows the existing verified packet path. Reject's behavior is unchanged; Accept now shares it.

No sleep, grace period, polling, new dispatch, action search, browser operation, retry, larger worker, model call or second publication was added. The original passive-barrier timestamp still anchors the six-second Accept and eight-second Reject absolute join deadlines, including verification. Existing late-form policy and worker absolute limits remain unchanged. Undispatched actions still cancel immediately. Results after the freeze and corrupt packets cannot reopen publication. This is not permission to wait for unresolved controls solely because unused time remains in a configured maximum.

## Local verification

- Two before-change positive fixtures failed; both pass after the change.
- Full coordinator suite with local HTTP/Chromium fixtures: **182/182** passed. The initial sandboxed run was invalidated by blocked localhost listeners and rerun with the required local permissions.
- Final focused coordinator suite: **17/17** passed, including completed and incomplete workers, complete-empty/limited passive inspection, bad hashes, replies after the freeze, confirmed registration, unchanged passive observations and single publication.
- Lambda TypeScript passed. Existing absolute tail-budget tests passed.

Fresh central contact history and the canonical selector admitted three targeted localhost rechecks under the standing cooldown waiver. These are diagnostic rechecks, not a population acceptance sample. SITS and ergoveritas were excluded.

| Target | Scan ID | Result |
|---|---|---|
| Archon | `3c8a8de3-0c6e-4cd3-9123-36438b43d341` | Ready report; Accept and Reject still unfinished at finalization, both canceled |
| WordPress | `fa9383b2-0511-4dfd-aa84-074097afc83f` | Ready report; Accept and Reject still unfinished at finalization, both canceled |
| HubSpot | `a0a531b6-8b5a-46d5-97f7-145f9a172268` | Ready report; Accept and Reject clicked, confirmed and observed |

HubSpot packet durations were **9,248 ms Accept** and **7,028 ms Reject**. Its one post-Accept form and snapshot metadata exactly match the hash-verified packet in the final report. Image work completed in 164 ms with `no_visible_context`; no available image was claimed. HubSpot's actions finished before the passive barrier, so their faster times cannot be attributed to this fix.

Archon's required finalization lasted about 180 ms after the passive barrier. The action lanes remained available during that interval, but no result arrived. The timing field `acceptLaneAddedWaitMs` includes that elapsed required-work interval; there was no action-worker wait phase. The change improves the demonstrated completion race, but these public rechecks recovered no additional action and do not establish a population completion-rate gain.

## Evidence, costs and holds

`artifacts/accept-finalization-20261113/` retains before/after logs, local report snapshots, packet comparisons, selector receipts, contact history, per-scan verification and a hash manifest. `verify-local.mts` only reads the exact local database rows and local artifact bytes. Historical reports and packets remain unchanged.

All three contacts are recorded with idempotent run key `accept-finalization-20261113-three-local`. The repository ledger preserves all 290 entries and changes only the three contacted targets. No Mac mini bot rows or reconciliation scheduling changed.

No recurring infrastructure was activated. There are no new scan attempts per request or extended configured limits. The expected additional worker overlap and normal packet verification/retention for recovered joins remain a below-$1/month planning estimate at 100,000 scans; reestimate before deployment if incidence, finalization duration or retained-copy volume exceeds the assumptions of the existing Reject policy. Canonical ledger access incurs only the small one-off operational cost already disclosed. No production scanner invocation, deployment or historical rewrite occurred.

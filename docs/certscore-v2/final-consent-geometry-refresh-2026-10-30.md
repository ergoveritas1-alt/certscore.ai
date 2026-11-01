# CertScore.ai final consent geometry refresh — October 30, 2026

The owner approved local implementation of the bounded repair and its conservative
$15/month planning ceiling at 100,000 scans. Deployment remains separate. The
approved preflight is retained at
`artifacts/daily-scan-audit/runs/20261031T010251Z-manual-checkpoint-scheduling-preflight-e18fad9f/implementation-proposal.json`.

Twelve verified original checkpoint pairs reproduce six stale pairs that pass
the old final stable-proof predicate. Their geometry precedes the latest typed
inventory by 2,147–8,186 ms. All six historical runs logged a stable-proof exit.
The existing end-of-run correction removes the stale completed channel too late
to inform that scheduling decision. Feeding the same source-preserving freshness
check into the final gate rejects all six false-stable inputs. This is a gate
reproduction, not evidence that all six sites can be recovered.

The final scanner gate now evaluates freshness before declaring proof stable.
Previously stable stale packets are owned by one narrow optional path under
`final_consent_geometry_refresh.v1`. They cannot fall into the older recovery
sequence, which can settle, read DOM again or take a screenshot. Other recovery
paths and adaptive checkpoints retain their existing behavior.

The optional path requires existing complete, ready DOM inventory with zero
failed/timed-out channels, a retained pre-interaction representative screenshot,
exact URL/CDP-loader binding and a previously loaded access context. It refuses
blocked/error contexts, missing evidence, insufficient remaining time or original
cancellation. The original module deadline must have at least 1,500 ms left.
No deadline, worker memory, publication barrier, action scope or per-read limit
is increased. The invocation-local claim cannot be acquired twice, including
concurrent calls or an earlier ineligible attempt.

The only new browser capability is one existing geometry read capped at 1,100 ms.
The whole optional refresh uses at most a 1,500 ms allowance, including a 250 ms
cleanup reserve; staging/commit must finish before that reserve begins. It adds
no settle, DOM inventory, screenshot, SDK method, action or retry. Geometry must
finish inside its own cap and carry a real timestamp at or after the retained DOM
inventory, inside the new read. Full structural inspection, viewport, screenshot
reference and exact document/frame binding are rechecked before retention.
Unknown or incomplete observations remain limited; old geometry is never redated.

Staging writes a private temporary file outside the uploaded artifact tree. Only
a synchronous atomic rename guarded by deadline, cancellation and current
document/frame state replaces the canonical geometry path. A late write can only
clean up its private file. Failure, including cross-filesystem rename failure,
leaves the earlier canonical artifact intact. No second uploaded artifact or
retention period is added. As with existing local filesystem operations, cleanup
is cooperative; a late asynchronous write is not promoted into evidence.

The refreshed artifact preserves access/egress diagnostic families. Access is
explicitly qualified as the previous same-loader geometry access context, with
the old geometry checkpoint; the reused DOM source has its original timestamp.
This is not a fresh page-access read. Old screenshot pixels are not relabeled as
a new image or used to create a visual-comparison witness. A successful retained
geometry joins the existing typed finalizer and canonical assessment path.
Valid earlier positives survive a failed refresh. A successful refresh can still
leave unresolved control intent or other coverage limitations unknown.

Focused tests verify the six stale inputs, original timestamps/controls, exact
source/image binding, missing/incomplete prerequisites, insufficient budget,
original cancellation, one invocation-local claim, simultaneous calls, changed
URL/loader/frame revision, truncated inspection, future/stale capture, read and
staging timeouts, cleanup timing and preservation of the previous artifact.

Owned Chromium fixtures demonstrate one Reject control rendered after the earlier
DOM inventory: the single fresh capture changes its canonical/public state from
unknown to observed while preserving Accept. A same-URL reload during staging
prevents replacement. An owned loopback scanner fixture exercises the actual
final scheduling path: one retained refresh, a current checkpoint and no legacy
settle/inventory recovery or duplicate late screenshot. An ordinary complete
fixture also finishes without unnecessary refresh. These are controlled local
results, not public-site recovery counts or production timing forecasts.

The combined focused gate covers 46 test files and five typechecks, with immutable
source/log-hash/exit-code receipts. Local fixture development exposed the public
network guard rejecting a loopback probe outside Node test context; the proper
owned test context is used, with no product guard change or waived check.

Local paid usage is $0. The approved planning envelope counts a 3,008 MB worker
and a same-sized waiting coordinator for 1.5 seconds at the repository planning
rate of $0.0000166667/GB-second: approximately $14.6875/month if all 100,000 scans
incur the full allowance, rounded to $15 including bounded metadata overhead.
Actual exposure and overlap savings are unknown. The six selected cases are not
a prevalence estimate. No cloud task/query, public scan/visit, model/API call,
privacy action, deployment, flag change, service, capacity or paid-retention
change occurs here.

The original October 29 190-report cohort and October 30 partial day remain
separate and unchanged. Production after-rates and deltas remain unavailable.
No historical report, score, assessment or snapshot is rematerialized. The 36
pinned audit tools remain unchanged; new source adoption still requires review
before dashboard publication. Checkpoints, issues/release state, model history,
snapshots/latest and automation schedule/model/reasoning/project/budget/unique
invocation accounting remain untouched, with zero scheduled invocations added.

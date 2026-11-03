# CertScore.ai CNN Accept path verification

Local continuation, November 2, 2026 (Hawaii), base HEAD
`6a9d197a207765ea958059d6ee2f2b2fdd94aa07`. No push, package publication,
deployment, production database access, configuration change or historical rewrite.

## Success criterion and retained limitation

The existing owner-approved `choice_path_execution.v1` policy defines Succeeded
as a verified completed click plus a complete bounded observation. Succeeded with
confirmation adds a verified corresponding consent decision. Consent registration
is independent, and a click alone is insufficient. See
[the existing policy](choice-path-execution-policy.md) and AGENTS.md's versioned
Accept/Reject confirmation section.

The preceding real CNN packet completed Accept but retained 192 of 256 observed
post-click requests within its three-second window. That original packet remains
Limited. Its bytes and historical interpretation are not changed. Semantic
acceptance was also unconfirmed; a background OneTrust global cannot bind a named
decoder to CNN's custom control. No new adapter or acknowledgment-to-consent rule
is introduced.

## Additional repair

The unconfirmed Accept branch did not close its request listener when its
configured dispatch-relative window ended. Unlike the confirmed branch, terminal
storage/form readback could keep consuming the request inventory after the
observation window. It now freezes network retention and the existing main-document
write capture before terminal readback. Retained instrumented writes are also
bounded by that original observation end.

A private closure flag keeps the network boundary separate from the later terminal
snapshot timestamp. It adds no public timing field and preserves the existing
strict relation between retained-action timing and after-action snapshot timing.
The terminal snapshot's actual timestamp is retained. No end time is backdated,
no original source is rewritten and no public timing invariant is weakened.

The repair does not increase the 192 post-click request cap, shorten the existing
three-second CNN window, omit in-window traffic by type/vendor, add a wait/retry,
raise a timeout, add a lane/browser/RPC/model call or publish late. Genuine
in-window drops still make execution Limited. Semantic confirmation, finding
eligibility, scoring and historical readers remain unchanged.

Hermetic fixtures exercise both complete and truncated in-window capture, followed
by 200 real loopback requests and an instrumented write during the existing terminal
snapshot. Late traffic cannot create truncation or contaminate the observation;
genuine in-window overflow remains Limited. The original completed-click proof,
source hash, required snapshot and canonical execution validation are used.

## Verification and cost

The focused offline fixture/contract suite and shared web/API/export/PDF suite are
recorded in `outputs/cnn-accept-path-2026-11-02/`, together with each fresh original
CNN receipt and canonical replay. Public-site execution is only the explicitly
owner-authorized CNN scan, with the existing bounded policy-assist approval.
AWS clients are local filesystem/recursive substitutes; no AWS access occurs.

The change adds one private boolean and zero serialized fields, retained rows,
RPCs or observation time. Incremental recurring compute/storage is estimated $0;
terminal over-retention can decrease but no Lambda saving is claimed. The existing
AGENTS.md approval of $30–$60 per 100,000 affected unverified action paths covers
normal full-window capture; it is not a new allowance. The pending CMP/GPC fix
allowance remains capped at $4/month at 100,000 scans/30-day retention, with no
infrastructure or retention configuration change. Local policy-assist charges
remain the previously approved existing calls; their exact bill is not measured.

Materialization v45 remains the existing unreleased cache change and global
projection v27 is unchanged. No automatic repair/backfill is enabled. Any future
release requires compatible consumers before producer packets through the checked-in
AWS workflows. This note authorizes no deployment.

## Concrete remaining budget boundary

The first fresh six-lane scan after this repair,
`cnn-accept-path-fe4e7033-614e-447d-add8-76f260976867`, observed 264 post-click
requests and retained 192, dropping 72. Every retained request began within the
original three-second window. The click completed, the window elapsed and the
terminal snapshot was retained; execution correctly remains Limited. The prior
CNN packet had 256 observed requests. The finalization repair is real but does
not erase genuine in-window request loss in either original run.

The reviewed next step, not implemented, is an Accept-only producer retention cap
of 384. Keep Reject's producer cap at 192 and all timeouts, windows, lanes,
capacity and infrastructure unchanged. Version/bind the new retention policy so
old packets retain their original 192-row maximum and overflow still cannot
claim success. Update canonical/public validators and compatible readers before
new producer packets. No historical reclassification or backfill.

Observed rows averaged 285 bytes (maximum 445). Conservatively planning 1,000
bytes per additional row, 192 additional rows, six retained copies, 100,000 scans
and 30-day retention yields 115.2 decimal GB. At a planning rate of $0.03/GB-month
(storage-rate assumption, not a provider price quote), this is $3.456/month,
plus a $0.544 processing reserve: $4 incremental. The requested combined pending-
fix allowance would replace $4 with $8/month. No measured Lambda saving or
production completion-rate coverage is claimed. The lower-cost alternative is
to keep 192 and honestly retain Limited for this captured CNN traffic.

AGENTS.md's Cost-change approval section requires explicit owner approval before
implementing a reasonably estimated increase of $1/month or more. The existing
unchanged-budget instruction also does not authorize this evidence-cap increase.
The proposal and its estimate are recorded in the separate retention-proposal
JSON. No cap, production flag or configured resource has been changed.

## Current verification before the approval boundary

The updated frozen-window code passed 74 focused core/contract tests and 373
shared canonical/web/API/export/PDF tests (447 passed, zero failures/skips).
Contracts and scan-core builds/typechecks, Lambda and web typechecks, public
contract drift checks and git diff whitespace checks passed. Full preflight was
not rerun for this follow-up. The new regression enters existing predeploy
consent-action coverage. The unrelated dashboard test remains unchanged.

The fresh original canonical artifact is 1,492,807 bytes. Its original receipt
hash and local byte-identical materialization copy verified. The normal canonical
materializer, persisted hydration, strict API and JSON/report projection all retain
Limited for this source. No displayed status or score was overridden. Semantic
registration remains unconfirmed. The current objective is not marked achieved;
the cap proposal is pending and unimplemented.

## Subsequent approval and fresh proof

The owner subsequently approved **“Approve 384 and $8 combined.”** The proposal
above is superseded by the implemented Accept-only versioned retention policy
and a separate fresh CNN scan with 264 retained requests, zero post-click drops
and canonical execution Succeeded. See
[the approval and fresh proof](accept-retention384-authorization-2026-11-02.md).
The earlier scans and Limited results documented here remain unchanged.

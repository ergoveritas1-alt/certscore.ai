# CertScore.ai consent checkpoint coverage — October 30, 2026

The next remaining consent-evidence priority is consistency between the latest
typed inventory and its geometry checkpoint. Earlier work fixed public
projection loss and six exact observation labels; it did not refresh or change
the original capture checkpoints.

The retained CyberGhost record has geometry at 10,973 ms and the final consent
observation at 14,919 ms. Its later DOM inventory still carries geometry in
completed channels. The downstream assessment correctly keeps Reject unknown
because that geometry is older. Five other records in the twelve-case retained
set also carry an older geometry checkpoint. This is an upstream coverage
accounting issue, not evidence that Reject was absent or that a CMP failed.

Final packet assembly now removes geometry from completed channels when the
retained artifact precedes a later inventory on the exact same URL and loader
identity. A formerly complete inventory becomes partial. An existing timeout,
frame or other incomplete outcome is preserved. The basis retains the explicit
reason `geometry:checkpoint_precedes_latest_inventory`.

Positive controls, control flags, timestamps, source artifact references,
completed DOM channels, timeout/failure diagnostics and original geometry bytes
are preserved. Current or equal-time geometry is unchanged. Missing or differently
bound geometry remains subject to existing integrity/read-side rules. The same
finalization is applied to normal, deadline-limited and failed returns. Original
retained packets and reports are not rewritten.

The correction happens only during final assembly, after capture decisions.
It does not reopen recovery gates, move reads, add a capture, launch a retry,
increase a wait or alter any absolute budget. Future improvement in actual
capture completeness remains a separate runtime task; no new observed controls
or confirmation-rate gain is claimed here.

Validation uses source-hash-labelled subsets of all twelve original packets.
All six stale checkpoint pairs lose the stale completed geometry channel while
retaining their controls. CyberGhost's original 3,946 ms mismatch is reproduced.
Tests also cover equal/newer checkpoints, missing/invalid/differently bound
geometry, existing failure outcomes, empty inventories and source immutability.
All 75 focused tests pass across coverage accounting, recapture gates, document
binding and canonical control assessment. Full scan-core and focused fixture/test
typechecks pass.

Local paid usage is $0. There were no new scans, public visits, cloud queries,
privacy actions, model/API calls, deployment, historical rewrite or dashboard
publication. Marginal deterministic accounting/metadata cost after separately
authorized deployment is estimated below $0.01/month at 100,000 scans. Existing
services, workers, capture budgets and retention allowances remain unchanged.
Dashboard source pins remain unchanged and require the existing review gate
before adopting future production evidence.

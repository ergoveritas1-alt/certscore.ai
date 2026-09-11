# Consent action release validation and measurement

This runbook covers the accumulated A/R/O capture and bounded Accept/Reject
changes. Deployment is a separate step. Pre-release verification does not initiate
production scans, enable features, change production configuration or schedule a
monitor.

## Release checks

Run the change-aware `pnpm preflight:fast` gate for the complete accumulated diff,
including untracked implementation and test files. Verify the workspace build as
well because shared contracts, scanner code, Lambda and web consumers change
together. Keep the gate output and source hashes with the release review. Re-run
checks affected by any subsequent code fix. A failed check remains a release
blocker until resolved or explicitly dispositioned; do not describe focused local
replay as a complete release gate.

Review these boundaries explicitly:

- Exact-target authorization, unique visible/enabled controls, independent browser
  sessions, one action, bounded recovery and unchanged coordinator tail caps.
- Semantic registration separate from a completed click and retained after-click
  observations. Never turn absence of verification into a new observed gap.
- Retained packet schemas, checksums, document/control identity, versioned
  provenance and exact persisted projection.
- Normalized concern -> concern policy -> unified findings/checklist -> scoring
  and display. Copy must describe already-projected facts.
- Single terminal publication, and explicit neutral outcomes for cancelled,
  failed, unsupported, ambiguous or unverifiable action lanes.

## Fixed denominators

Every comparison must retain its original scan IDs and action side. A path is
`(scanId, action)`; domains are a separate count. Repeated scans do not become
additional independent domains. Freeze cohort boundaries, runtime revisions,
regions, eligibility flags and exclusions before counting outcomes.

Exclude ErgoVeritas canaries consistently from both periods, keeping the excluded
count separately. Preserve disabled/ineligible scans, failed scans, unknown
first-layer inventory and held targets in a coverage accounting table. Do not
silently remove them when a retained action packet or click is missing.

Report two distinct denominators:

1. All action-eligible scan/side pairs, including their coverage limitations.
2. Candidate paths with an observed first-layer Accept or Reject in the canonical
   persisted control assessment. Freeze membership when comparing the same
   historical cohort; disappearance of a control during replay does not remove
   that historical candidate.

Keep “no actionable control in this independent session” separate from a
proven discovery defect. A passive-session candidate does not prove an actionable
control existed in the action session. Neither an unknown inventory nor a safety
stop is automatically a false negative.

For each denominator report:

- No dispatch, with the retained discovery/safety/authorization/deadline reason.
- Dispatch with uncertain or failed click completion.
- Completed click, split by complete, partial or unavailable after-click capture.
- Semantic registration (confirmed/opposite/mixed/unconfirmed) separately.

A completed window with no request drops is an operational capture measure, not
proof that every evidence dimension is complete or eligible for findings. Use
canonical persisted eligibility for any “projectable evidence” metric. Useful
retained after-click findings remain valuable when registration is unconfirmed.

These historical counts must not be mixed:

| Cohort | Candidate paths | Meaning |
|---|---:|---|
| Original historical cohort | 220 (134 Accept, 86 Reject) | 132 dispatched; 88 did not |
| Broad local Ireland matched replay | 117 | Historical no-dispatch 86 -> replay 58; net reduction 32.6% |
| Final focused Ireland matched subset | 27 | Previous Ireland no-dispatch 25 -> final 20; net reduction 20% |

The final focused subset contains 14 domains, with 28 enabled action lanes but
only 27 matched historical candidates. Its two demonstrated label-proof fixes
must be distinguished from three additional clicks that returned across sessions.
None of these targeted replay percentages is a new production-wide error rate.

## Read-only production assessment after an approved deployment

First verify the serving web revision and scanner image parity through the
canonical AWS deployment process. Then inspect ordinary customer/scheduled scans;
do not create scans to fill a sample. Production DB inspection uses the canonical
ECS psql one-off boundary with bounded read-only queries.

Use equal UTC windows and report actual scan/candidate counts. Compare matching
runtime versions, feature eligibility, region and relevant CMP mix; mark mixed
versions or materially different cohorts explicitly. Report insufficient volume
without dropping available observations. Bind conclusions to verified persisted
projections, retained packet provenance and terminal lane timing metadata.

Measure completed-click rate, after-click capture coverage, reason distributions,
coordinator-observed action timing versus the passive barrier, and overall scan
latency. Keep capture time separate from materialization/handoff time and do not
sum overlapping browser lanes. Report p50/p95 with their sample sizes.

Reopen engineering work for a reproducible family of scanner failures, degraded
retained evidence, unexpected extra waiting, or a repeated decline under comparable
conditions. Do not tune to a target pass rate by weakening control safety,
exact-target authorization, semantic proof, or retained-evidence requirements.
False-positive/false-negative claims require evidence-based adjudication; click
rates and confirmation rates alone cannot establish them.

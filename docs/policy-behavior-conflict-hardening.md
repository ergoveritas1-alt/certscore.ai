# Policy Behavior Conflict Hardening

## Goal

Make `policy_behavior_conflict` fail closed unless contradiction-grade evidence is retained, while keeping the existing `WC01` flow:

1. normalize inputs into a concern
2. apply concern policy
3. promote eligible concerns into unified findings
4. let unified findings handle merge and presentation

## Design

### Structured contradiction evidence

`policy_behavior_conflict` now reads from a structured contradiction bundle with four sections:

- `policyAnchor`
- `runtimeAnchor`
- `conflictBridge`
- `evidenceSufficiency`

The bundle retains normalized claim types, runtime observation types, phase context, contradiction mapping, and review status.

### Promotion contract

Promotion now requires all of the following:

- fetched, specific policy anchor
- concrete runtime anchor with phase context
- approved contradiction mapping
- explicit bridge reasoning that supports promotion
- no insufficiency/meta-signal blockers

If any of those are missing, the concern remains internal or audit-only and carries explicit insufficiency flags.

### Reusable pattern

The same promotion-contract approach is now used to tighten other evidence-sensitive families:

- replay/runtime disclosure
- retargeting/runtime artifact findings
- rights-friction findings
- sensitive-data findings

The rule is consistent across families: permissive upstream detection is allowed, but promotion requires the family-specific evidence contract to be met.

## Schwab regression

The Schwab-style case now fails closed because detailed cookie and GPC language alone is not enough. Without a contradiction-grade runtime anchor and approved conflict bridge, the concern is downgraded to `insufficient_evidence_for_policy_behavior_conflict` rather than promoted as a contradiction.

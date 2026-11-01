# CertScore.ai category diagnostic states — October 30, 2026

Choice confirmation remains the higher priority after the bounded first-layer
and policy-evidence repairs. A reproducible stage-engine defect conflates
unresolved category evidence with unsupported structure: its legacy rule maps
every otherwise-unrecognized `category_*` reason to Unsupported. The existing
OneTrust applicability assessor returns `category_inputs_malformed` for missing
inputs; that observation cannot establish unsupported capability. Similar
unresolved private flags, missing required-universe prerequisites and invalid
proof must stay unknown.

Explicit `consent_action_stages.v2` interpretation now separates supported,
no-optional-category, explicit unsupported-structure and unknown observations.
Only the reviewed hierarchy, IAB, category-type and required-category-exclusion
diagnostic reasons establish Unsupported. Malformed/unresolved/invalid or future
unrecognized reasons stay Unknown. Different states in a reason inventory yield
Unknown with conflictingObservations, because a set of reasons cannot order
transient observations. A truncated inventory also stays Unknown. Distinct
supported reasons agree; repeated polling does not create conflicting states.

`consent_category_diagnostics.v1` is diagnosticOnly and explicitly sourced from
the retained reason inventory. Aggregate, initial and terminal assessments stay
separate. Missing phase inventories are null. Retained empty phase inventories
yield Unknown with an explicit truncation flag; they do not establish a checked
phase, missing CMP or absent category. Missing legacy truncation metadata stays
null. These diagnostics are independent of typed category-scope proof and do
not verify a decision, complete an observation or establish a runtime cause.

Legacy stage behavior remains available unchanged as the default v1 path for
existing benchmark consumers. Public confirmation explicitly opts into stage
v2 and emits `choice_confirmation_summary.v2` with its matching category
diagnostics. The public API continues reading v1 under its original meaning;
v1 cannot acquire the new field. OpenAPI documents the version-dependent
requirement. Pulse's local public projection advances to v8. This is an explicit
source/contract transition: historical series are not repinned or relabeled,
and audit adoption still requires its existing review/publication gate.

Focused tests reproduce the malformed-input reason through the existing
applicability assessor, verify unknown versus explicit unsupported structures,
mixed observations, truncation, missing/empty phases and both action paths.
Eight SHA-verified retained production/category packets are reused as positive
controls: their existing supported/no-optional results and all non-category
stages remain unchanged. They do not supply a production occurrence count for
the unresolved-input defect. The known registration/decision proof is not
reinterpreted from these diagnostic reasons. Retained owned receipt fixtures
remain separate from those production examples.

The shared canonical stage engine supplies API/Pulse output; no display-specific
state inference or scoring/findings path is added. Registration, category-scope
proof, terminal verification, notification acknowledgment and execution logic
are unchanged. No decoder, SDK read, action, model call, wait, capture limit or
scope change is introduced. Existing CMP rollout holds remain in place; this
repair does not demonstrate a production confirmation-rate gain.

Run `pnpm test:retained-audit-fixes` for the combined 40-file focused gate and
five typechecks, with immutable source/log-hash receipts. The pre-change stage
engine/public writer, source receipts and replay are retained for comparison.

Local paid usage is $0. Expected incremental deterministic interpretation and
bounded export metadata cost after a separately authorized deployment is below
$0.10/month at 100,000 scans with unchanged capture and retention. No public
visit, rescan, cloud task/query, model/API call, privacy action, deployment, flag,
service/capacity or paid-retention change is performed. Existing dashboard pins,
snapshots/latest, checkpoints, release state, schedule/model/reasoning/project,
budget and unique invocation accounting remain unchanged. No historical rewrite,
dashboard repinning/publication or production inventory completion is included.

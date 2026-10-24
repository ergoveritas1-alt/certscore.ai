# CertScore.ai presence-only reporting and six-worker capture

October 23, 2026. Local implementation authorized by the owner. No deployment,
operational flag change, live scan, external form, SDK diagnostic, or cloud read
was performed. Existing memory, time, request, action and spending caps remain.

## Implemented behavior

The independent CMP audit fallback now projects verified cookie expiry,
post-choice consent records, completed action activity and retained coverage
limitations even when neither an optional preference packet nor its lane outcome
exists. Valid core CMP inventory keeps its existing projection precedence;
configured cookie identities are not masked by the fallback. Missing optional
inspection leaves its criteria unassessed, without inventing absence or failure.
No scoring policy changes or historical report rewrites were made.

New source-verified California assessments may retain `privacy_choice_presence.v1`
inside their canonical persisted child. Positive link proof requires an observed,
visible, named, directly discovered link, consistent classification and an exact
original source-document URL. Guessed paths, hidden links, ambiguous labels,
secondary navigation, no-go captures and unverified source bundles cannot create
this claim. Each retained presence row must join the assessment's original
control and document. The child is bounded to 12 links and 8 KiB; exceeding that
bound trims optional presence rows without discarding the California assessment.

The new signal travels through persisted ConsentControlAssessment, normalized
concern, concern policy and unified finding. The existing technical finding ID
`targeted_advertising_choices_present` is preserved. An explicit sale/sharing
label produces the customer title **Sale/sharing opt-out link observed**.
The owner subsequently selected the first row of the expanded **California
coverage** signal snapshot for this observation, without an effectiveness label
or caveat. It remains score-neutral and visible without another lead finding,
using the confidence-and-coverage lane rather than a duplicate finding card.
The three customer labels are **Sale/sharing opt-out link observed**,
**Sale/sharing opt-out link not observed**, and **Sale/sharing opt-out link unknown**.
Not observed requires the existing eligible canonical absence finding backed by
complete inspection; missing, incomplete or suppressed evidence stays unknown.
The snapshot consumes canonical unified output and never infers absence from an
empty link list. Existing absence policy and score effects are unchanged.
Existing broken-destination findings remain independent. Generic Your Privacy
Choices and Cookie Settings do not become a sale/sharing claim; visible buttons
remain control observations in the workpaper rather than being called links.
Historical assessments without the new proof are not upgraded on read.

Both the web dispatch builder and durable validation-worker publisher now select
`presence_only_six_workers.v1` for new sharded payloads. The profile allows:

1. consent_proof
2. runtime_evidence
3. policy_evidence
4. gpc_observation
5. accept_observation, subject to its existing gate
6. reject_observation, subject to its existing gate

The coordinator remains an orchestration-only invocation, separate from these
six evidence workers. This is a maximum of six evidence-worker lanes, not a
claim of six total invocations including orchestration. GPC remains required
and separate. No browser work was moved into the coordinator or another lane.

The profile suppresses environment-based CMP auto-injection and rejects explicit
CMP preference, sale/sharing action and canary overrides. Parsing, coordinator
entry, direct worker invocation and optional-worker entry enforce it before
browser or external work. The profile participates in the parent dispatch hash,
propagates to workers and is recorded in the final manifest. Historical unmarked
payload readers and optional packet readers remain compatible.

## Retained evidence and what is lost

The offline replay verified SHA-256 and size for 341 retained bundles and their
341 manifests; one of the 342 original attempts had no retained bundle. Removing
only the optional preference packet and outcome now loses **zero independent
CMP facts**, fixing the 53-scan dependency found in the prior audit. Original
retained files were not modified.

The remaining optional-worker increment is five privacy-policy-link hit-target
reachability observations, all on `https://ergoveritas.com/test1.html`. No unique
category, service, cookie purpose/duration or California choice-control evidence
is lost in this retained cohort. This is a counterfactual replay, not a guarantee
of coverage on future sites. Elsewhere, an optional independent preference visit
could capture inventory or reachability that core lanes miss; those checks stay
unassessed when core evidence is insufficient.

The optional sale/sharing action worker is also excluded from new profile
payloads: dedicated opt-out execution, registration and before/after verification
are therefore not collected by that lane. Existing core Accept, Reject and GPC
checks and previously retained optional evidence remain available. ReadCube and
Gimbal initialization diagnostics are not resumed.

## Cost and approval boundary

No additional visit, worker, model call, wait, retry or resource-size change is
introduced. Presence metadata is at most 8 KiB per assessment. Planning estimate:
below $0.10/month additional retained metadata at 100,000 scans and 30-day
retention, within the existing shared $10 allowance inside $50. It uses existing
writes; this is not a fresh AWS billing measurement. Excluding optional workers
is expected to reduce compute, but exact savings are not asserted from retained
worker timings alone.

No additional approval is needed for these completed local changes. Activation
requires separate approval to deploy the compatible Lambda/coordinator plus both
dispatch producers and report consumers. A rollout must account for older queued
unmarked payloads and older Lambda code before claiming that all live dispatches
use six workers. No operational flag change is required for new profile payloads;
any flag changes or queue cancellation/draining actions require a separately
approved rollout plan. Live validation, re-enabling optional workers, expanding
actions, external forms, larger workers or higher budgets remain unapproved.

## Verification

Evidence and logs: `artifacts/presence-only-six-workers-2026-10-23/`.

- 376 reporting/dispatch/surfacing tests passed, then 68 CMP projector tests
  passed after the final valid-basic-precedence regression test (67 overlap).
- 25 selected offline coordinator/authorization/merge tests passed, including
  exactly six mocked worker invocations with both optional environment flags
  enabled in the isolated test process, with a terminal neutral Reject failure.
- Seven relevant rendered UI tests passed using the web React test configuration.
- Contracts, web, Lambda and validation-worker TypeScript checks passed.
- `git diff --check` passed. Existing unrelated working-tree changes are retained.
- The broader UI suite has an unrelated pre-existing export-menu failure:
  `advanced PDF downloads start with GDPR/ePrivacy while sharing and workpapers
  preserve focus` expects CSV/workpaper links absent from the current share menu.
  The failure log is retained; export behavior was not changed for this task.

### California snapshot refinement

Offline verification: 95 projection/surfacing/report-model tests and eight
selected rendered UI tests passed; web TypeScript and diff-whitespace checks
passed. Coverage includes all three labels, incomplete inspection, scan/document
mismatches, suppressed or unbound findings, coexistence with a broken-destination
finding, and canonical-only report model consumption. The unrelated export-menu
test described above remains outside the selected UI run. Logs are retained as
`snapshot-*.log` in the existing artifact directory.

This presentation refinement adds no recurring infrastructure, capture or storage
cost (estimated incremental $0/month), changes no worker count or scan budget,
and requires no further approval for local implementation. Deployment and live
validation remain outside the current authorization.

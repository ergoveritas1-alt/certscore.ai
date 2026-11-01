# CertScore.ai reconciled MCP and reliability release — November 1, 2026

The owner authorized committing and deploying all intended changes since the
last release, reconciling branches/worktrees into main, verifying production,
and deleting merged branches and unused worktrees while preserving unique work.
This authorization does not enable held campaigns, change scan budgets or
authorize historical report rewrites or customer scans as verification.

## Reconciliation

The initial live web revision was
`100fad0aeb5e6a827e5e34d4ccac0f082d702b72`, on the retained-audit release branch.
Local main was `36af63f4a1148fa24349e5e5ed606520400af459`; remote main was
`a5cd14addad4d191db8ff41bc0ca2fa0bdcdc98a`. The live branch contains both main
revisions and its three release/follow-up commits.

Inventory found 218 local files already identical to live, three older local
copies superseded by deployed fixes, and 38 files of additional intended work.
The isolated release checkout starts from live, keeps its later geometry/PDF
and regression-gate corrections, and incorporates the additional work. The
overlapping MCP test changes merge without conflict. Original working source
and reconciliation manifests are archived under
`/Users/benmasek/WC01/tmp/release-20261101-mcp/` before modifying main.

## Intended behavior

- Preserve the early-policy queue visibility lease under local concurrency
  saturation instead of immediately cycling a notification toward the DLQ.
- Publish supported dual posture scores from verified native starting-page
  document-response provenance. Keep canonical evidence/scoring and historical
  versions; do not republish historical reports.
- Make admin scan status agree with persisted report publication readiness and
  terminal publication failures.
- Preserve original anonymous creation/read/concurrency limits and 30-minute
  session expiry, with bounded one-pass LRU eviction selection.
- Offer optional free Hosted OAuth after two genuinely new scans, with bounded
  best-effort continuity across supplied conversation contexts. Offer the
  existing separate workspace allowance on shared daily-pool exhaustion.
- Forward the verified session hash through Pulse creation so admission and
  invitation reads use the same session key. Keep signed-header validation and
  shared IP/surface limits. Describe access to existing authorized workspace
  reports accurately; do not imply that public scans gain workspace ownership.
- Defer the extra escalating retry cooldowns. Keep existing quota denials,
  Retry-After instructions and safe aggregate offer-returned observability.

## Release gates and AWS scope

Use the repository-supported Node 22 runtime and frozen pnpm lockfile. Build
workspace package exports before clean-checkout tests. Run `preflight:all`
before committing and the full release gate on the final source. Record exact
source hashes, commit, command exit codes, log hashes and any failures; an
unresolved failed gate blocks promotion. Keep required CI checks enabled.

The affected consumers are public web/materializer, validation worker and
hosted MCP. The approved deploy-all path includes the Lambda primary/inventory
images in `eu-central-1`, `eu-west-1` and `us-west-1`, with consumer promotions
before producer promotion. Reuse existing runtime bases, build the scanner
application image once, and replicate/verify immutable digest parity. There is
no new migration; the normal web workflow still applies migrations from its
exact target image before ECS promotion. No separate DB deployment is needed.

The existing country/ASN databases were verified current before scanner work.
Primary scanner memory is already 3,008 MB in all three regions; the existing
preference/menu flags and `coverage_25_gb_seconds.v1` policy are already enabled.
Do not introduce a new budget, memory increase, campaign or feature rollout.

Normal canonical scanner verification includes three tiny artifact-only
runtime-evidence Web Bot Auth checks against its fixed verifier target, without
customer DB scans, model calls or finding integration. Retain their results
separately from customer activity. Other live verification is read-only health,
revision, contract/documentation and runtime/digest inspection.

## Cost and completion evidence

Estimated recurring increment for the newly added response/counting/logging
work remains below $0.05/month at 100,000 scans. No capacity, dependency,
retention-policy or model-usage increase is introduced. The existing deployment
workflows/build budgets and bounded image retention remain in place. The tiny
three-region synthetic verification is estimated below $0.05 one-time.

Release success requires exact target-SHA workflow results, live web revision
and ECS runtime target, affected ECS service health, all scanner image digests
and provenance, and read-only MCP behavior checks. Preserve validation receipts
and deployment timing outside the source commit. Remove the temporary release
worktree/branch only after all unique work is merged and runtime verification
has finished. The final main branch must be clean and match origin/main.

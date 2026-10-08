# October 7 evidence reporting release

This release brings the locally reviewed report changes into the public web,
hosted MCP, validation consumers and the existing three-region Lambda scanner.
The owner authorized committing and deploying all intended changes after local
verification. Historical retained evidence and scores are not backfilled.

## Included behavior

- Timelines use neutral colors for observations and red only for existing
  canonical concerns. Essential cookie snapshot presence does not claim a
  tracking write or compare timing between independent browser lanes.
- Reports, API v2, Pulse and MCP expose canonical form tallies including retained
  After Accept observations, and a reconciled explanation of existing score
  deductions. Reject-click and confirmed-refusal evidence keep their distinct
  verification states and existing scoring policy.
- Authorized API follow-ups retrieve retained form fields and masked screenshots
  through the existing ownership, read-quota and byte-verification checks.
- The form privacy-disclosure column is last. Same-document, same-form retained
  samples preserve an earlier observed disclosure when later capture adds
  fields. Both source inventories, capture timestamps and image hashes remain
  unchanged; no disclosure is borrowed from another form or the site policy.
- The CMS card presents declared core versions, distinct asset candidates and
  an informational plugin inventory. Hidden versions remain undetected rather
  than receiving a guessed version. One page-linked WordPress feed fallback is
  bounded to one second within the existing deadline.
- Source-bound policy extraction and narrow multilingual profiling-disclosure
  recognition use the shared evidence classifier and canonical concern/checklist
  pipeline. Profiling presence does not establish significant automated decisions
  or introduce a score deduction. Reject issue copy names retained vendors,
  activity counts and reliably anchored timing.

## Verification and operational scope

Run the canonical `preflight:all` gate and the changed regression files before
commit/push. AWS workflow checks remain enabled. Build the scanner image once,
reuse the runtime base, replicate it to `eu-central-1`, `eu-west-1` and
`us-west-1`, and verify immutable digest parity. Web-image migrations precede ECS
promotion. Verify the live web revision, affected existing report, screenshots,
API documentation and hosted MCP behavior after promotion.

There are no dependency changes, new browser lanes, model calls, score weights,
provisioned services or retention budgets. The bounded WordPress feed fallback's
up-to-$8/month estimate at 100,000 affected scans was explicitly approved.
Previously disclosed passive metadata and deterministic classification costs
remain below the $1/month approval threshold. The form-inventory reconciliation
and column move are cost-neutral. Deployment itself adds no recurring capacity.

WC01 has one active worktree and no outstanding local/remote feature branches.
WS01 has no pending source changes and is not a production scanner deployment
target. Preserve the existing archived SITS worktree and ignored local replay
artifacts; cleanup must not discard their unique work.

# After Accept click form screenshots — local readiness

Application source `25368601d263217c8081498285aebdfb5c3567b5` passed
`pnpm preflight:full` in an isolated managed checkout from October 10,
00:01:09 to 00:13:16 UTC (October 9 Pacific time). All 4,446 tracked source
entries matched the primary checkout. No gate was skipped or weakened, and the
running localhost build output was not overwritten. See the [verification receipt](2026-10-09-after-click-form-local-readiness.json).
This is a local gate result, not a CI receipt or production verification.

The [approved bounded capture](../after-accept-click-form-snapshots.md) now
retains up to two masked, safety-reviewed screenshots after completed Accept
clicks with unconfirmed registration. It preserves explicit after-click
provenance, the original deadline and score neutrality. A retrieval fix also
keeps original pixels available when document-bound terminal fields enrich the
form row; mismatched or altered provenance still fails closed.

Focused checks passed: 573 contract tests, 50 existing browser regressions,
four new browser tests, 19 projection/retrieval/export checks and 99 existing
report/API/MCP/SDK regressions. Contracts, scan-core and web typechecks passed.
The new browser fixture verifies capture, masking, withholding, a stalled
reviewer, navigation invalidation and shared report/API image delivery. Both
JPEGs were visually inspected. The safety classifier is stubbed in these
deterministic tests; this is not a fresh public-site yield measurement.

Conservative approved incremental cost: up to $20/month per 100,000 newly
affected scans. No new browser lane, invocation, retry or deadline extension.
No fresh public-site scan, deployment, SDK publication, live DB mutation or
Mac mini bot restart occurred. Existing reports cannot acquire images that were
not captured. Live-report browser interaction signoff remains outstanding, and
bot installation still needs authenticated host access. A later documentation
commit records this receipt without changing the tested application source.

## PR verification follow-up

Draft PR #208 exposed a developer-docs parity failure: the SDK page embedded
the previous canonical resource example. The follow-up changes only that code
sample to match the packaged example, including form counts and score deductions.
Developer-docs quality guards, the packaged SDK consumer smoke check and web
typechecking passed locally after the correction. The full gate above still
identifies its exact tested source; it is not relabeled as testing the later
documentation-page edit. CI must pass on the updated PR before release.

Read-only release planning confirmed web ECS plus the three approved Lambda
scanner regions, with existing runtime bases and no migration. Validation reads
and transfers the retained artifacts but does not consume the changed form
capture/projection behavior; the conservative file classifier alone does not
justify a validation deployment. Public npm still reported SDK 0.2.14 during
this check, so 0.2.15 publication remains separate and outstanding. The bot
installation is being handled by Codex on the Mac mini. No deployment or new
scan was performed in this follow-up.

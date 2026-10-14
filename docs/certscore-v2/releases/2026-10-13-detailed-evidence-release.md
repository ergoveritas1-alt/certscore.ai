# Detailed Evidence release preparation

Owner-authorized scope: release the Detailed Evidence presentation improvements and API/SDK/MCP parity, then verify the existing SITS report in production. The target web revision must descend from live revision `a9e7bf32867f5a99096cd4d32bf8c81115bece2b`.

## Scope

- Shared section titles, recaps and Review/Limited badges, responsive wrapping and existing compact evidence controls.
- Read-only `certscore.detailed-evidence.v1` presentation over the canonical report model, with all 13 CMP criteria, safe CMS/version evidence, correction guidance and shared-evidence links.
- API `section=cmp` and `section=cms`, unchanged access controls and bounded pagination/downloads.
- SDK 0.2.16 adds typed, snapshot-checked `getReportEvidence`; MCP 0.2.27 adds the selectors to OAuth and Light without enlarging compact bundle budgets.
- No assessment, canonical finding, score, scanner observation, persistence or migration change. No scanner or validation deployment is required: their runtime consumers do not import the changed presentation helpers. Conservative readiness classification still runs validation checks.

## Validation

Before release preparation, web TypeScript, focused projection/UI tests, API-contract tests (25), SDK tests (37), MCP tests (158), package builds and generated-contract drift checks passed. Local SITS website/API/SDK/MCP header parity was verified over saved scan `bbfba2aa-dd27-4a50-b4bf-c2087c662b5d`, retaining 13 criteria, two CMP review rows, two post-Reject HubSpot requests and 15 unmatched cookie names. These are historical local evidence counts, not claims about the newer production scan.

The release additionally requires change-aware readiness, package release guards, clean-checkout application build, exact-SHA AWS workflow checks, package publication checks and read-only production verification. Deployment outcomes and timings will be recorded separately after completion.

## Cost and verification limits

No extra scan, lane, timeout, browser visit, model call, retention period or provisioned capacity. Incremental evidence transfer/formatting is estimated below $1/month at 100,000 evidence reads (local full added fields: 33,763 bytes before deduplication); disclosed to the owner before proceeding and preapproved by the repository cost policy.

Verify existing production SITS scan `a68a5b3b-df92-429a-bbef-975aa2fdddf0`, preserving its saved assessments. This release does not authorize a fresh SITS contact or override the testing hold/cooldown. Public versus workspace evidence access must remain enforced.

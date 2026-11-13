# CertScore.ai Sanity production verification — November 13, 2026

Owner-authorized AWS release: `5f60fa0af3d8f53e822e574c1ec92c8c028f0971`.
Web version and scanner provenance match. All six regional workers retain their
previous operational settings, 3,008 MB memory and existing budgets. No SITS or
ergoveritas scan was run. The prior estimated receipt storage increment remains
below $0.50/month at 100,000 scans; no capacity or capture budget was increased.

All 38 local preflight groups passed. The unchanged web CI form fixture passed
on retry after an initial timing failure; validation and MCP workflows passed.
Local timed fixtures also needed reruns after host sleep. No assertions or
budgets were relaxed to pass those retries.

- Web: https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/43462411992
- Validation: https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/43462411904
- MCP: https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/43462412190

Final resumed deploy took 7m14s: image preparation 30.3s alongside consumer work,
web stage 5m22s (longest resumed stage), worker promotion 1m28s. Validation had
already completed in 11m44s during the first attempt and was reused. The resumed
full local gate took 690.9s with its first 34 groups reused, followed by a 120.7s
change-aware deploy gate. These are attempt timings, not total elapsed release time.

One fresh production scan of https://sanity.io/ was created at
2026-11-13T16:45:46.173Z and completed at 16:46:22.573Z:
https://certscore.ai/scan/7485b83f-b2e8-4335-87a0-1af72f502b18

The database report projection is ready. Both actions are
`succeeded_with_confirmation`, with completed clicks and observation windows.
Both exact packet bytes match their recorded SHA-256 and lengths. Fresh
`osano_complete_cookie_receipt.v1` evidence establishes granted optional
categories for Accept and denied optional categories for Reject despite duplicate
Osano instances. Accept packet duration is 17,719 ms (confirmation 783 ms);
Reject is 20,638 ms (confirmation 72 ms, observation 8,004 ms). Neither lane
added a wait after the passive barrier. These are packet durations, not whole
report times. The full capture took 36.4 seconds.

The report retains six forms: four pre-consent and two after Accept. Both
post-Accept images and one pre-consent image were downloaded successfully from
production report endpoints, decoded as 326×400 JPEGs and visually inspected
(the two post-Accept images). After-Accept image SHA-256 values:

- `eb6245471e74516c9e3163e6c24ba9f55ad4c72125709d29142564e010beacb1`
- `4665452fa896cefbcef77298b7c95cc7c07d43c9a3a9baccb0d960d72805718e`

The overall public outcome remains `completed_limited`: accessibility coverage
is incomplete, form inventory is bounded, and three pre-consent images explicitly
report `capture_budget_exhausted`. The first post-Accept crop includes a residual
cookie notice from the page; confirmation is based on verified storage receipts,
not an assertion that every duplicate banner disappeared. No absence-of-tracking
or comprehensive form coverage is inferred.

The canonical contact ledger records this single authorized verification under
`sanity-production-release-20261113`. Detailed local receipts, packets and image
checks are retained under `artifacts/sanity-production-release-20261113/`.

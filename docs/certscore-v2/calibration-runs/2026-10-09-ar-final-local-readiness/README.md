# Final local Accept/Reject release checks

October 9, 2026. No deployment or implementation changes in this verification cycle.

`pnpm preflight:full` passed in an isolated clean checkout containing the complete working candidate, including workspace builds/typechecks, consent/action contracts, canonical projection parity and post-refusal gates. The additional focused passive-evidence suite passed **77/77 tests**. Avoid summing overlapping preflight suites into a unique test count.

The tested private snapshot is `39051fc1520819f56fc95ab60e2709e347ccf211`, based on branch HEAD `576e9902`. Its sorted source manifest covers 4,415 files, aggregate SHA-256 `933ad3042aae7f7c1e2dae9397e3828016bdd704c3cfaf2b6c11b4bfdd2c825d`. Every recorded file matched both the primary working tree and isolated checkout after testing. The primary localhost server and its build output remained intact. This snapshot is not a released revision or a CI typecheck receipt; keep required exact-commit CI checks for the eventual release.

## Fresh full reports

Each target ran once through localhost intake, six independent simulated DAG worker lanes, verified retained artifacts, canonical assessment/policy, persisted projection, real status polling and report export. All eighteen lanes completed and joined. All three canonical bundles validated, and all 107 mirrored artifacts matched their retained sizes and hashes. Every scan published once.

| Target | Score | Accept | Reject | Forms | Scanner completion → persisted projection |
| --- | ---: | --- | --- | --- | ---: |
| [Owned clean-Refusal canary](http://localhost:3000/scan/8999c43a-8039-4bce-8d5a-9d827ff99e08) | 84 | Confirmed, 5 eligible observations | Confirmed clean | 0 | 1.219s |
| [Owned tracking-Refusal canary](http://localhost:3000/scan/31744da2-8406-42ea-bd2b-b5990e982d33) | 69 | Completed click/capture; registration unconfirmed | Confirmed, 6 eligible observations | 0 | 0.425s |
| [Termly form canary](http://localhost:3000/scan/79929c2f-58d8-4baa-8d02-0b16798fd1ee) | 87 | Confirmed clean | Confirmed clean | 1 before consent + 1 after Accept | 1.409s |

Scores and deduction families match the previous owned full-flow results. Both ErgoVeritas canaries retain 8 storage + 8 tracking points; only the confirmed tracking-Refusal canary receives the additional **15 post-Reject points**. Its unconfirmed Accept retains four after-click requests and three instrumented writes, remains nonprojectable as confirmed acceptance, and does not create a confirmed post-Accept verdict. Termly retains 8 storage + 5 embed points; neither clean action path adds a deduction.

Report, API v2 resource and MCP summary **builders** agree on score, score explanation and forms summary. This is not authenticated external API/MCP transport verification. The browser shows both action timeline buttons and their respective events, including the after-Accept form event. Browser-local time resolves to PDT after hydration.

Termly retains the same seven-field form in two phases; these are **two observations, not two established distinct forms**. Both masked JPEG endpoints returned 200, valid JPEG bytes and hashes matching retained images. Both were visually reviewed, and the after-Accept modal loads in the browser. Its after-Accept form summary is now retained/captured rather than the earlier limited state. Form privacy disclosure is not captured in these rows; no disclosure is inferred from policy discovery. That is preserved evidence scope, not proof of absence.

Luna independently reviewed these retained results against the prior three local reports and found no blocking score, action-semantic or form-evidence regression. This is model-assisted review, not human-adjudicated accuracy or a population reliability estimate. Local California egress with EU-DE configuration does not establish production regional latency. The reported handoff times are persisted projection timing, not final browser rendering or a causal speedup comparison.

## Publication race and operational checks

The localhost concurrency diagnostic uses four independent HTTP processes, real local PostgreSQL advisory locks, actual handlers and retained artifact replay. With 24 concurrent status polls, the historical path reproduced worker HTTP 503; the current path returned worker 200, reused two transferred artifacts and published exactly once. Active-owner protection, expired/missing/failed-owner recovery and incomplete-evidence fail-closed cases passed. Two initial harness failures were corrected only in the artifact harness: `.mts` namespace interop and the child process's missing TSX loader. Production code and assertions were not relaxed.

The read-only deployment plan compared the tested snapshot with live ECS/Fargate revision `9b7c9a81630abe51c1608c88e7f0ed3f7bce8386`. The snapshot contains that revision and fetched origin/main. The plan selects web, validation and scanners in all three approved regions; no database migration changed. No push, workflow or deployment ran. No browser/runtime-base rebuild was requested. Eventual release still requires the clean committed source, current live-revision check, runtime consumer/base review and required CI checks.

## Contact bookkeeping and retained artifacts

Canonical registry validation, repository holds, fresh central history and canonical selection preceded contact. The existing owner's explicit cooldown waiver was used; no SITS contact or automatic retry occurred. Three parent full-scan contacts (eighteen lane sessions) were centrally persisted with idempotent run key `ar-final-release-readiness-20261009`.

The generated extended canary ledger is retained here as `owned-canary-ledger.json`: exactly the three attempted target entries change and all other 51 entries are preserved. It does not replace or broaden the canonical public inventory. This reviewed candidate and verification record are committed separately from the preexisting dirty implementation work, before further public calibration.

Detailed logs, source manifest/patch, per-scan exports, assertions, images and the concurrency receipt remain in `artifacts/ar-final-release-readiness-20261009/`. The private clean-checkout snapshot is preserved through the managed worktree archive. No recurring cost change was introduced. Estimated one-time contact bookkeeping and existing diagnostic policy-review usage is **under $0.50**, disclosed before execution.

Remaining limits: the earlier failed live-pair timing outliers remain unexplained; the passing ten-site pair sample has only one site with actionable A/R controls. These local checks do not establish a fleet success rate or production verification. The implementation remains on the working branch and has not been deployed.

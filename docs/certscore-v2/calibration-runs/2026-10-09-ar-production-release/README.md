# Accept/Reject production release verification

October 9, 2026. Production deployment and three fresh full-scan canaries completed.

## Released source and readiness

`d26865415100bcf3dc98a9084fada057dfc6a570` contains the intended consent/action evidence, report, API and latency work and was fast-forwarded into main. Its exact clean checkout passed `pnpm preflight:full`; all 4,420 source-manifest entries matched the tested checkout and primary repository. The full-gate log SHA-256 is `5b2a842d8dd30f864c3027ecb66831ab52179fb03fb5dbdf4e54d05d9a512ee0`.

The specialized regulatory CI configuration then exposed nullable CMS plugin `flatMap` inference. `233f175e619d0c22fbdcb64339c714fa9d70f3f8` supplies the explicit result type. Emitted JavaScript is identical; `pnpm preflight:all`, the exact regulatory typecheck and 13 CMS regression tests passed.

Docker Hub anonymous pull limits blocked initial web/validation builds before ECS promotion. `803173db229810f977153cc8aa7637effbfe4358` uses digest-pinned official public ECR Node/PostgreSQL mirrors in the canonical AWS workflows. Upstream and mirror manifest bytes match. Both architecture BuildKit smoke checks, workflow YAML checks and nine deployment-contract tests passed. Application source and runtime-base inputs are unchanged from the tested application commit. No CI typecheck receipt was fabricated and required workflow gates remained enabled.

Live web, materializer and validation run `803173db`. All three regional Lambda scanner images run `d2686541`, with digest `sha256:78868e805093b50133288a416160ca7c092bcc26cbae8168c73734e693ac4979`. The later type-only and build-workflow corrections do not change scanner runtime. The scanner image was built once, replicated, and verified in eu-central-1, eu-west-1 and us-west-1. Chromium/runtime bases were reused. The disabled scheduler remains disabled; unaffected MCP runtime was not rebuilt.

## Deployment timing

| Workflow | Result | Measured stages |
| --- | --- | --- |
| [Public web AWS ECS](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/37991547245) | Success; helper 11m 5s | Web typecheck 65s; image build/cache/push 267s; target-image migrations 58s; ECS stabilization 185s |
| [Validation AWS](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/37991547253) | Success; helper 7m 45s | Typecheck 44s; image build/cache/push 144s; ECS stabilization 215s |
| [Regulatory corpus](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/37991607637) | Success | Exact final build-workflow revision |

The scanner phase completed in 3m 24s during the initial deployment. Final web and validation deployments ran concurrently, reused runtime bases, and retained registry cache publication. These are observed stage durations, not a controlled deployment-speed comparison. Initial failures and their logs remain preserved.

Read-only ECS verification confirmed one completed deployment per enabled service, desired/running task parity, no pending tasks and the expected revision in every running container. The public production metadata agrees with the web revision.

## Fresh production reports

Each target ran once through production intake, six independent Lambda lanes, retained artifact verification, canonical assessment/policy, persisted projection, real polling and export. All eighteen lanes completed and joined. Each scan has exactly one result-received event and one unified derivation, with completed materialization. Original manifest, evidence bundle and both action packets passed retained byte/hash/schema verification.

| Report | Score | Accept | Reject | Request → client ready | Scanner completion → persisted report |
| --- | ---: | --- | --- | ---: | ---: |
| [Clean Reject canary](https://certscore.ai/scan/2651b7c8-3c21-49df-ae15-5d3ba1cf79d8) | 84 | Confirmed; 4 eligible comparison observations | Confirmed clean; no deduction | 26.338s | 4.091s |
| [Tracking Reject canary](https://certscore.ai/scan/58124a87-bfca-4607-a7f4-b5afcb2b7a8c) | 69 | Completed click/capture; registration unconfirmed | Confirmed; 4 eligible observations; 15-point deduction | 16.552s | 4.343s |
| [Termly form canary](https://certscore.ai/scan/5049609a-c668-4993-8e20-ec1fdfbaa6b9) | 87 | Confirmed clean | Confirmed clean | 27.424s | 6.010s |

Both ErgoVeritas reports retain 8 storage + 8 tracking points. Only confirmed tracking after Reject adds 15 points. The unconfirmed Accept retains three after-click requests and three writes without inventing successful semantic registration or a confirmed-Accept deduction. Termly retains 8 storage + 5 embed points. Ordinary post-Accept comparison activity is score-neutral.

The actual public API v2 and live MCP Light `certscore_get_scan_bundle` transport agree on score, score explanation and forms summary for all three reports. Private authenticated API/MCP credential modes were not exercised. This supplements the earlier localhost summary-builder parity check.

Termly shows two observations of the same apparent form: one before consent and one after Accept, not two established distinct forms. Both masked JPEG endpoints returned HTTP 200 with valid image bytes and matching retained hashes, and both images were visually inspected. Form field evidence follow-up and download endpoints also returned 200. No form was submitted. Privacy disclosure remains Not captured in both rows; no disclosure was inferred from generic policy discovery.

## Unresolved verification limits

- Termly's after-Accept row projects three typed fields from the earlier screenshot-associated inventory. The independently retained terminal structured form capture contains seven fields, as do the pre-consent row and visible screenshot. The shared projection currently prefers the image inventory and suppresses the main-frame structured row. These capture records have distinct session/document provenance. Reconciling them requires a verified upstream identity mapping, not copying fields from pixels or silently treating the two captures as identical. This release does not resolve that field-count mismatch.
- The production report initially rendered with both action timeline controls and both View form controls in the in-app browser. The browser then crashed before interactive checks completed and exposed a blocked crash-page URL. No reload, alternate-browser workaround or bypass was attempted. Production post-hydration timeline interaction, image-modal behavior and local-time rendering are therefore not verified in this cycle; the earlier localhost interaction checks passed.
- Production scanner-to-report time is 4.1–6.0 seconds here, versus 0.4–1.4 seconds in the previous local three-canary run. Delivery contributes 1.1–1.8 seconds and result-to-projection 3.0–4.2 seconds. These runs do not establish a causal latency improvement or fleet reliability rate. Earlier live-pair timing outliers remain unexplained.

## Contact bookkeeping, cost and cleanup

Canonical registry validation, repository hold checks, fresh central history and canonical selection preceded contact. The owner's explicit repeat-scan/cooldown waiver applied. No SITS diagnostic contact or retry occurred. Three parent contacts, representing eighteen lane sessions, were centrally persisted with idempotent run key `ar-production-release-20261009`.

The reviewed `owned-canary-ledger.json` changes exactly those three attempted entries; the other 51 entries match the committed local-readiness ledger. This scoped ledger does not replace or broaden the public inventory.

All intended source is on main. The fully merged `codex/cmp-consent-event-evidence` branch was safely deleted; the remote contains only main. Only the primary checkout remains active; four unused managed worktrees were archived recoverably, preserving unique snapshots and local verification work. Existing unreachable-object maintenance warnings were not resolved by destructive pruning. Build cache/base tags and ignored diagnostic artifacts remain preserved.

No new recurring diagnostic or infrastructure cost was introduced. Existing approved runtime behavior is unchanged by the deployment corrections. The disclosed one-time production verification/contact-bookkeeping estimate is under $0.50. Detailed logs, originals, screenshots and verification scripts remain in `artifacts/ar-production-release-20261009/`; sanitized receipts are committed alongside this record. This documentation-only record does not require another runtime deployment.

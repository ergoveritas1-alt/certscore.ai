# CertScore.ai release and fresh post-Reject proof verification — October 22, 2026

Production application release: `c41c7848bf93d48abe356c1c3ccc5d83fb625305`.
Tested source tree: `c2c2ed9c24c096d4a4ad8515e84861ac4f285d1a`.
This operational record and the resulting calibration ledger are a documentation-only
follow-up; they do not change the deployed application source.

## Deployment

All intended source changes were committed, merged into main and pushed. Public
web/materializer, validation and hosted MCP deployments completed before scanner
producer deployment:

- [Public web AWS deployment](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/39734027524)
- [Validation AWS deployment](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/39734051433)
- [Hosted MCP AWS deployment](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/39734027562)

Live `/api/version` reports the release SHA and `ecs-fargate`. All four ECS
services were stable on release images. All six scanner functions in
`us-west-1`, `eu-central-1` and `eu-west-1` were active with successful updates
and one image digest:

`sha256:248255b0c054cee94545e9e251d8c407c64027c7e2c9da995747194a22aafcf8`.

Scanner deployment used the repository helper, one build, the existing Chromium
runtime base and regional replication. It took 4m10s. From consumer workflow
creation at 06:27:17 UTC to final production verification at approximately
06:44:58 UTC, deployment took approximately 17m41s, excluding local readiness.
Web image build/push took 5m06s, exact-image migrations 54s and stability wait
3m04s. Validation rebuilt its dependency-changed runtime base in 2m59s, built
the application image in 45s and waited 3m36s for stability. MCP image build/push
took 1m33s and service promotion 2m34s. These stages overlapped.

The automatic validation run was canceled during checkout, before image build,
and replaced by the exact-SHA manual run with the required runtime-base rebuild.
The MCP immutable release-tag promotion now verifies the source digest and
accepts an already-identical destination tag; image scanning and health gates
remain enforced.

## Readiness and production verification

- Full clean-checkout deploy-all preflight: 3,788 tests, 3,787 passed, zero failed,
  one existing environment-gated PostgreSQL integration skip.
- Isolated application build: all 19 targets passed.
- Focused proof, cap, contract, API/SDK and report checks: 844 passed.
- MCP promotion helper: three regression tests passed.
- Regional scanner navigation/bot-auth checks passed in all three regions.
- Initial development-checkout failures were stale compiled package outputs;
  prerequisites were rebuilt and the entire clean-checkout gate passed. No gate
  was waived.
- Fresh retained packet replay matched persisted California post-Reject
  assessments, canonical findings and exported scores across all 47 attempts.
- Production Admin verified Ovid EU 64, CA 85, GPC# 1, Rej# 2 and GPP# 0.

## Fresh cohort results

The owner authorized one fresh attempt for each of the frozen 47 source scans:
38 domains, 42 distinct target URLs. Original target URLs, region, profile and
page limits were preserved. Maximum cohort concurrency was three, with the same
hostname serialized. No scan retries were added. A copied historical client
request ID stopped initial queuing after 34 creations; fresh request IDs fixed
the queue, and only the missing 13 were created on resumption.

All 47 attempts completed and all 47 report projections became ready. There
were **38 usable reports with both EU and CA scores**, and nine corroborated
No-go visits: five access-denied pages, one blank/unusable page, one 404, one
authentication gate and one CAPTCHA/challenge. These nine were not assigned
scores for representative site visits that did not occur.

**Zero additional California post-Reject deductions qualify in the fresh
cohort.** The counterfactual removes only the canonical California post-Reject
finding from each same-scan score, preserving shared-recipient GPC deduplication.

Four bounded California request proofs were retained, all with complete header
inspection: three SITS HubSpot GETs and one Ovid LinkedIn `/wa/` POST. HubSpot
requests did not establish qualifying sale/sharing collection. The Ovid POST
completed with HTTP 204 and retained body-hash and full-header evidence, but its
body format was unsupported and no qualifying advertising identifier was
established. Consequently, the public cohort contains **zero fully inspected
supported POST bodies** and zero advertising-cookie proof requests. Supported
POST parsing was verified in a fully intercepted local Chromium fixture; the
fresh public cohort does not independently demonstrate that case.

The existing canonical EU Reject family applied to SITS (20 points, HubSpot and
LinkedIn), Ovid (20 points, LinkedIn and Google) and Empires & Puzzles (15 points,
RTB House). Canonical score inputs contained the Reject finding in each case.
These internal scoring diagnostics are not customer-report deduction copy.

## Limits, cost and cleanup

No Options/Manage controls or preference-opening SDK calls were executed. CMP
packets were passive. The separate sale/sharing opt-out panel-opening lane was
disabled for this cohort only; global production rollout flags were preserved.
GPC and Reject remained enabled. Memory, timeouts, capture caps, provisioned
capacity and retention periods were unchanged. Incremental bounded proof
metadata storage is estimated below $0.50/month at 100,000 scans; no additional
browser lane or model call was introduced.

Ovid's unsupported body format remains an evidence limitation. A retained hash
cannot reconstruct its missing body fields. Supporting that format requires
bounded format diagnostics and a decoder validated against fresh proof before
any additional California qualification. Unsupported evidence remains neutral.

Two parallel report-export reads returned transient HTTP 502 responses. Read-only
serial retrieval recovered both, and all 47 exports were verified. ECS services
were healthy with zero failed tasks; the cause of those transient errors remains
unconfirmed. No scans were rerun to recover exports.

The merged feature branch was deleted and the temporary release worktree was
archived with recovery preserved. WS01 remains clean and synchronized; its two
unrelated stashes and existing Git recovery objects were preserved. No WS01
production scanner service was deployed. The cohort's generated calibration
ledger records contacts/cooldowns without adding public targets to the rotating
selection manifest or clearing permanent holds.

Detailed local evidence is retained under
`artifacts/release-ca-reject-proof-2026-10-22/`, including per-scan results,
verified artifact hashes, the production receipt and readiness logs. Request
headers and raw evidence are not included in this operational note.

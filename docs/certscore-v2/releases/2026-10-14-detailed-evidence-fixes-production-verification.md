# Detailed Evidence fixes — production verification

Owner-authorized release completed October 14, 2026. Source: `94399fef7c45f348ef27da535198f783670f61f2`, a forward deployment from `959292e886c814b651c14f633ef15052dd3ab89b`.

## Deployment and packages

| Surface | Successful release | Job duration |
| --- | --- | --- |
| AWS public web | [Workflow](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/38582380489) | 10m 11s |
| AWS hosted MCP 0.2.28 | [Workflow](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/38582405929) | 7m 2s |
| SDK 0.2.17 | [npm publication](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/38582415085) | 37s |
| MCP npm 0.2.28 | [npm publication](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/38582416773) | 1m 2s |

The canonical web helper completed in 10m 27s, including workflow monitoring and final deployment/pathway audits. `/api/version` confirms the exact source and `ecs-fargate`. Web task definition 727, materializer 290 and isolated MCP 173 each reached one completed deployment, with running count equal to desired count and no pending tasks. All three image references contain the release SHA; CPU and memory match their preceding task definitions. The web workflow reused its unchanged runtime base and registry cache. Scanner and validation runtimes were not deployed. No new migration was added; the required exact-image migration check passed before ECS promotion.

## Production verification

Verification reused four saved reports, without requesting a new scan or contacting their target websites:

| Saved report | Scan ID | Score | Canonical findings |
| --- | --- | ---: | ---: |
| MiniMax | `50620d0a-abd3-4399-8a09-39207ac8df79` | 100 | 0 |
| AdPushup | `3165a11c-2756-4ff2-b07a-61c8940d5d8a` | 39 | 5 |
| Limited-evidence ErgoVeritas canary | `9ba99a8c-b1ad-44c1-985f-92cef760ab40` | 92 | 1 |
| SITS | `a68a5b3b-df92-429a-bbef-975aa2fdddf0` | 82 | 2 |

- The previously failing full hosted MCP bundle now validates, retains all 80 string GPC proof IDs, and returns 47,408 bytes under the requested 100,000-byte budget. No typed comparison was shortened or replaced with a truncation marker.
- California privacy choices and notices match across direct API downloads, the freshly installed published SDK and hosted MCP Light. Verified controls, unverified candidates, notice passages and provenance remain distinct. California reports contain the matching shared section; the EU canary does not acquire one. Source policy rows, scores and findings equal their saved originals.
- Hosted Light retains four tools and its 25,000-byte response ceiling. Oversized detail is still explicitly omitted. The authenticated/anonymous full catalog retains 14 tools.
- SITS CMP and policy sections match direct SDK reads and authenticated hosted MCP. All 13 CMP criteria and their supporting evidence equal the pre-deploy snapshot. Its canonical consent, policy, GPC, accessibility and action assessments are unchanged. Unauthenticated Light still denies its workspace-owned evidence.
- SITS and MiniMax website section titles and recaps match the updated API sections. SITS retains nine boxes; MiniMax has eight, including California privacy choices. Legacy boilerplate is simplified in display summaries while original evidence remains retained.

SITS verification used a ten-minute, read-only operational credential bound to its existing organization. Its scope came from the already-retained operational scope-check log, avoiding a new database task. The signing material and bearer token remained in process memory; no persistent API key, grant or credential file was created.

## Readiness and limitations

The exact release passed change-aware readiness with 1,967 tests and zero failures, focused presentation/export/layout tests (25), generated-contract drift checks and MCP release guards. An isolated clean checkout passed frozen-lockfile installation, 14 package builds and the full Next production build without overwriting the localhost preview. The temporary checkout was submitted for archival after verification.

Fresh public-registry consumers installed SDK 0.2.17 and MCP 0.2.28. Strict standalone TypeScript compiled the privacy evidence contract. The published MCP bundle passed offline full/Light protocol tests against the saved 80-ID report. Both registry records have the release `gitHead` and provenance attestations. npm metadata propagation briefly delayed installation; no duplicate publication was attempted. The Mac/Homebrew artifact was not republished.

Final live deployment and pathway audits passed. The only audit warning is the intentionally unconfigured secondary host. Browser verification here checked deployed desktop content and shared header parity; this follow-up does not claim a new mobile visual pass.

Safe receipts, workflow step timings, registry provenance metadata, pre/post SITS exports, API/SDK/MCP comparisons and task-image metadata are retained locally under `artifacts/detailed-evidence-fixes-release-20261014/` in the primary checkout.

## Cost

No additional scanner wait, lane, model call, retention period, provisioned capacity or recurring scanner/model/infrastructure cost. Existing response ceilings remain unchanged. Incremental on-demand formatting/transfer is estimated below $1/month at 100,000 evidence reads, as disclosed before release and preapproved by repository policy. One-time read-only operational authentication/log/API checks are estimated below $0.01; no database task was launched. These are estimates, not measured production billing or scanner-latency improvements.

# Detailed Evidence production verification

Released October 13, 2026 PDT (October 14 UTC), explicitly authorized by the owner. Application and package source: `959292e886c814b651c14f633ef15052dd3ab89b`, a descendant of the previous live revision `a9e7bf32867f5a99096cd4d32bf8c81115bece2b`.

## Deployment and publication

| Surface | Release evidence | Duration |
| --- | --- | --- |
| AWS public web | [Successful workflow](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/38511533581) | 11m 32s |
| AWS hosted MCP 0.2.27 | [Successful workflow](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/38511708705) | 7m 9s |
| SDK 0.2.16 | [Successful publication](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/38512127832) | 46s |
| MCP npm 0.2.27 | [Successful publication](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/38512127820) | 63s |

Production `/api/version` confirms the exact source above and `ecs-fargate`. Web task definition 726, the existing materializer task definition 289, and isolated MCP task definition 172 all reached a single completed deployment with running count equal to desired count and no pending tasks. Image references retain the exact release SHA. No scanner or validation service was deployed, and no infrastructure/capacity or database migration was added. The canonical web workflow's exact-image migration check succeeded before ECS promotion.

The web image stage took 254 seconds; required web typecheck took 68 seconds; exact-image migration checking took 50 seconds; ECS stabilization took 200 seconds. Local canonical deployment readiness took approximately two minutes, with total helper wall time 13m 39s including workflow discovery/monitoring and final live audits. Hosted MCP source checks took 92 seconds and image build/push 94 seconds. These are measured release timings, not claims of a scanner speed improvement.

Both npm versions propagated after publication. A fresh public-registry consumer installed both packages, verified new SDK exports, compiled strict standalone TypeScript use of the typed CMP/CMS selectors and reconstructed evidence document, and checked full/Light tool catalogs from the published MCP bundle. Registry `gitHead` matches the release SHA for both, and signed provenance attestations are present. The separate Mac/Homebrew artifact was not republished.

## Production SITS evidence

Used existing [SITS scan a68a5b3b](https://certscore.ai/scan/a68a5b3b-df92-429a-bbef-975aa2fdddf0#cmp-details), captured October 14 at 02:49:59 UTC from EU-Germany against `https://sits.com/en/`. No fresh contact, scan, model call or report regeneration was performed.

Before/after comparisons passed for the canonical exported assessments, controls, action paths, GPC result, accessibility evidence, score and canonical findings. Score remains 82. The same three first-layer controls are Observed; the same two canonical findings remain. No assessment was upgraded to improve presentation.

The public SDK read the deployed API and reconstructed all sections. Authenticated hosted MCP independently read CMP, CMS and policy sections and reconstructed values equal to direct SDK/API reads. All nine website headers (title, recap and badge) equal the shared API/SDK presentation. The CMP projection retains source hash `fnv1a-031c8ad9` and 13 unique criteria: 11 Observed and two Review outcomes. Prominence remains Observed, with retained Accept 528×45, Reject 528×49 geometry and 434 ms capture skew. The two Review criteria retain post-Reject activity and seven unmatched cookie names against 36 CMP declaration patterns.

There are eight eligible post-Reject observations in the canonical export and five retained request examples in CMP Details. The example list is a bounded source sample, not the observation total. All counts and evidence are preserved; this release does not invent the other examples. The production scan differs from the older localhost scan that had two HubSpot requests and 15 unmatched names.

The scan is workspace-owned. Its API export succeeds with a short-lived, read-only operational credential; no persistent API key or grant was created. Unauthenticated API and Light access remain denied. Light's new selectors were separately exercised against its explicitly labeled retained public connection-test example; that example was not represented as SITS and was not rescanned. Hosted MCP has the expected 14 authenticated and four Light tools.

## Visual and release checks

- Exact-commit change-aware readiness: 1,967 tests passed, zero failures; affected typechecks and validation pipeline checks passed.
- Separate API contracts: 25 tests; SDK: 37; MCP: 158; focused presentation/projection tests passed.
- MCP release drift guards, generated public contract drift check and standalone SDK packaging checks passed.
- Isolated clean checkout: frozen-lockfile installation, 14 workspace package builds and full Next application build passed, with no overwrite of the running localhost preview.
- Desktop 1280px: all nine boxes wrap correctly and the extra box remains in the left column.
- Mobile 390px: page scroll width remains 390px with expanded CMP and policy boxes, compact icon controls and the retained policy passage dialog. No correction control appears on the observed prominence/retention examples; the Review criterion retains Correction steps. Evidence navigation opens its destination; expanded outlines clear on collapse.
- Live deployment/pathway audits passed. Their only warning is the intentionally unconfigured secondary host, whose runtime audit was skipped.

Safe verification receipts, pre/post exports, workflow step timings, package integrity/provenance metadata, ECS status and desktop/mobile screenshots are retained locally under `artifacts/detailed-evidence-production-release/`. Operational credentials were kept in process memory and are absent from receipts.

## Cost

No additional scanner latency, lanes, model usage, retention periods or provisioned capacity. Estimated incremental transfer/formatting remains below $1/month at 100,000 on-demand evidence reads, disclosed and preapproved by repository policy. The one-time read-only production database scope check is estimated below $0.01. Existing bounded read/session telemetry remains in effect.

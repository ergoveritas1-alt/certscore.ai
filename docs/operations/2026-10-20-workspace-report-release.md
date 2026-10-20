# CertScore.ai workspace branding and PDF report release

Advanced users and platform admins can configure a workspace logo and a white or black report header, and download the visual GDPR/ePrivacy PDF report. The executive summary includes the canonical CertScore.ai score, site assessment, severity chart, priority actions, and topic visuals. All eight appendices use Topic overview, Fixes and verification, Detailed evidence, and Sources and workpaper.

The production-data verification exposed two PDF presentation issues that the illustrative previews did not cover. Follow-up commit `d23a845b53e4783fb91036756d061487d12fe61d` gives canonical finding identity/category ownership precedence over broad legacy family context, honors existing audit-only/support decisions, uses readable and deduplicated repair locations, and keeps encoded evidence packets in the linked JSON workpaper. Typed appendix tables retain the readable evidence. Continued repair pages identify the action being continued. No normalized concern, finding, evidence packet, scoring policy, or persisted result changed.

## Production revisions and workflow results

| Runtime | Revision | Result |
| --- | --- | --- |
| Public web, `https://certscore.ai`, ECS/Fargate | `d23a845b53e4783fb91036756d061487d12fe61d` | [Final web workflow](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/39487079204) succeeded; exact public revision verified |
| Validation worker | `843c3d13991d678f43a066ad7d45db076af6dfcb` | [Validation workflow](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/39483559180) succeeded; current image digest and recent heartbeat verified |
| Lambda primary and inventory functions in `eu-central-1`, `eu-west-1`, and `us-west-1` | `843c3d13991d678f43a066ad7d45db076af6dfcb` | All six functions Active/Successful; regional digest parity and regional bot-auth navigation passed |

The initial [web workflow](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/39483556663) succeeded and applied migrations from its exact image before ECS promotion. Migration `0209_workspace_report_header_theme.sql` adds the constrained header setting with a white default. The follow-up changes only PDF presentation modules and preview artifacts; validation and scanner runtime consumers are unchanged.

All scanner regions use digest `sha256:8fed477eecec58a4176d6e1ad835ddaab5935b4e123fba482e9c49fb77e9507c`. The scanner build reused its existing runtime base, built once in the canonical region, skipped registry-cache export, and replicated the image. Web and validation runtime-base inputs changed in the initial release because of the explicit Sharp dependency declaration; the follow-up reused the matching web base. No infrastructure or capacity change was made.

Unrelated MCP and redundant validation deployments were canceled before image builds. The PDF-only follow-up's automatically triggered validation deployment was also canceled before image build after verifying that the worker does not consume these modules. Required CI validation checks remained enabled and passed.

## Readiness and production verification

- Initial `pnpm preflight:all`, compared with live revision `65cdeaa256f992231d1d02afdcc831f05f37c58f`: 3,732 tests, zero failures, one optional PostgreSQL integration test skipped. Clean isolated workspace build: all 19 targets passed.
- Follow-up `pnpm preflight:fast`, compared with `843c3d13`: 2,235 tests, zero failures, the same optional integration test skipped. Clean isolated web build passed.
- Final feature/regression suite: 79 tests passed, including branding authorization, image validation, tenant isolation, exports, canonical presentation decisions, conflicting legacy family metadata, and structured workpaper preservation.
- Both tested source trees matched the committed source exactly. The canonical deploy helper reused completed local readiness with `--no-predeploy`; required CI tests/typechecks and exact-image migration, forward-deploy, health and stability guards stayed enabled.
- Final public `/api/version` reports `d23a845b53e4783fb91036756d061487d12fe61d` and `ecs-fargate`; homepage returns HTTP 200. Web ECS has two desired/running tasks, no pending tasks, one completed primary deployment, and zero failed tasks.
- An existing completed report exports `canonical-report-export-v8`. Its 12 unified findings are byte-for-byte equivalent as parsed JSON to the pre-release export; its canonical score remains 40. The PDF displays 10 narrative findings because two audit-only/supporting records remain supporting context rather than independent findings or repair tasks.
- Anonymous production PDF access returns HTTP 401. An existing signed-in admin session downloaded the final PDF successfully. Advanced/regular-role and foreign-workspace boundaries are covered by local regression tests; no production account or role was created for verification.
- Final production PDF: 66 pages, all eight appendices, nine top-level bookmarks, 41 valid destinations and 148 valid internal links. Text-bound and overlap checks passed for every page. Representative executive, appendix and continued-action pages were rendered and visually inspected. Both illustrative header themes and long-content fixtures also passed layout/navigation checks.
- Production settings expose logo upload and white/black header choices; existing workspace defaults to white. Database connectivity, worker activity and all three scanner-region health indicators were healthy. Verification did not upload a logo, save a header preference, queue a scan, or mutate a retained report.

## Measured timing

These are observed run durations, not claims of isolated causal savings.

| Stage | Duration |
| --- | --- |
| Initial local deploy-all preflight | 16m 04s |
| Initial clean workspace build | 3m 25s |
| Initial canonical AWS deployment, total | 14m 53s |
| Initial web deployment | 11m 57s: image build/cache/push 4m 23s; migrations 52s; stabilization 3m 05s |
| Initial validation deployment | 11m 04s: runtime base 3m; application image 43s; stabilization 3m 35s |
| Scanner build/replication/promotion | 2m 44s |
| Follow-up local preflight / clean web build | 3m 20s / 2m 06s; independent remaining checks and build overlapped |
| Follow-up canonical web deployment, total | 10m 47s: image build/cache/push 3m 32s; migration check 50s; stabilization 3m 03s; final live checks 3.7s |

## Reconciliation, cost, and remaining items

The repository initially had only local/remote `main`, one primary worktree, no stashes, and no open PRs. Both intended code commits and the PDF preview artifacts were committed to `main` and pushed. No unique branch work needed merging or deletion. The temporary isolated build worktree was removed only after its staged tree matched the committed release and no unique unstaged/untracked source existed. The primary worktree remains the only worktree.

PDF generation is on demand. The reviewed sample layout's incremental export transfer was estimated below $0.01 per 1,000 exports, as previously disclosed; actual transfer depends on report size and export usage. Logos are bounded to 256 KiB and replaced objects are cleaned up. No scan lane, model call, paid integration, retention window, automatic per-scan PDF storage, or provisioned capacity was added.

Remaining items:

- The pre-existing [Production Ops Monitor workflow failure](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/39484000017) was isolated to the CMP coverage audit; the production health-check step passed in that run. The audit imported workspace exports without compiled `@certscore/contracts/dist/index.js`. The follow-up configures both audit steps with `TSX_TSCONFIG_PATH=./tsconfig.base.json`, using existing source aliases without adding package builds. An isolated checkout with frozen-lockfile dependencies and no compiled contracts reproduced the old failure and passed the exact fixed registry-only command, including live read-only IAB discovery (274 names). All 23 focused infrastructure/coverage tests passed; the stale unsupported-CMP fixture now uses Axeptio because Borlabs has registered action recipes. No runtime deployment, new scans, production data changes, or manual alert/repair invocation was required. Incremental recurring infrastructure cost is $0; the change uses the existing scheduled invocation without an extra build. Confirmation from a subsequent scheduled GitHub Actions run remains pending.
- The optional PostgreSQL quarantine/recovery integration test remained skipped under its existing environment gate; this release does not change publication/recovery behavior.
- The build emitted the existing stale Browserslist-data warning. No unrelated dependency upgrade was included.
- The live audit's warning that no secondary host is configured is expected for the canonical single production host; no alternate-host deployment was attempted.

This file records verification only and has no runtime consumer.

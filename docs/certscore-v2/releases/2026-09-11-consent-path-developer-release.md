# Consent path and developer release — September 11, 2026

Status: deployed September 11, 2026. Production revisions and verification are recorded below.

## Included changes

- Canonical multilingual Accept/Reject classification, semantic final-proof guards, bounded final binding and weak-label rediscovery. Original deadlines, one-action authorization, retained evidence and registration requirements remain intact.
- A bounded public `afterAction` summary from validated persisted Accept/Reject projections with retained packet hashes. It preserves completed clicks and captured request/write counts independently of registration. Malformed, unbound and legacy missing capture stays absent; no raw values, request URLs, new findings or scoring rules are introduced.
- SDK **0.2.11** packages the existing GPC v3 bounded-observation types and new after-click summary types. SDK 0.2.10 still receives additional response JSON but does not provide those types.
- MCP **0.2.21** packages GPC v3 support for local clients and accepts the new action summary. Hosted MCP, npm/registry manifests, discovery versions, SDK examples and developer API/MCP documentation are aligned.
- GPC v3 remains deployed from ancestor `6f704ff2d4f226165d130b40479d2f039fbb379d`. Bounded observation completion remains separate from paired responsiveness and California scoring. Historical records retain their original evidence and contract versions.
- Authenticated user-activity logging commit `5ba1d22f` and `docs/operations/authenticated-user-activity.md` are already ancestors and remain included.

## Lane configuration

Read-only production inspection found public web using sharded orchestration with both `CERTSCORE_POST_ACCEPT_WORKER_ENABLED=1` and `CERTSCORE_POST_REFUSAL_REJECT_WORKER_ENABLED=1`, and both rollout modes `all_eligible`. All three regional DAG Lambda functions are Active/Successful with both action flags enabled. The canonical web workflow and scanner deploy script explicitly preserve enabled flags. GPC is enabled unconditionally for sharded dispatch in `local-v2-dag-scan-config.ts`.

Enabled means all eligible authorized paths, not forced clicks on missing, ambiguous, transactional or unauthorized controls. Inventory Lambda functions are separate passive inventory workers; they do not become additional A/R lanes. Keep the single terminal report barrier and existing failure neutrality.

## Release sequence

Use clean tested descendant commits. Refresh production SHA before dispatch and verify ancestry. The final documentation-only correction changed web source after the compatible runtime consumers deployed; the exact component revisions are recorded below.

1. Publish SDK tag `certscore-sdk-v0.2.11` through `certscore-sdk-release.yml`; publish MCP tag `certscore-mcp-npm-v0.2.21` through `certscore-mcp-npm-release.yml`. Verify actual npm tarball versions, bundled generated types, and local MCP bundle. Include the existing standalone distribution via `certscore-mcp-v0.2.21` / `certscore-mcp-linux-release.yml` and review its generated Homebrew release/PR. Do not claim external directory submissions or a Homebrew PR merge merely from manifest updates. Do not present npm publication as complete merely because package manifests were bumped.
2. Deploy compatible hosted MCP through `mcp-aws-ecs-deploy.yml` at the same commit. This is a separate workflow: `deploy:all` does **not** include hosted MCP or npm publication.
3. Deploy web/materializer with `pnpm deploy:web -- --base <fresh-live-sha>`, and validation worker/scheduler with `pnpm deploy:validation -- --base <fresh-live-sha>`, from the same tested commit. Wait for successful consumer deployment before `pnpm deploy:scanners -- --base <fresh-live-sha>` promotes all three scanner regions (`eu-central-1`, `eu-west-1`, `us-west-1`). Validation is deliberately included for the shared contract release even though the change classifier does not select it automatically. Web migrations use the target image; no new migration is introduced. Do not use concurrent `deploy:all` for this rollout: old consumers may reject the new control-proof diagnostic enum.
4. Reuse runtime bases. Build the scanner image once and verify regional digest parity. No Chromium, OS/runtime dependency, timeout or capacity increase is part of this release.
5. Verify workflow conclusions, stabilized services, live web SHA, hosted MCP version, regional scanner images and enabled flags. Check live SDK/MCP/API discovery and OpenAPI, then read newly generated production scan records for v3 GPC and A/R evidence. Do not initiate new production scans without explicit authorization. Cache reuse cannot demonstrate new capture behavior.

Package publication precedes public pages advertising the new versions. Updating local bot/MCP installations remains a separate client rollout; backend scans benefit independently.

## Validation and limitations

The earlier Ireland follow-up completed five targeted clicks out of five versus three out of five on deployed baseline. All six scans passed retained evidence, persistence and API checks. Four unconfirmed paths retain complete after-click captures; Blick Accept registered. Blick Reject remains explicitly coverage-limited. The new rediscovery branch is proven by deterministic fixtures, not by those live successes. See [the follow-up report](../consent-action-followup-20260911.md).

Release preparation additionally replays all six retained A/R outcomes through the public projector. The four unconfirmed captures now expose factual summaries; the confirmed and limited paths retain their dispositions. Focused tests cover missing hashes/proof, action mismatch, broken references, historical omission and partial/dropped capture. SDK package smoke compiles the examples against an isolated packed SDK. Full preflight, API/SDK/MCP tests, public discovery and distribution guards are required before promotion; local logs are retained under `artifacts/release-prep-20260911/`.

No claim of a new production completion percentage is made. PestPac's recovered Reject capture increased its paired scan duration by 4.5 seconds within existing budgets. Existing approved action compute planning remains up to $2/month at 100,000 scans; added proof metadata is below $0.10/month. The public summary adds no scan/model invocation or stored artifact; incremental API serialization/egress is estimated below $0.10/month per 100,000 result reads. All remain within prior approvals. GPC's previously approved $1–$3/month estimate is unchanged.

## Mac mini client handoff

The owner's supplied read-only audit identifies the running JavaScript bot as
`com.user.certscore-ca2k`, `/Users/miniben/Documents/sb1/daemon.js`, using SDK
0.2.10 against production. It preserves Pulse evidence in JSON files and SQLite
`scans.details`, but its structured columns and workbook/CSV outputs read legacy
control checklist statuses. Eight v3 records in the audit snapshot already retain
complete GPC observation plus indeterminate paired response. Older v2 records
legitimately omit bounded observation. These are audit snapshots, not production
completion-rate estimates.

After npm publication, update the bot's dependency and add one shared parser for
normal ingestion, reconciliation and export. Backfill derived local fields from
retained JSON; preserve original bytes and historical versions. Keep checklist
control presence, completed action, registered decision, after-click capture and
GPC observation/comparison in separate columns. `acceptanceExercised` and
`refusalExercised` are registration-related fields and can undercount completed
unconfirmed clicks; use `afterAction.activationStatus` where present, without
inventing missing historical values. The audit's 27/11 counts should not be used
as all-click totals without checking their predicates.

Codex on that Mac uses hosted MCP Light, so no local MCP installation update is
required there. The parser/export change remains a separate Mac mini task; this
repository release cannot alter its local daemon or workbooks.

## Completed preparation checks

All selected preflight checks completed: 1,479 passing executions before the
validation-pipeline runner encountered a relative tsconfig path error, then 624
passing executions after correcting that path and finishing all remaining gates.
The 11 initial failures were test-file startup errors, not assertion failures;
the affected gate passed on rerun with the absolute source configuration. Counts
include overlapping suites. Web, scan-core, Lambda, validation, DB, SDK and MCP
checks completed. Separate final checks passed: SDK 27, API contracts 16, MCP 112,
public projection 60, and discovery 24 (one existing test skipped). SDK isolated
package smoke, MCP package contents, generated GPC contract parity and distribution
metadata checks passed.

Read-only localhost API requests for both saved Mackolik and PestPac scans
returned HTTP 200 and all four expected after-click summaries. No new scans were
created. Final production-source hashes matched the tested hashes. Detailed logs
and the runner correction are recorded in `validation-summary.json` under the
release-preparation artifact directory. Production promotion and package publishing completed; see the release record below.

## Production release record

All canonical AWS deployments succeeded. Production web reports `ecs-fargate`.

| Component | Deployed source or package |
| --- | --- |
| Web and materializer | `20892312aa702b285342849669548c57513e5e0b` |
| Scanners, Frankfurt / Ireland / California | `20892312aa702b285342849669548c57513e5e0b` |
| Hosted MCP and validation worker/scheduler | `2870e964d9ff23ccaf37b45335c184d2289626bb` |
| SDK npm | `@certscore/sdk@0.2.11`, tag at `aef64de7a9dffd784341a795a467e2cf2192a997` |
| MCP npm and standalone | `@certscore/mcp@0.2.21`, tags at `aef64de7a9dffd784341a795a467e2cf2192a997` |

The difference between `2870e964` and `20892312` is public consent guidance and
its existing test assertion. Scanner, MCP and validation runtime source is
unchanged between them. All include the authenticated user-activity logging
ancestor. This release record is documentation written after deployment; its
own commit is not a new runtime deployment.

Successful workflow runs:

- [Final web/documentation](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/34641802882), following [initial web](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/34640866547).
- [Hosted MCP](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/34640805602).
- [Validation](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/34640810633).
- [SDK npm](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/34640441598), [MCP npm](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/34640441323), and [standalone MCP](https://github.com/ergoveritas1-alt/certscore.ai/actions/runs/34640441858).

The reviewed [Homebrew metadata PR 188](https://github.com/ergoveritas1-alt/certscore.ai/pull/188)
was merged at `a6026668b97ab92e1722980bd6a45a2308c102fa`. Both default-branch
Homebrew files reference the checksum-verified 0.2.21 archive. Published npm
packages were downloaded and checked for their version, checksum and new types
or bundled evidence handling; publication was not inferred from local manifests.

Canonical scanner deployment completed in 3m18s, reusing the cached full-image
path because California lacked a runtime base. No runtime base or capacity was
added. All six Lambda functions are Active/Successful at 3008 MB and share image
digest `sha256:cf049076c8e025cb2b818c1781268d5060b7d305818d1425c9e4472a9ba30f22`.
All regional image/provenance and crawler-identity checks passed. The all-region
verification timestamp is `2026-09-11T20:03:48.637Z`.

All four ECS services stabilized with the expected immutable revision, required
running count, no pending tasks and one completed deployment. Web remains
sharded; Accept and Reject remain enabled with `all_eligible`; GPC remains
unconditionally enabled for sharded dispatch. Live SDK/reference/MCP pages,
OpenAPI v1/v2, agent-readable guidance and discovery were checked. The final
web correction removes stale wording that discounted unconfirmed click evidence
and omitted the approved Reject-click tracking policy.

Initial deployment checks caught an outdated generated MCP manifest and an old
HTTP tool-description assertion. These were corrected before the successful
MCP deployment; HTTP tests passed 35/35 and the release guard passed. The public
copy follow-up passed 26 tests with one existing skip. Preflight was not repeated
inside deployment wrappers after the completed preparation gates and focused
correction checks; canonical workflow checks, image verification, migration
steps and service-stability gates remained enabled.

No production scans were created for this release verification. Two naturally
initiated, non-ErgoVeritas scans after regional readiness were checked against
original S3 bytes/checksums, canonical schemas, reconstructed GPC observations,
persisted action projections, public API output and a single terminal result:

- `3274368b-18c1-4089-83d4-8104994e88ab` (`djatoya.com`): GPC observation complete;
  A/R lanes explicitly limited at the passive barrier, without manufactured
  click evidence.
- `300c7693-99cd-47d3-9674-80cf246d4175` (`n0c.com`): GPC unavailable and paired
  result indeterminate. The retained GPC worker records transport failures,
  no successful main document, and incomplete capture. A/R were not attempted;
  the unavailable evidence remained neutral.

This is deployment-integrity verification, not a new A/R or GPC completion-rate
estimate. Detailed retained verification lives under the local
`artifacts/consent-release-20260911/` directory. Mac mini dependency/parser/export
work remains the separate handoff described above.

Three additional existing scans were verified through the newly deployed API:
`uwaterloo.ca` (`0865f7f8-76f8-4d62-8b2e-2b7fc2b32527`), `adswizz.com`
(`28bd06b8-827e-4683-b268-066eedc329c0`) and `brother.com`
(`c9157267-01bb-4038-a259-eda375d5c432`). Their original scanner revision was
`6f704ff2`; they are existing-capture API checks, not evidence of new-scanner
click success. All five completed captures (three Accept, two Reject) matched
verified packet hashes and canonical persisted projections, including the new
public `afterAction` summary. Registration remained unconfirmed for all five;
no click was relabeled as registered consent. The remaining Reject packet was
not attempted and did not acquire an after-click summary.

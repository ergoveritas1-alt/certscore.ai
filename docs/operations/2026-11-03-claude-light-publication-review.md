# CertScore.ai Claude Light publication review — November 3, 2026

Local implementation and commit preparation only. Publication and deployment remain on hold. No deployment, publication, resubmission, withdrawal, account/permission change, connector installation, Anthropic contact, new scan, paid model call or production analytics change was performed. Existing unrelated working-tree changes were preserved. All QA used local fixtures and produced no growth-metric events.

## Completed changes

- `integrations/claude-code/certscore-mcp-light/skills/privacy-scan/SKILL.md`: check canonical returned/total counts and truncation before the first completed answer. Recover missing findings on the same scan, using at most one server-recommended larger bundle within the advertised ceiling, then at most five evidence pages. Stop on recovery, completion, missing/repeated cursor, snapshot change, read failure or throttling. The five-page bound is a client workflow stopping rule, not a new server parameter or higher service limit. No invented pagination inputs or rescan fallback.
- `packages/certscore-mcp/src/adoption.ts`: apply the same completion and answer guidance to the Light launch prompt and project-instructions resource. Remove the rigid word target. Group overlapping canonical findings without dropping their distinct evidence; provide three distinct evidence-linked actions when supported, fewer otherwise. State original scan time, target, region, scope, creation/reuse provenance and material coverage gaps. Keep network timing, cookie snapshots, new writes, completed clicks and confirmed decisions distinct. No legal conclusions or deduction explanations.
- `packages/certscore-mcp/src/light-review-actions.ts`: missing findings are part of completing an already-requested review, not gated behind another user request. Compare returned/total counts as well as existing truncation flags. Optional deeper exports/checklists and future fresh rechecks still require a request. This function itself executes no reads or scans.
- `apps/web/lib/mcp-public-copy.ts`, consumed by `/claude`, `/mcp/light` and `/developers/mcp`: one shared first-review prompt with the same evidence/completion expectations. Fresh observations require an explicit request. The Claude connection check reads the retained example instead of requesting a canary scan. Direct Light remains `https://mcp.certscore.ai/mcp/light`, with no CertScore.ai account, key or OAuth; Claude account, plan and organization requirements remain separate.
- `docs/mcp-light-install.md`: document the exact supported recovery path and bounded stopping conditions.
- Plugin manifest: add `privacyPolicyUrl=https://certscore.ai/privacy`, `documentationUrl=https://certscore.ai/developers/mcp`, `supportUrl=https://certscore.ai/contact`, and `icon=./assets/icon.png`. The icon is an unchanged copy of the existing approved 512 × 512 `apps/web/public/certscore-mark-dark.png` asset. The README now uses public documentation rather than a relative path outside the plugin package.
- Plugin version is `0.2.26`; its task-context version and local version expectations agree. Hosted MCP has an independent version and was not bumped by this work.
- `scripts/verify-mcp-light-distribution.ts` derives the repository runtime version from its package manifest and checks both server manifests and the public version constant. Current install/marketplace copy explicitly identifies repository version `0.2.34`; dated publication receipts retain their historical versions. This removes the stale `0.2.26` validator assumption without claiming a new deployment or registry publication.

The manifest field names and plugin-relative icon path are supported by Anthropic's current [manifest reference](https://code.claude.com/docs/en/plugins/manifest-reference#directory-listing-fields). These fields belong in `plugin.json`, not the repository marketplace entry. A repository icon update does not automatically replace an existing portal listing icon.

## Exact artifact comparison

| Revision | Verified plugin content | Interpretation |
| --- | --- | --- |
| `1f2869f49a3ea558c7510ba4321f8c6e0bfb0291` | Plugin `0.2.25`; tree `239ed449fd520339aaa32f21145b917e85ecec34` | Owner-reported queued submission; lacks this work. |
| `6a9d197a207765ea958059d6ee2f2b2fdd94aa07` | Same plugin version and exact same tree | Current checkout HEAD and owner-reported passed security scan. No plugin-package advantage over the queued SHA. |
| Local candidate | Plugin `0.2.26`; exact archive and per-file checksums below | Includes the improved skill, manifest metadata and packaged icon. Prepared for a scoped local commit; not submitted. |

Both historical revisions also have the same `.claude-plugin` marketplace tree, `9236250f5dea240f8639c13a90f7e24b0bfe149a`. No Claude page, adoption-prompt or review-actions changes occurred between those SHAs. There are separate hosted MCP changes between them (including runtime version `0.2.31` → `0.2.32` and GPC interpretation/text changes); those are remote service code, not files bundled in this plugin. The plugin points to the remote Light endpoint, so pinning a plugin commit does not pin that server's runtime. The serving runtime was not inspected or changed during this task.

Proposed publication candidate:

- Archive: `outputs/claude-light-publication-2026-11-03/certscore-mcp-light-0.2.26.zip`
- SHA-256: `591bfc1e16d6335a2d15ad1c6b3b945f6d8f8b945462610050bea0878d1bfb7a`
- Receipt: `outputs/claude-light-publication-2026-11-03/artifact.json`
- Six files at plugin-root paths, including `.claude-plugin/plugin.json`, `.mcp.json`, `LICENSE`, `README.md`, `skills/privacy-scan/SKILL.md` and `assets/icon.png`. ZIP CRCs, complete file inventory, manifest icon resolution and exact file bytes were verified.

The archive contains only the plugin. Hosted prompt/action changes and public setup copy need separate authorized AWS releases; publishing the plugin alone will not deploy them. The reviewed changes are isolated on local branch `codex/claude-light-publication`, rebased onto `f822dcfedc731bf153fcbdc811b31b8f859854d9` (latest `main` inspected for PR #223). The original working branch and its unrelated local changes remain untouched. Before any future Git-backed submission, select the exact reviewed commit and verify its plugin files against the receipt; do not assume the working branch HEAD is the intended release. ZIPs and validation logs referenced here are local output artifacts, not source files in the commit.

## Validation

Final checks ran in an isolated checkout of `f822dcfedc731bf153fcbdc811b31b8f859854d9` plus only the 18 files in this candidate. Workspace dependencies were built there from committed source; no unrelated working-tree source or generated workspace package output was used. External installed tool dependencies were reused.

- Node `v22.22.1`, pnpm `10.6.3`.
- `TSX_TSCONFIG_PATH=tsconfig.base.json node --import tsx --test packages/certscore-mcp/src/*.test.ts apps/web/lib/api-v2/report-evidence-page.test.ts apps/web/lib/mcp-public-copy.test.ts apps/web/lib/mcp-light-seo.test.ts apps/web/lib/mcp-light-public-links.test.ts scripts/claude-light-publication.test.ts`: **196 passed, 0 failed**. Includes MCP protocol byte-budget tests, completeness-action behavior, unchanged optional rechecks, snapshot/cursor reconstruction and a synthetic three-of-five response recovering all five unchanged findings on a sanitized retained scan core, for fresh and reused provenance.
- `pnpm --filter @certscore/mcp typecheck`: **passed**.
- `pnpm --filter @website-signal-risk-scanner/web typecheck`: **passed**, including route type generation. No full production build, live UI run or live model evaluation was performed.
- Claude Code **2.1.317** `plugin validate --strict`: **passed** for the plugin source directory, the repository marketplace and the extracted exact ZIP. This temporary validator used a separate temporary configuration directory, with telemetry/error reporting/autoupdates disabled. The installed Claude Code and account settings were unchanged. Its optional README install-command suggestion does not change the passing verdict. Directory safety scanning and policy review remain portal-only checks.
- The earlier Claude Code 2.1.77 unknown-field errors are resolved by the current validator; the supported metadata was preserved. The generic Codex skill-creator Python validator is not the applicable schema for a Claude skill's `argument-hint` extension. Claude's native package validation and a safe YAML parse of the actual skill frontmatter passed; no metadata was removed merely to satisfy a different platform's schema.
- `scripts/verify-mcp-light-distribution.ts`: **passed**. Negative checks in the isolated checkout confirmed that a stale setup version and mismatched Light manifest are rejected; restoring the candidate passes. Dated publication records were not rewritten.
- ZIP inventory, icon containment, PNG signature/dimensions, unchanged approved asset bytes and archive/source checksum parity: **passed**.
- Developer documentation quality and LLM discovery documentation checks: **passed**.
- Scoped `git diff --check`: **passed**.

These checks verify contracts, packaging and local behavior, not that a live Claude model will always follow the instructions. No five-finding production report was fetched and no new scan was created. Missing/truncated evidence must still be identified when bounded retained reads cannot recover it.

Local incremental recurring cost: **$0**; no running infrastructure, capacity, capture, paid-service usage or retention was changed. Future clients may issue the explicitly bounded retained reads to complete a review under existing service limits; this is not a measured monthly cost forecast for a future deployment. No growth-metric instrumentation or QA attribution policy was changed.

## PR #223 CI and latest-main review

The original PR head `28db231f96ac64b9234331743f35433609faad58` passed all four GitHub workflows: Accessibility Validation, MCP Release Guards, Developer Docs Quality and Prohibit Scanner ECS. The live validation smoke steps were skipped after their secret-availability check. No reviews, comments or unresolved review threads were present when checked.

The branch was rebased onto latest inspected `main`, `f822dcfedc731bf153fcbdc811b31b8f859854d9`, without conflicts. Revalidation caught the three setup documents still naming MCP `0.2.32` while the new base carries `0.2.34`; those references were corrected. No historical publication receipt or plugin version was changed. The plugin files and ZIP checksum are identical to the previously validated artifact. The 196 focused tests, both typechecks, distribution check, documentation checks and strict plugin/marketplace validation were rerun against this base. GitHub CI for the updated head is tracked on [PR #223](https://github.com/ergoveritas1-alt/certscore.ai/pull/223); results for the earlier SHA do not substitute for checks on the updated branch.

Merging, publication and deployment remain on hold. No review was dismissed, no PR was merged, and no release or deployment workflow was dispatched.

## Remaining portal-only actions and publication decision

The owner supplied these recent portal observations: the connector is published with its account-free copy/Light endpoint update in review; the plugin is unpublished awaiting an Anthropic reviewer after passed security checks; the queued version reports no icon/privacy URL; listing privacy is already `https://certscore.ai/privacy`; documentation/support are empty and the icon falls back to the publisher picture. Browser inventory access timed out during this task, so these live statuses were **not independently refreshed**.

After explicit publication authorization, the operator should:

1. Decide whether to leave the existing `1f2869f49a3ea558c7510ba4321f8c6e0bfb0291` review unchanged or submit a separately reviewed commit containing this `0.2.26` candidate. Neither historical SHA contains the new work. Do not infer the queued artifact from a separate security-scan activity entry.
2. Verify the portal's selected repository subdirectory, exact commit, plugin version and security-check activity all refer to the chosen candidate. Retain the passing local validator receipt and run the portal-required security checks for those exact bytes. No resubmission or withdrawal was performed here.
3. Explicitly upload/select the approved `assets/icon.png` for the existing listing; merely adding it to Git does not establish that the portal icon changed.
4. Fill the listing documentation URL with `https://certscore.ai/developers/mcp` and support URL with `https://certscore.ai/contact`. Verify the already-existing listing privacy URL remains correct and that the chosen artifact now supplies `privacyPolicyUrl`; these are separate metadata layers.
5. Check the connector's pending endpoint/account-free-copy update separately from the plugin publication. Direct Light uses the endpoint above; no account, permission or connector changes were made here.

No additional Anthropic contact is proposed. The decision is which exact artifact to authorize for the future publication workflow, not whether the local implementation should be completed.

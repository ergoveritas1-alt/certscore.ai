# CertScore.ai MCP Light review actions

Completed, reportable Light bundle responses expose
`certscore.light-review-actions.v1` under
`_meta["ai.certscore/responseGuidance"].reviewActions` and the appended guidance
TextContent. Structured bundle schemas and canonical findings remain unchanged.
The actions survive small bundle budgets that omit the larger evidence index.

The browser action uses only a returned HTTPS CertScore.ai URL whose path
matches the retained scan ID. Missing, invalid, external and mismatched report
URLs produce no browser action. No report URL or tracking parameter is invented.

One contextual follow-up selects remaining retained evidence when findings are
truncated, a developer-checklist prompt for returned finding IDs, a tracking
workpaper for a returned inventory, a coverage review for limited results, or a
future post-change recheck offer. Read/prompt actions retain the original scan
ID and create no scan. Rechecks declare that they would create a scan and have
no executable tool call. All follow-ups require the user's request. The agent
answers first and skips repeated or declined offers. No new findings, legal
conclusions, schedules or verified-remediation claims are introduced.

Actions are added only to completed Light bundles. Active, failed, no-go,
unknown and error responses have no actions. Existing required next actions,
read-versus-create provenance, access controls and non-Light behavior are
preserved. The existing detailed navigation remains available for discovery;
model-visible compact guidance presents the single selected follow-up.

## Deployment plan and readiness

- Baseline web revision: `b14bc1f1f6fa7855de4a77c30df667f153a03e71`.
- Baseline MCP image: `6a92eadff2901180920082fdc7ebd7bf964f030c`, ECS task
  definition `certscore-web-mcp:186`, one stable running task.
- Source changes affect only `packages/certscore-mcp` and this operations note.
  No web, validation, scanner, database, dependency or capacity change.
- Deploy through the checked-in `.github/workflows/mcp-aws-ecs-deploy.yml`
  exact-SHA push trigger. The fast deploy helper has no MCP mode. Reuse the
  exact push-triggered run; do not dispatch another deployment in parallel.
- Local readiness: 167 MCP package tests, 48 HTTP integration tests, MCP
  dependency build/typecheck and source-tracking check. Protocol regressions
  cover 5,000/8,000-byte structured bundles, unchanged output schemas, optional
  actions with original scan identity, and no extra origin requests.
- CI retains its contract, SDK, auth, MCP and HTTP tests; image scan; exact-SHA
  image promotion; isolated ECS service update; stability and live metadata/tool
  checks. This is a hosted update; no registry package is published.
- Post-release verification reads a retained example scan at both byte limits,
  checks the returned report URL/action and one optional follow-up, and confirms
  the exact ECS image SHA, healthy targets and workflow success. It creates no
  production scans. Record live results and stage timings in the release work
  summary.

No added API requests, model calls, evidence storage, background scans or
capacity. Estimated extra response transfer is below $0.10/month at 100,000
completed bundle responses. Reading evidence or creating later scans remains a
separate user-requested operation under existing allowances.

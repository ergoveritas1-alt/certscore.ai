# Local verification of the Mac mini bot ingestion fixes

The owner authorized implementing the findings from the October 9 recent-scan
audit. This change implements the cost-neutral API/bot fixes locally. No
production deployment, bot installation, restart, live database mutation,
historical evidence rewrite or fresh site scan was performed.

## Changes

Pulse's common quality gate now recognizes the existing canonical no-go
projection as retained terminal evidence. Its established reason, recommended
next action and null score remain available through the existing projection;
an empty completed shell without that decision still fails the gate. This fixes
the first broken stage, rather than adding a route-specific fallback or finding.

The external bot's reviewed delta is in `scripts/mini-bot/fixes.patch` and the
new shared `result-handling.mjs`. Both ingestion paths use the same evidence
state classifier. Exact terminal 409 `scan_unavailable` records become
unavailable with no next poll; their canonical scan resource/reason is retained
locally. Recoverable evidence failures on completed-limited scans remain eligible
for the existing reconciliation process and retry budget.

The bot separates privacy-policy and cookie-policy checklist statuses. Parser
version 2 consumes validated canonical choice execution while retaining separate
click, capture and registration fields, preserves historical fallback only when
execution is absent, and fails closed on malformed execution. It adds independent
privacy/cookie derivatives for the existing historical backfill/export path.
Original retained evidence files and hashes remain unchanged.

The same three initial supporting reads overlap with independent error handling.
No request or retry is added. Total ingestion, supporting-resource and
completion-to-ingestion timings are stored separately; the historical runtime
fields retain their meanings. Live latency improvement has not yet been measured.

## Verification

- Web TypeScript check passed with `--noEmit --incremental false`; the running
  localhost build directory was not replaced.
- All 45 Pulse projection tests passed, including every canonical no-go reason
  without public-page anchors, null-score preservation and the empty-shell gate.
- All 17 existing bot regression tests passed against the patched isolated copy.
- Five new shared-helper tests passed for terminal/pending state, retry exhaustion,
  separate policy rows, overlapping reads and honest timing.
- Four staged integration tests passed using the actual patched daemon/parser,
  an in-memory SQLite database and fake API client. They exercise initial ingestion,
  completed-limited reconciliation, no repeat polling after terminal failure,
  privacy/cookie persistence and malformed/valid A/R execution. Live HTTP is disabled.
- The hash-guarded staging utility was exercised successfully against the mounted
  original source. It stages no credentials, database, evidence or dependency upgrade.

Logs and original/staged source snapshots are under
`artifacts/mini-bot-fixes-20261009/`. The bot source is outside Git; the tracked
patch and original/patched SHA-256 manifest preserve a reviewable installation.
The installer is intentionally not automated into the WC01 AWS release workflow.

## Remaining work

The owner subsequently approved and the local implementation now includes the
completed-but-unconfirmed Accept screenshot branch: at most two masked,
safety-reviewed images within the existing action deadline, conservative
incremental estimate up to $20/month per 100,000 newly affected scans, no lane,
retry or timeout increase. See the [capture policy and local verification](../certscore-v2/after-accept-click-form-snapshots.md).
It retains explicit after-click provenance without manufacturing a registration
timestamp or changing scoring. Production rollout remains outstanding.

The installed mini bot remains unchanged until a between-scans cutover and
restart. Bonjour resolved the mounted mini to `minibens-Mac-mini.local`; a
read-only, batch-mode SSH check failed with `Permission denied`. No credentials
were requested or copied, and no launch agent or running process was altered.
Authenticated host access is needed for a safe between-scans cutover.
Existing exact terminal-409 pending rows are retired by its startup
cleanup; historical policy/action derivatives need the reviewed backfill after
migration. No full-table backfill or repair was run against the live mounted DB.
The previous browser-policy block also leaves live report interaction signoff
outstanding; local server tests do not establish that signoff.

Recurring infrastructure cost increase for the ingestion fixes: **$0**.
The separately approved screenshot change is estimated up to **$20/month per
100,000 newly affected scans**; no production usage was added in this local run.

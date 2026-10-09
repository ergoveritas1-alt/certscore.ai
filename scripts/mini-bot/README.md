# Mac mini bot ingestion fixes

WC01 owns the Pulse quality fix. The standalone bot is installed outside this
repository, so its reviewed daemon/parser delta is retained as `fixes.patch`,
with exact original/patched SHA-256 hashes. `result-handling.mjs` is a new sibling
module for that bot. No scanner runtime logic is added to the bot.

Changes:

- Initial ingestion and reconciliation share terminal/pending classification.
  Exact HTTP 409 `scan_unavailable` is terminal, preserves the canonical scan
  resource locally, and schedules no evidence poll or new scan.
- Temporary evidence failures on `completed_limited` scans remain eligible for
  reconciliation. Existing retry limits are preserved.
- Privacy and cookie-policy columns use their separate canonical checklist rows.
  Missing privacy evidence cannot inherit the cookie-policy status.
- Canonical `choice_path_execution.v1` drives click/capture/registration counts;
  historical records without execution keep their former parsing. Malformed
  execution fails closed. Parser version 2 and raw execution are retained.
  Separate `privacy_policy_status` and `cookie_policy_status` derivatives are
  also available to the existing historical backfill and CSV exporter.
- The same three initial supporting API reads overlap with independent failure
  handling. Request count and retry policy do not increase. Stored timing adds
  total bot ingestion, supporting-read duration and completion-to-ingestion time;
  the historical scan-runtime fields keep their meanings.

## Stage and test locally

```sh
node scripts/mini-bot/stage-fixes.mjs /Volumes/miniben/Documents/sb1 /tmp/certscore-mini-bot-review
MINI_BOT_STAGE_DIR=/tmp/certscore-mini-bot-review node --test scripts/mini-bot/staged-integration.test.mjs
CERTSCORE_SCAN_TARGET=local CERTSCORE_API_KEY=local_test DATA_DIR=/tmp/certscore-mini-bot-review-data node --test /tmp/certscore-mini-bot-review/test.js /tmp/certscore-mini-bot-review/result_parser.test.js /tmp/certscore-mini-bot-review/dns_guard.test.js
node --test scripts/mini-bot/result-handling.test.mjs
```

The staging script refuses source drift or an existing output directory. It
copies no credentials, database or evidence. Integration tests disable live HTTP
and use a scratch in-memory database and fake API client. No contact with target
sites or production API is needed.

## Cutover

These files are **not installed automatically**. After local verification,
back up the installed daemon/parser and database through the bot's operational
backup procedure, then stop the daemon between scans, install the new sibling
module, parser and daemon, and restart it. Startup adds columns and retires the
previous exact terminal-409 pending records. Do not kill an in-flight scan or
restart into a partial installation. Confirm the first terminal result's status,
evidence state, separate privacy/cookie fields and new timing values.

Original evidence JSON is unchanged. Historical derived action rows can be
rebuilt using the bot's existing `backfill_results.mjs` after migration. Historical
`privacy_policy_captured` values created by parser version 1 remain unreliable
until rebuilt from retained checklist rows; do not silently relabel old exports.

Recurring infrastructure cost increase: $0. The bot uses existing local storage
and API reads; no additional scan, screenshot, model call, retention period or
provisioned capacity is introduced by these changes.

# Production rotating sentinel

The existing AWS EventBridge Scheduler resource `certscore-sentinel-hourly`
retains its name/ARN but runs at :00, :20 and :40 UTC. Each invocation submits
one fresh scan, rotating the five owned sentinel pages, three scan locations
and three submission labels. A 45-slot cycle covers all combinations in 15 hours.
The SDK label still exercises REST with a client header, not the SDK library.

## Delivery and coverage

Scheduler injects its scheduled timestamp. Events older than 180 seconds,
future events and legacy events without a timestamp are skipped. A conditional
DynamoDB slot lock prevents repeated delivery from creating another scan.
The 180-second delivery allowance plus the existing 900-second Lambda timeout
fits inside the 1,200-second interval. This bounds monitor invocation overlap;
it does not terminate a separately running scanner if the monitor times out.
Missed slots are not replayed. Run records retain the scheduled time, absolute
slot, cycle position, selected page, location and transport for coverage audits.

Only the selected page is preflighted; inter-scan sleeps are removed. REST
creation retries only explicit 429 refusals, because an ambiguous 5xx may have
already created a scan. MCP creation remains non-retrying. Existing completion,
freshness, canonical result reads and alert semantics remain in place.
Keyword-based privacy signal diagnostics are not correctness alerts. Required
WCAG detection uses a separate typed check described below. Real SDK execution
remains a separate improvement.

## Required accessibility detection

All five rotating pages contain the same five inline WCAG failures: missing
image text, an unlabelled input, an unnamed button, low-contrast text, and a
nested interactive control. The manifest's versioned `sentinelCorpus.accessibility`
contract declares the required axe rule IDs and exact fixture selectors.

After a completed or `completed_limited` scan, the monitor reads the existing
`report-evidence?section=accessibility` API once. It requires a matching scan,
document URL, required axe audit and concrete retained violation examples for
every declared rule. Review-only items, prose mentions, zero counts and unrelated
selectors cannot satisfy the check. Unavailable or malformed evidence fails
closed to an operational incident. An unrelated audit review limitation does
not cancel independently retained required violations.

The typed outcome and observed/missing rules are retained in the existing run
record. Detection failures enter the existing scanner alert and reconciliation
path. Reconciliation may reread that completed report; it never starts another
scan. The existing one-scan-per-20-minute rotation, locks, regions, transports,
timeouts and alert destination remain unchanged. Each page is visited once per
five slots (100 minutes), not every page every 20 minutes.

The October 10 `certscore.sentinel-accessibility-check.v2` check additionally
requires the four canonical accessibility finding families (text alternatives,
semantic labeling, visual contrast and keyboard navigation). REST reuses its
existing findings read; MCP calls `certscore_list_findings` once with a 200-row
limit. Same-scan typed results are required and truncated or unavailable lists
fail closed. Raw violations cannot mask a concern/policy/projection regression.
Reconciliation rereads only the completed scan, never creates another scan.

Publish the five pages and manifest before deploying this handler, using
`scripts/deploy-ergoveritas-canary-bundle.sh --sentinels-only --apply`.
`test2.html` separately contains twelve WCAG failures and can be published with
`scripts/deploy-ergoveritas-test2-canary.sh --page-only --apply`.

## Deploy

The `Sentinel Monitor AWS Deploy` workflow tests and deploys the handler,
verifies its bytes, then runs `configure_schedule.py --apply`. The schedule
script updates the existing resource and preserves state, dates, encryption,
execution role and dead-letter configuration. It defaults to a read-only plan.
The GitHub deployment role needs the checked-in `github-actions-policy.json`;
the scheduler's existing execution role is passed only to Scheduler.

During first migration, deploy the handler before changing the schedule.
Legacy empty-payload deliveries safely skip in that short transition. Do not
manually invoke extra verification scans; inspect the next scheduled run.

Run tests with `python3 -m unittest infra/aws/sentinel-monitor/test_handler.py`.

## Cost estimate (September 15, 2026)

Scan volume remains 72/day or 2,160/30 days. No scanner/model configuration,
capacity, or retention increase is introduced. Monitor invocations and small
DynamoDB run/lock records rise from 720 to 2,160/month; selected-page preflight
requests fall from 3,600 to 2,160/month. MCP secret reads remain 720/month.
Estimated additional scheduling, request, storage and initialization overhead
is below $0.25/month before savings from removing 16–30 seconds of hourly
inter-scan sleeps. This is below the owner's $1/month pre-approved threshold;
actual net billing depends on execution time and free-tier availability.

October 10 WCAG fixture/check additions are estimated below $0.50/month at
2,160 scheduled runs and up to 15,000 total canary scans/month, including small
HTML/evidence growth, incremental audit work and one retained API evidence read
per successful run. Static publication/checksum checks are estimated below
$0.05 once. No scan volume, service, browser lane, model call or capacity is added.

The projection repair and canonical-finding monitoring add an estimated less
than $0.25/month at 100,000 scans and 2,160 scheduled runs, including bounded
additional canonical projection rows, up to 720 small MCP finding reads and
bounded run-record growth under the existing retention. They add no
scanner work or model usage. This estimate was disclosed before implementation
under the owner's below-$1/month pre-approval policy.

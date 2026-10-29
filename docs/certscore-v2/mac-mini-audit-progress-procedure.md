# CertScore.ai Mac mini audit progress

Procedure version: 2026-10-27.v4. Module: `certscore.mac-mini-daily-progress.v4`.

This audit-only supplement is owner-authorized for the existing daily audit. It
uses the preceding calendar month, grouped by America/Los_Angeles date. Partial
days and retained-export samples are allowed. It does not change the audit
schedule, model, checkpoint, backlog, release watch, scoring or production data.

## Evidence and cohort

The default daily job is the focused data/dashboard refresh described in the
audit-state audit-prompt.md. Reuse already sealed audit inputs; do not initiate
a new full audit or deep review just to refresh the table. The dashboard
summarizes returned canonical assessments/findings and cannot create a finding
or close an issue. During an explicitly requested full audit, retain its
source-first Pass A before generated-output comparison.

Use the Mac mini's `/Volumes/miniben/CertScore/evidence` archive as the historical
source, copying bounded JSON files locally. Preserve originals. Do not copy or
query the live multi-gigabyte SQLite database, open target sites, launch scans,
request another model review or fetch missing historical report exports.

Create a fresh cache manifest for each frozen interval. Reuse the preceding local
cache with `--reuse` to hard-link unchanged files and avoid duplicate local bytes.
The copier validates embedded creation dates, identities, byte bounds and hashes;
mtime with a two-day cushion is discovery only, not proof of complete inventory.
Missing timestamps, unavailable files and discovery limitations stay explicit.
Never overwrite a sealed manifest. A stale reused export is historical evidence;
a generation mismatch must remain unverified rather than replacing the original.

Exclude canaries, synthetic/internal traffic, known owned test targets and other
verified origins before denominators. All owned ergoveritas.com archive exports
are excluded. Original creator credentials, not the API client that later reads a
report, identify the independently verified Mac mini subset. Use the canonical
original-request SQL and key-name registry in `scripts/lib/audit-bot-origin.ts`.
Historical archive-folder provenance and original-credential proof remain separate
and filterable. Do not claim independently verified original ownership for an old
folder export. Never treat unknown origins as verified bot attempts.

Recent sealed audit inventories add failed, no-go and missing-export attempts.
Verify the Pass A seal, original receipt hashes/sizes/event pointers, scan identity,
persisted report checksum and exported projection generation. Deduplicate scan IDs
across overlapping audits and archive files. A complete calendar day requires a
complete inventory interval and original-request export for that inventory. Other
days are samples; no retained export does not mean zero scans or failures.

## Measures and interpretation

Report exclusive complete/limited/no-go/failed/publication/in-progress outcomes;
Accept/Reject/Options/opt-out observed, not observed, unknown and not checked;
click completion, verified execution and choice registration separately; privacy
link, original fetch, verified full-text bytes and producer-declared owner/role;
each of the ten returned GDPR transparency topics; GPC observation, delivery and
explicit canonical findings; accessibility coverage and each accessibility finding;
CMP recognition, optional dispatch and returned individual checks; publication and
export integrity; and every other returned canonical finding ID separately.

Keep intentionally omitted CMP work separate from failure. Do not infer GPC
honoring, successful choice registration or substantive governing-policy capture
from a link, provider name, click or missing finding. Missing historical fields
are not checked. Preserve historical policy versions and returned finding IDs.
Historical top/headline selection is unavailable, not zero. Truncated finding
inventories cannot supply a no-finding denominator.

Show every state as count/eligible denominator and percent, with change from the
immediately preceding calendar day in percentage points. Partial samples also
show changes, explicitly descriptive. Empty denominators produce null, never zero
percent. Report sample counts, sites, regions, inventoried hours and available
producer/profile/assessment/projection versions. Preserve gaps. Changes in sites,
capabilities, schema or versions can explain changes; these are not adjudicated
accuracy, legal compliance or causal repair measurements.

Fix verification comes only from the existing issue ledger and release watch.
Keep replay, deployment and eligible ordinary production exposure distinct. In
particular preserve October 23 fix gates and the separate C2 diagnostic/protocol
coverage boundaries. Do not close issues based on chart direction or deployment.

## Inputs, command and outputs

Prepare `run-inputs.json` as an array of `{path, runId}` for compatible retained
audits overlapping the month. Each run requires `begin.json`, `pass-a-seal.json`,
`work-inventory-v2.json`, original retrieval receipts and already-local artifacts.
Use the actual begin `auditEndUtc` when no `windowEndUtc` exists. Do not substitute
the start time or advance another inventory cursor.

The origin file is `certscore.audit-bot-origin.v1`, with `readOnly: true` and one
row per exported scan ID: originalRequestId, originalRequestedAt, isMacMini,
isCanary and publicationRequestStatus. Reuse retained origin rows. Include new
origin facts in the already-budgeted primary read-only export when available;
the helper SQL can run in that same connection/task. Do not automatically launch
the standalone origin exporter or another cloud task for this dashboard. Missing
origin proof remains excluded/unverified and makes interval coverage partial.

Example, from `/Users/benmasek/WC01`, using explicit frozen times and fresh paths:

```sh
python3 scripts/cache-mac-mini-evidence.py --exports-only \
  --source /Volumes/miniben/CertScore --out "$NEW_CACHE" \
  --start "$MONTH_START_WITH_OFFSET" --end "$FROZEN_END_WITH_OFFSET" \
  --reuse "$PRIOR_CACHE"
pnpm exec tsx --tsconfig apps/web/tsconfig.test.json scripts/audit-progress-month.ts \
  "$RUN_INPUTS" "$ORIGINS" "$NEW_CACHE" "$FRESH_RUN_OUTPUT" \
  /Users/benmasek/WC01/artifacts/daily-scan-audit/issues.json \
  /Users/benmasek/WC01/artifacts/daily-scan-audit/release-watch.json
```

Clamp the start to one calendar month before the frozen end (not all available
history). Never claim refreshed Mac mini coverage when the mounted source is
unavailable. Preserve the prior output and record the new component as partial or
blocked with the reason; do not interfere with the primary audit transaction.

Save immutable `dashboard.html`, `dashboard.json`, `daily-metrics.csv`, exclusions,
source/ output hashes and a summary under the existing audit `runs/` directory.
The self-contained dashboard performs no network requests. Its nested sealed
audit view remains available separately. Verify generated counts, nulls, state
deltas and filters; link the dashboard from the daily summary. Keep unchanged,
non-actionable results quiet under the existing notification rule.

Local copying/charting adds $0 in paid cloud or model usage. A one-time bounded
origin lookup for initial validation reserved $0.02 from the existing $5/month
audit envelope. Future origin facts must reuse/batch the existing primary export;
reserve at most $0.01/month for its marginal query work and recalculate the whole
audit forecast before paid work. No new task, service, paid retention or scheduled
model calls are authorized by this supplement.

## Validation

Use the focused Node tests in `scripts/lib/audit-progress.test.ts`, the cache tests
in `scripts/cache-mac-mini-evidence.test.py`, a focused strict TypeScript check and
an offline browser check of desktop/mobile rendering, state/region/origin filters,
evidence drill-down and CSV download. Production access is unnecessary.

## V2 correction and retained review

Generation-matched persisted consent-control states are authoritative for recent
rows. Historical returned canonical checklist states precede the narrower raw
first-layer inventory fallback. Preserve per-metric source labels and do not
interpret a change in source/assessment version as recovered coverage. Preserve
all v1 outputs; v2 is the corrected baseline. Accessibility result availability,
manual-review items and omitted bounded examples are separate metrics. Null rule
counts never become measured zero. Empty-day CSV percentages remain null.

After the source seal, the audit-only `scripts/audit-retained-priorities.ts` may
consume the same run-input/origin files and already-local original action/GPC
receipts into a fresh retained-review output. It ranks confirmation reasons and
unsupported exact protocol endpoints without new findings, decoder assumptions,
raw-body retention, cloud reads or calls. Original canonical comparison URI/hash/
size and worker/parent identities must join before including worker metadata.
A body hash or field-name list cannot recover a production payload. Keep C2
diagnostics verified separately from unresolved decoder/qualification coverage.


## V3 detailed-evidence coverage

Preserve all prior outputs and the corrected v2 measures. V3 adds every returned
canonical checklist ID not already mapped to an existing measure, retaining its
returned status. In particular, a connection-security row may have observed
supporting evidence but a `Gap observed` status; do not turn that into a positive
check. Include returned negative, concern, unknown, unavailable and not-checked
states separately. New or missing historical checks remain explicit rather than
being treated as passes or failures.

Include A/R verdicts, projectability, stop and indeterminate reasons; GPC response,
semantic probe, acknowledgment and recorded sale/sharing states; forms count and
capture coverage; storage classification; inventory caps; and final-host changes.
These remain descriptive returned assessments, not new findings or legal
conclusions. Count variables require explicit nonnegative integers; null is not
zero. Show daily medians with measured/eligible denominators, totals in a separate
`daily-volumes.csv`, and changes in medians as counts rather than percentage
points. No reportable evidence measures may include failed/no-go attempts.

Recent detailed projections may supplement archive-only exports after supported
typed-schema, scan identity and original canonical-bundle hash checks: site
integrity, technology, form-destination trace, and relationship-graph reference
metadata. The metadata's node/edge counts do not verify deferred graph bytes.
Never request a graph endpoint or fetch missing artifacts for this supplement.
Older missing projections remain not checked. Keep independent source review
separate from producer-declared ownership, including unresolved DPO attribution.

Save a coverage map for all main detailed-evidence boxes, including fields that
cannot yet be tabulated from the retained exports. California qualification and
protocol support, full opt-out execution, entity attribution and complete
historical inventories remain distinct gaps. No chart can close an issue.

The viewer uses compact lossless state encoding and one master table containing
all state measures, numeric measures and distinct canonical findings, in contiguous
measure groups, with calendar days as columns. Open all groups by default; retain
an optional table group filter. Show state counts/rates directly, count medians
with their own units, and finding rates with complete-inventory denominators.
Use one text block per state breakdown to keep the large table economical. Preserve full machine-readable
JSON and CSV outputs. Check state-specific charts, group/origin filters, lazy
finding tables, CSV parity and mobile overflow. This expansion adds no cloud
queries, model/API calls or incremental paid/recurring infrastructure usage.


## Daily table refresh and stable latest view

Every scheduled dashboard refresh rebuilds the grouped table using already
sealed local audit inputs and the newest eligible Mac mini exports available at
that run's frozen cutoff, a rolling calendar-month window, the current run's
compatible retained inventory and previously sealed audits. Reconcile repeated
scan IDs and changed export generations. Refresh data even when there is no
new actionable defect; the notification rule may stay quiet while the local
snapshot advances. This is not a second scan/audit schedule.

The cache copier records source size, mtime and ctime. Reuse prior bytes only
when the source metadata is unchanged and cached bytes match the prior receipt,
or after newly read source bytes verify the same digest. Otherwise retain the
changed source in a fresh cache file. Legacy caches without source signatures
require one source read before reuse. Use at most eight metadata readers and
eight copy readers, preserving all file/window bounds and read-only access.
Never overwrite an earlier cache or report. Metadata reuse is labelled separately
from a fresh source-byte read. A changed-during-read source stays unavailable.

After source/output validation, publish the new immutable run using:

```sh
python3 scripts/publish-audit-progress-dashboard.py --run "$FRESH_RUN_OUTPUT"
```

This verifies output seals, cohort, cache freshness and a non-regressing cutoff,
then atomically updates the local `artifacts/daily-scan-audit/latest` symlink and
`progress-dashboard-latest.json`. It records a publication receipt in that run.
This pointer is a viewer location, not an inventory checkpoint or issue ledger.
Keep old runs immutable. If refresh/validation fails, preserve the previous latest
view and save the partial/blocked component with its actual available cutoff.
Never call missing data zero, fetch missing detail endpoints or launch another
cloud query for this supplement.

The existing local HTTP preview should serve the `latest` path so that reloading
the same dashboard URL opens the newest published table. A page already open is
its loaded snapshot until reloaded. No daemon, extra cron, new automation, paid
service, deployment or production mutation is introduced. Link the stable view
and immutable run from each daily summary. Preserve the 5:00 a.m. Los Angeles
schedule, actual model/reasoning, checkpoint, backlog and model-transition ledger.


## Focused incremental policy — owner direction

The default schedule now performs data acquisition and dashboard maintenance
only. Preserve cached prior-day history. For terminal exports older than the
prior cutoff minus 48 hours, verify/reuse the local cached bytes without remote
metadata or content reads. Recheck metadata only for recent entries and explicit
pending IDs; fetch bytes only for new/missing/changed files. Use --refresh-ids
with a bounded JSON list of retained pending scan IDs when needed. Historical
reuse is labelled historical_cache_verified and is not a claim of a current
source reread. Preserve those historical versions rather than refreshing them
through today's report code.

A lightweight filename listing discovers new files. Persist known-old names and
outside-window creation dates so later runs skip repeat metadata work for them.
A legacy cache may need one metadata catalogue bootstrap; disclose it, do not
silently recopy the historical exports. Duplicate filenames from a live mounted
listing must be counted once; conflicting source receipts fail validation.

Routine extra work is limited to integrity, freshness, exclusions and table
consistency. Broad production audits, deep policy review, reliability/root-cause
investigations, release/fix verification and product tests are opt-in work.
List proposed extra activities for the owner instead of starting them. The
previous full procedure is retained separately and is not run automatically.


## V4 registration semantics and PDF source coverage

Registration uses the retained initial semantic status, including aborted. Legacy
confirmed_clean/confirmed_observation results map to confirmed. The operational
execution.consentConfirmed flag cannot establish initial registration. Prefer
generation-matched persisted semantic registration over archive fallbacks.
Missing historical semantic evidence remains not checked.

Terminal decision verification is a separate measure. Require the retained typed
witness, authorized target/action binding and completed after-action window;
missing witnesses stay not checked. Later confirmation never backdates initial
registration or promotes evidence into the post-registration interval.

New PDF captures retain policy_pdf_source_coverage.v1: total/extracted pages, the
unchanged 12-page/500,000-character limits, truncation and complete/partial/unknown
source coverage. Complete retention of the extracted string does not establish
whole-PDF coverage. Unobserved topics require complete source coverage before
absence review; positively bound complete sections remain usable. Legacy records
keep their original metadata and semantics. No source PDF is fetched to fill a
historical gap. These local product changes require separate deployment.

The correction rebuilds only the local aggregate dashboard from already sealed
inputs. It does not rewrite customer reports, advance inventory or close issues.

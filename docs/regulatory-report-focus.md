# Regulatory report focus and privacy workpapers

A completed report has one retained evidence set and two presentation focuses:
`gdpr_eprivacy` and `ccpa_cpra`. California defaults to CCPA/CPRA; Germany and
Ireland default to GDPR/ePrivacy. Either can be selected without starting a scan.
The actual origin stays visible, and a different regional view does not claim
that region's visitor experience was tested. Share links and PDF/JSON downloads
retain `reviewFocus`.

The shared report layout, canonical findings and score inputs stay unchanged.
The CCPA/CPRA focus highlights the existing GPC workpaper and opens privacy
choices/notices. There is no separate CCPA score or new legal conclusion.
Existing California GPC policy is unchanged. GPC response, verified signal
delivery and comparison coverage remain independent; neither a completed run nor
a vendor's presence proves GPC honoring.

## Evidence contract

Canonical materialization projects `certscore.privacy-audit-evidence.v1` only
from a verified original bundle. The persisted runtime projection retains its
source hash, scan identity, timestamp and evidence references. Reports, exports
and API v2 `privacyAuditEvidence` read that projection; they do not reconstruct
observations from presentation text. The SDK and MCP scan resource use the same
public schema. Old records without this projection stay unknown; no backfill or
rescan is triggered.

Direct observed links distinguish Do Not Sell/Share, Your Privacy Choices and
Cookie Settings. A common-path fetch, nested policy link or generic rights link
does not prove a starting-page opt-out control. Visible JavaScript controls need
retained geometry and matching document identity. Missing controls remain
unknown because existing privacy-policy search does not establish complete
privacy-choice inspection.

Only usable, target-owned retained policy text can supply notice passages.
`california_notice_passages.v1` locates bounded topic excerpts deterministically;
it does not evaluate adequacy, prove sale/sharing or assess notice placement at
collection points. Maximum output is 12 controls, four documents and five
480-character passages per document. Truncation and partial coverage are explicit.
This observational workpaper creates no normalized concern, finding or deduction.
Any future such effect requires the normal concern/policy/unified-finding path.

## Exports

`/api/scans/{scanId}/report-export?format=csv&reviewFocus=ccpa_cpra` returns a
tracking workpaper. `format=json&workpaper=tracking` returns its structured
counterpart. They cover the starting page; full-site JSON remains the separate
additional-page inventory export. A manifest preserves scan identity, origin,
timestamp, coverage and retained/included/omitted counts even for empty CSVs.
Inventory is bounded to 500 rows by the existing report appendix. Sale, sharing
and vendor-specific GPC honoring remain `not_assessed`. CSV cells are quoted and
formula-leading values are neutralized.

Accept/Reject exports reuse the established report-eligibility rule: an observed
control or independently verified completed action permits the outcome to be
shown. An unobserved control with no verified action produces no after-action
section. Existing registration, findings and scoring rules are unchanged.

## Scope and cost

No new browser lane, page visit, retry, timeout, model call, database migration,
provisioned capacity or retention period is introduced. Expected incremental
metadata storage is under $1/month at 100,000 scans/month and 30-day retention
for typical bounded workpapers. This estimate was disclosed before proceeding;
larger volume or retention requires a fresh estimate. No deployment or live scan
is part of this change.

Separate jurisdictional scoring, executed DNS flows, new coverage/absence
findings, additional-page policy analysis, and forced paired geographies remain
outside this implementation.

## Internal CCPA scoring review

Run this offline against a downloaded canonical report JSON (v6):

```bash
pnpm exec tsx --tsconfig apps/web/tsconfig.test.json apps/web/scripts/review-ccpa-scoring.ts /path/to/report.json
```

It emits `certscore.ccpa-scoring-review.v1` with four checks: GPC response,
sale/share choice surface, sale/share opt-out effectiveness, and notice evidence.
`observed` means evidence exists, not that a requirement passed. Missing,
malformed, historical or incomplete evidence remains explicitly limited;
untested behavior stays `not_assessed`. Cookie Settings and cookie Reject cannot
stand in for a sale/share opt-out. Notice excerpts do not establish adequacy.

The review copies the existing GPC policy result for context and never applies
it again. It produces no numeric score, findings, persisted changes or customer
output. Source versions, hashes, origin and evidence references are retained;
the tool trusts the downloaded export and does not reverify original source
bytes. Use trusted exports only. No scan, network, model or database calls are
made; incremental recurring infrastructure cost is $0/month.

Before introducing a separate public score, review these four checks against
retained examples, decide the minimum evidence required, and approve calibrated
weights. Do not turn unknown evidence into a pass or reuse the legacy California
score. The current review explicitly records the unassessed behavior and notice
checks, so a high number cannot conceal them.

The [September 25 retained-evidence review](scoring/ccpa-scoring-calibration-2026-09-25.md)
tested that decision against 306 completed historical scans. Only two had a
determinate comparison with qualifying advertising/marketing activity. It
recommends retaining the four evidence checks and existing GPC rule, with no
standalone numeric CCPA score until the missing behavior can be assessed.

## GPC results presentation

Lead with facts from the existing canonical GPC observation: classified tracking
requests, page/browser signal delivery, readable site-recorded sale/sharing
opt-out states, GPC receipt and visible acknowledgment. Unknown fields do not
become repetitive result cards. Positive retained facts remain visible when the
paired comparison is indeterminate; a zero-request statement requires complete
observation coverage. Recorded opt-out state does not imply that GPC caused it.

The report headline, CCPA focus link and evidence card use those observations.
Comparison diagnostics remain in an expandable section; PDF exports also put
the observed facts first. Existing canonical findings, comparison outcomes,
historical evidence and scoring remain unchanged. This presentation change adds
no capture work, model call, persistence or recurring cost ($0/month).

### Bounded GPC comparison

The approved `certscore.gpc-activity-comparison.v1` supplement shows Baseline → GPC advertising/marketing and analytics/replay request counts with the matched 250, 500 or 1,000 ms duration. Both report focuses use the same persisted unified GPC evidence, as do API/Pulse, SDK/MCP and JSON/PDF exports. Full-session observations remain first. The original response assessment and California deduction are unchanged; short-window zeros do not become suppression or honoring claims. Historical records remain unchanged. See [the approved integration](scoring/gpc-bounded-comparison-proposal.md).

## API, SDK and MCP workpaper parity

API v2 `privacyAuditEvidence` is explicitly typed in SDK 0.2.13. MCP 0.2.24 exposes
its source-bound compact controls/notice topics as `privacyAuditSummary`, with
full evidence in `detail=full`; existing byte ceilings disclose omissions.

`GET /api/v2/scans/{scanId}/report-evidence?workpaper=tracking` reuses the canonical
tracking workpaper and existing workspace/public authorization, read throttles,
snapshot-bound pagination and five-minute report download capabilities. Add
`format=download` for JSON or `format=csv` for the inventory CSV. The same selector
is available on the existing MCP report-evidence tool and SDK reader. Selection
must be preserved during pagination. This export is explicitly starting-page
only, including for scans with additional pages.

No capture, findings, score, persistence, retention or capacity change. Estimated
incremental bounded summary transfer is under $1/month at 100,000 reads; requested
workpaper reads reuse existing quotas and substitute for larger report exports.

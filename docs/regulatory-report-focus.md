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

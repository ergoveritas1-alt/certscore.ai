# CertScore.ai cross-surface report parity

October 30, 2026. Local implementation and retained-only validation. No deployment,
public visits, new scanning, historical rewrite, scoring or proof-policy changes.

## One evidence inventory, explicit scopes

The web report, PDF and Word exports consume the same report projections for
priority selection, forms and initial-visit runtime inventory. API report-evidence
pages export the corresponding scoped web projection; SDK reconstruction and MCP
pagination preserve it. Machine scan summaries can contain both posture scores
and a bounded subset of findings. Their subset counts are not a count of all
report findings or all observed resources.

`projectReportRuntimeInventory` reuses the established retained-request and
single-page resource projectors. It replaces the duplicated web/export runtime
selection. Complete retained request events determine the request metric; vendor
signature samples never supply a complete request breakdown. Missing, malformed,
wrong-phase or count-mismatched events leave that breakdown unavailable while
preserving a separately supported event total. Unclassified resources remain
unclassified. Resource recognition creates no finding, score or consent proof.

Canonical v8 exports add `cookieAndTrackerInventory.requestInventory` with the
initial-page scope, event metric, distinct resource/host counts, service overview,
public resource rows and omitted-row count. The existing 500-row export bound
applies to the added table. Totals use the full verified inventory. Historical
exports without this additive field retain their existing scope; they do not
acquire synthetic zero-request results. Choice-session samples remain separate.

All five transport assessments, including form transport, appear in summaries.
Form transport evidence can also remain in the Forms chapter. Its presence in
both locations never creates an additional finding or score effect.

California PDF/Word details exclude EU checklist coverage summaries and their
unfiltered summary counts. Shared observed transport facts remain available in
both frameworks. Existing canonical finding selection, labels, highlights bounds,
coverage, underlying assessment states and scoring remain unchanged.

## Framework selection in machine evidence

API report-evidence, SDK and MCP accept an optional `reviewFocus` enum:
`gdpr_eprivacy` or `ccpa_cpra`. The scan default remains unchanged when omitted.
The selector applies before shared section filtering and display projection;
it never adds a finding or changes a score. Machine summaries retain both typed
posture scores; a lens-specific comparison uses the corresponding posture.

The selected framework is retained on page metadata, report links, downloads and
MCP continuation arguments. The snapshot hash binds it independently of data
contents. SDK reconstruction rejects framework drift, including mixed pages with
otherwise identical snapshots. A tracking workpaper is an independent machine
inventory and does not accept this display selector. Invalid or duplicate
frameworks are rejected. Authentication, download-ticket authorization, rate
limits and transport/capture budgets remain unchanged.

## Audit and release checks

`scripts/audit-report-export-parity.ts --out <audit.json>` reads two fixed cohorts:

- `artifacts/independent-production-audit-2026-10-22/scans`
- `artifacts/postdeploy-independent-review-2026-10-21/scans`

It records source hashes, checks 112 exports across 86 sites in both frameworks,
preserves all historical files and compares 65 matching API/SDK/MCP capture
triples. It also checks original packet/bundle/scan/target joins before reporting
recoverable after-Accept form omissions. SITS has two later forms/nine fields;
Ovid has one later form/one field. Both historical omissions are covered by the
shared form-inventory correction. Two unverified target joins are left unresolved.

Historical export consistency is not a complete historical web replay: 82 reports
have no separately retained Accept packet in these cohorts, and the frozen
exports omit the newer complete-request and combined-form inventories. The audit
records those boundaries instead of filling missing evidence.

Fifty-four retained SDK summaries lack dual-posture scores. Six retained MCP
summaries explicitly omit GPC detail under their transport budget. These are
recorded delivery differences, not conflicting observations; historical files
remain untouched. Current integration tests verify dual scores through the API
and SDK, and detailed forms/tracking evidence through both full and light MCP.

`scripts/report-cross-surface-parity.test.mts` exercises the actual web model,
canonical PDF/Word content, API resource and Pulse summary, SDK HTTP reads and
reconstruction, and in-memory MCP protocol calls. It checks both frameworks,
missing receipts and wrong-target proof, phases, classifications, counts,
finding identities, scores and source immutability. Every HTTP call is intercepted
by an owned read-only fixture; any unexpected endpoint or scan creation fails.
Existing SDK/MCP negative tests cover cursor drift, incomplete pagination,
byte bounds and unknown/unsupported evidence. The shared report and deployment
selection suites include the new parity checks.

## Cost and readiness

Local recurring AWS cost is zero. No new capture, retention, browser work, model
call or paid service is added. The estimated added export compute/transfer is
below $0.50/month at 100,000 comparable downloads, within the sub-$1 preapproval.
The estimate and source hashes are retained with the audit. Existing scan and
MCP transport budgets are unchanged.

This is an implementation/retained-fixture validation result. Production
verification awaits ordinary deployed report evidence after separate deployment
authorization. Legacy exports cannot be repaired from absent retained proof.

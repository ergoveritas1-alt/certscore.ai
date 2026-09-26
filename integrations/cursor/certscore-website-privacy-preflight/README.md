# Website Privacy Preflight

Website Privacy Preflight connects Cursor to the existing no-auth CertScore.ai MCP Light service and adds a bounded public-site privacy-review workflow.

## Included components

- Agent Plugin manifest: `plugin.json`
- Streamable HTTP MCP configuration: `mcp.json`
- Agent skill: `skills/website-privacy-preflight/SKILL.md`
- Monorepo marketplace catalog: `../../../.cursor-plugin/marketplace.json`

## Connection

[Install CertScore.ai MCP Light in Cursor](https://cursor.com/link/mcp/install?name=CertScore.ai&config=eyJ1cmwiOiJodHRwczovL21jcC5jZXJ0c2NvcmUuYWkvbWNwL2xpZ2h0In0%3D) — hosted Light URL, no API key required.

- Cursor plugin version: `1.0.5`
- Canonical MCP identity: `ai.certscore/mcp-light`
- Hosted MCP version: `0.2.25`
- Endpoint: `https://mcp.certscore.ai/mcp/light`
- Authentication: none
- Tools: `certscore_scan_site`, `certscore_get_scan_status`, `certscore_get_scan_bundle`, `certscore_get_report_evidence_page`

MCP Light allows up to 50 new scans per day. The separate anonymous REST API allows 20 new scans per day. With the default `freshness=latest`, an eligible recent completed scan may be reused without consuming the MCP Light new-scan allowance.

Ask Cursor to run a Website Privacy Preflight for a public URL. The skill retains the scan ID, polls only while the scan is active, stops at a documented terminal state, retrieves a bounded findings bundle when usable, and reports evidence as observations rather than legal conclusions.

The installed MCP component is displayed as `CertScore.ai`. For GPC, lead with available `gpcResponse.observation` facts and `gpcResponse.activityComparison` request counts, preserving the matched duration. These facts remain useful when the paired `gpcResponse.status` is `indeterminate`. Use the returned paired status and finding title for that comparison: `GPC response`, `No observable GPC response`, or `indeterminate`. Keep any returned California scoring policy separate. Observation completion, recorded opt-out state and short-window request counts do not establish that GPC was honored.

For `postAcceptObservation` and `postRefusalObservation`, read `execution.status` independently of consent confirmation. Both `succeeded` and `succeeded_with_confirmation` describe a completed click and bounded observation; the latter adds a confirmed consent decision. Report returned `afterAction` facts even when registration is unconfirmed, as after-click observations. Missing historical execution remains unavailable. Failed or incomplete execution remains limited coverage rather than a pass. Omit after-Accept/Reject discussion when no corresponding observed control or verified action evidence is returned.

When either observation status is `confirmed_observation`, report its typed `interpretation` directly. If `termination.kind` is `evidence_satisfied`, the observer intentionally stopped after retaining qualifying evidence; do not characterize that stop as uncertainty about the returned observation. Keep `coverageLimitations` scoped to additional behavior or persistence that was not measured. Ordinary post-Accept activity is a score-neutral behavior baseline unless a separately projected finding says otherwise. Use returned canonical findings for any Reject score effect, including a returned Reject-click tracking finding; do not infer a finding from request counts or require confirmation that the finding itself does not require. Determine scan reuse only from returned provenance such as `executionMode`, `reused`, or `freshnessDecision`.

Documentation: https://certscore.ai/developers/mcp

Support: https://certscore.ai/contact

Privacy: https://certscore.ai/privacy

Terms: https://certscore.ai/terms

## License scope

This Cursor integration package is licensed under the Apache License 2.0. That license applies only to the files in `integrations/cursor/certscore-website-privacy-preflight`.

CertScore services, APIs, scanner implementations, trademarks, and other repository components remain governed by their respective licenses and terms. The Apache License 2.0 does not grant permission to use CertScore.ai, LLC trade names, trademarks, service marks, or product names except as the license permits for describing the origin of this integration.

## Retained audit workpapers

For inventory, CCPA/CPRA workpapers or export requests, use the existing `scanId` with `certscore_get_report_evidence_page` and `workpaper="tracking"` when advertised by the server. Ordinary summaries use `privacyAuditSummary` and the returned GPC facts without an automatic extra read. The workpaper provides retained starting-page inventory, privacy-choice controls, notice passages, and GPC evidence. Preserve `workpaper="tracking"` with every `pagination.nextCursor`; use `download.url` for JSON and `download.csvUrl` for CSV. Keep private download links confidential; request a fresh link after expiry. Missing evidence in a bounded bundle is not evidence of absence: inspect `mcpMetadata.omittedSections` and retrieve the workpaper when needed. If the tool or selector is missing, refresh the existing connection's tool list or update the local MCP package; do not start a replacement scan.

Report observed Do Not Sell/Share controls and notice passages as evidence. Control presence does not establish opt-out effectiveness, and notice passages do not assess adequacy. Preserve the actual scan origin and existing CertScore score; the regulatory focus does not change the evidence or produce a separate CCPA score.

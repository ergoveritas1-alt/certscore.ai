# Website Privacy Preflight for ChatGPT and Codex

This package contains the provider-neutral skill and remote MCP wiring for an OpenAI **With MCP** plugin submission. It covers fast preliminary cookie/tracker evidence from active scans, persisted public-website privacy evidence, jurisdiction-neutral GPC response comparisons, and eligible bounded Accept and Reject observations in separate scanner sessions.

## Included components

- OpenAI plugin manifest: `.codex-plugin/plugin.json`
- Repository-test MCP configuration: `.mcp.json`
- Provider-neutral skill: `skills/website-privacy-preflight/SKILL.md`
- OpenAI skill metadata and MCP dependency: `skills/website-privacy-preflight/agents/openai.yaml`

## Release identities

- OpenAI plugin version: `2.0.1`
- Hosted MCP version: `0.2.25`
- Production Streamable HTTP endpoint: `https://mcp.certscore.ai/mcp/light`
- Authentication: none
- Tools: `certscore_scan_site`, `certscore_get_scan_status`, `certscore_get_scan_bundle`, `certscore_get_report_evidence_page`

The package version and hosted MCP version are intentionally independent. A hosted MCP deployment updates direct MCP users at the stable URL; publishing this plugin separately distributes the bundled workflow instructions through ChatGPT and Codex.

For a newly accepted scan, `certscore_scan_site` returns the stable `scanId` and may include a bounded `preConsentPreview` as soon as the runtime lane completes or reaches its six-second checkpoint. ChatGPT and Codex should surface this preview promptly as preliminary evidence rather than withholding it until the scan completes. Captured counts and returned identity counts are separate because returned lists are bounded. `trackingVendorCount` excludes infrastructure, security, and consent-management vendors, which appear separately in `operationalVendors`; the compatibility preview `trackerCount` must not be compared directly with the completed inventory's broader `trackerCount`. The workflow must continue with `certscore_get_scan_status`, then retrieve `certscore_get_scan_bundle` after completed or completed_limited before reporting the full scan results and final returned tally.

For GPC, lead with available `gpcResponse.observation` facts and `gpcResponse.activityComparison` request counts, preserving the matched duration. These facts remain useful when the paired `gpcResponse.status` is `indeterminate`. Use the returned paired status and finding title for that comparison: `GPC response`, `No observable GPC response`, or `indeterminate`. Keep any returned California scoring policy separate. Observation completion, recorded opt-out state and short-window request counts do not establish that GPC was honored.

For `postAcceptObservation` and `postRefusalObservation`, read `execution.status` independently of consent confirmation. Both `succeeded` and `succeeded_with_confirmation` describe a completed click and bounded observation; the latter adds a confirmed consent decision. Report returned `afterAction` facts even when registration is unconfirmed, as after-click observations. Missing historical execution remains unavailable. Failed or incomplete execution remains limited coverage rather than a pass. Omit after-Accept/Reject discussion when no corresponding observed control or verified action evidence is returned.

When either observation status is `confirmed_observation`, report its typed `interpretation` directly. If `termination.kind` is `evidence_satisfied`, the observer intentionally stopped after retaining qualifying evidence; do not characterize that stop as uncertainty about the returned observation. Keep `coverageLimitations` scoped to additional behavior or persistence that was not measured. Ordinary post-Accept activity is a score-neutral behavior baseline unless a separately projected finding says otherwise. Use returned canonical findings for any Reject score effect, including a returned Reject-click tracking finding; do not infer a finding from request counts or require confirmation that the finding itself does not require. Determine scan reuse only from returned provenance such as `executionMode`, `reused`, or `freshnessDecision`.

Submission prompts and review cases use multiple owned ErgoVeritas canary pages rather than only the domain root. The selected internal URLs cover broad baseline evidence, runtime storage, typed GPC comparison, shadow-DOM consent controls, policy transparency, and deterministic Accept and Reject behavior.

## Public submission

In OpenAI's plugin submission portal, create a **With MCP** draft, submit the production endpoint above, and add the bundled skill from this package to the same draft. Complete domain verification, listing metadata, safety review, and publisher identity requirements in the portal before submission.

The direct `.mcp.json` mapping supports repository validation and compatible local plugin hosts. If ChatGPT developer mode creates a registered connection with a technical ID beginning `plugin_asdk_app`, a local test package may instead reference that registered connection through `.app.json`; do not invent or commit a placeholder connection ID.

Documentation: https://certscore.ai/developers/mcp

Support: https://certscore.ai/contact

Privacy: https://certscore.ai/privacy

Terms: https://certscore.ai/terms

## Retained audit workpapers

For inventory, CCPA/CPRA workpapers or export requests, use the existing `scanId` with `certscore_get_report_evidence_page` and `workpaper="tracking"` when advertised by the server. Ordinary summaries use `privacyAuditSummary` and the returned GPC facts without an automatic extra read. The workpaper provides retained starting-page inventory, privacy-choice controls, notice passages, and GPC evidence. Preserve `workpaper="tracking"` with every `pagination.nextCursor`; use `download.url` for JSON and `download.csvUrl` for CSV. Keep private download links confidential; request a fresh link after expiry. Missing evidence in a bounded bundle is not evidence of absence: inspect `mcpMetadata.omittedSections` and retrieve the workpaper when needed. If the tool or selector is missing, refresh the existing connection's tool list or update the local MCP package; do not start a replacement scan.

Report observed Do Not Sell/Share controls and notice passages as evidence. Control presence does not establish opt-out effectiveness, and notice passages do not assess adequacy. Preserve the actual scan origin and existing CertScore score; the regulatory focus does not change the evidence or produce a separate CCPA score.

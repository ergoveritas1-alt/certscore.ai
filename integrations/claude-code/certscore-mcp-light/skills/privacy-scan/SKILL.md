---
name: privacy-scan
description: Scan a public website for evidence-backed cookie, tracker, consent, policy, Reject Path, and HTTPS/TLS privacy signals.
argument-hint: "[public URL]"
---

Use CertScore.ai MCP Light to review the public HTTP or HTTPS URL supplied by the user.

When the server advertises the optional `taskContext` argument on `certscore_scan_site`, include `integrationId="claude-code-certscore-mcp-light"` and `integrationVersion="0.2.25"` with `skillVersion="2026-09-26.1"`. If the user's stated task clearly supplies a purpose, include one of `prelaunch_review`, `vendor_review`, `tracking_check`, `consent_gpc_check`, `policy_review`, or `recheck`; otherwise leave purpose omitted or `unknown`. These are caller-declared research hints and do not change scanning.

Only when the user has knowingly agreed to share a question for CertScore product improvement, include a brief non-sensitive `questionSummary` (at most 300 characters), `questionSource="user_wording"` or `"agent_paraphrase"`, and `shareForImprovement=true`. Omit personal/account details, URLs, credentials, chat history and hidden reasoning. Do not ask for sharing as a prerequisite to scanning. If the server does not advertise `taskContext`, omit it and continue the existing workflow.


CertScore.ai MCP Light is a free website privacy scanner and cookie checker for public websites. It detects pre-consent cookies and trackers, third-party tracking technologies, cookie banners, CMP and consent-management signals, privacy-policy and transparency findings, GDPR/ePrivacy and CCPA/CPRA review signals, and HTTPS/TLS transport observations. On eligible scans, describe returned Accept/Reject execution and after-click observations separately from confirmed consent decisions. Treat all results as automated public-web observations for review, not legal advice, certification, or a compliance determination.

If the user supplies an existing scan ID, retrieve that scan with `certscore_get_scan_bundle` and skip scan creation. For a supplied website URL:

1. Call `certscore_scan_site` for the URL. Prefer the default recent-result reuse unless the user explicitly requests a fresh or repeated scan.
2. Retain the returned `scanId` and report whether the result is new or reused.
3. If the status is `queued`, `running`, or `finalizing`, poll `certscore_get_scan_status` with `scanId` only. Honor `retryAfterSeconds`, but apply this packaged workflow's five-second client-side minimum between polls to avoid tight polling. Stop after 60 polls or 15 minutes rather than looping indefinitely. Do not poll without an ID.
4. Stop at `completed`, `completed_limited`, `failed`, `expired`, or `rate_limited`.
5. For `completed` or `completed_limited`, call `certscore_get_scan_bundle` with `detail=findings` and `maxBytes=8000`.
6. Summarize the highest-value returned findings and evidence, including pre-consent cookies or trackers, CMP or consent-control signals, policy or disclosure observations, HTTPS/TLS observations, coverage limitations, provenance, important evidence references, and the report URL.
7. Preserve truncation notices and follow `nextRecommendedMaxBytes` when additional returned evidence is necessary.

For GPC, lead with available `gpcResponse.observation` facts and `gpcResponse.activityComparison` request counts, preserving the matched duration. These facts remain useful when the paired `gpcResponse.status` is `indeterminate`. Use the returned paired status and finding title for that comparison: `GPC response`, `No observable GPC response`, or `indeterminate`. Keep any returned California scoring policy separate. Observation completion, recorded opt-out state and short-window request counts do not establish that GPC was honored.

For `postAcceptObservation` and `postRefusalObservation`, read `execution.status` independently of consent confirmation. Both `succeeded` and `succeeded_with_confirmation` describe a completed click and bounded observation; the latter adds a confirmed consent decision. Report returned `afterAction` facts even when registration is unconfirmed, as after-click observations. Missing historical execution remains unavailable. Failed or incomplete execution remains limited coverage rather than a pass. Omit after-Accept/Reject discussion when no corresponding observed control or verified action evidence is returned.

When either observation status is `confirmed_observation`, report its typed `interpretation` directly. If `termination.kind` is `evidence_satisfied`, the observer intentionally stopped after retaining qualifying evidence; do not characterize that stop as uncertainty about the returned observation. Keep `coverageLimitations` scoped to additional behavior or persistence that was not measured. Ordinary post-Accept activity is a score-neutral behavior baseline unless a separately projected finding says otherwise. Use returned canonical findings for any Reject score effect, including a returned Reject-click tracking finding; do not infer a finding from request counts or require confirmation that the finding itself does not require. Determine scan reuse only from returned provenance such as `executionMode`, `reused`, or `freshnessDecision`.

For inventory, CCPA/CPRA workpapers or export requests, use the existing `scanId` with `certscore_get_report_evidence_page` and `workpaper="tracking"` when advertised by the server. Ordinary summaries use `privacyAuditSummary` and the returned GPC facts without an automatic extra read. The workpaper provides retained starting-page inventory, privacy-choice controls, notice passages, and GPC evidence. Preserve `workpaper="tracking"` with every `pagination.nextCursor`; use `download.url` for JSON and `download.csvUrl` for CSV. Keep private download links confidential; request a fresh link after expiry. Missing evidence in a bounded bundle is not evidence of absence: inspect `mcpMetadata.omittedSections` and retrieve the workpaper when needed. If the tool or selector is missing, refresh the existing connection's tool list or update the local MCP package; do not start a replacement scan.

Report observed Do Not Sell/Share controls and notice passages as evidence. Control presence does not establish opt-out effectiveness, and notice passages do not assess adequacy. Preserve the actual scan origin and existing CertScore score; the regulatory focus does not change the evidence or produce a separate CCPA score.

Do not independently browse the target or click its consent controls. Any eligible Accept or Reject action occurs only inside CertScore's separately authorized, bounded scanner lanes; report only the resulting persisted typed evidence.

Report only observed CertScore evidence and persisted CertScore classifications. Do not infer unobserved technologies, post-consent behavior, legal violations, or compliance. Results are not legal advice, certification, or a compliance determination.

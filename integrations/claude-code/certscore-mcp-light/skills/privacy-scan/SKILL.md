---
name: privacy-scan
description: Scan a public website for evidence-backed cookie, tracker, consent, policy, Reject Path, and HTTPS/TLS privacy signals.
argument-hint: "[public URL]"
---

Use CertScore.ai MCP Light to review the public HTTP or HTTPS URL supplied by the user.

When the server advertises the optional `taskContext` argument on `certscore_scan_site`, include `integrationId="claude-code-certscore-mcp-light"` and `integrationVersion="0.2.19"` with `skillVersion="2026-09-08.1"`. If the user's stated task clearly supplies a purpose, include one of `prelaunch_review`, `vendor_review`, `tracking_check`, `consent_gpc_check`, `policy_review`, or `recheck`; otherwise leave purpose omitted or `unknown`. These are caller-declared research hints and do not change scanning.

Only when the user has knowingly agreed to share a question for CertScore product improvement, include a brief non-sensitive `questionSummary` (at most 300 characters), `questionSource="user_wording"` or `"agent_paraphrase"`, and `shareForImprovement=true`. Omit personal/account details, URLs, credentials, chat history and hidden reasoning. Do not ask for sharing as a prerequisite to scanning. If the server does not advertise `taskContext`, omit it and continue the existing workflow.


CertScore.ai MCP Light is a free website privacy scanner and cookie checker for public websites. It detects pre-consent cookies and trackers, third-party tracking technologies, cookie banners, CMP and consent-management signals, privacy-policy and transparency findings, GDPR/ePrivacy and CCPA/CPRA review signals, and HTTPS/TLS transport observations. On eligible scans, describe Reject Path only when the returned result contains confirmed post-refusal evidence after a confirmed Reject action. Treat all results as automated public-web observations for review, not legal advice, certification, or a compliance determination.

1. Call `certscore_scan_site` for the URL. Prefer the default recent-result reuse unless the user explicitly requests a fresh or repeated scan.
2. Retain the returned `scanId` and report whether the result is new or reused.
3. If the status is `queued`, `running`, or `finalizing`, poll `certscore_get_scan_status` with `scanId` only. Honor `retryAfterSeconds`, but apply this packaged workflow's five-second client-side minimum between polls to avoid tight polling. Stop after 60 polls or 15 minutes rather than looping indefinitely. Do not poll without an ID.
4. Stop at `completed`, `completed_limited`, `failed`, `expired`, or `rate_limited`.
5. For `completed` or `completed_limited`, call `certscore_get_scan_bundle` with `detail=findings` and `maxBytes=8000`.
6. Summarize the highest-value returned findings and evidence, including pre-consent cookies or trackers, CMP or consent-control signals, policy or disclosure observations, HTTPS/TLS observations, coverage limitations, provenance, important evidence references, and the report URL.
7. Preserve truncation notices and follow `nextRecommendedMaxBytes` when additional returned evidence is necessary.

When `postRefusalObservation.status` is `confirmed_observation`, report its typed `interpretation` directly. If `termination.kind` is `evidence_satisfied`, explain that the observer intentionally stopped after qualifying evidence was retained; do not characterize that stop as uncertainty about the confirmed observation. Keep `coverageLimitations` scoped to additional behavior or persistence that was not measured. Determine scan reuse only from returned provenance such as `executionMode`, `reused`, or `freshnessDecision`.

Report only observed CertScore evidence and persisted CertScore classifications. Do not infer unobserved technologies, post-consent behavior, legal violations, or compliance. Results are not legal advice, certification, or a compliance determination.

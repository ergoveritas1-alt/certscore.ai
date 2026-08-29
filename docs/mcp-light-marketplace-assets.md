# CertScore.ai MCP Light marketplace workflow assets

These platform-neutral assets are the source copy for Cursor, Claude Code, Cline, Kilo, GitHub, Docker, and other MCP directories. They do not grant publishing authority and are not platform manifests.

## Canonical identity

- Product: CertScore.ai MCP Light
- Registry name: `ai.certscore/mcp-light`
- Hosted MCP version: `0.2.16`
- Publisher and legal owner: CertScore.ai, LLC
- Remote endpoint: `https://mcp.certscore.ai/mcp/light`
- Transport: Streamable HTTP
- Authentication: none
- New-scan allowance: 50 genuinely new scans per UTC day across requester and shared public-Light scopes, plus a 5-new-scan rolling 10-minute limit
- Reuse: an eligible recent completed scan may be reused; reuse does not consume quota
- Tools: `certscore_scan_site`, `certscore_get_scan_status`, `certscore_get_scan_bundle`

## Short description

Free website privacy scanner to detect pre-consent cookies and trackers, CMP and consent controls, privacy policy, GDPR/ePrivacy and CCPA, and HTTPS/TLS signals.

## Long description

Free website privacy scanner and cookie checker for public websites. Detect pre-consent cookies and trackers, third-party tracking technologies, cookie banners, CMP and consent-management signals, privacy-policy and transparency findings, GDPR/ePrivacy and CCPA/CPRA review signals, and HTTPS/TLS transport observations.

Give CertScore.ai a public website to collect structured, evidence-backed privacy findings for launch review, vendor review, audit triage, or human compliance review. Results include a CertScore score and supporting evidence for human and agentic review; they are not legal advice, certification, or a compliance determination.

## Suggested command: `privacy-scan`

Input: one public HTTP or HTTPS URL.

Workflow instruction:

> Use CertScore.ai MCP Light to request or reuse a scan for the supplied public URL. Prefer recent-result reuse unless the user explicitly requests a fresh scan. Retain the returned scanId. If the scan is queued, running, or finalizing, poll certscore_get_scan_status with scanId only and honor retry guidance until a terminal state. For completed or completed_limited, retrieve certscore_get_scan_bundle with detail=findings and maxBytes=8000. Summarize the highest-value returned findings, pre-consent cookie/tracker observations, consent or CMP signals, policy/disclosure evidence, transport observations, coverage limitations, evidence references, scan provenance, and report URL. Preserve evidence identifiers or links needed for follow-up. State whether the scan was new or reused. Present results as observed website behavior and CertScore findings, not legal advice, certification, or a compliance determination.

Do not implement this command as a hook or autonomous background action. It should run only when a user or agent workflow supplies a public URL and requests the review.

## Suggested skill: website privacy preflight

Use this workflow before a public website launch, during vendor-domain review, for audit triage, or before escalating observable privacy questions to a human reviewer.

1. Confirm that the target is a public HTTP or HTTPS URL.
2. Call `certscore_scan_site`; use default recent-result reuse unless freshness was explicitly requested.
3. Retain `scanId` and distinguish a reused result from a genuinely new scan.
4. Poll `certscore_get_scan_status` only while active and honor retry delays.
5. Stop on any terminal state. Retrieve `certscore_get_scan_bundle` only for `completed` or `completed_limited`.
6. Prioritize returned evidence about pre-consent storage, trackers/vendors, CMP and consent controls, privacy-policy/disclosure surfaces, GDPR/ePrivacy or CCPA/CPRA review signals, and HTTPS/TLS observations.
7. Preserve important evidence references, coverage limitations, provenance, and truncation notices.
8. Never infer unobserved technology, consent behavior, legal violations, or compliance from missing or limited evidence.

For a confirmed `postRefusalObservation`, report its typed interpretation directly. `termination.kind=evidence_satisfied` means the observer intentionally stopped after retaining qualifying evidence; it does not make the confirmed observation inconclusive. Keep `coverageLimitations` scoped to additional behavior or persistence that was not measured, and determine scan reuse only from returned provenance fields.

## Links for listing forms

- Landing page: https://certscore.ai/mcp/light
- Documentation: https://certscore.ai/developers/mcp
- Installation reference: https://github.com/ergoveritas1-alt/certscore.ai/blob/main/docs/mcp-light-install.md
- Repository: https://github.com/ergoveritas1-alt/certscore.ai
- Support: https://certscore.ai/contact
- Privacy: https://certscore.ai/privacy
- Terms: https://certscore.ai/terms
- Icons: https://certscore.ai/certscore-mark-dark.png for light backgrounds and https://certscore.ai/certscore-mark-light.png for dark backgrounds (PNG, 512 × 512)
- Cline marketplace icon: https://certscore.ai/images/mcp-directory/certscore-mcp-light-cline-400.png (PNG, 400 × 400)
- Changelog: https://github.com/ergoveritas1-alt/certscore.ai/blob/main/packages/certscore-mcp/CHANGELOG.md
- Submission packets: https://github.com/ergoveritas1-alt/certscore.ai/blob/main/docs/mcp-light-submission-packets.md
- Agent installation guide: https://github.com/ergoveritas1-alt/certscore.ai/blob/main/llms-install.md

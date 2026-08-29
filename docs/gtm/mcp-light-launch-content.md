# CertScore.ai MCP Light organic launch kit

Use this copy only while the following facts remain current:

- Official MCP Registry: `ai.certscore/mcp-light`, hosted version `0.2.16`
- Endpoint: `https://mcp.certscore.ai/mcp/light`
- Authentication: none
- Tools: `certscore_scan_site`, `certscore_get_scan_status`, `certscore_get_scan_bundle`
- Cursor Directory: live
- Cursor Marketplace: pending review; do not imply approval or availability there
- Publisher and legal owner: CertScore.ai, LLC

Every post should link to `https://certscore.ai/mcp/light` with a channel-specific UTM source. Do not claim legal compliance, certification, exhaustive detection, or a successful Reject Path observation unless the cited completed result contains eligible confirmed post-refusal evidence.

## LinkedIn launch post

We published CertScore.ai MCP Light for agents that need a fast, evidence-backed first look at a public website’s privacy risk signals.

It is live in the Official MCP Registry as `ai.certscore/mcp-light` and requires no account, API key, or OAuth. Connect the Streamable HTTP endpoint, give your agent a public URL, and follow a three-tool workflow from scan request to completed findings bundle.

The scan can surface observed cookies and trackers, CMP and consent controls, privacy-policy and transparency signals, GDPR/ePrivacy and CCPA/CPRA review context, and HTTPS/TLS observations. On eligible scans, CertScore may also report bounded post-refusal evidence—but only when a deterministic Reject action was confirmed and eligible activity was actually retained.

CertScore results are automated public-web observations for human and agentic review. They are not legal advice, certification, or a compliance determination.

Try MCP Light: https://certscore.ai/mcp/light?utm_source=linkedin&utm_medium=organic_social&utm_campaign=mcp_light_launch

#MCP #PrivacyEngineering #AIEngineering #DeveloperTools

## X launch thread

1. CertScore.ai MCP Light is live in the Official MCP Registry: `ai.certscore/mcp-light`.

   No account. No API key. No OAuth. Give an MCP-capable agent a public URL and get an evidence-backed website privacy-risk scan.

   https://certscore.ai/mcp/light?utm_source=x&utm_medium=organic_social&utm_campaign=mcp_light_launch

2. The Light surface is deliberately small:

   `certscore_scan_site` → `certscore_get_scan_status` → `certscore_get_scan_bundle`

   That keeps the first-run workflow easy to inspect and test.

3. Results can include observed cookies and trackers, consent controls, policy/transparency signals, regulatory review context, and HTTPS/TLS observations—with evidence links and explicit coverage limitations.

4. Reject Path is evidence-bound. CertScore reports post-refusal activity only when the scan was eligible, the bounded Reject action was confirmed, and qualifying evidence was retained. Unsupported or inconclusive outcomes remain neutral.

5. These are automated public-web observations for review—not legal advice, certification, or a compliance determination.

6. Cursor Directory is live, direct Cursor installation is available, and the official Cursor Marketplace submission remains under review.

   Setup, prompts, and troubleshooting: https://certscore.ai/mcp/light?utm_source=x&utm_medium=organic_social&utm_campaign=mcp_light_launch

## GitHub release / discussion post

### CertScore.ai MCP Light: no-auth website privacy scans for MCP clients

CertScore.ai MCP Light is published in the Official MCP Registry as `ai.certscore/mcp-light`.

Connect any Streamable HTTP-capable MCP client to:

```text
https://mcp.certscore.ai/mcp/light
```

No account, API key, bearer token, browser login, or OAuth is required. The server exposes exactly three tools:

```text
certscore_scan_site
certscore_get_scan_status
certscore_get_scan_bundle
```

Use `freshness=latest` for ordinary checks so an eligible recent completed scan can be reused. Retain the returned `scanId`, poll only while the scan is active, and retrieve the findings bundle after a terminal status.

Start here: https://certscore.ai/mcp/light?utm_source=github&utm_medium=community&utm_campaign=mcp_light_launch

Installation reference: https://github.com/ergoveritas1-alt/certscore.ai/blob/main/docs/mcp-light-install.md

Results are automated public-web observations for human and agentic review, not legal advice, certification, or a compliance determination.

## MCP and developer-community post

**Title:** CertScore.ai MCP Light — no-auth public website privacy scans with a three-tool workflow

We have published CertScore.ai MCP Light in the Official MCP Registry as `ai.certscore/mcp-light`.

It is a hosted Streamable HTTP server for low-volume public website privacy-risk scans. There is no signup or authentication step. The integration intentionally exposes three read-oriented workflow tools: start or reuse a scan, poll status while active, and retrieve a bounded completed findings bundle.

The useful implementation detail is the evidence boundary: results preserve observed evidence, provenance, and limitations. Missing or inconclusive evidence is not converted into a compliance claim. Reject Path output is included only for eligible scans with a confirmed bounded Reject action and retained qualifying post-refusal evidence.

Endpoint and copy-ready prompts: https://certscore.ai/mcp/light?utm_source=mcp_community&utm_medium=community&utm_campaign=mcp_light_launch

Source: https://github.com/ergoveritas1-alt/certscore.ai

I would especially value feedback on first-run connection clarity, scan lifecycle handling, and whether the bundle size guidance is easy for agents to follow.

## Technical-launch article outline

**Working title:** Designing a no-auth MCP website scanner that fails closed

1. Why the public Light surface exposes only three tools.
2. The scan lifecycle: new versus reused result, stable scan ID, bounded polling, terminal retrieval.
3. Evidence before interpretation: normalized concerns, concern policy, and unified finding projection.
4. Why missing evidence remains unknown or limited.
5. Reject Path eligibility and confirmed-evidence requirements.
6. Privacy-conscious operational telemetry: opaque correlation, bounded client attribution, no prompts or response bodies.
7. Rate limits, response byte budgets, and agent-safe retry guidance.
8. Reproducible first-run prompt and public canary.
9. What CertScore does not claim: legal advice, certification, or compliance determination.

## Follow-up post templates

### Setup walkthrough

The fastest way to test CertScore.ai MCP Light is one connection plus one prompt. The setup page now includes Cursor installation, a Codex command, the exact three-tool lifecycle, a stable public canary, and failure-state guidance.

https://certscore.ai/mcp/light?utm_source={{channel}}&utm_medium=organic_social&utm_campaign=mcp_light_setup

### Evidence-bound Reject Path explanation

“Reject button present” and “tracking continued after refusal” are not interchangeable claims.

CertScore’s Reject Path reports post-refusal activity only when the scan is eligible, a supported deterministic first-layer Reject action is confirmed, and qualifying post-refusal request/write evidence is retained. Unsupported, failed, stale, or inconclusive outcomes remain score-neutral coverage limitations.

https://certscore.ai/guides/reject-consent-tracking-test?utm_source={{channel}}&utm_medium=organic_social&utm_campaign=mcp_light_reject_path

### Reuse and repeat workflow

Running the same website review again should not automatically create another scan. MCP Light’s ordinary `freshness=latest` path can reuse an eligible recent completed result, returns the original creation decision when retained, and keeps current retrieval separate from historical provenance.

https://certscore.ai/mcp/light?utm_source={{channel}}&utm_medium=organic_social&utm_campaign=mcp_light_repeat_use

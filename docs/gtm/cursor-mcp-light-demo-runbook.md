# Cursor MCP Light Demo Runbook

## Objective

Record a truthful 45-60 second Cursor demonstration of the complete MCP Light workflow:

`Add to Cursor -> three tools discovered -> scan a URL -> preliminary evidence -> final CertScore findings`

The recording should help a qualified viewer understand installation, connection, scan completion, and the value of returning for another scan. It must show only evidence returned by CertScore and must not imply legal compliance or certification.

## Prerequisites

- Use the live `Add to Cursor` button on `https://certscore.ai/mcp/light`.
- Use a clean Cursor profile or first remove any existing CertScore.ai MCP entry.
- Confirm that the installed server name is `CertScore.ai` and the endpoint is `https://mcp.certscore.ai/mcp/light`.
- Confirm that Cursor discovers exactly these three tools:
  - `certscore_scan_site`
  - `certscore_get_scan_status`
  - `certscore_get_scan_bundle`
- Use a public URL that the owner has authorized for demonstration. Prefer an owned CertScore or ErgoVeritas canary that produces stable, non-sensitive evidence.
- Do not use a customer or third-party URL without permission.

## Capture Sequence

### 0-8 seconds: install

1. Start on the MCP Light landing page with the `Add to Cursor` control visible.
2. Select it and approve the MCP configuration in Cursor.
3. Briefly show the connected `CertScore.ai` server and its three discovered tools.

On-screen caption: `Free hosted MCP • no API key`

### 8-18 seconds: start the review

Open Cursor Agent with this prompt, replacing the placeholder only with the authorized demonstration URL:

> Run a launch privacy review for https://AUTHORIZED-TEST-URL. Use CertScore.ai MCP Light, wait for the final result, and summarize observed evidence, GPC response, eligible Accept and Reject Path observations, coverage limitations, and the report link. Do not make a legal compliance determination.

Show Cursor invoking `certscore_scan_site` and retaining the returned `scanId`.

### 18-30 seconds: show progress and preliminary evidence

Show `certscore_get_scan_status` polling through the returned scan state. If the response includes a preliminary cookie or tracker preview, label it visibly as preliminary and do not present its counts as final totals.

On-screen caption: `Preliminary evidence while the full scan runs`

### 30-52 seconds: show final findings

Show the terminal state and the `certscore_get_scan_bundle` call. Keep these distinctions visible in the Agent summary:

- `GPC response`, `No observable GPC response`, or `indeterminate` is a jurisdiction-neutral comparison, not a legal conclusion.
- Ordinary post-Accept activity is a score-neutral behavior baseline unless a separately projected finding says otherwise.
- Reject Path is reported only when confirmed, eligible post-refusal evidence was retained.
- Any non-confirmed action-path status is limited coverage, not a pass.
- Findings are observed risk signals, not legal advice, certification, or a compliance determination.

### 52-60 seconds: close

Show the returned CertScore report link and end on:

`Run another review before launch, after a vendor change, or during audit triage.`

## Capture Settings

- Record at 1440 x 900 or 1920 x 1080.
- Keep browser and Cursor zoom at a readable level; hide personal tabs, notifications, tokens, and account details.
- Export a full MP4 to `apps/web/public/videos/cursor-mcp-light-demo.mp4`.
- Export a silent, captioned GIF under 15 MB only if it remains legible.
- Do not splice responses from different scans into a sequence that appears to be one run.

## Acceptance Checklist

- The install begins from the live CertScore landing page.
- The MCP server is named `CertScore.ai`, not `server` or `certscore`.
- All three tools are visible and used in the documented order.
- The URL shown is authorized for public demonstration.
- Preliminary results are clearly distinguished from final findings.
- GPC, Accept Path, and Reject Path use the exact evidence boundaries above.
- No legal compliance or certification claim appears in speech, captions, or Agent output.
- No credentials, internal identifiers, or private browser content are visible.
- The final report link resolves successfully before publication.

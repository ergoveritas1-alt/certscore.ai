---
name: certscore-website-privacy-scan
description: Review public website privacy, cookies, tracking, consent, GPC, and policy signals with CertScore.ai. Use for a requested launch check, vendor review, tracking investigation, policy review, or comparison with an earlier scan.
metadata:
  version: 1.0.0
---

# CertScore.ai website privacy scan

Use CertScore.ai MCP Light for public HTTP or HTTPS websites the user asks to review. It is free within a scoped daily allowance. No CertScore.ai account, API key, OAuth flow, or Authorization header is needed. Current limits: https://certscore.ai/developers/mcp#light-usage-limits.

Results are automated observations of public pages. They are not legal advice, certification, or a compliance determination.

## Connection

Endpoint: `https://mcp.certscore.ai/mcp/light`. Transport: Streamable HTTP. Registry identity: `ai.certscore/mcp-light`. Hosted release reference: `0.2.30`, verified October 21, 2026. The package version is independent of the hosted release.

Reuse an existing CertScore.ai Light connection. If Muse exposes connector discovery, read its current connector instructions first. Native tools are preferable when available. If no connection is available, the included `scripts/certscore_mcp.py` calls the same MCP endpoint using Python 3's standard library. Run its commands from this skill's directory. It has no credentials, package installation, shell hooks, or background jobs.

To check connectivity without creating a scan:

```sh
python3 scripts/certscore_mcp.py --list-tools
```

This lists tools only. Do not run an example scan as an installation or connectivity check. Installing this skill does not authorize scans.

## When to scan

Use this workflow when the user asks about a public site's launch readiness, cookie banner, tag or analytics changes, vendor privacy posture, behavior before consent or after Reject, or policy wording. Use the URL the user supplies. If they provide an existing scan ID, retrieve its bundle instead of creating a scan.

Only scan sites the user has asked to review or approved for a recurring review. Do not schedule scans during installation, invent a recurring task, visit other sites, click consent controls yourself, or submit forms.

## Four-tool workflow

1. Call `certscore_scan_site` with `url`. Prefer `freshness="latest"` for recent-result reuse. Use `freshness="refresh"` only for a requested fresh scan or a recheck after a change. When the advertised schema supports `taskContext`, a clearly stated purpose belongs in `taskContext.purpose`: `prelaunch_review`, `vendor_review`, `tracking_check`, `consent_gpc_check`, `policy_review`, or `recheck`. Omit it when unclear. Do not send chat history, question summaries, personal details, or credentials.
2. Keep the returned `scanId`. Poll `certscore_get_scan_status` with that ID only while status is `queued`, `running`, or `finalizing`. Honor returned retry guidance and wait at least five seconds between polls. Stop after 60 polls or 15 minutes, whichever comes first, and give the user the scan ID and latest status. Never poll without a scan ID or restart an ambiguously timed-out scan creation.
3. For `completed` or `completed_limited`, call `certscore_get_scan_bundle` with that ID. Start with `detail="findings"` and `maxBytes=8000`. Do not treat a preliminary preview as the final report. Preserve truncation notices and retrieve additional context only when it helps answer the question. Stop on other terminal or unknown states and report the returned state without inventing a score or findings.
4. Use `certscore_get_report_evidence_page` with the same ID when a finding needs evidence. Follow its returned retrieval instructions and cursor; preserve any selected section or workpaper. Retrieve only relevant pages. A bounded or omitted section is not evidence of absence.

On HTTP 429, `rate_limited`, or an explicit quota denial, tell the user and stop. Do not retry in a loop. For authentication, schema, transport, or connection errors, report the issue rather than creating a replacement scan or asking for credentials for Light.

The helper prints the returned JSON to standard output. It performs one requested tool call per invocation, with no automatic scan retries or polling. Use the workflow above to decide what to call next.

Example, only when the user requests this test-page scan:

```sh
python3 scripts/certscore_mcp.py --call certscore_scan_site --arguments '{"url":"https://ergoveritas.com/test1.html","freshness":"latest"}'
```

For subsequent calls, substitute the returned ID:

```sh
python3 scripts/certscore_mcp.py --call certscore_get_scan_status --arguments '{"scanId":"RETURNED_SCAN_ID"}'
python3 scripts/certscore_mcp.py --call certscore_get_scan_bundle --arguments '{"scanId":"RETURNED_SCAN_ID","detail":"findings","maxBytes":8000}'
python3 scripts/certscore_mcp.py --call certscore_get_report_evidence_page --arguments '{"scanId":"RETURNED_SCAN_ID"}'
```

## Present the results

Lead with the returned overall score and scan date. Identify the site, scan ID, execution region when returned, and whether the result was new or reused. Summarize the findings that answer the user's question, with supporting evidence and the report link. State reported coverage limits plainly. Show the score as returned, without deduction breakdowns or explanations.

Use returned canonical findings and classifications. Do not create findings from request counts, vendor names, screenshots, or missing evidence. Report Accept and Reject observations only when the canonical response makes that path reportable. Keep after-click activity separate from confirmed consent registration. A completed GPC observation does not establish that GPC was honored. Do not infer active tracking solely from storage persistence or service presence.

Never describe a finding as a legal violation or a site as compliant or non-compliant. Keep factual observations separate from suggested changes and manual checks. Do not invent scores, evidence, report URLs, successful connections, or installation results.

## Recheck and repeat use

Keep the baseline scan ID, target URL, execution region, scan date, report link, and relevant coverage in the current task or the user's chosen record. After an authorized site change, request `freshness="refresh"` with `taskContext.purpose="recheck"` when supported. Retrieve both retained bundles and compare compatible targets, regions, and coverage. Report new, persistent, and no-longer-returned findings with their evidence. A finding missing from a later scan is not proof of a fix.

You may offer a later check before launch, after consent or tag changes, for a new vendor, or across user-selected client sites. Start those scans only after the user requests them or approves a specific recurring pattern.

For workspace history or access across conversations, point the user to Hosted MCP OAuth: https://certscore.ai/releases/mcp-hosted-oauth. It requires a CertScore.ai account and the user's workspace authorization. Do not change the Light endpoint or request a private credential as a shortcut.

Guide: https://certscore.ai/muse

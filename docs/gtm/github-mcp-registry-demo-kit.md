# GitHub MCP Registry launch demo kit

## Objective

Publish one 35–50 second silent-first video that proves the complete acquisition path:

```text
GitHub MCP Registry discovery
→ install in VS Code
→ run one owned-canary prompt
→ retrieve a completed CertScore findings bundle
```

The primary demo must show GitHub discovery and installation. Do not use `apps/web/public/videos/openai-mcp-certscore-demo.mp4` as the primary GitHub launch asset: it is a useful 27.5-second ChatGPT results demonstration, but it does not prove the GitHub Registry path.

## Preflight

1. Use a clean VS Code window with notifications, private repositories, terminals, file paths, account details, and unrelated chat history hidden.
2. Open `https://github.com/mcp/ai.certscore/mcp-light` and verify the listing still shows:
   - `CertScore.ai MCP Light`
   - publisher `ergoveritas1-alt`
   - the CertScore repository
   - the no-auth Light description
3. Confirm `https://mcp.certscore.ai/mcp/light` initializes and lists exactly:
   - `certscore_scan_site`
   - `certscore_get_scan_status`
   - `certscore_get_scan_bundle`
4. Use the owned canary below with ordinary recent-result reuse. Do not force a fresh scan solely for the recording.
5. If no eligible recent result exists, stop and capture the recording later rather than creating avoidable scan spend for repeated takes.

## Shot list

| Time | Picture | On-screen caption |
| --- | --- | --- |
| 0–4s | GitHub MCP Registry search for `certscore` showing the single result | `Now live in GitHub’s MCP Registry` |
| 4–9s | Open the listing; pause on the title, publisher, and description | `ai.certscore/mcp-light` |
| 9–14s | Open **Install MCP server** and choose VS Code | `No account · no API key · no OAuth` |
| 14–22s | In VS Code, show the three discovered CertScore tools | `Three tools, one bounded workflow` |
| 22–31s | Paste the prompt and show the returned new-or-reused decision | `Give your agent a public URL` |
| 31–43s | Jump cut to the completed findings bundle: score, one finding, one limitation, and report link | `Evidence-backed findings + explicit limitations` |
| 43–50s | End card with listing and landing-page URLs | `github.com/mcp/ai.certscore/mcp-light` |

Keep the pacing legible without audio. Use a subtle zoom or crop rather than moving the pointer continuously. Do not expose raw IPs, tokens, browser storage, private targets, or unrelated account data.

## Copy-ready demo prompt

> Scan https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html. Prefer an eligible recent result. If the scan is active, retain its scanId and poll status only as instructed. At completed or completed_limited, retrieve the findings bundle with detail=findings and maxBytes=8000. Summarize whether the result was new or reused, the CertScore score, risk level, highest-value findings, evidence links, coverage limitations, and report URL. Treat results as automated public-web observations, not legal advice, certification, or a compliance determination.

## Optional voiceover

> CertScore.ai MCP Light is now live in GitHub’s MCP Registry. Install it in VS Code without an account, API key, or OAuth. Give your agent a public URL, then follow three tools from scan request to a completed, evidence-backed findings bundle. Results include explicit coverage limitations and support human review—they are not legal advice or certification.

## Export

- Primary: MP4, H.264, 1080p, 30 fps, 35–50 seconds.
- Also export a captioned 1080 × 1080 crop for LinkedIn and X.
- Keep text inside the central safe area so both 16:9 and square crops remain readable.
- Use a descriptive filename such as `certscore-github-mcp-registry-demo.mp4`.
- Add captions even when voiceover is present.

## Post copy

CertScore.ai MCP Light is now live in GitHub’s MCP Registry.

Install it without an account, API key, or OAuth, give your agent a public URL, and retrieve an evidence-backed website privacy findings bundle through three focused tools.

GitHub listing: https://github.com/mcp/ai.certscore/mcp-light

Setup and copy-ready prompts: https://certscore.ai/mcp/light?utm_source={{channel}}&utm_medium=organic_social&utm_campaign=github_mcp_registry_launch

Results are automated public-web observations for review, not legal advice, certification, or a compliance determination.

## Release checklist

- [ ] Listing details rechecked immediately before capture.
- [ ] Exactly three Light tools shown.
- [ ] Owned canary used; new/reused status reported honestly.
- [ ] Completed bundle shown rather than a preliminary preview.
- [ ] At least one coverage limitation remains visible.
- [ ] No secrets, private targets, raw IPs, or unrelated account data are visible.
- [ ] Captions and alt text added.
- [ ] Channel-specific UTM source substituted before each post.
- [ ] LinkedIn, X, and GitHub release/discussion posts published inside one 24-hour window.
- [ ] First-day support replies link to the setup guide instead of restating long instructions.

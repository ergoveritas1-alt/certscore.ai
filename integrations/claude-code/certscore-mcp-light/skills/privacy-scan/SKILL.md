---
name: privacy-scan
description: Run an evidence-backed privacy preflight on a public website before launch, vendor review, audit triage, or human compliance review.
argument-hint: "[public URL]"
---

Use CertScore.ai MCP Light to review the public HTTP or HTTPS URL supplied by the user.

1. Call `certscore_scan_site` for the URL. Prefer the default recent-result reuse unless the user explicitly requests a fresh or repeated scan.
2. Retain the returned `scanId` and report whether the result is new or reused.
3. If the status is `queued`, `running`, or `finalizing`, poll `certscore_get_scan_status` with `scanId` only. Honor `retryAfterSeconds`, but apply this packaged workflow's five-second client-side minimum between polls to avoid tight polling. Stop after 60 polls or 15 minutes rather than looping indefinitely. Do not poll without an ID.
4. Stop at `completed`, `completed_limited`, `failed`, `expired`, or `rate_limited`.
5. For `completed` or `completed_limited`, call `certscore_get_scan_bundle` with `detail=findings` and `maxBytes=8000`.
6. Summarize the highest-value returned findings and evidence, including pre-consent cookies or trackers, CMP or consent-control signals, policy or disclosure observations, HTTPS/TLS observations, coverage limitations, provenance, important evidence references, and the report URL.
7. Preserve truncation notices and follow `nextRecommendedMaxBytes` when additional returned evidence is necessary.

Report only observed CertScore evidence and persisted CertScore classifications. Do not infer unobserved technologies, post-consent behavior, legal violations, or compliance. Results are not legal advice, certification, or a compliance determination.

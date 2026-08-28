---
name: website-privacy-preflight
description: Run an evidence-backed privacy preflight on a public website before launch, vendor review, audit triage, or human compliance review.
---

Use CertScore.ai MCP Light to review the public HTTP or HTTPS URL supplied by the user.

1. Call `certscore_scan_site` for the URL. Prefer the default `freshness=latest` so an eligible recent completed scan can be reused unless the user explicitly asks for a fresh or repeated scan.
2. Retain the returned `scanId` and report whether the result is new or reused. If a retryable response contains no `scanId`, honor `retryAfterSeconds` and retry `certscore_scan_site`; do not poll status without an ID.
3. While the status is `queued`, `running`, or `finalizing`, poll `certscore_get_scan_status` using `scanId` only. Honor returned retry guidance, wait at least five seconds between polls, and stop after 60 polls or 15 minutes rather than looping indefinitely.
4. Stop immediately at `completed`, `completed_limited`, `failed`, `expired`, or `rate_limited`.
5. For `completed` or `completed_limited`, call `certscore_get_scan_bundle` with `detail=findings` and `maxBytes=8000`. Do not request a bundle for another terminal state unless a later tool response explicitly directs it.
6. Summarize the highest-value returned findings and evidence, including relevant pre-consent cookies or trackers, CMP or consent-control signals, policy or disclosure observations, HTTPS/TLS observations, coverage limitations, provenance, useful evidence references, and the report URL.
7. Preserve truncation notices and use `nextRecommendedMaxBytes` only when more returned evidence is needed.

When `postRefusalObservation.status` is `confirmed_observation`, report its typed `interpretation` directly. If `termination.kind` is `evidence_satisfied`, explain that the observer intentionally stopped after qualifying evidence was retained; do not characterize that stop as uncertainty about the confirmed observation. Keep `coverageLimitations` scoped to additional behavior or persistence that was not measured. Determine scan reuse only from returned provenance such as `executionMode`, `reused`, or `freshnessDecision`.

Report only observed CertScore evidence and persisted CertScore classifications. Do not infer unobserved technologies, post-consent behavior, legal violations, or compliance. Results are not legal advice, certification, or a compliance determination.

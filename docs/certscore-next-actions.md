# CertScore Next Actions

## Implemented now

1. Canonical host redirect: redirect `www.certscore.ai` to `https://certscore.ai` while preserving path and query.
2. Infrastructure sync: keep the ECS web tfvars aligned with the manually enabled Google OAuth flag and Secrets Manager ARNs.
3. Production auth smoke: verify runtime target, visible Google login, Google redirect URI, logout redirect origin, and `www` canonical redirect.
4. Local cleanup: keep generated TypeScript build metadata out of the working change set after verification.

## Follow-up list

5. Add origin IP visibility on the scan row or scan event metadata. Prefer an append-only `scan_events.metadata_json.originIp` for request provenance, then promote to a `scans.origin_ip` column only if filtering/reporting needs it.
6. Keep regulatory lens summary copy to one compact row when possible. The card layout now gives summaries the full available card width instead of the narrow left title column.
7. Investigate queued scan pickup latency. Add timing around `scan_requested` to first worker pickup, scheduler poll interval, ECS worker desired count, and DB query/index behavior before tuning.
8. Clean up `certscore.ai` FTC-style choice architecture findings by making commercial claims and pricing expectations explicit near CTAs, avoiding promotional copy that implies risk-free certainty, and keeping disclosure links adjacent to conversion actions.
9. Clean up `certscore.ai` reject-option findings by ensuring any consent UI has equally visible `Accept` and `Reject` choices, no hidden secondary reject path, no preselected non-essential toggles, and a persistent preferences link.
10. Clean up `certscore.ai` forced-consent findings by allowing page access without accepting non-essential cookies, blocking analytics/ads until choice, and treating dismiss or reject as a valid non-consent state.

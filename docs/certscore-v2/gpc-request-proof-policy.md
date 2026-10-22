# CertScore.ai GPC request proof — October 22, 2026

The owner authorized local GPC POST body/header capture to discover additional eligible California recipients, within existing scan budgets. Missing supplemental proof must not become a new gate that removes independently qualifying URL evidence. No deployment, Options panels or historical report rewrite is authorized.

## Capture and provenance

The existing GPC session now retains the optional versioned `gpc_request_capture.v1` extension. Its `gpc_request_proof.v1` rows reuse the closed California request parser and validator used by Reject without manufacturing a Reject observation. Each proof binds the exact event/request ID, raw-URL hash, method, request time and main-document loader. The original worker artifact and session hashes still verify the producer's bytes. Successful response, delivered GPC, representative access and current canonical recipient attribution remain required downstream.

Capture uses cached Playwright Request body bytes and one `allHeaders()` read per selected request. An existing missing-Sec-GPC read is shared; when the snapshot already has Sec-GPC, a selected candidate can initiate one bounded supplemental read. No network request, browser visit, wait, retry, lane, worker-size increase, model call or Options interaction is added. Pending readbacks are recorded and never awaited; finalization freezes the packet.

The inspection pool is bounded to 48 candidate requests, retaining at most 32 detailed proofs. This is a GPC-local cap, not a claim that GPC shares Reject's process-local pool. The last eight inspection slots are protected from duplicate recipients while fewer than eight recipients have been inspected. Retention prefers successful qualifying proof for distinct recipients, then duplicates. Obsolete document proofs cannot displace current-document proofs. Known request-local processing restrictions remain in a separate compact, bounded index (at most 48) even if a detailed proof loses its slot.

Existing closed limits remain: 32 KiB input/decoded body, 128 fields, 64 header names, 8 KiB per header value, 96 cookies and eight identifier digests. Raw bodies, headers, identifiers and GPP strings are not added to retention. Unsupported, oversized, pending and absent proof stays explicitly incomplete. The existing 100-request qualification compute/output cap now selects distinct recipients before duplicates; total network inventory and collection counts are preserved.

## Qualification and scoring

1. Qualify independently supported URL evidence as before.
2. A complete, exact-request body/header proof can add a supported advertising identity or request role. It does not substitute for successful collection or actual GPC delivery.
3. Missing, unsupported, truncated or pending supplemental proof does not erase a URL-qualified request.
4. An actually observed restriction/conflict applies to that same request. It does not cancel an independently qualifying sibling request or another path to the recipient. Exact-time CMP consistency uses the same offline GPP comparison logic; a later CMP read does not prove an earlier choice.
5. Canonical downstream assessment, normalized concerns, concern policy, unified findings and scoring remain authoritative. CA recipients remain unioned across GPC, eligible Reject and explicit opt-out under the existing 47-point family cap. EU Reject and separate GPP scoring are unchanged. Customer reports show facts and resulting scores, not deduction explanations.

This improves bounded coverage, not a guarantee of observing every eligible recipient. Later activity, unsupported formats, unverified document ancestry and finite capture capacity remain limitations. Historical records are not relabeled as having new proof; discarded payloads cannot be recovered from hashes or field names.

## Cost estimate and validation

Expected incremental recurring cost is below $1/month at 100,000 scans and 30-day retention, disclosed before implementation. Working estimate: approximately $0.75/month, allowing roughly 128 KiB of additional evidence per scan (about $0.30/month S3 storage) and roughly 60 ms of additional 4 GiB compute per scan (about $0.40/month); no new paid API/model request or invocation. These are planning assumptions, not production measurements. Existing absolute execution windows and retention remain unchanged. Reassess before expanding caps or if measured incremental costs exceed the approval threshold.

Local verification includes intercepted Chromium requests, bounded capture/freeze and provenance tests, canonical observation-to-finding/scoring regression, and a hash-verified replay of the original 47-scan cohort. See `artifacts/gpc-request-proof-2026-10-22/replay.json`. The retained cohort has no new GPC request proofs, so replay must not invent additional body/header-derived recipients.

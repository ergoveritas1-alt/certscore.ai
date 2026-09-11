# Bounded MCP response capture

Implemented September 11, 2026 following owner approval.

The existing invocation event now carries a versioned response summary, capped at 2 KB of UTF-8 JSON within the existing 4 KB request-details envelope. The existing 90-day retention is unchanged. No response bodies, finding bundles, evidence contents, argument values, URL paths, query strings, authorization headers, or raw upstream message text are added to telemetry.

Recorded fields: generated tool/protocol response kind, isError, response type/status, error and reason codes, MCP code, retry eligibility/delay, next tool, bounded schema-owned validation issues, and controlled-template message/action text. Untrusted or unavailable text is explicitly omitted; truncation has its own marker. Successful responses retain compact operational metadata. Terminal fallback guidance is captured when locally generated; upstream-supplied text remains omitted even if it resembles a familiar template.

The SDK attaches operation names and safe upstream UUID request IDs to failed HTTP calls. Network failures retain their operation without inventing an HTTP status or changing the original thrown exception. Operations include creation, status, resource, report, evidence, findings, pre-consent and domain lookup. No new requests or retries are introduced.

Thrown MCP errors and transport rate-limit responses are included. Their byte size remains unavailable where the final transport serialization is not observed, rather than reporting the size of a placeholder error object. This is a generated-response summary, not a delivery receipt or wire transcript. Existing access-denied/pre-session exclusions are unchanged.

Hosted telemetry includes BUILD_GIT_SHA when available and well formed, alongside the existing server version and the response template version. Admin Request details displays summaries, omission/truncation markers, missing historical capture, and the server revision.

Capture is best-effort. Malformed optional capture metadata degrades to a minimal summary without suppressing the invocation event. Envelope bounding preserves summaries by trimming bounded caller previews/options first, then response prose/issues if needed; original in-memory data is not mutated. Existing older records remain readable and are not backfilled from current results.

Validation: MCP 110 tests, SDK 27 tests, hosted MCP 35 tests, 11 focused shared-contract/admin-render tests; shared/SDK/MCP builds and hosted MCP typecheck; web typecheck and production build. Tests cover protocol errors, optional-null issues, raw-message omission, safe upstream IDs, unchanged network exceptions, multi-byte byte limits, malformed metadata, the overall envelope bound, ingestion forwarding and UI labels.

Cost estimate disclosed before implementation: below $1/month at 100,000 requests/month. A 2 KB maximum adds at most about 200 MB/month, or 600 MB over 90 days before overhead; successful summaries are smaller, and the existing 4 KB per-event envelope is unchanged. No new infrastructure, log stream, retention extension, scans, model calls, or automatic retries. Not deployed by this implementation.

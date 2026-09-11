# MCP failure guidance implementation

Implemented on September 11, 2026 following approval of the four-day audit recommendations.

- Validate arguments against the registered tool's canonical schema before execution. Return at most eight unique schema-owned field names and validation codes; omit caller values and dynamic nested keys. Optional `null` inputs remain rejected, with explicit instructions to omit optional parameters and refresh MCP tool discovery. Required inputs and the existing optional task-context sanitization remain unchanged.
- Preserve `domain_not_found`, `dns_unavailable`, and `non_public_target` through Pulse, API v2, OpenAPI and MCP responses. Permanent DNS rejection stays non-retryable; transient failures retain the existing delay and retry policy.
- Return the existing 409 `scan_unavailable` readiness response for known eligible incomplete scans. Unknown/ineligible scans remain 404, and failed database lookups propagate to the route's 500 response. Read throttling and anonymous eligibility checks remain in place.
- Classify retained `completed_limited` invocations separately in the admin table, filter and metrics. Historical error rows additionally require a canonical no-go reason; current successful limited invocations use their recorded state. Original transport outcomes and error codes remain intact. Nullable historical status cannot hide an execution error.
- Explain that failed/expired scans are terminal: polling does not resume them, freshness=refresh starts a new scan and uses quota, and repeated failure should stop. Include a bounded scan-ID support reference while preserving existing retry eligibility and delays.

Example optional-null response excerpt:

```json
{
  "error": {
    "code": "invalid_arguments",
    "message": "Invalid arguments in fields: detail, maxBytes, maxFindings, maxPreConsentRows.",
    "retryable": false,
    "retryAfterSeconds": null,
    "recommendedNextAction": "Correct the named fields using the tool input schema. Omit optional parameters to use defaults; do not send null. Refresh tool discovery (tools/list) for the accepted types, values and limits, then retry."
  }
}
```

The full response also contains the bounded `issues` array, first `field`, and MCP code -32602.

Validation: MCP 105 tests; API contracts 16 tests; focused web suites and scan-status regressions; MCP build; web typecheck and production build; local PostgreSQL classification check covering historical limits, successful limits, invalid inputs and a null-status execution failure. Production deployment and live runtime verification are separate from this implementation.

Cost estimate: no new scans, automatic retries, model calls, infrastructure, or retention. Additional bounded error-response bytes and in-query classification are estimated below $1/month at 100,000 requests/month. No telemetry records were rewritten.

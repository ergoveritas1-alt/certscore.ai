# @certscore/sdk

## 0.2.5

- Send an `X-CertScore-Client` header on API requests for clearer SDK/MCP attribution.
- Add the optional `clientName` client setting for integrations that share the SDK runtime with MCP.

## 0.2.4

- Expose typed `resultDisposition` and `noGo` details for completed-limited no-go scans across scan, job, and Pulse resources.
- Preserve all supported reason codes, customer-safe presentation, retry guidance, attribution, and bounded evidence excerpts.
- Treat `completed_limited` as a usable terminal result in polling and wait workflows.

## 0.2.3

- Expose API v2 scan timing fields in packaged SDK declarations: `startedAt`, `completedAt`, and `scanTimeSeconds`.
- Keep scan timing nullable when the API has insufficient timing evidence instead of encouraging client-side `0.0` fallbacks.

## 0.1.0

- Prepared the TypeScript SDK as a source-preview package for future public distribution.
- Changed `certscore.scans.wait()` before first publish so it always resolves to the completed API v2 scan resource object.
- Added `CertScoreTimeoutError` and `CertScoreScanFailedError` exports for typed timeout and terminal failure handling.

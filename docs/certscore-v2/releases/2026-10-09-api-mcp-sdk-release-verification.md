# API, MCP and published SDK verification — October 9, 2026

Read-only verification of existing production reports; no scan creation, target contact, source change, package publication or deployment. Production `/api/version` still reports web revision `803173db229810f977153cc8aa7637effbfe4358`.

## Verified live

Installed the actual public npm `@certscore/sdk@0.2.14` with install scripts disabled, rather than testing only workspace source. Connected to live MCP Light and full anonymous MCP; both advertise server version 0.2.26.

All three reports from the [latest production release](../calibration-runs/2026-10-09-ar-production-release/README.md) were read again. Direct API v2, published SDK scan resource/status/default Pulse, and both MCP bundle endpoints agree on score, score explanation, forms summary, GPC response and both action observations. Published SDK finding lists agree with both MCP bundles on identities, classification, wording and bounded evidence digests, including vendor-specific Reject findings and timing. Resource/MCP scan timestamps and scan duration agree. Thirty-nine runtime/parity assertions passed.

- Clean Reject: score 84, no post-refusal deduction.
- Tracking Reject: score 69, 15-point confirmed post-refusal deduction. Its completed but semantically unconfirmed Accept retains after-click evidence and is not relabeled confirmed.
- Termly-CMP form report: score 87, two phase observations (one before consent and one after Accept). Forms selector entries match between direct API, published SDK and both MCP surfaces. Both JPEG links return 200, with hashes matching the prior release receipt. The historical row still has seven pre-consent fields and three after Accept.

The consent selector retains `acceptPath` and `rejectPath`, including execution, registration, score effect, evidence rows and Reject event timing. Full report evidence retrieved through the published SDK includes policy rows, transport rows, controls, timeline and site metadata. Focused policy, transport, tracking and GPC reads passed; tracking required two pages with the section selector preserved. Summary bundles are bounded; detailed evidence is retrieved separately.

## Confirmed SDK declaration gap

Runtime JSON is preserved, but the published SDK does not explicitly declare `formsSummary` or `scoreExplanation` on scan, status or Pulse result types. Strict consumer TypeScript compilation reproduces TS18046 (`unknown`) when accessing summary fields. API schemas already describe these contracts. A future SDK patch should add/export matching summary types and validate packaged consumer compilation before publication. This verification did not change or publish the SDK.

## Scope limits

The local document-bound seven-field reconciliation commit `d426b766` is not deployed. It cannot be claimed as a benefit of the latest release, and historical v2 evidence must not be silently upgraded. Form disclosure remains Not captured on this report, consistently across surfaces. Private API bearer/OAuth flows and local stdio MCP distribution were not exercised. No new scan was submitted, so these reads do not benchmark live intake, polling or scan-to-report latency. Site metadata was retrieved, but this non-WordPress target cannot validate CMS/plugin-version detection.

Initial harness assumptions were corrected without production code changes: consent pages use `acceptPath`/`rejectPath`, focused tracking evidence is paginated, and MCP summary findings retain bounded digests rather than entire API evidence objects. Final assertions follow those documented contracts; initial outputs remain preserved.

Raw responses, scripts, published SDK package and the verification receipt remain under `artifacts/api-mcp-sdk-release-verification-20261009/`. No recurring cost was introduced; one-time read-request cost was estimated below $0.10 and disclosed during verification.

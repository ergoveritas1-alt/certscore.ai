# @certscore/sdk

## 0.2.22

- Align the standalone GPC observation declarations with the deployed canonical API contract; client requests and runtime behavior are unchanged.
- Type successful collection-review rows, expanded vendor qualification bases, request-local processing signals, and supported GPP decoding and consistency evidence.
- Include the separate GPP propagation evidence, sale/sharing qualification policy versions through v5, and corroborated property-bound sale/sharing source references.
- Preserve optional fields and historical observation versions for backward-compatible consumption.

## 0.2.21

- Align CertScore.ai SDK declarations with the deployed API without changing client request behavior.
- Type post-Reject non-essential entity observations, cookie/service evidence, and milliseconds after the Reject click.
- Include GPC advertising-collection evidence and canonical recipients, positive-evidence provenance, extended comparison durations, and the California recipient-based score values.
- Type California posture coverage summaries and versioned policies, CMP privacy-choice inventories and unnamed-cookie references, and optional privacy-control provenance on retained records.

## 0.2.20

- Type both versioned EU and California posture scores on completed scan resources, status results and reconstructed report evidence.

## 0.2.19

- Type the optional CMP details presentation for recognized providers, custom consent controls, and visits without a banner.
- Include passively loaded CMP inventory sources in service and cookie declarations. Preserve their provenance and the distinction between loaded configuration and visible disclosure.

## 0.2.18

Extend Detailed Evidence types for scoped CMP inventories, possible cookie-template matches, inferred purpose, observed expiry and incomplete capture diagnostics. Preserve saved assessments and evidence provenance.

## 0.2.17

- Include typed California privacy-choice evidence in shared report exports and focused policy results. Preserve verified controls, unverified candidates, notice passages and provenance.

## 0.2.16

- Type the shared Detailed Evidence presentation, all 13 CMP audit criteria and safe CMS/version evidence.
- Add `cmp` and `cms` evidence selectors and on-demand `getReportEvidence` reconstruction with bounded, snapshot-checked pagination.
- Generate standalone public types from the API schemas; preserve source statuses, evidence provenance and canonical findings.

## 0.2.15

- Type and export canonical `ScanFormsSummary` and `ScanScoreExplanation` on scan resources, scan jobs and Pulse results.
- Preserve unavailable phase counts and decision-verification states in TypeScript consumers.

## 0.2.14

- Retrieve focused retained report evidence with `getReportEvidencePage(scanId, { section })`.
- Type the section selector, selection metadata and selector-preserving pagination.

## 0.2.13

- Type retained privacy choices and notice passages as `ScanResource.privacyAuditEvidence`.
- Expose bounded baseline/GPC activity comparisons through `gpcResponse.activityComparison`.
- Retrieve tracking-workpaper pages with `getReportEvidencePage(scanId, { workpaper: "tracking" })`, including JSON/CSV download links.

## 0.2.12

- Type canonical Accept/Reject `execution` outcomes and export `isSuccessfulChoicePath`.
- Count complete unconfirmed and confirmed paths together, without relying on optional `afterAction` capture.
- Keep missing historical execution separate from unsuccessful paths.

## 0.2.11

- Add typed GPC v3 bounded observations, separately from the paired response status.
- Expose evidence-bound after-click summaries for Accept and Reject without upgrading consent registration or scoring.
- Clarify complete observations, limited capture and historical records in integration examples.

## 0.2.10

- Surface GPC, post-Accept, and post-Refusal observation results on Pulse responses returned by the default `scan()` and `getScan()` SDK methods, in addition to API v2 scan and scan-job resources.

## 0.2.9

- Expose the jurisdiction-neutral GPC response, retained enablement proof, and baseline-versus-GPC comparison deltas on scan and scan-job resources.
- Expose post-Accept and post-Refusal observation outcomes alongside the GPC comparison.

## 0.2.8

- Accept `eu_de`, `eu_ie`, and `california` consistently across API v2 scan creation and latest-domain resource types.
- Align regional API v2 submissions with the shared durable scan, polling, evidence, diagnostics, no-go, and rate-limit lifecycle.

## 0.2.7

- Expose the canonical report projection version and source hash in Pulse metadata.
- Keep SDK Evidence JSON responses aligned with the report, public Pulse API, and MCP evidence tool.

## 0.2.6

- Type the no-account scan allowance and higher-volume support guidance returned by API v2 scan creation.
- Reflect the 20-new-scans-per-requester-per-UTC-day no-account allowance.

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

## Unreleased

- Add typed EU and California `summary.postureScores` to Pulse responses while
  preserving the existing generic score and older immutable artifacts.

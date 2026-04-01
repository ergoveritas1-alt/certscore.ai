# WS01 Tier Metadata Contract

## Purpose

This document defines the minimum `WS01` event and execution-summary metadata that `WC01` expects for early tier surfacing during running scans.

This is the contract that feeds:

- the in-progress `Early results` panel in `WC01`
- access-posture presentation
- later tier-aware admin and detail views

## Scope

This contract is intentionally limited to:

- Tier 0 passive baseline
- Tier 1 minimal front-door probe

It does not yet define the full Tier 2 through Tier 5 runtime artifact model.

## Where `WS01` should write this metadata

`WS01` should emit the same metadata in two places when practical:

1. execution-summary stage metadata
2. `runtime.build_phase_diagnostic` event metadata

Why both:

- execution-summary metadata is the structured source of truth
- live event metadata lets `WC01` surface early results before the final snapshot is persisted

## Stage mapping

### Tier 0

Execution summary stage:

- `baseline_lookup`

Expected `tier` value:

- `tier0_passive`

### Tier 1

Execution summary stage:

- `crawl_discovery`

Expected `tier` value:

- `tier1_front_door`

## Required metadata keys

### Common keys

These should be present whenever known:

- `tier`
- `accessPostureClass`
- `riskSpent`

Allowed values:

- `tier`
  - `tier0_passive`
  - `tier1_front_door`
- `accessPostureClass`
  - `tolerant`
  - `degraded_but_useful`
  - `early_loss`
  - `robots_limited`
  - `unknown`
- `riskSpent`
  - `none`
  - `low`
  - `medium`
  - `high`

### Tier 0 keys

Emit when known:

- `resolvedHostname`
- `canonicalHost`
- `dnsAnswers`
  - array of strings
- `tlsIssuer`
- `tlsSubject`
- `tlsValidFrom`
- `tlsValidTo`
- `priorKnownSuccessfulUrl`
- `priorKnownEvidenceSource`
  - example: `har`, `dom`, `previous_snapshot`

Minimum useful Tier 0 payload:

```json
{
  "tier": "tier0_passive",
  "resolvedHostname": "www.example.com",
  "tlsIssuer": "Amazon RSA 2048 M01",
  "riskSpent": "none"
}
```

### Tier 1 keys

Emit when known:

- `homepageFetchHttpStatus`
- `homepageFetchStatus`
- `finalUrl`
- `redirectCount`
- `contentType`
- `serverHeader`
- `blockVendorGuess`
- `blockPageClassification`
- `blockedFlag`
- `challengeSuspected`
- `rateLimitSuspected`
- `authWallSuspected`
- `verifiedPublicSurfacesCount`

Minimum useful Tier 1 payload:

```json
{
  "tier": "tier1_front_door",
  "homepageFetchHttpStatus": 403,
  "homepageFetchStatus": "forbidden",
  "finalUrl": "https://www.example.com/",
  "serverHeader": "cloudflare",
  "blockVendorGuess": "cloudflare",
  "accessPostureClass": "early_loss",
  "riskSpent": "low"
}
```

## Event contract

Event type:

- `runtime.build_phase_diagnostic`

Preferred message patterns:

- Tier 0:
  - `Passive baseline collected.`
- Tier 1:
  - `Front-door probe completed.`
  - `Front-door probe blocked.`

Event metadata requirements:

- include the same metadata keys listed above
- include `phase` or `stepKey` when helpful, but `tier` is the important key for `WC01`

Recommended Tier 0 event example:

```json
{
  "phase": "tier0_passive_baseline",
  "tier": "tier0_passive",
  "resolvedHostname": "www.example.com",
  "tlsIssuer": "Amazon RSA 2048 M01",
  "riskSpent": "none"
}
```

Recommended Tier 1 event example:

```json
{
  "phase": "tier1_front_door_probe",
  "tier": "tier1_front_door",
  "homepageFetchHttpStatus": 403,
  "homepageFetchStatus": "forbidden",
  "finalUrl": "https://www.example.com/",
  "serverHeader": "cloudflare",
  "blockVendorGuess": "cloudflare",
  "challengeSuspected": true,
  "accessPostureClass": "early_loss",
  "riskSpent": "low"
}
```

## Execution-summary metadata contract

When recording `ScannerStageOutcome.metadata`, `WS01` should write a compact summary using the same keys.

Recommended rule:

- one final metadata packet per completed stage
- do not spam many partial metadata variants for the same stage outcome

Recommended `baseline_lookup` metadata:

```json
{
  "tier": "tier0_passive",
  "resolvedHostname": "www.example.com",
  "tlsIssuer": "Amazon RSA 2048 M01",
  "riskSpent": "none"
}
```

Recommended `crawl_discovery` metadata:

```json
{
  "tier": "tier1_front_door",
  "homepageFetchHttpStatus": 200,
  "homepageFetchStatus": "ok",
  "finalUrl": "https://www.example.com/",
  "serverHeader": "envoy",
  "accessPostureClass": "tolerant",
  "verifiedPublicSurfacesCount": 1,
  "riskSpent": "low"
}
```

## Snapshot persistence alignment

When the final snapshot is written, `WS01` should persist matching values into:

- `max_requested_tier`
- `highest_attempted_tier`
- `highest_successful_tier`
- `stop_tier`
- `stop_tier_kind`
- `access_posture_class`
- `recoverable_finding_classes`

The event and execution-summary metadata should agree with those final snapshot fields.

## WC01 expectations

`WC01` currently uses these keys opportunistically:

- `tier`
- `resolvedHostname`
- `canonicalHost`
- `tlsIssuer`
- `homepageFetchHttpStatus`
- `finalUrl`
- `serverHeader`
- `blockVendorGuess`
- `accessPostureClass`
- `verifiedPublicSurfacesCount`
- `blockedFlag`
- `challengeSuspected`

If `WS01` emits those consistently, `WC01` can surface reliable early results without waiting for snapshot finalization.

## Do not emit

Avoid using stage metadata for:

- large raw HTML blobs
- unsanitized network payloads
- full cookie dumps
- verbose artifact bodies

Stage metadata should stay compact and summary-shaped.

## Validation checklist

Before considering the contract implemented in `WS01`, confirm:

- Tier 0 metadata appears in `baseline_lookup`
- Tier 1 metadata appears in `crawl_discovery`
- running scans show early Tier 0/Tier 1 results in `WC01`
- final snapshot values agree with stage metadata
- event metadata and stage metadata use the same key names

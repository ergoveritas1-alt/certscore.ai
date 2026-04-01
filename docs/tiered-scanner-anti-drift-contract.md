# Tiered Scanner Anti-Drift Contract

## Purpose

This document defines the boundary that keeps the tiered scanner redesign aligned with the existing `WC01` signal, concern, and canonical finding model.

The goal is:

- let `WS01` change how evidence is collected
- without changing what `WC01` treats as evidence-backed truth

This prevents scanner execution posture from leaking directly into canonical finding logic.

## Core rule

Tier metadata is execution context, not substantive evidence by itself.

That means:

- a finding must not exist because a scan reached a certain tier
- a finding must exist only because retained evidence supports a normalized concern and that concern is eligible for promotion

## Canonical pipeline remains unchanged

The ordering documented in [normalized-concern-pipeline.md](/Users/benmasek/WC01/docs/normalized-concern-pipeline.md) remains the required path:

1. normalize inputs into a concern
2. apply concern policy
3. promote eligible concerns into unified findings
4. merge into canonical report objects

The tiered scanner redesign must fit into that pipeline, not replace it.

## Responsibility split

### `WS01`

`WS01` owns:

- tier execution
- stop conditions
- browser freshness and isolation
- access posture classification
- artifact retention quality
- execution metadata

`WS01` may emit:

- raw signals
- artifacts
- execution summaries
- access posture and stop metadata

### `WC01`

`WC01` owns:

- evidence interpretation
- normalized concerns
- concern policy
- unified finding promotion
- canonical object assembly
- customer-facing surfacing

`WC01` must not infer stronger substantive conclusions only because a tier was reached.

## Field classification

The tier redesign introduces or emphasizes several classes of fields.

### Class A: Substantive evidence fields

These can directly contribute to normalized concerns and unified findings because they describe retained evidence:

- visible privacy/legal surface evidence
- CMP identifiers retained in DOM, HTML, or runtime artifacts
- cookies and storage retained from runtime capture
- sanitized network evidence
- consent interaction results retained as artifacts
- policy page presence and policy content evidence
- challenge/interstitial evidence retained from headers, body, screenshot, or DOM

These remain valid inputs to concern normalization.

### Class B: Execution-context fields

These describe how the scanner got its evidence and what it attempted:

- `maxRequestedTier`
- `highestAttemptedTier`
- `highestSuccessfulTier`
- `stopTier`
- `stopTierKind`
- `tierTrace`
- `browserStateQuality`
- `recommendedNextTier`
- `cooldownRecommended`
- `cooldownUntil`
- `riskSpent`

These must not directly trigger unified findings.

They may inform:

- access-limitation concerns
- evidence sufficiency concerns
- reviewer/admin context
- product surfacing status

### Class C: Hybrid access-posture fields

These are execution-derived but may support internal concerns when paired with retained evidence:

- `accessPostureClass`
- `blockedFlag`
- `captchaFlag`
- `challengeSuspected`
- `rateLimitSuspected`
- `authWallDetected`
- `authWallSuspected`
- `fingerprintBlockSuspected`
- `geoBlockSuspected`
- `blockVendorGuess`
- `blockPageClassification`
- `verifiedPublicSurfacesCount`

These should generally normalize into access or insufficiency concerns, not substantive compliance findings.

## Allowed uses of tier metadata in `WC01`

Tier metadata may be used to:

- explain why some evidence classes are missing
- support internal access-posture concerns
- downscope confidence when deeper evidence was not safely reachable
- improve stop-reason and product-status presentation
- decide whether a concern is external, audit-only, or suppressed

Tier metadata may also support normalized concerns such as:

- `front_door_access_limited`
- `browser_surface_unverified`
- `runtime_capture_not_attempted_due_to_access_risk`
- `interaction_not_attempted_due_to_access_risk`
- `partial_value_retained_before_block`

## Disallowed shortcuts

The following should be treated as anti-patterns.

### Disallowed: tier-as-finding shortcut

Do not write logic like:

- "Tier 3 reached, therefore pre-consent tracking finding is eligible"
- "Tier 4B reached, therefore privacy-choice finding is promotable"

Tier reach is not itself evidence.

### Disallowed: stop-reason suppression shortcut

Do not suppress findings solely because:

- the scan stopped early
- the homepage was challenged
- the scan outcome includes blocked or auth-wall language

If retained evidence supports a concern, that concern should still be evaluated on its merits.

### Disallowed: execution-context promotion

Do not promote unified findings from:

- `accessPostureClass`
- `highestSuccessfulTier`
- `tierTrace`
- `browserStateQuality`

without retained substantive evidence.

### Disallowed: canonical object branching by tier

Canonical unified finding IDs and finding-family assembly should not fork by scanner tier.

Tier should affect:

- evidence sufficiency
- access posture
- presentation context

not the identity of the finding itself.

## Preferred pattern

When tier context matters, use this pattern:

1. retained evidence creates a substantive or access-related normalized concern
2. tier metadata informs whether that concern is:
   - promotable
   - internal only
   - audit only
   - insufficiently supported
3. unified findings still depend on evidence-backed concern promotion

Example:

- retained runtime evidence shows trackers firing on initial load
- tier metadata shows runtime capture succeeded only through Tier 3 and interaction was never attempted
- `WC01` may:
  - promote a pre-interaction tracking concern
  - avoid stronger reject-effectiveness findings
  - add an internal insufficiency concern explaining that reject-path evidence was not collected

## Minimum-evidence framing

When mapping scan capabilities to findings, use:

- minimum evidence contract

not:

- minimum tier reached

Tiers are useful because they predict which evidence classes are usually available, but the canonical model should remain evidence-first.

## Canonical object guardrails

The canonical unified finding object should remain stable across scanner redesign iterations.

The tiered redesign should therefore avoid:

- new canonical finding IDs that merely restate access posture
- tier-specific variants of the same finding family
- direct insertion of tier names into user-facing finding taxonomy

If customer-facing access messaging is needed, it should live in:

- scan status
- access-limitation sections
- executive summary context
- audit-only or internal concerns where appropriate

not in the canonical substantive finding taxonomy unless the taxonomy itself is intentionally expanded.

## Product surfacing guardrails

Product presentation should distinguish between:

- substantive findings supported by retained evidence
- access limitations that constrained evidence collection

Both matter, but they should not collapse into a single severity or status concept.

The product should be able to say:

- the scan recovered meaningful findings
- deeper runtime or interaction evidence was limited by site protections

without implying either:

- a total scan failure
- stronger substantive claims than the evidence supports

## Recommended implementation checks

Before shipping each phase of the tier redesign, confirm:

- no new unified-finding rule depends directly on tier names or tier numbers
- access-posture fields normalize into concerns before affecting surfacing
- tier-limited scans still promote supported concerns from retained evidence
- degraded-but-useful scans are not mislabeled as practical failures
- canonical finding IDs and evidence contracts remain stable unless intentionally revised

## Suggested review checklist

When reviewing future scanner-tier changes, ask:

- does this field describe retained evidence or execution context?
- if execution context, is it being used only for access, sufficiency, or presentation?
- could the same decision be expressed as a normalized concern instead of a raw shortcut?
- would this change cause the same evidence to produce a different canonical finding only because scan posture changed?

If the answer to the last question is yes, the change likely introduces drift.

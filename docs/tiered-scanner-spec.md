# Tiered Scanner Spec

## Purpose

This document defines the next scanner execution model for `WS01` and the product-side contract expected by `WC01`.

The primary objective is:

- maximize useful low-risk signal capture before the first meaningful blocker

This is a different optimization target than "reach full scan depth whenever possible." In practice, many domains tolerate some scan depth but not all scan depth. The scanner should preserve partial value instead of burning trust budget early and returning little or no evidence.

## Repo boundary

- `WS01` owns tier execution, scanner heuristics, browser/runtime collection, stop conditions, and artifact quality
- `WC01` owns concern normalization, concern policy, unified-finding promotion, and product-facing surfacing

`WC01` should continue to consume scanner outputs through the normalized concern pipeline documented in [normalized-concern-pipeline.md](/Users/benmasek/WC01/docs/normalized-concern-pipeline.md).

## Design principles

- Each new domain scan starts from a fresh isolated browser state.
- Tier escalation is earned, not assumed.
- Every tier must justify its access risk with meaningful new signal classes.
- Blockers are valid outputs, not only failures.
- Stop reasons must not erase already-recovered value.
- New gating logic should prefer:
  1. normalize into a concern
  2. apply concern policy
  3. promote eligible concerns into unified findings

## Research summary behind this spec

From the March 30, 2026 sample:

- only a minority of unique domains were true early-loss cases
- the dominant early-loss mode was front-door challenge or deny, usually HTTP `403`
- many scans labeled as blocked still produced meaningful signal and findings
- the redesign problem is therefore split:
  - recover more value on early-loss domains
  - present degraded-but-useful scans accurately

## Tier model

### Tier 0: Passive Baseline

Purpose:

- collect zero-risk baseline identity without touching the front door

Allowed actions:

- DNS resolution
- TLS certificate metadata
- reuse of prior known local evidence such as existing HAR, DOM, or prior successful scan metadata

Explicitly not allowed:

- homepage `HEAD`
- homepage `GET`
- `robots.txt`
- browser navigation

Primary outputs:

- hostname and edge layout
- certificate metadata
- known canonical host candidates
- known prior-success baseline, if available

Finding coverage:

- internal access-posture and scanability context only
- no customer-facing compliance findings should depend on Tier 0 alone

Escalation rule:

- default escalation target is Tier 1
- stop only if the target domain/surface cannot be identified reliably

### Tier 1: Minimal Front-Door Probe

Purpose:

- learn whether the front door is currently readable with the lowest possible request cost

Allowed actions:

- one top-level request only
- preferred default is `HEAD`
- one top-level `GET` body fetch is optional when title/interstitial classification is needed before browser escalation

Explicitly not allowed by default:

- `robots.txt`
- multiple homepage retries
- browser automation

Primary outputs:

- current reachability
- status code
- final URL
- redirect behavior
- content type
- CDN/WAF/server headers
- top-level blocked/interstitial detection

Finding coverage:

- homepage reachable or unavailable
- top-level access limitation
- canonical redirect behavior

Escalation rule:

- escalate to Tier 2 if the domain is readable or if a browser-first confirmation is worth one controlled attempt
- stop if the response clearly establishes a high-confidence early-loss path and browser escalation is not justified

### Tier 2: Clean Browser Verification

Purpose:

- determine whether a fresh browser can render a usable public surface

Allowed actions:

- one clean isolated browser navigation
- no clicks
- no scroll unless necessary to confirm initial surface
- short wait for stable load

Primary outputs:

- rendered or challenged page result
- page title
- screenshot
- top-level DOM identity
- visible legal/privacy/navigation surface
- first-party asset pattern
- CMP presence if visible or loaded

Finding coverage:

- public surface availability
- privacy or legal surface presence
- CMP surface presence
- challenge/interstitial rendered in browser

Escalation rule:

- escalate to Tier 3 only if a usable browser page rendered
- stop if the browser lands directly on a challenge/interstitial with no meaningful page surface

### Tier 3: Shallow Runtime Observation

Purpose:

- collect passive runtime evidence from initial load before any user interaction

Allowed actions:

- continue from the same fresh Tier 2 browser context
- bounded observation window
- capture cookies, storage, and sanitized network evidence
- no consent clicks

Primary outputs:

- initial cookies
- initial local/session storage
- initial sanitized request domain set
- CMP runtime state
- tracker and vendor categories observed on first load
- whether consent state appears implicit, deferred, unknown, or explicit

Finding coverage:

- pre-interaction tracking
- pre-interaction storage
- CMP active on load
- possible implicit consent state

Escalation rule:

- escalate to Tier 4A only if a privacy or consent surface is present or runtime state suggests further inspection is worthwhile
- stop if runtime capture destabilizes the session or yields no additional meaningful surface

### Tier 4A: Surface Inspection

Purpose:

- inspect visible privacy and consent controls without mutating consent state

Allowed actions:

- inspect DOM and visible controls
- identify banner, modal, footer links, or privacy-choice entry points
- no clicks

Primary outputs:

- banner presence or absence
- visible choice model
- visible reject/manage/preferences affordances
- privacy-choice entry points

Finding coverage:

- privacy-choice surface present or absent
- first-layer consent surface present or absent
- visible choice affordance class

Escalation rule:

- escalate to Tier 4B only if a bounded interaction is likely to unlock a meaningful new finding class
- stop if no meaningful choice surface is present

### Tier 4B: Bounded Interaction

Purpose:

- perform one low-risk interaction to test whether a real preferences or choice surface opens

Allowed actions:

- one bounded click or interaction
- preferred order:
  1. open privacy choices or preferences
  2. inspect surfaced controls
  3. stop

Explicitly not allowed by default:

- save changes
- accept all
- reject all
- multi-step parity testing

Primary outputs:

- whether a preferences UI opens
- surfaced toggles or categories
- basic dialog or panel identity

Finding coverage:

- preferences surface exposed or not exposed in this session
- stronger evidence around existence of user-choice controls

Escalation rule:

- escalate to Tier 4C only for domains where parity or effectiveness testing is justified
- stop if interaction triggers friction or invalidates the session

### Tier 4C: Comparative Consent Interaction

Purpose:

- test meaningful user-choice outcomes and parity only after lower-risk evidence is already retained

Allowed actions:

- bounded reject, accept, or manage-preferences flows
- before/after runtime delta capture

Primary outputs:

- accept/reject parity
- whether reject is exposed
- whether reject suppresses optional tracking
- whether optional categories are preselected

Finding coverage:

- ineffective reject path
- accept/reject asymmetry
- dark-pattern indicators
- post-choice runtime mismatch

Escalation rule:

- stop after one comparative flow per session unless explicitly configured otherwise

### Tier 5: Full CertScore Scan

Purpose:

- run the broader scan suite for domains that tolerate prior tiers or where deeper coverage is worth the access risk

Allowed actions:

- broader key-page discovery
- deeper runtime validation
- policy extraction
- contradiction and review pipelines

Primary outputs:

- full evidence set and report packet

## Stop conditions

Stop conditions should be evaluated after every tier.

### Hard stop

- clear WAF or challenge interstitial with no usable public surface
- repeated `403` or `429` at the same tier boundary
- CAPTCHA or challenge escalation after a bounded retry budget
- browser session invalidated before meaningful surface
- evidence that continued probing is likely to reduce rather than increase recoverable value

### Soft stop

- the next tier does not unlock a meaningful new finding class
- the next tier would mutate state without enough prior evidence to justify it
- the domain is already producing sufficient value for the requested scan depth

### Cooldown recommendation

When a hard stop is reached, `WS01` should persist a cooldown recommendation instead of immediately escalating or retrying.

## Execution flow

`WS01` execution should move from a monolithic pass to a tier-driven loop.

### Proposed flow

1. initialize fresh scan session and isolated browser plan
2. run Tier 0
3. evaluate tier outputs and stop conditions
4. if justified, run Tier 1
5. evaluate tier outputs and stop conditions
6. continue tier-by-tier until:
   - the requested max depth is reached
   - a hard stop is reached
   - a soft stop is reached
7. persist:
   - highest attempted tier
   - highest successful tier
   - stop tier
   - stop reason
   - recoverable signal classes
   - confidence and cooldown guidance

### Stage mapping

The existing execution summary in [scanner-execution.ts](/Users/benmasek/WC01/packages/shared/src/types/scanner-execution.ts) should remain the outer lifecycle contract, but stage metadata should include tier progress:

- `setup_load`
- `baseline_lookup`
  - Tier 0
- `crawl_discovery`
  - Tier 1 and Tier 2
- `runtime_snapshot_capture`
  - Tier 3 and Tier 4
- `signal_derivation`
  - tier-aware signal and concern derivation
- `persistence_diff_finalization`

`WS01` does not need a brand-new execution-summary contract to adopt tiers; it needs tier-aware metadata inside the existing summary.

## Browser-state rules

- Every new scan starts from a fresh isolated browser state.
- Tier 2 through Tier 4 for the same scan should reuse the same fresh context intentionally.
- A retry or a new scan of the same domain must start fresh again.
- Fresh state means:
  - no cookies
  - no local/session storage carryover
  - no service workers
  - no cache carryover
  - no extension contamination in headed/manual-assisted modes

## Data contract additions

The current snapshot model in [snapshots.ts](/Users/benmasek/WC01/packages/shared/src/types/snapshots.ts) already carries many access-limitation fields. The tier model needs additive fields, not a replacement.

### Required snapshot fields

Add scanner-side fields for:

- `maxRequestedTier`
- `highestAttemptedTier`
- `highestSuccessfulTier`
- `stopTier`
- `stopTierKind`
  - `hard_stop | soft_stop | max_depth_reached | completed`
- `tierTrace`
  - compact JSON summary of each tier attempt
- `browserStateQuality`
  - `fresh_isolated | reused_context | not_applicable_http_only | unknown`
- `accessPostureClass`
  - `tolerant | degraded_but_useful | early_loss | robots_limited | unknown`
- `recoverableFindingClasses`
  - string array of finding classes supported by retained evidence
- `recommendedNextTier`
- `cooldownRecommended`
- `cooldownUntil`

### Tier trace shape

Each tier record should capture:

- `tier`
- `attempted`
- `succeeded`
- `startTime`
- `endTime`
- `requestCount`
- `browserUsed`
- `artifactsProduced`
- `signalClassesObserved`
- `newFindingClassesUnlocked`
- `stopReasonCode`
- `stopReasonDetail`
- `riskSpent`

`riskSpent` is intentionally qualitative at first:

- `none`
- `low`
- `medium`
- `high`

### Why this belongs in `WS01`

These fields describe execution posture and access dynamics, which are scanner concerns. `WC01` should consume them as evidence and presentation context, not infer them from raw artifacts after the fact.

## Finding-class coverage by tier

This mapping should guide escalation policy and later surfacing.

- Tier 0:
  - scanability and access-posture context only
- Tier 1:
  - homepage reachable or blocked
  - top-level access limitation
- Tier 2:
  - public surface availability
  - visible legal/privacy surface
  - CMP presence
- Tier 3:
  - initial tracking and storage
  - implicit consent-runtime state
- Tier 4A:
  - visible privacy-choice and consent surface
- Tier 4B:
  - preferences UI exposure
- Tier 4C:
  - reject/accept effectiveness
  - parity and dark-pattern findings
- Tier 5:
  - broader policy/runtime contradiction and full report coverage

This mapping should not be enforced by raw signal shortcuts in `WC01`. It should inform concern normalization and promotion policy.

## Concern pipeline implications for `WC01`

`WC01` should add normalized concerns representing access posture and tier-limited evidence quality, for example:

- `front_door_access_limited`
- `browser_surface_unverified`
- `runtime_capture_not_attempted_due_to_access_risk`
- `preferences_ui_not_observed_in_bounded_interaction`
- `partial_value_retained_before_block`

These concerns should:

- remain internal when they only describe scanability
- become externally surfacable only when they materially affect what the product can honestly claim

This preserves the design rule from [normalized-concern-pipeline.md](/Users/benmasek/WC01/docs/normalized-concern-pipeline.md): access posture should become structured concerns before it shapes unified findings or customer-facing messaging.

## Product surfacing implications

Product copy and status logic should distinguish:

- `blocked early`
- `completed with access limitations`
- `robots-limited`
- `completed successfully`

Scans in the degraded-but-useful class should not be presented as practical failures when they already recovered substantial findings.

## Recommended rollout

### Phase 1

- add tier metadata fields
- add Tier 0 and Tier 1 execution
- preserve current deeper execution behind a temporary `maxRequestedTier`

### Phase 2

- split current browser execution into Tier 2 and Tier 3
- add browser freshness guarantees
- add access-posture classification

### Phase 3

- split current interaction logic into Tier 4A, Tier 4B, and Tier 4C
- wire tier-limited concerns into `WC01`

### Phase 4

- recalibrate product status and admin reporting around:
  - early loss
  - degraded but useful
  - robots limited
  - tolerant

## Open questions

- whether `robots.txt` should remain outside Tier 1 by default on fragile domains
- whether Tier 1 browser fallback should be automatic for some challenge-like domains or opt-in by risk profile
- whether cooldown should be per domain, per registered domain, or per egress
- whether preview scans should cap at Tier 2 or Tier 3
- whether `WC01` needs a customer-facing partial-value badge when a scan stopped after meaningful evidence was already retained

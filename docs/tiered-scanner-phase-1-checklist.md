# Tiered Scanner Phase 1 Checklist

## Goal

Phase 1 should establish the minimum contract for tiered scanning without rewriting the entire scanner.

Phase 1 scope:

- add tier-aware execution metadata
- add Tier 0 passive baseline
- add Tier 1 minimal front-door probe semantics
- preserve the current deeper scan path behind an explicit max-depth contract
- avoid drift in `WC01` finding logic

This phase is primarily about:

- execution posture
- persistence contract
- status and surfacing semantics

It is not yet the full runtime refactor.

## Phase 1 acceptance criteria

- every new scan can declare a max requested tier
- every completed scan records highest attempted and highest successful tier
- every scan records whether it stopped early, and why
- Tier 0 can be represented distinctly from Tier 1
- Tier 1 can be represented as a single minimal front-door probe
- `WC01` product views can distinguish:
  - blocked early
  - completed with access limitations
  - robots-limited
  - completed successfully
- no unified finding logic depends directly on tier names or tier numbers

## Implementation slices

### 1. Shared contract updates

Target files:

- [snapshots.ts](/Users/benmasek/WC01/packages/shared/src/types/snapshots.ts)
- [scanner-execution.ts](/Users/benmasek/WC01/packages/shared/src/types/scanner-execution.ts)

Additions in `snapshots.ts`:

- add tier enums or string unions for:
  - `ScanExecutionTier`
    - `tier0_passive`
    - `tier1_front_door`
    - `tier2_browser_surface`
    - `tier3_runtime_observation`
    - `tier4a_surface_inspection`
    - `tier4b_bounded_interaction`
    - `tier4c_comparative_interaction`
    - `tier5_full_scan`
  - `ScanStopTierKind`
    - `hard_stop`
    - `soft_stop`
    - `max_depth_reached`
    - `completed`
  - `BrowserStateQuality`
    - `fresh_isolated`
    - `reused_context`
    - `not_applicable_http_only`
    - `unknown`
  - `AccessPostureClass`
    - `tolerant`
    - `degraded_but_useful`
    - `early_loss`
    - `robots_limited`
    - `unknown`
  - `RecoverableFindingClass`
    - start as a string union or documented string set, not an over-modeled taxonomy

Additive `ScanSnapshot` fields:

- `maxRequestedTier`
- `highestAttemptedTier`
- `highestSuccessfulTier`
- `stopTier`
- `stopTierKind`
- `tierTrace`
- `browserStateQuality`
- `accessPostureClass`
- `recoverableFindingClasses`
- `recommendedNextTier`
- `cooldownRecommended`
- `cooldownUntil`

Additions in `scanner-execution.ts`:

- keep the existing stage model
- extend stage `metadata` conventions to include:
  - `tier`
  - `tierAttempt`
  - `tierOutcome`
  - `stopTier`
  - `stopTierKind`
- do not replace the stage summary contract in Phase 1

Phase 1 decision:

- store tier detail in stage metadata and `scan_snapshots`
- do not add a separate execution table yet

### 2. Database contract updates

Target area:

- new migration in [packages/db/migrations](/Users/benmasek/WC01/packages/db/migrations)

Add snapshot columns for the Phase 1 fields above.

Recommended persistence shape:

- scalar columns for:
  - `max_requested_tier`
  - `highest_attempted_tier`
  - `highest_successful_tier`
  - `stop_tier`
  - `stop_tier_kind`
  - `browser_state_quality`
  - `access_posture_class`
  - `recommended_next_tier`
  - `cooldown_recommended`
  - `cooldown_until`
- JSONB for:
  - `tier_trace`
  - `recoverable_finding_classes`

Phase 1 caution:

- keep the migration additive only
- do not repurpose existing blocked/auth/challenge columns

### 3. Scan creation contract

Target file:

- [create-full-scan.ts](/Users/benmasek/WC01/apps/web/server/scans/create-full-scan.ts)

Phase 1 changes:

- add `maxRequestedTier` to `scan_config_json`
- default manual full scans to a temporary max tier that preserves current behavior
- add a config flag for `freshBrowserRequired: true`
- keep current `post403Policy` for now, but document that it is transitional and will later be tier-policy driven

Recommended initial default:

- full scans:
  - `maxRequestedTier = tier5_full_scan`
- preview scans:
  - likely `tier2_browser_surface` or `tier3_runtime_observation`
  - decide in a follow-up ticket

### 4. Scanner-side execution wiring

Repo boundary note:

- implementation belongs in `WS01`
- this checklist records the expected contract from `WC01`

Phase 1 `WS01` tasks:

- implement explicit Tier 0 passive baseline collection
- implement explicit Tier 1 minimal front-door probe collection
- persist tier progression metadata into `scan_snapshots`
- classify stop tier and access posture class at end of run
- classify browser state quality

Phase 1 non-goals:

- do not fully split existing browser logic into Tier 2, 3, and 4 internals yet
- do not redesign the full runtime artifact schema yet

### 5. Stop-reason and access-posture semantics

Target files:

- [scan-stop-reason.ts](/Users/benmasek/WC01/apps/web/lib/scans/scan-stop-reason.ts)
- [unverified-homepage-reason.ts](/Users/benmasek/WC01/apps/web/lib/scans/unverified-homepage-reason.ts)

Phase 1 changes:

- preserve current stop-reason derivation
- add presentation-aware helpers or adapters that can combine:
  - stop reason
  - highest successful tier
  - access posture class
- avoid changing canonical stop-reason codes unless necessary

Desired product distinction:

- `blocked early`
  - little or no retained evidence
- `completed with access limitations`
  - meaningful retained evidence plus access friction
- `robots-limited`
- `completed successfully`

Phase 1 caution:

- do not overload `scan_outcome` with every new nuance
- use new tier fields to provide nuance

### 6. Admin and scan-detail surfacing

Target files:

- [list-admin-scans.ts](/Users/benmasek/WC01/apps/web/server/admin/list-admin-scans.ts)
- [get-admin-scan-detail.ts](/Users/benmasek/WC01/apps/web/server/admin/get-admin-scan-detail.ts)
- [get-scan-by-id.ts](/Users/benmasek/WC01/apps/web/server/scans/get-scan-by-id.ts)
- related UI files under:
  - [/Users/benmasek/WC01/apps/web/components/scans](/Users/benmasek/WC01/apps/web/components/scans)
  - [/Users/benmasek/WC01/apps/web/app/app/admin/scans](/Users/benmasek/WC01/apps/web/app/app/admin/scans)

Phase 1 server additions:

- include tier fields from `scan_snapshots` in admin list/detail queries
- expose `accessPostureClass`
- expose `highestSuccessfulTier`
- expose `stopTier`
- expose `recoverableFindingClasses`

Phase 1 UI goals:

- admin list can distinguish early-loss from degraded-but-useful
- scan detail can explain:
  - what the scan achieved
  - where it stopped
  - what classes of findings are still supportable

Phase 1 caution:

- do not expose raw `tierTrace` by default in customer-facing UI
- reserve the full trace for admin/debug surfaces

### 7. Concern-pipeline guardrails

Target files:

- [normalized-concerns.ts](/Users/benmasek/WC01/apps/web/lib/scans/normalized-concerns.ts)
- [concern-policy.ts](/Users/benmasek/WC01/apps/web/lib/scans/concern-policy.ts)
- [finding-evidence-gates.ts](/Users/benmasek/WC01/apps/web/lib/scans/finding-evidence-gates.ts)
- [unified-findings.ts](/Users/benmasek/WC01/apps/web/lib/scans/unified-findings.ts)

Phase 1 changes:

- do not add tier-as-finding shortcuts
- add only access and sufficiency concerns if needed, such as:
  - `front_door_access_limited`
  - `partial_value_retained_before_block`
  - `runtime_capture_not_attempted_due_to_access_risk`

Phase 1 non-goals:

- do not revise canonical unified finding IDs
- do not create tier-specific finding families

### 8. Metrics and validation

Target files:

- [list-admin-scans.ts](/Users/benmasek/WC01/apps/web/server/admin/list-admin-scans.ts)
- blocked-run telemetry logic already in the same module

Add Phase 1 metrics:

- scans by `accessPostureClass`
- scans by `highestSuccessfulTier`
- scans by `stopTier`
- degraded-but-useful rate
- early-loss rate

Validation dataset:

- early-loss sample:
  - `hostgator.com`
  - `tripadvisor.com`
  - `www.noaa.gov`
- degraded-but-useful sample:
  - `docker.com`
  - `oxylabs.io`
  - `eventbrite.com`
- robots-limited sample:
  - `instagram.com`
  - `marketwatch.com`

Validation questions:

- did the new fields classify these runs correctly?
- did product surfaces avoid calling degraded-but-useful runs failures?
- did any finding behavior drift because of tier metadata?

## Suggested ticket breakdown

### Ticket 1: Shared tier contract

Deliverables:

- shared type additions in `snapshots.ts`
- shared metadata conventions in `scanner-execution.ts`

### Ticket 2: Snapshot migration

Deliverables:

- additive migration for new snapshot fields

### Ticket 3: Scan config wiring

Deliverables:

- `maxRequestedTier` and `freshBrowserRequired` in scan config creation

### Ticket 4: WS01 Phase 1 persistence

Deliverables:

- Tier 0 and Tier 1 metadata persisted
- stop tier and access posture classification

### Ticket 5: Admin and detail surfacing

Deliverables:

- tier-aware scan status context in admin and scan detail surfaces

### Ticket 6: Concern guardrails

Deliverables:

- any new access-limitation concerns added without changing substantive finding promotion semantics

## Definition of done for Phase 1

Phase 1 is done when:

- a scan can declare and persist tier posture
- early-loss vs degraded-but-useful is visible in product/admin surfaces
- current finding promotion remains evidence-first
- the system is ready for Phase 2 browser/runtime splitting without contract churn

## Explicitly deferred to Phase 2+

- full split of current browser logic into Tier 2 and Tier 3 execution
- full split of consent interaction logic into Tier 4A, 4B, and 4C execution
- preview-tier product decisions
- automatic per-domain escalation policies
- cooldown policy optimization
- full customer-facing partial-value messaging

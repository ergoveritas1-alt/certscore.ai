# Normalized Concern Pipeline

## Purpose

`WC01` standardizes scanner-derived inputs through one internal concern contract before anything becomes a unified finding or a customer-facing surfaced finding.

This keeps the canonical taxonomy and report payload stable while giving us one place to reason about:

- what concern a piece of evidence represents
- how strong that evidence is
- whether the concern is eligible for promotion
- whether the concern is externally surfacable or audit-only

## Repo boundary

- `WS01` owns evidence collection and scanner-side artifact quality
- `WC01` owns concern normalization, concern policy, unified finding assembly, and customer-facing surfacing

## Current flow

1. `WS01` emits scanner outputs
   - snapshot fields and scores
   - compatibility signals
   - policy enrichment rows
   - policy review queue rows
   - runtime artifacts

2. `WC01` normalizes incoming inputs into `NormalizedConcern`
   - primary signals
   - supplemental policy review rows
   - validation findings

3. `WC01` applies shared concern policy
   - `promotionEligibility`: `eligible | internal_only | blocked`
   - `externalSurfacingEligibility`: `eligible | audit_only | suppress`

4. Eligible concerns become unified-finding candidates

5. Candidates map into the existing canonical unified finding IDs

6. Unified finding packets are merged and get a final presentation decision

## Key files

- Concern normalization:
  - [normalized-concerns.ts](/Users/benmasek/WC01/apps/web/lib/scans/normalized-concerns.ts)
- Concern policy:
  - [concern-policy.ts](/Users/benmasek/WC01/apps/web/lib/scans/concern-policy.ts)
- Primary signal gate adapter:
  - [finding-evidence-gates.ts](/Users/benmasek/WC01/apps/web/lib/scans/finding-evidence-gates.ts)
- Supplemental policy-review gate adapter:
  - [supplemental-policy-review-gates.ts](/Users/benmasek/WC01/apps/web/lib/scans/supplemental-policy-review-gates.ts)
- Canonical unified finding assembly:
  - [unified-findings.ts](/Users/benmasek/WC01/apps/web/lib/scans/unified-findings.ts)

## Design rule

New `WC01` scan/finding logic should prefer this sequence:

1. normalize into a concern
2. apply concern policy
3. convert to unified-finding candidate if eligible
4. let unified finding packets handle only canonical merge and report-level exceptions

Avoid adding new direct raw-signal or raw-policy-row gating paths when the same decision can be expressed through concern normalization and concern policy.

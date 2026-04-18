# Scanner Project Boundary

`WS01` is now the standalone scanner project and runtime home. `WC01` should be treated as the product control plane that creates scans, reads scan state, and renders product-facing results.

## Scanner project responsibilities
- scanner runtime entrypoints
- scanner crawler identity and public scanner domain
- scheduled scan creation and scan claiming
- scanner runtime health and heartbeat behavior
- future cloud/runtime migration to AWS

## Product repo responsibilities
- user-facing product web apps
- scan-triggering UI and product workflows
- organization, plan, and dashboard logic
- validation UI and non-scanner product surfaces
- compatibility shims needed while `WC01` shares the database contract with the scanner

## Current contract
- product apps persist scan requests as `scans.status = queued`
- scanner service claims queued work from the database
- scanner service owns execution pickup and heartbeat availability
- `WC01` should not be treated as the source of truth for scanner runtime behavior

## Current repo boundary
- `WC01` no longer carries `packages/scan-core`; that package now lives in the sibling `WS01` workspace
- scanner-side extraction, enrichment, and runtime changes should originate in `WS01`
- `WC01` should limit scan-specific logic to normalization, concern policy, unified-finding assembly, and product-facing presentation

## Follow-up tickets

### Ticket: Add `affiliate_disclosure_present`

Goal:
- add a positive transparency finding for sites that clearly expose an affiliate disclosure page or equivalent affiliate disclosure language

Scope:
- define the canonical evidence shape in `WS01`
- normalize and promote the resulting signal through the standard `WC01` concern pipeline
- validate on sites like `kbdlab.io` where an affiliate disclosure page is clearly reachable

Acceptance notes:
- should surface only when the disclosure path is clearly retained
- should avoid piggybacking on unrelated privacy-policy evidence

### Ticket: Revisit suppression for `bounded_key_page_discovery_unresolved`

Goal:
- reduce low-value internal noise on sites where key legal/support pages are already obviously reachable through stable footer or legal navigation

Scope:
- review whether this should be suppressed or downranked when the scan already retained clear paths to expected legal pages
- keep the decision in the normalized concern and concern policy flow rather than adding new raw-signal exceptions
- calibrate against `kbdlab.io` and similar sites that expose `Terms`, `Privacy`, and `Contact` paths clearly

Acceptance notes:
- should preserve reviewer value for genuine discovery failures
- should avoid surfacing or prioritizing this concern when retained evidence already shows the expected legal pages are reachable

This document records the boundary now that the standalone scanner repo exists.

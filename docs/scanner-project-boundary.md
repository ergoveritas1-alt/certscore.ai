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
- compatibility shims needed while `WC01` still shares the database contract with the scanner

## Current contract
- product apps persist scan requests as `scans.status = queued`
- scanner service claims queued work from the database
- scanner service owns execution pickup and heartbeat availability
- `WC01` should not be treated as the source of truth for scanner runtime behavior

## Transitional code still in `WC01`
- `apps/scanner` and `packages/scan-core` remain here only as migration carryover and compatibility scaffolding
- new scanner runtime, crawler identity, and operational changes should originate in `WS01`

This document records the boundary now that the standalone scanner repo exists.

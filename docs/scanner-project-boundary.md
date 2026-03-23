# Scanner Project Boundary

Phase 1 keeps scanner runtime in this monorepo, but the intended ownership boundary is now:

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

## Phase 1 contract
- product apps persist scan requests as `scans.status = queued`
- scanner service claims queued work from the database
- scanner service owns execution pickup and heartbeat availability
- `@website-signal-risk-scanner/scan-core` remains the shared engine until the scanner project is fully extracted

This document is the extraction boundary for the future standalone scanner repo/Codex project.

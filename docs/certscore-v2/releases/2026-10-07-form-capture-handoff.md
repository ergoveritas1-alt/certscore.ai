# October 7 form capture handoff release

The owner authorized committing and deploying the intended follow-up changes after
one fresh localhost Accept-only SITS verification. This release fixes the late
form detection handoff, preserves structured fields independently of optional
images, and prevents incomplete empty captures from looking like verified absence.
Historical evidence, scores and customer records are not rewritten.

## Included behavior

- A validated main-frame visible-field notification can activate the existing
  approved late-form allowance before the full inventory response returns.
  No notification received within the original window means no extension.
- Structured form capture v2 samples throughout the existing confirmed Accept
  window, binds its terminal coverage and preserves independent iframe fields.
  Legacy v1 remains readable with its original provenance.
- Reports, API v2 and Pulse/MCP share retained form counts and additive
  `countStatus`. Incomplete empty capture reads `Not captured`; a completed
  empty inspection can still read `0`. Images failing review do not erase fields.
  Coverage metadata does not add a verbose form-table disclaimer.
- Report timestamps use the browser timezone when available, with explicit UTC
  server/fallback rendering. The pre-consent classification disclosure sits
  above and inside the executive inventory card.
- Development review routes remain local-only, fail closed in production and
  serve only integrity-verified masked images. Fixture and live packet bytes are
  ignored and excluded from image builds.
- Restore Next's isolated webpack build worker and enable its memory
  optimizations. The custom extension-alias configuration had disabled the
  automatic worker; local full-gate compilation exhausted the 8 GiB heap.
  This changes compilation only and preserves the existing runtime and heap caps.
  The local dependency tracer also traversed the ignored diagnostics tree.
  Temporarily preserving that tree outside the repository allowed compilation
  to finish in 36 seconds at a 4 GiB cap; Docker already excludes these inputs.
  The development image reader now uses two explicit file paths.

## Verification

Fresh local SITS run `0273807b-785b-4683-a41b-ae7aa948be66` used the existing
ConsentCheckBot HTTP/native navigator posture, one context, one confirmed Borlabs
Accept click, no retry and no submitted forms. It completed in 11.220 seconds,
retaining two reviewed screenshots, eight contact fields and one newsletter field.
Contact request-handling/privacy/marketing notices were retained. Newsletter
privacy disclosure was not captured. The separate structured capture remained
limited by the existing frame cap; independently verified images and fields remain.
The canonical contact history was checked, selection used a narrow owner-approved
hold/cooldown exception and the attempted contact was persisted idempotently.
Its reviewed repository ledger is in
`docs/certscore-v2/calibration-runs/2026-10-07-sits-accept-handoff`.

Focused runtime/contract, report/API/Pulse and image follow-up tests passed
(104 tests), as did contracts, scan-core, API contracts, web and hosted MCP
HTTP typechecks. Release gates and AWS workflow outcomes are recorded separately
in the deployment artifacts. Production verification checks the exact live SHA,
ECS stability, three-region scanner image/health parity, API documentation, hosted
MCP health, existing report counts and retained image serving. No diagnostic SITS
rescan is implied by the release authorization; the global testing hold persists.

## Cost and cleanup

No new browser lane, model call, timeout ceiling, retained-byte limit, capacity or
retention policy is introduced. Capture uses the previously approved bounded
allowance (upper estimate $126.55/month at 100,000 affected scans); utilization may
vary. Local verification/history/contact bookkeeping was estimated below $0.06
once. Deployment adds no recurring capacity. Build memory optimization may
slightly increase CI compilation time, estimated below $0.10/month at ten releases;
no production resource increase is introduced. Preserve the archived worktree,
ignored local evidence and all unique work; remove only merged active branches
or unused active worktrees after successful production verification.

# IKEA preference and screenshot review timing repair — October 14, 2026

## Scope and retained diagnosis

Owner requested local fixes and retained-evidence/fixture verification only. No
fresh public scan, deployment, production call, target visit or historical repair.
Active checkout: `codex/cmp-scanner-production`.

Read-only audit of scan `e5478fa0-d292-4e3f-8991-b72ba2d5de23` verified the
canonical terminal artifact SHA-256 and schema, the retained structured pair,
loader binding and original file hashes:

- Preferences returned at 8,337 ms of a 17,000 ms allowance, in `surface_binding`,
  with zero Options clicks. The old catch reported `preference_budget_exhausted`
  for any Playwright `TimeoutError`. Its blanket 300 ms locator timeout could
  abandon root binding well before the absolute budget. The old packet does not
  identify the exact locator operation; it cannot establish whole-budget
  exhaustion. A real local Chromium main-thread stall reproduces that failure.
- Consent-proof retained a structurally verified, main-document Accept/Reject
  pair, completed DOM/geometry channels and 239 ms screenshot skew. Other
  candidates remained unresolved and inventory remained partial. Its geometry
  artifact has no pixel-comparison metrics. Safety eligibility required those
  metrics, so the geometry-proof review received 75 ms rather than the existing
  two-second grace. The image was correctly withheld and deleted at its deadline.
- The deleted image cannot be recovered or retroactively approved. No local
  fixture replaces it in the saved report. The exact reason pixel measurement
  did not complete is not established by the retained packet.

Audit receipt and logs are ignored under
`artifacts/ikea-timeout-repair-20261014/`. The original packet, geometry, bundle,
manifest and summary hashes were checked before and after the audit; unchanged.

## Repairs

Preferences use the existing absolute inspection deadline for default locator
operations. The same context/browser cancellation timer remains authoritative.
Explicit readiness and click caps remain unchanged. An individual operation
`TimeoutError` is now `preference_operation_timed_out`, distinct from actual
absolute-budget exhaustion and parent cancellation. WC01 projects either timeout
through the canonical typed CMP assessment with the specific cause retained;
it does not invent feature absence or change eligibility/scoring.

Safety review eligibility now accepts either the existing verified visual
comparison or a verified structured A/R pair selected by the canonical pairing
function. A missing pixel measurement does not shorten review grace. Present but
malformed metrics cannot use the structured path to evade validation. Both paths
still require complete structural inspection, verified decision roles, typed
DOM/geometry observations, exact document and image references, unique controls,
in-viewport bounds, at most 500 ms capture skew, exact PNG/viewport dimensions,
bounded current file bytes and hash binding into the existing review result.
The existing viewport fallback also qualifies when its dimensions and binding
verify; no inferred image transform is allowed.

This grants review time only. It neither produces pixel metrics nor establishes
prominence, consent equivalence, complete inventory or safe imagery. Safety
approval is still mandatory. Timed-out, sensitive, failed, malformed, stale,
replaced or already-withheld images remain withheld; late approval cannot reopen
retention. An already-withheld historical image remains ineligible.

Queued geometry-proof screenshots outrank settled/general screenshots. Existing
in-flight reviews are neither preempted nor repeated; concurrency remains two.
The authoritative paired path can still receive explicit priority. Byte-identical
sharing and rechecking the reviewed snapshot before retention are unchanged.

## Budgets and cost

- Preference maximum remains 17 seconds with the same memory-adjusted 56 GB-second
  envelope, coordinator join and one Options action. No Save, choice changes,
  second click, vendor opening API, retry or extra visit.
- Safety finalization remains an absolute two seconds from gate entry, inside the
  existing 2.1-second cleanup ceiling. General-image grace and eligibility I/O
  remain bounded by the existing 75 ms. The existing request timeout, image count,
  byte limits, review concurrency and number of remote calls are unchanged.
- A previously premature operation may use more of its already-approved
  allowance. Structured pairs without metrics can use the already-approved extra
  1,925 ms of grace; this stays within the existing conservative $9.42/month
  safety-compute allowance at 100,000 affected scans. No new capacity, service,
  lane, model call, storage object or retention period. The longer diagnostic
  reason adds only a few bytes to an existing packet; estimated incremental
  storage is below $0.01/month at 100,000 scans, inside the previously disclosed
  diagnostic allowance. Local verification used no paid API calls.

## Verification

286 tests passed:

- Nine preference tests, including real Chromium contention: the legacy 300 ms
  setting stops before clicking, whereas the shared deadline opens once and
  retains the category. Registered hidden/lazy panels, replaced roots, wrong
  roles, ambiguity, navigation, unopened sections, Borlabs, cancellation/deadline
  behavior and memory-adjusted limits remain covered.
- 42 screenshot safety tests: missing metrics, delayed/hung/failed/sensitive
  reviews, invalid proof, document/byte/dimension drift, explicit withholding,
  immutable late outcomes, byte sharing and both static/explicit queue priority.
- 21 CMP assessment tests, including specific operation-timeout projection with
  unchanged source evidence and no invented absence, review or score effect.
- 91 canonical consent, persistence, concern/checklist, prominence and shared
  API/SDK export regressions. An initial JSX test invocation used the wrong
  configuration; rerunning with `apps/web/tsconfig.test.json` passed all 91.
- 123 Lambda handler tests, including single publication, action joins, preference
  deadlines, evidence verification and bounded artifact finalization.

Scan-core build, Lambda typecheck, web typecheck and `git diff --check` passed.
Live IKEA success remains unverified until a separately authorized fresh scan.
The saved local report intentionally retains its original assessments.

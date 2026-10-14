# CMP evidence coverage v5 — local implementation

Owner scope: use retained facts more effectively within the existing capture,
latency and cost allowances. No deployment, new scan, target visit, paid review
call or historical report rewrite was performed for this work.

## Behavior

New canonical materializations use `cmp_audit_assessment.v5`; public CMP evidence
uses `cmp_audit_report.v2`. Stored assessment versions v1–v4 retain their scopes
and conclusions on read. The 13 customer criteria remain independently
addressable and exported.

- **CMP cookie expiry** can use the latest usable pre-choice cookie snapshot.
  It requires a canonical CMP cookie name, target-bound domain/path and valid
  capture/expiry arithmetic. It describes remaining cookie life, not confirmed
  consent, legal adequacy or future behavior.
- **CMP service list** preserves actual named services from a verified partial
  configuration capture. Counts alone do not manufacture names or switches.
- **Cookie details** retains available purpose/duration fields. Missing fields
  produce Partially assessed rather than discard useful captured entries.
- **Unmatched cookie names** retains comparisons against partial declarations.
  Unmatched names say “No match in captured list” and stay Partially assessed.
  Review remains available for mismatches against complete, interpretable CMP
  declarations and eligible runtime capture. This is a name comparison, not a
  legal conclusion about cookie necessity.
- **Activity after Accept / Reject** distinguishes completed bounded after-click
  observation from confirmed semantic consent. A validated completed click/window,
  retained storage snapshot and zero dropped post-action requests are required
  for the new unconfirmed-capture scope. One captured action is Partial; two are
  Observed coverage. Existing canonical Review findings keep precedence. The
  existing reportability rules for After Accept/Reject sections remain unchanged.
- **Incomplete** identifies a retained capture failure and specific cause, without
  creating a concern or score effect. Preference-dependent failures share one
  expandable limitation. Each child criterion retains its ID, status and JSON.
  Separate action and visual failures remain separate groups.
- **Not applicable** for prominence requires a complete, usable, persisted
  control assessment with a verified absent Accept or Reject. Unknown, blocked,
  mismatched or failed visits cannot establish applicability or feature absence.
  Scanner adapter absence remains distinct from incomplete inspection and a
  product not supporting a feature.
- The specific Accept/Reject image has its own coverage record. Another available
  image cannot conceal a withheld paired image. Coverage requires verified
  structured inspection, same loader/target and capture time, plus the unique
  mirrored file identity. Images remain withheld until safety approval; pixel
  measurements are never reconstructed from absent historical imagery.

## Resource bounds

The existing 80 ms total pixel-analysis allowance reserves 40 ms for the final
geometry-proof/recovery image. Early captures share the other 40 ms. Neither the
module deadline nor number of screenshots is increased. Existing paired-image
safety-review finalization remains 2 seconds maximum, with its existing cleanup
ceiling; preference inspection retains its memory-adjusted 17-second maximum.
No lane, retry, navigation, interaction, model call, retention period or storage
object is added. Accessibility and general inventory budgets are unchanged.

The expected incremental serialized metadata and partial table projections are
estimated below $0.50/month at 100,000 scans, within the previously approved
cost envelope. Existing table limits (100 retained inventory rows; four expiry
entries) remain in effect. Large inventory counts do not justify unbounded work.

## Local retained-evidence verification

`artifacts/cmp-coverage-v5-20261014/retained-replay.json` records five offline
replays: latest IKEA, SITS, FullStory, an earlier IKEA capture, and Georgia Tech.
Each verifies the original coordinator canonical-bundle SHA-256 and geometry
SHA-256 against its retained manifest before materialization. Original source
bytes are checked again afterward. Only new local replay artifacts are written;
there are no database writes. API output, SDK reconstruction and the in-memory
MCP evidence-page tool agree for all five reports. Accessibility and existing
priority findings remain unchanged.

Latest IKEA (`e5478fa0-d292-4e3f-8991-b72ba2d5de23`):

- Previously: three Observed and ten Not assessed.
- Local replay: four Observed, seven Incomplete grouped into preference (five),
  action (one) and screenshot (one), and two Not assessed.
- The real additional assessed fact is `OptanonConsent` expiry from the baseline
  snapshot. Preference fields and missing pixel measurements are not invented.
- The historical deleted/withheld paired screenshot remains unavailable.

SITS (`68e528ce-ff80-4dd3-99be-e9e951c2f535`): eleven Observed, one Review and
one Not observed remain unchanged; the verified prominence comparison and all
11 service names survive. The earlier IKEA capture also preserves a completed
unconfirmed after-click observation as Partial, independently of its expiry.

Development-only previews read those explicit replay artifacts:

- `/dev-fixtures/cmp-coverage#cmp-details` — IKEA.
- `/dev-fixtures/cmp-coverage?example=sits#cmp-details` — SITS.

Both are labelled as local replays and return 404 outside development. They do
not replace the original `/scan/` reports. Mobile (390 px) and desktop (1280 px)
were inspected; grouped checks, upper-right badges, exact expiry table and compact
copy/evidence controls remain usable. The copy button acknowledges success in
the browser; the browser automation clipboard readback returned empty, so native
pasteboard delivery is not claimed by this verification. Table payload formatting
is covered by the existing local tests.

## Tests

Focused assessment/persistence/policy/projection, public export, historical
compatibility, UI and real pixel fixture tests pass. Contracts, SDK, MCP and API
contract suites pass; web, Lambda, SDK, MCP and API contract typechecks pass.
Generated SDK/OpenAPI files pass the contract drift check.

The combined browser-fixture/safety run had one timing-dependent failure: a
fake safe general image exceeded its real 75 ms deadline under concurrent test
load and was correctly withheld. All 42 screenshot-safety tests pass when run
in isolation, including delayed, failed, tampered and queued-review cases.
Production timeouts were not relaxed to make a test pass. Remaining external
service timeouts stay explicit and score-neutral.

Runtime success on a fresh IKEA navigation is intentionally unverified: the
owner requested retained evidence and local tests before any further scan.

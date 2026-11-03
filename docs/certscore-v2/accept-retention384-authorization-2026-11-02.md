# CertScore.ai Accept request-retention approval and proof

On November 2, 2026 (Hawaii), the owner approved: **“Approve 384 and $8 combined.”**
This replaces the prior $4/month combined pending CMP/GPC allowance with up to
$8/month at 100,000 scans and 30-day retention. It authorizes local implementation
and verification of Accept's post-click retention cap from 192 to 384. Reject's
producer cap stays 192. The three-second CNN window, all timeouts, worker size,
lanes and configured infrastructure remain unchanged. No push, package publication,
deployment, production flag change or historical rewrite is authorized.

## Proof and compatibility gates

New Accept writers identify `priority_bounded_action_requests.v3-accept384`.
Legacy v1/v2 or absent retention policies still permit at most 192 retained rows.
The writer checks its explicit policy capacity; overflow accounting, prioritization
and the fixed overflow-evaluation allowance remain intact. No omitted request is
represented as retained evidence or complete observation.

Packets and projections join the larger coverage policy to the Accept action.
The optional requestRetentionPolicy marker in full after-action captures and
prospective source proofs binds expanded references to that same producer policy.
An old capture without the marker keeps its 192-reference bound. Reject cannot
borrow the new policy, even with an empty inventory. Missing/mismatched markers,
over-cap rows, source/clock mismatches and actual dropped requests fail closed.
The registered and unconfirmed Accept branches retain the same source, window,
semantic confirmation and execution rules. More retained rows cannot itself create
confirmation, a finding or score effect. Genuine overflow remains Limited.

The public AfterActionSummary still contains bounded factual counts and the same
v1/v2 capture policy literals. The internal budget marker is not exported. API,
SDK and MCP already accept numerical request counts without a hardcoded 192 ceiling;
regressions verify 300 retained Accept requests and an unconfirmed Succeeded path.
No public package imports a private runtime contract. Existing response versions,
statuses and named public types are unchanged.

Compatible contract readers/materializers must precede a future producer release
through repository-controlled AWS workflows. This is a release-order note only.
The existing unreleased materialization v45 change remains; global projection v27
is unchanged. No migration, automatic backfill or report-time artifact retrieval.

## Cost and measurements

The reviewed estimate uses 192 additional rows × 1,000 bytes × six retained copies
× 100,000 scans = 115.2 decimal GB. At a planning rate of $0.03/GB-month, storage is
$3.456/month; a $0.544 processing reserve gives an incremental estimate up to
$4/month. Combined with the prior pending fixes, the owner-approved cap is $8/month.
This is a conservative planning model, not a provider quote, measured Lambda saving
or claim of production completion-rate coverage. The actual prior CNN rows averaged
285 bytes and peaked at 445 bytes. No configured infrastructure increase is made.
Existing approved bounded local policy-assist calls may incur their ordinary charges;
the exact one-off API bill is not measured.

Final fresh receipts, exact test/typecheck results, source state, canonical replay
and web/PDF review belong in `outputs/cnn-accept384-2026-11-02/`. Original earlier
CNN packets with 256/264 observed requests and lost rows remain Limited; none is
rewritten or rehashed as an original receipt. Fresh proof uses a fresh scan ID and
legitimate original-byte pointers. Local egress geography is not asserted.

## Verified fresh CNN result

Fresh scan `cnn-accept384-b26dd25d-c44f-4295-9d81-62a55962478f` completed all six
local lanes and published one local terminal result. The original coordinator
artifact is 1,408,778 bytes, SHA-256
`309d2cb10304931f0373592dade390a622b4d3db01142fe58b75980bb5e590b9`.
Its original receipt size/hash verified; a byte-identical local materialization
copy passed the ordinary reader. No production report or historical artifact
was changed.

Accept clicked the canonically bound control, completed the unchanged three-second
window and retained its storage snapshot. All 264 observed post-click requests
were retained, with zero drops or replacements. `choice_path_execution.v1`
reports **Succeeded**, with `consentConfirmed=false`. The original packet,
canonical materializer, persisted JSON hydration, API and canonical report agree.
This proves operational path completion, not successful semantic registration or
privacy compliance. The passive CMP audit separately reports both privacy-link
presence and unobstructed pre-consent pointer access as Observed.

Reject was not attempted: no deterministic Reject control was safely matched.
The combined Accept/Reject activity row therefore remains Partially assessed,
with “Accept: 3-second activity check completed.” Three CMP criteria remain Not
assessed; other partial inventory checks remain partial. This result does not
justify claiming every CNN criterion is complete, opening Options, changing
finding eligibility, or manufacturing a paired CMP state comparison.

## Local verification and review

- Core/contracts/action fixtures: 206 passed, zero failed/skipped. After the final
  exact expanded-inventory count check, the overlapping 69 budget fixtures were
  rerun and contracts rebuilt: all passed.
- Canonical/web/API/hydration/JSON/PDF fixtures: 390 passed, zero failed/skipped.
- Public API/SDK/MCP fixtures: 82 passed, zero failed/skipped. These groups overlap
  on SDK cases and are not presented as a distinct-test total.
- Contracts and scan-core builds/typechecks, API build/typecheck, Lambda/web/validation-worker/SDK/MCP
  typechecks and both public-contract drift checks passed. Exact commands, durations
  and logs are retained alongside the proof. Full preflight was not rerun for this
  focused follow-up; this is not deployment readiness approval.
- The actual shared CMP component was served on localhost:3000 at widths 390 and
  1280. Enter/Space expanders, no document overflow, no page errors and zero
  unexpected/external requests passed. This reviews the real component with the
  canonical report model, not a complete authenticated Next.js application route.
- The shared renderer produced 37 PDF pages. All were rendered and inspected in
  five contact sheets; the CMP matrix and Accept results were inspected full size
  on pages 4 and 12, without clipping or overlap.

Measured extra packet retention beyond the legacy 192-row cap is 72 rows:
21,494 bytes of network rows and 1,872 bytes of request references. The private
capture policy marker adds 73 bytes, and the retention-policy literal adds 10
bytes. This packet has no optional ancestry array. Measurements are compact JSON
size comparisons only, not rewritten packets or new source receipts. Downstream
copies remain covered by the conservative combined $8/month allowance above.

A 30-round warmed synthetic local CPU benchmark offering 768 requests measured
median retention processing of 13.37 ms at 192 and 19.24 ms at 384 (about 5.87 ms
additional); worst observed 14.15/20.89 ms. The fresh six-lane wrapper took
32,770 ms. Neither measurement establishes Lambda cost, production latency savings
or population coverage. No new browser RPC, wait, invocation or publication was
added by the cap change.

Final adversarial review checked legacy/missing markers, Reject isolation,
193/384/385 boundaries, exact loss accounting, source-proof joins, unconfirmed
success without confirmation promotion, genuine overflow remaining Limited and
terminal late traffic excluded from the frozen window. The changes add neither
raw payload retention nor finding/scoring rules. The unrelated concurrent
dashboard test retains its original hash. Source remains dirty local main at
`6a9d197a207765ea958059d6ee2f2b2fdd94aa07`; nothing was pushed or deployed.

# CertScore.ai local adaptive Baseline → GPC capture

## Approved scope and cost

On October 20, 2026, the owner requested local implementation of a five-second
minimum, two-second request-start quiet interval and fifteen-second cap, expanded
bounded retention, and a fresh ErgoVeritas report verification. Production is
unchanged: no deployment, AWS capacity change, production flag, scoring policy,
or production artifact-retention change is included.

Before implementation, the disclosed estimate was **below USD 1 one-off**, with
zero recurring infrastructure increase. Browser execution, artifact storage and
database work use the existing local simulator, local object storage and local
database. The normal owned-canary extraction/export flow uses existing configured
model roles; no new role, model call per scan, lane, or paid service is introduced.
Actual billing is not measured. A production rollout requires its own compute,
storage, orchestration and approval review.

## Capture protocol

`CERTSCORE_LOCAL_GPC_ADAPTIVE_ENABLED=1` enables the protocol only for development
localhost dispatches targeting the local simulator. Its checked-in example is
off. The existing local five-second flag remains compatible; adaptive mode takes
precedence for these local Baseline/GPC workers only. Production, inventory,
policy, consent-proof, Accept, Reject and opt-out workers do not receive it.

The two passive workers receive an explicitly injected shared, in-process local
pairing gate. No browser work is performed by the coordinator, and the gate is
not a global singleton or a serialized callback supplied by a request. An adaptive
worker without its paired simulator fails closed instead of silently pretending
that a fixed capture was adaptive.

- The initial shared comparison deadline is 5000 ms after each worker's own
  main-document commit.
- Every captured request start before the current deadline can extend it to
  `request offset + 2000 ms`, capped at 15000 ms. Ordinary assets are not filtered
  out. This is not an in-flight completion or page-load-completeness assertion.
- Both lanes use the same logical duration. Quiet finalization waits until both
  have covered that duration. At the cap, each retains its own full fifteen-second
  interval even if their document commits were slightly staggered.
- Requests at or after a finalized stopping boundary cannot reopen it. Capture
  identities, half-open boundaries, document navigation invalidation, header proof
  and parent cancellation remain authoritative.
- The terminal duration and reciprocal peer-document tokens are retained in
  `certscore.local-gpc-adaptive.v1`. The canonical assessor checks both original
  artifacts, matching duration/outcome and reciprocal document binding. A missing
  complete adaptive interval yields unknown comparison coverage, not a silently
  shortened claim. Other independently verified lanes remain available.

The initial form/DOM inventory still runs concurrently. Existing evidence work
keeps its allocation; local workers receive the bounded extra observation budget
instead of borrowing it from accessibility, forms, consent or policy work. Existing
outer safety caps remain unchanged. No later report refresh or additional scan is
introduced.

## Retention fix

The prior diagnostic lost complete intervals when a compact ledger exceeded
64 KiB or 1000 rows. Local adaptive captures now use the explicitly scoped
`gpc_compact_requests.local.v2` ledger, with a maximum of **5000 request identities
and 2 MiB of UTF-8 row data per lane**. The existing collector's 5000-request bound
is not enlarged. A pair can therefore retain up to approximately 4 MiB of this
local ledger data, plus existing artifact allocations.

The local ledger has its own bounded allocation; it does not consume the ordinary
400 KiB evidence compaction allowance. It retains event IDs, timestamps, URL
hashes, signal verification and deterministic attribution facts, not additional
raw bodies, cookie values or query values. Both row and byte caps are validated.
Overflow, dropped identities or unverifiable digests still fail closed. The limits
remain bounded, not a claim of unlimited evidence capture.

Legacy ledgers keep their 1000-row/64-KiB policy. Old captures are not rewritten,
repaired, upgraded, or retroactively declared complete. Public/API/SDK duration
contracts are synchronized from the canonical schema to accept verified integer
intervals through fifteen seconds; producer defaults and production behavior stay
unchanged. The existing canonical assessment → persisted projection → report flow
supplies the displayed comparison; no display-only findings were added.

## Fresh localhost verification

Scan: `69848191-d632-4d4b-94b1-294b8f3aa93b`.
Target: `https://ergoveritas.com/test1.html`.

Report: `http://localhost:3000/app/scans/69848191-d632-4d4b-94b1-294b8f3aa93b?reviewFocus=ccpa_cpra`.

Both lanes correctly stopped at the **five-second minimum**, because their last
captured requests occurred well before the two-second quiet threshold:

| Evidence | Baseline | GPC |
| --- | ---: | ---: |
| Matched comparison duration | 5000 ms | 5000 ms |
| Actual signal readback after commit | 5018 ms | 5015 ms |
| Last request start after commit | 704 ms | 649 ms |
| Complete retained comparison requests | 8 | 8 |
| Advertising / marketing requests | 1 | 1 |
| Analytics / replay requests | 5 | 5 |
| Compact ledger bytes | 2265 | 2257 |

There are no dropped requests or capture limitations. Original size/SHA-256
pointers and checkpoint digests verify. Canonical replay exactly matches the
persisted report and both GDPR/ePrivacy and CCPA/CPRA JSON exports. The comparison
component renders the actual five-second interval. These counts do not establish
GPC causation or honoring.

The GDPR/ePrivacy score remains **28**, and the report's disclosure notice is
unchanged from the earlier canary. Seven of eleven transparency rows remain
observed, all three accessibility failures remain, cookie names and form labels
are preserved, five fields remain retained, and hidden-link evidence is verified.
All five transport-security checklist rows are Observed.

The coordinator capture/join took 7473 ms; this is not a controlled latency
comparison. Intake-to-report duration includes a manual CLI lifecycle handoff:
the initial CLI exited before its background child performed browser work; the
same pending dispatch was then completed with the CLI kept alive. There was no
second completed browser capture or public-target retry. Do not present that
intake delay as adaptive observation latency. The configured regional profile is
Ireland; local egress is not independently verified Irish production egress.

## PDF verification and presentation limitation

The authenticated custom-header PDF export returns HTTP 200 and a valid PDF,
with `private, no-store` caching and the expected `report-ergoveritas.com.pdf`
filename. Anonymous PDF requests remain HTTP 401. The temporary local test session
is deleted after verification. The first page was rendered and visually inspected:
custom header, local PDT timestamp, score and inventory summaries are present.

Saved PDF: `output/pdf/local-gpc-adaptive/report.pdf`.

**The current PDF is 24 pages**, above the earlier 15–18-page presentation target.
This task does not change pagination or remove evidence to meet that target. PDF
length remains a separate presentation issue; successful download does not mean
that earlier page-count requirement is satisfied.

## Validation and artifacts

All 68 focused tests pass: 40 capture/assessment/retention/replay tests, eight
browser/settling regressions, three dispatch/configuration tests and 17 public
contract/OpenAPI/rendering tests. Coverage includes a real paired 8.5-second
extension, unequal commit timing, cap behavior, cancellation, document drift,
missing peers, 1200-row retention beyond the old limits, unchanged ordinary
evidence selection, byte/row overflow and missing-identity rejection.

The scan core and API contracts build; scan-core, Lambda and web TypeScript checks
pass. Generated contract drift checks and `git diff --check` pass. No production
deployment or source commit is performed for this implementation.

Retained verification:

- `artifacts/gpc-adaptive-local/verification.json`: canonical replay, report,
  timing, unchanged score/disclosure and local-only receipt.
- `artifacts/gpc-adaptive-local/report-ccpa.json`: report export for the GPC lens.
- `artifacts/gpc-adaptive-local/comparison.html`: rendered comparison component.
- `output/pdf/local-gpc-adaptive/report.json` and `verification.json`: authenticated
  export evidence and PDF response metadata.
- `artifacts/local-v2-dag-lambda-simulated/69848191-d632-4d4b-94b1-294b8f3aa93b/`:
  original per-lane artifacts, metadata and terminal manifests.

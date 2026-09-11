# GPC opt-out assessment prototype

Internal calibration only, September 10, 2026. This is not a production GPC
policy revision. The existing v1/v2 assessment, California scoring policy,
publication barrier and stored historical conclusions remain authoritative.

## Questions and evidence

The prototype separates these claims instead of using tracker reduction as a
proxy for a sale/sharing opt-out:

| Facet | What its evidence establishes | What it does not establish |
| --- | --- | --- |
| HTTP delivery | The retained final-document request carried `Sec-GPC: 1`. | Browser-wide delivery or opt-out processing. |
| Main navigator / full context | Actual same-capture navigator values; full context additionally requires existing frame/worker coverage gates. | An enabled configuration alone is insufficient. |
| Current CMP-recorded USCA state | Ready GPP 1.1 California section 8 contains explicit sale and sharing opt-out states with applicable notice fields. | GPC caused this state, account-wide application, or legal compliance. |
| CMP GPC signal | The optional USCA GPC subsection reports true, false or is unavailable. | Signal receipt alone is not an opt-out state. |
| Displayed acknowledgment | An exact current-status message is visible in a registered CMP live-status scope. | A new transition or independently verified processing. |
| Direct request activity | A retained request has its own unambiguous canonical advertising, marketing, analytics or replay classification and carried GPC. Collection endpoints are counted separately from resource loads. | Legal sale/sharing, disallowed processing, identifier use, or decoded privacy modes. |
| Paired comparison | Existing v2's independently verified, matched baseline/GPC comparison. | Causation or comprehensive compliance. |

`registration.basis` is always `current_recorded_state`; `causedByGpc` is always
`not_established`. A pre-existing/default opt-out remains a useful state
observation even when the CMP's GPC flag is false or absent. It must never be
renamed “GPC honored.” A mixed but fully known sale/sharing state counts as
completed state observation; an unknown axis does not. Notice 0/2 and opt-out 0
remain unknown, not inferred opt-in or opt-out. GPC subsection true alone,
receipts, generic promises, opaque storage changes and A/R consent do not
establish either axis.

## Capture and retention

The explicit `gpcOptOutPrototype` option on the low-level passive scanner is
for local calibration. `runScan` and Lambda dispatch do not expose or forward
it. The ordinary scanner neither invokes the probe nor emits prototype
metadata. This option does not enable any new action, browser, polling loop,
retry, model call or timeout. It performs one passive page evaluation inside
the existing remaining page-capture budget. GPP generic ping must deliver one
successful synchronous callback; unready/asynchronous, malformed, duplicate or
unsupported responses stay unavailable. Raw GPP strings and unrelated sections
are never retained.

The local scanner result's optional typed `gpcOptOutObservation` is a **sidecar
output**, not a CanonicalEvidenceBundle field. Canonical bundle parsing strips
it. The existing production assessment union rejects the prototype assessment.
No concern, finding, score or display consumer reads it.

Each opted-in browser attempt gets a random capture UUID. Both its signal
proof and semantic readback retain that UUID and the browser-native CDP loader
token. Missing/changing tokens, another attempt, and same-URL reloads invalidate
semantic binding. Signal proof metadata is optional and is not backfilled on
legacy records. Changing its TypeScript alias does not relax runtime validation.

After the canonical local GPC artifact is finalized, the local retention caller
must serialize a `retainedGpcOptOutObservationSchema` envelope containing:

- `contractVersion: certscore.retained-gpc-opt-out-observation.prototype.v1`;
- `gpcArtifactSha256`: the SHA-256 of that exact finalized GPC artifact's bytes;
- `observation`: the typed sidecar from that same scanner invocation.

Retain the envelope as `GpcOptOutObservation.json` and its original byte size,
SHA-256 and URI as `GpcOptOutObservation.pointer.json`. Do not generate a new
expected checksum during replay. The builder verifies both artifacts' size,
checksum, schema, exact scan, document hash, capture UUID, loader token, time
origin, capture interval and normalized state hash. A bad sidecar cannot erase
independent request evidence. Source pointers discriminate `runtime_bundle`
from `semantic_readback`; the latter cannot masquerade as a lane bundle.

The probe does not write artifacts or production state automatically. Runtime
bundle retention/finalization and sidecar persistence must be implemented in a
separately reviewed calibration runner before fresh public use; this prototype
currently supports deterministic browser fixtures and retained-artifact replay.

## Replay and denominators

Run from the repository root with an unused output directory:

```sh
pnpm exec tsx --tsconfig tsconfig.base.json scripts/replay-gpc-opt-out-prototype.ts \
  --cohort artifacts/gpc-prod-review-20260910/cohort.ndjson \
  --pairs artifacts/gpc-prod-review-20260910/pairs \
  --out artifacts/NEW-gpc-prototype-evaluation
```

Add `--observations DIRECTORY` only for originally retained, capture-bound
sidecars. The command makes no AWS calls or site contacts and refuses to
replace an existing output directory. It retains the cohort hash, exact source
pointers, implementation file hashes, evaluation time, original window and
upstream exclusions. It also filters ErgoVeritas itself. The reviewed cohort
already excludes 225 ErgoVeritas scans: its denominator is **888**, not 663.
All terminal non-canary scans, including four failures, stay in that denominator.

Count delivery, current state, acknowledgment, direct classified requests,
direct collection requests and paired comparison separately. The diagnostic
`substantiveEvidence` union counts a fully known current state or a directly
observed collection endpoint. It is not a new GPC success/violation metric.
Transmission, acknowledgment, unclassified/resource-only traffic and an empty
capture do not inflate this union. A zero qualified-request count is described
only within a complete bounded capture; otherwise it stays unknown.

Historical semantic state was not captured. Replay must not infer it from CMP
identity, cookies, displayed copy, a different session or the new contract.
Model review can challenge classifications and evidence sufficiency, but Luna
labels are not independent human ground truth or a measured error rate.

## Completion and release gates

The prototype always reports `productionProjectable: false`, `scoreEffect:
none`, `legalInterpretation: not_assessed`, and `release.eligible: false`.
Strongly validated fixtures are necessary, but cannot establish real-site
completion or false-positive/false-negative rates. Before proposing integration:

1. Complete the local capture/retention runner above and verify a whole fresh
   browser → retained bytes → assessor round trip, including corrupted/mismatched
   packets and same-URL navigation.
2. Use owned canaries separately, then the calibration registry's rotating
   public selector with a successful central contact-history export and ledger.
   Keep ErgoVeritas out of public metrics. Retain country/IP and run provenance;
   California-specific GPP coverage must be evaluated from a California-serving
   observation context, not extrapolated from the earlier Ireland action tests.
3. Stratify by GPP/other CMP support, explicit positive/negative/mixed state,
   acknowledgment, collection activity, worker/readback limits and failed page
   access. Use the same targets and budgets for old/new comparison. Report
   every denominator and unsupported-adapter share.
4. Have evidence-only human adjudication establish precision/recall for each
   claim. Luna may assist the audit and benchmark selection; do not call that
   independent truth. Freeze the release criteria before scoring the held-out
   sample. A numeric completion target is still a product/calibration decision;
   this prototype makes no unsupported promise of a high success rate.
5. Measure paired p50/p95 scanner and lane wall time, timeout/coverage losses,
   retained bytes and per-scan cost. Staying inside existing caps does not prove
   zero latency cost. No longer waits or extra browser runs are justified by
   unknown GPP state.
6. Submit a separate canonical production contract/policy proposal. Any approved
   integration must use verified retained evidence → typed persistence →
   normalized concern → concern policy → unified projection, with migration and
   every downstream boundary tested. Do not silently replace stored v2 results.

Current incremental recurring production cost is **$0/month at 100,000 scans**:
the option is not enabled or reachable through production dispatch, and there
are no new services, model calls or retention jobs. Enabling future capture
requires a measured compute/metadata estimate and applicable owner approval.
No deployment is part of this work.

## Local verification

The 93 focused prototype/GPC tests and 17 GPC contract/policy/report boundary
tests passed. `pnpm preflight:fast` passed, including contracts, canonical
projection/persistence, scanner/Lambda typechecks, consent/policy fixtures and
Lambda tests. No fresh public completion/precision/recall or latency claim is
made from these local results.

## Protocol references

- [IAB GPP CMP API 1.1](https://github.com/InteractiveAdvertisingBureau/Global-Privacy-Platform/blob/main/Core/CMP%20API%20Specification.md)
- [IAB USCA section 8](https://github.com/InteractiveAdvertisingBureau/Global-Privacy-Platform/blob/main/Sections/US-States/CA/GPP%20Extension%3A%20California%20Privacy%20Technical%20Specification.md)
- [Existing approved GPC evidence policy](gpc-evidence-policy.md)

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
| Current CMP-recorded state | Ready GPP 1.1 California section 8 or US National section 7 (versions 1/2) contains explicit sale and sharing opt-out states with applicable notice fields. | GPC caused this state, account-wide application, or legal compliance. |
| CMP GPC signal | The optional applicable-section GPC subsection reports true, false or is unavailable. | Signal receipt alone is not an opt-out state. |
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

The low-level `gpcOptOutPrototype` option and `runScan`'s in-process
`onGpcObservationSession` callback explicitly opt into local calibration. The
callback is not accepted or forwarded by public/Lambda dispatch. Ordinary scans
neither install the listener nor emit session metadata. There is no new browser,
action, retry, model call, polling timer or timeout increase.

One bounded passive GPP listener observes readiness and section changes while the
existing page work runs. The one terminal ping runs after that parallel page work,
inside its remaining deadline, so the listener is not stopped prematurely. Attachment attempts, callbacks and retained transitions
are capped; overflow is an explicit coverage failure. A terminal synchronous ping
reads normalized USCA/US National state, with unsupported/absent API distinguished
from malformed or still-unready responses. Ambiguous applicable supported sections
remain limited; no geographic preference silently overrides a conflicting state.
The parser also accepts the explicitly documented Sourcepoint flat US National/California
objects, retaining its format diagnostic and validating the same notice/opt-out
fields and `GpcSegmentType`. It does not infer state from malformed GPC fields.
Only whitelisted primitive fields and normalized state hashes leave the browser.
Raw GPP strings, cookies and unrelated sections are not retained by this probe.

CDP navigation events bind actual `Sec-GPC: 1` delivery to the committed loader.
Same-document URL changes keep that loader; the original request URL hash remains
separate from the current document URL hash. A new loader requires its own delivery
proof. Main navigator readback, capture UUID, document hash and monotonic retained
state observations must agree. The bounded request capture retains event identity,
time, URL hash and header, with explicit start/end and drop counters. It can end
without global network quiet; this establishes observations within that window,
never absence beyond it or comprehensive browser-worker coverage.

The finalized typed session is hashed into the same canonical artifact's optional
`gpcPrototypeSessionBinding` before artifact finalization. This producer-owned
binding retains capture UUID, document token/hash and session SHA-256 independently
of the older all-frame snapshot. A failed frame cannot erase separately retained
main-document evidence. Legacy local prototype packets can still use their original
`prototypeSessionSha256` signal anchor; no historical source is backfilled.

The local runner retains `GpcObservationSession.json` in a
`certscore.retained-gpc-observation-session.v1` envelope bound to the exact canonical
artifact SHA-256, alongside original URI, size and SHA-256 pointers. The completion
assessor verifies both byte streams, schemas, scan and capture identities, loader,
document, interval, state hashes and the canonical session hash. Replacing a session
or a request row cannot pass by merely calculating a new sidecar pointer.

A missing synchronous request-header snapshot triggers an overlapping read of the
same browser request's `allHeaders()`. Only `Sec-GPC`, its source and readback time
are retained. Pending/failed readback at finalization remains limited; no additional
wait is added, no configured value is substituted, and late completion cannot change
a finalized packet. Actual absence or zero is preserved. Every request counted for
the declared GPC window must still have retained `Sec-GPC: 1` proof.

The optional `certscore.gpc-request-diagnostics.v1` packet records bounded CDP
request outcomes, fixed failure/blocked-reason codes and missing-header correlation
metadata. It retains only hashed URLs and the Sec-GPC value, never full headers or
raw error strings. Unique URL/method/timing correlation is diagnostic-only; candidates
without timing remain explicitly unbound. Redirect chains and ambiguous extra-info
cannot supply a header for another request. These diagnostics never populate missing
request or main-document delivery evidence and never change completion or scoring.
Raw event, request-handle and output caps have explicit overflow counters.

The local runner validates the actual canonical file and writes its original
checksum pointer before handling an optional session, including blocked/no-session
outcomes. Exclusive creation prevents replacing that original pointer during replay.
This does not backfill older records whose capture-time pointer is unavailable.

The session remains a sidecar, not a CanonicalEvidenceBundle field. Its small optional
canonical checksum/binding does not alter production v1/v2 conclusions or make a
prototype assessment projectable. Historical packets are not backfilled. Existing
strict paired-comparison and frame/worker proof remain independently limited when
their requirements are unmet.

## Local California capture

After registry validation, successful central contact-history export and canonical
target selection, supply fresh independently obtained California egress proof:

```sh
SCAN_PROXY_ENABLED=true SCAN_PROXY_SERVER=http://127.0.0.1:PORT \
  pnpm exec tsx --tsconfig tsconfig.base.json scripts/run-gpc-observation-local.ts \
  --selection artifacts/CalibrationTargetSelection.json \
  --egress artifacts/EgressProof.json \
  --out artifacts/NEW-gpc-local-cohort --run-key UNIQUE_KEY
```

The egress proof contains `country: US`, `region: California`, `ip`, `verifiedAt`
and `proxyServer`. The runner requires the active browser proxy to match and both
selection and egress proof to be fresh. It freezes target URLs and source hashes
before contact, refuses an existing output directory, excludes ErgoVeritas, respects
hard contact holds and performs no automatic retries or target replacements. Run
owned canaries separately. Persist every public contact through the canonical
idempotent contact-ledger command and review the repository ledger candidate.

An explicit owner cooldown waiver can be supplied to the canonical selector via
`--cooldown-override-reason`. It records the reason and affected URLs and bypasses
only cooldown dates, never `blocked`, `do_not_calibrate` or live contact holds.

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

Adapter v3 adds the documented flat California shape and independently anchored
main-document session. Adapter v4 also accepts the canonical subsection-array
`GpcSegmentType: 1` form while retaining legacy `SubsectionType: 1` support. When
both markers appear they must agree; missing/invalid markers and non-boolean GPC
values remain invalid. Earlier v1/v2/v3 observations retain their versions.

The owner target is **strictly greater than 95%** completion of
`main_document_and_retained_http_requests` observation on representative pages.
Completion requires retained actual main-document header delivery, actual main
navigator readback, terminal supported/unsupported/absent semantic probing, verified
same-session artifact binding and a complete, no-drop request window of at least
250 ms after document commit. Request counts cover the full declared capture-start
to capture-end interval, including navigation; document commit is separately
reported and pre-commit requests are never relabeled post-commit. Malformed/unready probes, cancellation, truncated
request capture and unverifiable evidence remain failures. An acknowledgment-search
limit is reported on that independent facet and does not invalidate a complete GPP
probe; it must never be converted to “no acknowledgment.”

This metric does not establish that a site honored an opt-out. Always report known
sale/sharing state, acknowledgment coverage, full-context delivery and paired
comparison separately. Absent or unsupported CMP APIs can complete the stated
observation while registration remains unknown. That distinction must remain
visible in any later product proposal.

`scripts/lib/gpc-observation-completion-gate.ts` reports both all-submitted and
representative-page rates. Only independently evidenced non-representative pages
leave the latter denominator; unknown access and unverified artifacts stay as
failures. Duplicate scan identities fail the gate. Require at least 100 representative
observations and a 95% Wilson lower confidence bound strictly above 95%. The
September 11 follow-up preregisters a stricter minimum of 200 representative
observations. A small perfect sample does not pass. Freeze a held-out cohort before
evaluation and report
cohort composition; this is not an internet-wide reliability estimate.

The prototype always remains internal-only and score-neutral. Before production:

1. Pass fresh retained-artifact completion and integrity gates, stratified by API,
   state, request activity, page access and worker limitations.
2. Establish claim precision/recall with evidence-only human adjudication. Luna
   assistance is not independent human ground truth.
3. Measure paired p50/p95 lane and scan wall time, coverage losses, retained bytes
   and cost with the same targets/budgets. Existing caps alone do not prove zero
   overhead; sidecar finalization and listener work have a bounded compute cost.
4. Obtain the separate canonical production contract/policy integration approval,
   preserving verified evidence → typed persistence → normalized concerns → policy
   → unified projection. Do not silently replace stored v2 results.

Incremental recurring production cost remains **$0/month at 100,000 scans** because
the option is disabled and unavailable through production dispatch. The one-off
local calibration uses an existing California proxy, with no capacity added; AWS
contact-ledger jobs and proxy traffic are estimated below $1 total. Any future
production enablement requires a measured compute/metadata estimate and applicable
owner approval. No deployment is part of this work.

## Verification record

See the [follow-up calibration report](calibration/gpc-completion-followup-20260911/README.md)
and the [earlier report](calibration/gpc-completion-20260911/README.md) for exact
source hashes, outcomes, limitations,
artifact sizes and checks. Earlier historical replay remains unchanged and cannot
supply the new completion proof. A held-out statistical pass is required before
claiming the >95% target achieved.

## Protocol references

- [IAB GPP CMP API 1.1](https://github.com/InteractiveAdvertisingBureau/Global-Privacy-Platform/blob/main/Core/CMP%20API%20Specification.md)
- [Playwright complete request headers](https://playwright.dev/docs/api/class-request#request-all-headers)
- [Sourcepoint California fields](https://sourcepoint-public-api.readme.io/reference/california-privacy-section)
- [Sourcepoint documented flat US National ping](https://sourcepoint-public-api.readme.io/reference/ping-1)
- [IAB USCA section 8](https://github.com/InteractiveAdvertisingBureau/Global-Privacy-Platform/blob/main/Sections/US-States/CA/GPP%20Extension%3A%20California%20Privacy%20Technical%20Specification.md)
- [Existing approved GPC evidence policy](gpc-evidence-policy.md)

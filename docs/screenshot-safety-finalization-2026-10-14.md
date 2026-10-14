# Screenshot safety finalization and timing audit — 2026-10-14

## Approved scope

The owner approved giving a verified, document-bound Accept/Reject comparison image the existing two-second safety-finalization allowance even when unrelated inventory work remains partial. The approval includes prioritizing the comparison image, sharing review only for identical bytes, recording bounded timings, and testing delayed/failed review locally. It does not authorize a new SITS scan or deployment in this turn.

Affected partial captures can use up to 1,925 ms more finalization grace than before. The representative-image wait remains an absolute 2,000 ms from gate entry; the existing added-latency envelope remains 2,100 ms including cleanup. The underlying moderation request still uses the existing timeout (8 seconds by default), starts during capture, and is cancelled when finalization ends. There is no additional moderation call, retry, browser run, lane, or late publication.

The approved conservative compute estimate is approximately $9.42/month at 100,000 scans if every scan consumes the full additional 1,925 ms, using 3,008 MiB and x86 Lambda duration pricing. Actual cost depends on architecture and completion timing; the additional grace may overlap a slower passive lane and add no report wall time.

Diagnostics are embedded in the existing worker `LocalV2DagLambdaManifest.json`, which the coordinator already mirrors and retains. No separate diagnostic object or extra S3 upload request is added. The normal three-image case remains below the previously disclosed $0.75/month estimate. Bounded metadata adds only bytes under existing retention, with no new retention period. At 100,000 scans/month, 12 review rows and roughly 16 KiB per manifest across two retained copies would add about 3.3 GB/month; twelve accumulated months at $0.023/GB-month are approximately $0.91/month. The normal three-image case is substantially smaller. Retention growth remains governed by the existing artifact policy; this is an estimate, not a new retention commitment.

## Implementation

- `apps/v2-dag-lambda/src/screenshot-safety-evidence.ts` verifies the producer geometry's version, first-layer decision candidates, structured inspection, document URL/loader identity, observation channels, capture skew, viewport, selected screenshot reference, PNG dimensions and actual SHA-256. The verified pair receives time only, not an assessment or permission to display an image. Unrelated AX timeouts and unresolved controls remain unchanged. Incomplete required DOM/geometry proof, changed documents, altered bytes, invalid geometry or missing provenance cannot obtain the extra allowance.
- `screenshot-safety.ts` starts review in the background and bounds concurrent moderation at two requests. It prioritizes the authoritative comparison when it becomes known; queued settled/proof captures also outrank ordinary images. Already-running requests are not preempted or retried. A first screenshot captured before the pair is known can already be in flight.
- Sharing requires matching MIME type, SHA-256 and literal buffer equality. Current file bytes are compared to the reviewed snapshot again before retention. Replacement bytes at the same path cannot inherit approval. The selected comparison must also retain its expected hash. Images are bounded to the existing downstream 8 MiB limit, with at most 12 reviewed files and 96 MiB of buffered image data; all eight current producer capture IDs fit. Buffers are erased and pending work is cancelled at finalization.
- General-image deadlines start before pair-verification I/O. That local verification cannot consume a completed general image's finalization opportunity. Pair verification is itself bounded within the normal grace; a missing/stalled local artifact cannot extend the gate. Any extended wait uses the same absolute gate-entry deadline and original review, rather than adding two seconds after the normal grace.
- `handler.ts` persists `screenshotSafetyReview` in the existing manifest. It records scheduling, file-read start, queueing, classifier execution, HTTP request start, response headers/body, completion, finalization budget/outcome, byte-binding failures and identical-byte sharing. Diagnostics exclude image bytes, base64, URLs, credentials, raw API responses and exception text. They freeze at finalization; late approvals cannot mutate the result.
- HTTP timings separate queueing from request/response time. Fetch cannot independently measure upload, network transit and provider processing; those remain combined. A timeout while consuming the moderation response is now classified as `moderation_timeout`, rather than invalid JSON.

Sensitive, failed, cancelled, mismatched and timed-out images remain withheld and are removed from retained image storage. Partial inventories, structured control states, concern policy, scoring, reportability and historical conclusions are unchanged. A newly safe image still has to pass the existing canonical consent assessment and prominence projection; these changes do not directly create report findings.

## Saved SITS diagnosis

Reviewed existing local scan `58ac0b55-641b-4cd1-bdd1-6d5c7bb24613`, without contacting SITS again.

The consent worker captured a valid Accept/Reject comparison with 129 ms capture skew, a matching 1366 × 900 viewport, the same loader identity and completed DOM/geometry channels. A rapid retry timeout was retained alongside later observed controls, leaving the inventory partial. The old gate used roughly 79 ms of finalization time and withheld all three screenshots after the safety deadline. The old logs cannot identify whether scheduling, network or provider time caused the pending reviews.

The original images were deleted. This change cannot recover them or retroactively make this saved scan's prominence assessed. Local tests use explicit deterministic fixtures; they do not replace the saved scan's images or assessments.

## Other timing gates inspected

| Gate | Evidence / behavior | Conclusion and recommendation |
| --- | --- | --- |
| Rapid control inventory | Early/retry DOM snapshots share bounded windows. `mergeConsentUiObservations` preserves a latest partial observation while retaining verified visible controls; completed channels clear earlier active channel failures. SITS retained a rapid-retry timeout marker. | A partial flag can outlive successful selected-control capture. The safety gate no longer uses that whole-inventory flag to shorten the verified pair's review. Preserve partial coverage rather than upgrading it. |
| Preference inspection | The worker shares one absolute budget across startup, navigation, readiness, Options and inspection; the coordinator's 19-second allowance includes verification/download. Existing checkpoints preserve document-bound partial evidence. | SITS joined in 16.229 seconds, 3.373 seconds before the passive barrier. No preference evidence was dropped in this run. Monitor its retained phase diagnostic near the budget limit; do not add another wait or repeat the interaction. |
| Action joins | Accept and Reject join concurrently against independent absolute deadlines, including packet verification. Existing tests retain already-terminal outcomes at the cutoff. Accept normally has a six-second tail; Reject has eight seconds. | SITS Reject completed 1.702 seconds before the passive barrier and joined; Accept joined 1.225 seconds afterward. This was retained evidence and expected bounded tail time, not evidence loss. No deadline change. |
| Policy capture and semantic readiness | Policy work has a reserved finalization period and absolute output deadline. Completed early/cached model artifacts may project; late/incomplete model output remains unavailable. Rendered-link fallback retains typed partial observations. | Policy was SITS's slowest passive lane at 19.599 seconds. Its output joined; this scan showed no policy-lane loss. Provider delays can still reduce semantic coverage. Keep those limitations explicit; do not add terminal calls, polling or late refresh. |
| Artifact upload/publication | The canonical bundle uploads before auxiliary objects, but the manifest publishes after auxiliary uploads. The overall artifact deadline bounds the chain. | Slow image/auxiliary transfer can consume publication reserve even when capture succeeded. This is a remaining architectural risk, not an observed SITS failure: its auxiliary upload took 5 ms. Investigate retained upload-phase durations on affected saved scans before proposing changes; preserve all critical proof and single publication. |
| Host/browser contention | Sharded production lanes are independent invocations; local simulated lanes share one host. Background safety requests and browser work overlap. | No evidence establishes shared-host CPU contention as this SITS moderation failure's cause. The new queue and HTTP timings make that hypothesis distinguishable from remote latency. Do not tune production capacity from one local run. |

## Local verification

Result: 130 focused tests passed (31 safety, 15 handler, 72 canonical assessment/projection, 12 policy deadline/handoff), plus the Lambda package TypeScript check and whitespace check.

- Screenshot safety fixtures: delayed partial-pair approval; unrelated AX timeout; malformed document/hash/candidate/frame/bounds/capture-time/dimension proof; hung review bounded by the existing ceiling; sensitive/failed/aborted review; immutable late outcome; literal identical-byte sharing and different-byte isolation; same-path replacement; queue priority/concurrency; all current capture IDs; HTTP phase privacy; response-body timeout; existing-manifest persistence without extra uploads.
- Focused handler regressions: action tails, concurrent joins, terminal outcomes at the cutoff, consent visual reserve, policy absolute deadline, auxiliary upload and worker-manifest mirroring.
- Canonical assessment/projection regressions: valid structured A/R/O survives visual safety failure through persistence, concerns, checklist and scoring; missing/unbound proof stays limited; CMP diagnostic copy retains specific timeout reasons.
- Policy output and early-handoff regressions: absolute deadline, finalization reserve and retained partial rendered-link evidence.
- Lambda package TypeScript check and `git diff --check`.

No public requests, paid moderation calls, new scan records, historical evidence edits, push or deployment were used for verification.

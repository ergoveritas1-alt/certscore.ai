# CertScore.ai passive request reliability

Local follow-up to the bounded vendor hardening pass. No Options panels, live public-site attempts, production deployment or historical report rewrite.

## Corrected upstream loss

The passive runtime request listener previously read `Request.postData()` without a guard before retaining the request and forwarding it to the GPC observation session. The form tracer also read it again before those operations. An opaque body could throw and discard independently available request facts.

The listener now shares one guarded read between payload-field observation and passive form tracing. An unavailable body omits the optional payload observation rather than asserting `bodyPresent: false`. The request, exact request/response binding and GPC observation continue. The form tracer counts an unavailable body as unsupported while retaining independently matched query evidence. No payload, identifier or exception message is added to retained evidence. Existing successful-body interpretation and field bounds remain unchanged. Supplemental GPC proof continues to inspect within its existing limits; unavailable supplemental proof does not veto independently qualified URL evidence.

This changes capture reliability only. Recipient qualification, schedules, deduplication, customer presentation and historical policy versions are unchanged. No added browser/API read, wait, retry, lane, model call, capacity or retention allowance; the shared runtime/form read removes one duplicate access. Expected recurring infrastructure cost increase: $0.

## Historical investigation limits

The prior coverage inventory contains 18 recognized collector/recipient/path pairs across nine scans without any retained successful response. Those are evidence gaps, not 18 verified missed deductions. Current Reject and passive response capture already retain the same-Response status before asynchronous headers; request completion is not substituted for success. New capture cannot reconstruct discarded historical statuses.

Acuity Brands' GPC packet has a late main-document commit after its overlapping terminal binding read. The read began at 7741 ms and completed at 8206 ms; the terminal generation changed from 6 to 7 with `document_commit` invalidation. A later semantic read at 9608 ms observed navigator GPC in the final loader, but the packet lacks verified final-document request/header binding and the earlier signal snapshot is absent. Three retained successful Google responses do not repair that missing attribution. Preserve the neutral result. No terminal retry or extra read is introduced to manufacture coverage.

The original Squadhelp failure retained two generic custom validation issues, but no usable packet. Its exact invariants cannot be recovered. The separately authorized follow-up already succeeded. Additional fixed allowlisted diagnostic codes now cover terminal decision, observed action source, authorized document and write-coverage invariants; arbitrary messages and rejected values remain excluded. This improves future diagnosis and is not claimed to fix the original intermittent failure.

## Verification

Loopback Chromium fault injection makes a real fixture POST's body accessor throw before the runtime listener runs. The request, matching 204 response and GPC request observation survive, with no body absence claim or retained payload. Focused tests cover opaque forms, successful body reads, exact response recovery, terminal invalidation and safe diagnostics. One stale browser-test assertion was corrected to the existing v2 completed-empty form notice contract; notice capture behavior did not change.

All 122 and 47 original scan records were replayed offline, verifying 359 retained source/packet hashes and sizes and the canonical persisted assessment -> normalized concern -> finding -> scoring path. CA recipient/risk/GPP assessments, EU Reject entities and family amounts are identical to the preceding hardening replay. No additional eligible CA or EU deductions can be confirmed from these retained bytes. Fresh five-site verification results remain separate and unchanged.

See `artifacts/capture-reliability-2026-10-22/review.html` and `verification.json` for source manifests, test receipts and every unresolved collector pair. No additional public-site contact was made.

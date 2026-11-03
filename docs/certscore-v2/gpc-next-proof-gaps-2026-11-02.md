# CertScore.ai next GPC proof gaps — retained-only review

Base: dirty main `6a9d197a207765ea958059d6ee2f2b2fdd94aa07`; concurrent edits preserved. This phase extends only the existing internal cohort helper and its tests. Its only non-test caller remains the read-only replay CLI. No producer, public contract, customer report, scoring policy, capture budget, cache, daily-audit configuration or historical source changes.

## What the existing evidence supports

The same 26 already-local original baseline/GPC pairs retain 22 measured request comparisons and five stronger collection packets. Existing activity packets and previous cohort headline metrics are identical. Collection samples are now summarized separately by exact window, evidence policy, packet version and identifier scope; missing samples never mean no collection.

The internal audit now inventories source verification, cookie coverage/document metadata, bounded per-visit read intervals, storage read declarations and the two GPC commit timestamps. It exposes counts and relative times only, with fixed `comparison=not_assessed`, `matchedRequestHorizon=not_established`, `productionProjectable=false` and `scoreEffect=none`. These are metadata coverage statistics, not a new comparability policy or finding.

| Retained fact | Baseline | GPC |
| --- | ---: | ---: |
| Original source bytes verified | 26/26 | 26/26 |
| Cookie snapshots retained | 26/26 | 26/26 |
| Cookie snapshots with coverage and own-document binding | 23/26 | 0/26 |
| Storage snapshots with complete-read declarations | 26/26 | 26/26 |

No pair has bound cookie snapshot metadata on both sides. Storage's current snapshot contract records URL/origin and completeness but has no document token or start/end read interval. Neither the declarations nor nearby request counts establish a comparable cookie/storage checkpoint.

Four pairs have different retained GPC commit times between the impact and observation captures. One such pair retains qualified collection inside its five-second window but is omitted by the exact-commit gate: the two timestamps differ by one millisecond. Another GPC-positive visit has a three-second matched window and all five retained collection requests occur later. Full-visit collection stays visible independently; no longer wait or timing tolerance is warranted by this review.

These 26 convenience records do not establish production population coverage. No raw cookie names, storage names/values, identifiers, URLs or document tokens enter the new diagnostics. Independent source verification rejects wrong scan/lane/region, hashes and lengths; cookie metadata must match its own retained document, target and worker timing. Unequal snapshot times remain unequal and never become matched-horizon evidence.

## Next worker repair, before broader public comparison

1. **Use one authoritative source for the existing GPC document-commit timestamp.** The impact metadata capture and `startGpcObservationSession` currently observe separate CDP sessions and independently sample the host clock. This can explain small differences for the same loader. A future repair should forward one original document request/commit stream to both observers, preserving source/session/loader/URL ancestry, request-before-commit ordering, document replacement invalidation and existing budgets. Do not add a ±1 ms tolerance, copy a later timestamp over an earlier retained fact, or modify historical artifacts.
2. **Retain the existing GPC cookie read's binding metadata under an explicitly scoped contract.** The current `cookieCaptureCoverage` condition in `pre-consent-runtime-scanner.ts` explicitly excludes `globalPrivacyControlEnabled`. The existing cookie read already samples before/after document identity and start/end time; the missing GPC metadata is a retention boundary. Simply removing the exclusion could broaden downstream use of baseline-only coverage. Review an isolated optional GPC proof/version and its consumers first, then test source/target/session/document/read timing without another cookie read, navigation, wait, action or invocation.
3. **Gate any future public cookie/storage packet independently.** Original byte/source-pair proof, fresh isolated visits, compatible snapshot scope and declared checkpoints are still required. Preserve actual per-visit read intervals; never label terminal snapshots as taken at the matched request horizon. Missing partition/completeness/document proof remains unknown. Cookie presence is not use, transmission, persistence, sale/sharing or honoring. Storage needs its own binding design; it cannot borrow cookie or CMP proof.

The original release instruction prohibits new capture and requires original already-loaded bytes at the merge barrier. This review therefore stops before adding future worker evidence or creating a public cookie/storage packet. Existing retained records cannot acquire the missing proof through a renderer fallback, rescan of unchanged code, modified receipt or report-time reconstruction. The next local worker-evidence phase must be explicitly scoped around the repairs above; no deployment is authorized.

## Validation and cost

29 focused Node/tsx tests passed, with zero failures/skips, including existing impact/collection and CLI source-protection cases. New cases cover distinct own-document tokens, unequal cookie checkpoints, missing/partial coverage, wrong source bindings, target/document/time tampering, a one-millisecond commit mismatch without gate relaxation, grouping of sample scopes and whole-report redaction. Scan-core typecheck/build and strict test types passed; `git diff --check` passed. The existing GPC predeploy stage already selects the modified test file.

Only internal report code changed, so public generation, UI/PDF review and a repeat of the prior 35-check product preflight are not required for this phase. The prior product verification receipt remains the record for that earlier source state; this phase's exact checks and hashes are separate.

The full 26-pair local replay took 4.15 seconds (including local file reads, verification and existing assessments), not a measurement of incremental Lambda time. Added compact internal JSON: 38,440 bytes; final compact report: 283,422 bytes. Production storage, paid service usage, browser work and recurring infrastructure increments are **$0/month**. Existing product/audit allowances and the prior release cost-headroom prerequisite are unchanged. No public scan, AWS query/object read, artifact download, push, publication or deployment occurred.

Final evidence: `outputs/gpc-paired-readiness-2026-11-02/cohort-verified.json`, `review-verification.json`, `verification-summary.json`, `prescribed-tests-final.log`, `typecheck-final.log`, `test-types-final.log`, and `build.log`. All replay outputs are internal; no historical customer report or current dashboard was rewritten. The daily audit's 54 source pins remain verified and unchanged.

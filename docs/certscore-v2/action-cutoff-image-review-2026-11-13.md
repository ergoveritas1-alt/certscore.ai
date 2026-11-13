# CertScore.ai action cutoff and image review — November 13, 2026

This follow-up corrects the timeout interpretation in the earlier completeness review. No production changes, new public-target scans, budget changes or deployment occurred. SITS and ergoveritas were not visited. Verification used retained local artifacts, mocked coordinator tests and a temporary localhost HTTP browser fixture with external requests blocked.

## Findings and fix

Three retained paths were deliberately canceled under the existing passive-inspection policy, not proven worker timeouts:

| Scan | Path | Coordinator action interval | Trigger |
|---|---|---:|---|
| Archon `037079c3-8f8f-41ed-a803-f011446b035e` | Accept | 13,838 ms | Partial passive inventory; Privacy choices/Dismiss, no observed Accept |
| WordPress `69aee075-8270-4a15-8f3d-589b785dafa9` | Accept | 9,701 ms | Complete empty first-layer inventory |
| Same WordPress scan | Reject | 10,294 ms | Complete empty first-layer inventory; cutoff after required passive finalization |

The workers have no retained terminal packet or worker-reported completed duration. These intervals are coordinator measurements, not proof of a completed worker run. Their lane code is `*_path_incomplete_at_passive_barrier`. Accept was canceled at the passive barrier; Reject was canceled after the already-required passive finalization. No new tail wait is justified by these fixtures.

The reproduced defect was in the new shared limitation-message helper: it treated `*_path_incomplete_at_passive_barrier` and `*_path_timeout` identically. Three exact retained regressions failed before the fix. Both Accept and Reject now use `passive_inspection_cutoff` for the former and reserve `result_deadline_exceeded` for an actual timeout outcome. The message does not infer that a control was absent or that a click happened. Existing coordinator eligibility, absolute deadlines, worker limits, report status, confirmation and scoring are unchanged. Historical reports are not rewritten.

The portable fixture is `packages/certscore-contracts/fixtures/local-action-cutoff-image-20261113.json`. It retains source/report and manifest hashes, exact scan IDs and diagnostic facts. `artifacts/action-cutoff-image-20261113/passive-inspection.json` records the original passive observations; the compressed Archon bundle's decoded hash/size and both scan IDs were independently checked.

## HubSpot image

Scan `7482db1b-cf8e-43a4-b074-837e340f822f` retained one search form. Its post-Accept image work completed in 107 ms, reached packet validation and returned `no_visible_context`; it did not time out. Form and snapshot metadata survive in the hash-bound packet and report. The canonical image guard emits this reason only when every channel in the final bounded masked image is exactly uniform.

The original rejected pixels and exact form HTML/layout are not retained. Therefore this record cannot distinguish a fully masked input-only crop from other uniform/blank page pixels, or prove that visible neighboring content was wrongly excluded. No image algorithm change is justified. Publishing blank pixels or relaxing field masking would not repair completeness.

A new localhost search-form fixture reproduces the supported outcome under existing image limits: a populated, input-only search form has unavailable image status and no review/published bytes after masking; its structured inventory and original input value remain unchanged. In a separate positive fixture, adding a visible adjacent label yields an available, reviewed image. Existing stalled-review and fully-masked sibling-form tests also pass. The positive fixture is not a reconstruction of HubSpot's missing HTML.

## Verification

- Before: all three retained cutoff tests fail with the old timeout diagnosis.
- After: 179 action/coverage tests pass; final focused regression/release-gate checks pass 8/8.
- Localhost browser/image cases pass 3/3, including stalled sibling review and the new search-only case.
- Accept/Reject coordinator cutoff cases pass 2/2 with existing cancellation behavior and no extra wait.
- Web TypeScript check passes. The pre-existing trailing blank-line warning in `reject-named-stability.test.ts` was preserved.
- The shared completeness and predeploy action-semantics gates include the new retained regression file.

Replay: `TSX_TSCONFIG_PATH=tsconfig.base.json node --import tsx artifacts/action-cutoff-image-20261113/replay.mts`. This verifies the original report-file hash and writes a new comparison; it does not mutate reports. Logs and the evidence manifest are in the same directory.

No additional capture, requests, retries, model use, memory or retention allocation was introduced. Deployment remains on hold. The original action paths remain incomplete and the original HubSpot image remains unavailable; the evidence supports a diagnosis fix, not a new successful-action or available-image claim.

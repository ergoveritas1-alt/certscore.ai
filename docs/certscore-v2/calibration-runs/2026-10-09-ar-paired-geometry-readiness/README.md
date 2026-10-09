# Local paired geometry timing readiness

No deployment, fresh public contact, historical evidence rewrite or baseline promotion. This local cycle follows the quoted privacy/canary corrections and leaves their classification and action semantics unchanged.

## Fix

Positive paired settled-frame geometry previously left `consentGeometryDiagnosticWritten` false until the later dedicated diagnostic. That preserves the required diagnostic/proof screenshot/scroll recovery, but the adaptive timing gate also treated the flag as evidence not yet ready, continuing through its 18-second safety exit even when the settled packet was already usable.

A separate in-memory paired readiness predicate now permits that packet to satisfy the existing timing gate. It verifies canonical complete structural/frame inspection, successful DOM/geometry capture, exact current loader and URL, and an actual same-session paired settled screenshot whose retention is not withheld. Typed controls must match geometry one-to-one on action, label, selector, tag and role. This timing optimization is conservatively main-frame-only because observation rows do not retain per-control frame identity; other captures keep existing timing behavior. Frame attach/detach/navigation and renderer crash invalidate reuse; frame objects are checked too. No new browser read, capture, lane, timeout, action or model call was added.

The diagnostic flag remains independent and unchanged. The later dedicated geometry diagnostic, representative screenshot and bounded scroll recovery still run. Screenshot withholding is never cleared by timing readiness. Retention-withheld and fresh-context images cannot satisfy readiness; display-only withholding may coexist with retained proof. Unresolved decisions stay partial/unknown; no assessment, semantic registration, policy, score or report projection is upgraded.

## Local measurements

The frozen baseline scanner matches the exact working source before this cycle, rather than the deployed release. Both sides use the same current canonical contracts. The deterministic loopback fixture mounts a delayed Accept control plus an untranslated decision after the early empty capture, with local request activity until 2.5 seconds. It performs no click.

| Run | Consent-proof module | Gate outcome | Dedicated proof |
| --- | ---: | --- | --- |
| Baseline | 18.492 s | 18-second incomplete-proof safety exit | Retained |
| Candidate | 8.173 s | Existing 8-second stable-partial exit | Retained |
| Candidate audit holdout | 18.194 s | Existing 18-second audit exit | Retained |
| Candidate with same-URL child reload (earlier guard build) | 18.816 s | Earlier proof invalidated; conservative exit | Retained |

The stable pair saved 10.319 seconds (55.8%) in this local module. Full control arrays, A/R/O flags, capture status and partial inventory agree between baseline and candidate. The untranslated-decision limitation is preserved. This is one deterministic comparison, not a population or end-to-end scan speed estimate.

The child reload occurs at 4.5 seconds after paired capture; the main loader remains unchanged. The gate switches back to incomplete-proof continuation, demonstrating that same-URL child navigation cannot reuse stale readiness. It still retains final geometry and its dedicated screenshot.

## Verification and provenance

Artifacts and source hashes are under `artifacts/ar-paired-geometry-readiness-20261009/`, including `before.json`, the final `verified/benchmark.mts` and `verified/benchmark.json`, `frame-drift.mts`, `frame-drift.json`, raw scanner results and screenshots, logs and `verification.json`. Final geometry artifacts belong to the final dedicated capture and must not be relabeled as the earlier settled geometry packet.

The focused 41-test suite passed before final guard tightening, including geometry/screenshot binding, DOM-context boundaries, and below-fold and internally scrollable consent recovery. Final guard behavior was then verified separately with the final readiness tests and the byte-pinned benchmark. A separate loopback case exits the stable-partial gate at 8 seconds, then reveals a clipped Reject mounted at 7 seconds through the existing internal-scroll recovery. Both A/R controls and the dedicated proof screenshot are retained, with the unrelated unresolved decision still partial. This case is now a permanent regression. Three representative-proof integration tests pass: paired empty CMP inspection, generic negative inventory and same-document Playwright proof after stalled CDP capture. Scan-core typecheck and whitespace checks pass. All three final readiness tests pass, including the permanent scanner frame-reload and ready-pair scroll recovery regressions. The predicate regression additionally exercises malformed/incomplete/mismatched proof, unknown preservation, visual withholding, progress reset and audit holdouts; a permanent scanner test covers same-URL child reload.

Initial standalone harness attempts were blocked by the existing public-target guard because loopback is disallowed outside Node test context. Running the loopback fixture through the standard Node test runner resolves that expected harness restriction; no production network guard was changed or disabled. Proxying was explicitly disabled for the artifact harness only. The initial scroll fixture inventoried Reject before the adaptive gate, so its stable-exit assertion failed despite correct retained A/R and scroll proof. That attempt remains under `scroll-proof/`; the corrected coverage scenario is separately retained under `scroll-progress/` and passes, along with its permanent regression.

Luna reviews benchmark/baseline decisions under AGENTS.md. Luna accepted deterministic local readiness after review prompted the retained-image and one-to-one control guards; the final benchmark records source hashes before imports and asserts no source drift afterward. The table uses worker-reported module duration; invocation elapsed time is separately retained in the verification summary. Earlier benchmark runs are preserved separately. Model-assisted review is not independent human adjudication. No production latency claim is made. The previous nine-pair local cohort p95 increase of 3,344 ms still exceeds the 2,000 ms release target; canonical ledger-selected paired live calibration is the next gate before considering deployment.

Production compute should decrease for qualifying cases; other evidence and lane barriers may still determine total scan latency. There is no recurring production cost increase. The new approximately 30 seconds of CI regression coverage is conservatively below $0.60/month at 100 runs using an assumed $0.01/runner-minute, within the repository's below-$1 preapproval.

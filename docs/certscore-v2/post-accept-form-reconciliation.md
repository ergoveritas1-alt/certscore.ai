# Document-bound post-Accept form reconciliation

Local implementation, October 9, 2026. No deployment in this cycle.

The production Termly report retained an early three-field image inventory and a later seven-field structured inventory. The shared report preferred the image inventory and suppressed all main-frame structured rows. The captures used unrelated generated IDs, so historical evidence could not safely establish a common document binding.

New `post_accept_form_capture.v3` records can retain a main-document loader binding. The image collector supplies its existing CDP loader proof to the structured collector running on the same Playwright Page. Only samples started after that binding may carry it. Both collectors invalidate their work on navigation; earlier samples never acquire proof retroactively. The original capture byte cap, DOM sampling cadence, action window, two-image cap, masking and safety review remain unchanged.

The contract-layer reconciliation accepts a completed terminal structured sample only when target hash, dispatched action, confirmed-window start, main-document loader, page URL, form reference, structure, method, destination and original positioned controls match. Duplicate references/indices, incomplete capture, truncation, earlier timestamps and mismatched proof preserve the original inventory. Existing v1/v2 captures remain readable and cannot gain the new proof on read.

Verified later fields and scoped disclosures can enrich the same form row. Its structured evidence references and later capture provenance remain separate from the original image bytes/hash/time. Newly retained main-document forms retain their own structured rows, without an invented screenshot. Shared report, API form follow-up, forms tally and Accept timeline consume this reconciliation. Consent registration, concerns, findings and scoring are unchanged.

The two collectors also now agree that a native input without a type attribute is a text input. Screenshot rebinding supports that browser default and the exact older `input` representation, while rejecting an explicit changed type. The structured sampler retains the observed destination hostname, needed for a strict destination match.

## Verification

- All 572 contract tests passed, including new identity, timestamp, ambiguity, legacy and additional-form cases.
- All 49 form browser regressions passed: masking, default-input compatibility, changed types, navigation, deadlines and late capture. Six binding lifecycle tests were then rerun after adding navigation and no-retroactive-binding assertions; all passed. These counts overlap.
- All 19 Accept observer regressions and 22 shared report/API/timeline/image-route tests passed.
- Contracts/scanner typechecks, scanner workspace build and web TypeScript check passed. The localhost application build output was not overwritten.
- A real localhost browser fixture retains an early three-field image and a later seven-field terminal sample; the canonical typed projection reconciles seven fields into one row while preserving the original image inventory and its hash inputs.
- Read-only replay of the original production packet preserves its three-field projection. Historical loader proof was not invented. Full logs and originals remain under `artifacts/post-accept-form-reconciliation-20261009/`.

The first combined browser run failed the new reconciliation fixture because default input types differed; its follow-up exposed the matching screenshot rebinding inconsistency. Both were fixed without relaxing assertions. One existing 200ms frame-capture fixture also failed while browser/typecheck work overlapped; it passed in the subsequent sequential 49-test suite. The replay harness initially failed on CommonJS top-level await and was corrected without changing production evidence or assertions.

## Cost and release scope

No new browser session, network request, screenshot, model call, configured wait or timeout is introduced. The additional bounded loader/destination metadata and reconciliation work are estimated below $0.10/month at 100,000 scans, assuming eight retained copies and 30-day retention. This below-$1 estimate was disclosed before implementation and is pre-approved under the repository cost policy; it is not a hard spending cap. Existing packet byte limits remain enforced.

The fresh localhost Termly-CMP full-report verification and contact receipt are recorded in [the scoped verification record](calibration-runs/2026-10-09-post-accept-form-reconciliation/README.md). The disclosed one-time verification/bookkeeping estimate is under $0.50. No SITS contact or form submission is authorized by this test. This focused cycle is not a new production release receipt or a fleet reliability benchmark.

# CertScore.ai California executive presentation repair

The saved report for `thisisvisceral.com`, scan `2e5f9f25-964e-4ce2-b52f-b90dd54f7f65`, was inspected read-only. It displays a 14-second scan, California score 86, CookieYes, three observed consent controls and one policy surface. No new scan was started.

Its California details have six families: sale/sharing choices has completed page inspection with its obligation unresolved; privacy notice, rights disclosures, request methods and sale/sharing disclosures are partly assessed; notice at collection has limited evidence. These are check-level evidence/interpretation states, not a failed scan job.

`californiaAssessmentPresentation` treated any non-completed family as a global “Assessment incomplete” label, even with an available score. Both the executive overview and the regulatory priority section displayed that label, and replaced empty highlights with a diagnostic paragraph.

The shared partial-coverage presentation now uses **California privacy review** and **View the California privacy checks in Detailed evidence.** Both surfaces use that shared copy, with a working evidence link. Complete assessed evidence retains its qualified zero-issue presentation. Missing scores remain unavailable; pending or loading California scores no longer display an unavailable message prematurely.

This is a presentation-only change. Score computation, canonical findings and priority selection, coverage states, consent proof, stored scans and detailed evidence are unchanged. Partial evidence cannot produce a clean zero-issue statement. No coverage family is promoted to completed and no finding is synthesized. The historical 80-case reviewed corpus remains unchanged; its current empty-state presentation expectation is explicitly updated in the test while finding-bearing qualifications remain pinned.

Validation: 163 tests passed across the presentation, reviewed corpus, highlights, regulatory selection and California disclosure suites. Tests reproduce the 86-point/six-family case, preserve projected findings and score inputs, reject misleading zero-issue output for partial coverage, and cover unavailable/loading scores. Full web typecheck and `git diff --check` passed. One early new test fixture lacked required finding fields; the fixture was corrected through the canonical finding schema and the passing suite rerun. Logs are retained under `artifacts/executive-california-review-2026-10-29/`.

No deployment, flag change, rescan, historical report rewrite or recurring infrastructure cost change occurred. The live report will retain the old presentation until the local fix is deployed through an approved AWS workflow.

## Completed-report regression follow-up

The existing shared copy fix covers each California condition identified in the audit. No further production-code change was needed. Added `apps/web/components/scans/completed-report-assessment-headline.test.tsx` with 70 regression tests:

- Missing, null and empty-family coverage at the display compatibility boundary.
- Coverage v1–v3: `review` and `unknown` in each of the six families, using schema-validated fixtures.
- Coverage v4: `partial` and `limited` assessments in each family, including cases with an `observed` status that must not override the incomplete assessment state.
- Each unresolved case renders both EU and California executive and regulatory priority surfaces, with one and four scanned pages and with an available or unavailable California score. Completed reports never receive the misleading global incomplete headline. Unavailable California scores never borrow the EU score or become a passing result.
- Completed family assessments retain their qualified no-priority-issues presentation. Existing projected findings remain visible under the appropriate jurisdiction; pending, loading and unavailable states remain distinct.
- California detailed coverage keeps all six family rows, original reasons, partial/limited labels and retained policy passages. A completed EU scan with incomplete consent-control proof keeps its canonical `Not testable` refusal-control checklist result and explanation. Rendering does not change evidence or score inputs.

Validation: all **434 tests passed** across 15 files, including the 70 new tests, prior presentation/highlights/reviewed-corpus regressions, EU coverage policy, canonical report exports and PDF exports. Full web typecheck and `git diff --check` passed. Final logs are `completed-headline-regressions/tests-serial.log` and `completed-headline-regressions/typecheck.log` under the existing artifact directory.

The two component regression suites are also included in `pnpm test:assessment-highlights`. That existing report check now runs in full preflight as well as fast web preflight. The actual report command passed **244/244 tests**; the release-gate selection suite passed **17/17**, including the new check that both plans select the headline regressions. These overlap the 434-test run and are not additional unique test counts. Logs are `report-gate-rerun.log` and `gate-selection.log`. The initial report-command invocation was blocked before tests started by the sandbox's prohibition on tsx's local IPC pipe; it passed when that pipe was allowed. Neither full nor fast preflight was executed as a whole, and no deployment command ran.

The initial concurrent run is preserved in `completed-headline-regressions/tests.log`: 432 passed, one bounded agent-registration fixture assertion failed, and the sandbox denied an owned localhost test server. The registration test passed in isolation, then the entire suite passed serially with permission for the loopback-only fixture. No test expectation, production evidence deadline or capture budget was relaxed to obtain the passing result.

This follow-up adds local tests only. It performs no public-site scan, deployment, flag change, production write or historical export rewrite. Recurring cost increment: **$0/month**.

## Canonical highlights follow-up

The owner rejected the navigation-only California highlights as insufficient and required consistency with the shared highlights path. Both web report surfaces now call `buildRegulatoryAssessmentHighlights`, which preserves the existing regulatory selector and delegates narrative rendering to `buildAssessmentBrief` / `buildAssessmentHighlightsPresentation`. Finding-bearing narratives continue to use the same priority order, whole-fact qualifications, length bounds, actions and evidence links.

For an empty California priority list on a single-page report, `projectCaliforniaAssessmentResultSummary` can provide neutral assessed-result context from an already-projected California finding's typed evidence payload. The provenance is:

```text
verified retained California assessment
→ normalized California concern
→ concern policy
→ eligible unified finding
→ projectCaliforniaRegulatoryPriorities
→ source-bound assessment result context
→ shared assessment brief/highlights renderer
→ executive and regulatory display
```

The projection requires the exact canonical finding identity, matching evidence payload identity, a valid versioned California assessment, matching report scan/document/source hash, consistent sibling assessments and retained policy evidence references. Rights wording is summarized only from a positively assessed, source-bound passage; general consumer wording stays explicitly general. It does not accept raw policy text, UI screenshots, CMP names, control counts, a score or an isolated workpaper as a source of new executive facts. Missing, malformed, conflicting or differently bound context produces no assessed-result narrative.

Contextual facts and source references remain separate from priority count, severity and score. A reviewed notice and retained general deletion-right wording may be described, followed by the relevant existing disclosure or collection-notice review action. The earlier suggested sentence about an absent named sale/sharing choice is **not** added to highlights: the approved uncorroborated-choice demotion remains effective. Standalone non-discrimination and registration wording, analytics-only collection and existing recipient overlap exclusions also remain effective. No finding is restored by calling it context. Actual eligible priority issues retain their existing narrative without this fallback context. EU and site-wide narratives keep their existing behavior; starting-page context is not generalized to a whole site.

The report supplies scan/document/source identity independently from the candidate finding payload. The shared result renderer produces the prose and links for both California surfaces, while unknown and unavailable data remain truthful. Detailed evidence, original assessments, canonical finding eligibility and score calculations are unchanged. Previously generated `customer-preview/` screenshots show the earlier navigation-only candidate and are not proof of this later narrative revision; no production improvement is claimed.

Validation records are under `artifacts/executive-california-review-2026-10-29/canonical-highlights/`. The reviewed 80-case corpus remains byte-for-byte unchanged; all cases are now checked through the shared regulatory wrapper as well as the underlying narrative renderer. Canonical fixtures exercise the complete assessment/concern/policy/unified-finding projection, source identity, missing and other-jurisdiction rights proof, conflicting assessments, wrong scan/document/source, missing identity, both report surfaces, unchanged scoring and preserved editorial exclusions. The existing report test command includes these regressions and the California priority/disclosure suites; it runs test files serially to preserve the existing bounded analysis deadlines under local load.

Final validation: **465/465** report and policy tests, **268/268** in the actual report-highlights command, **17/17** release-gate selection tests, full web typecheck and `git diff --check` passed. Test sets overlap and are not cumulative unique counts. The initial typecheck caught widened string literals in the JSON corpus test adapter; its existing explicit finding type is now preserved through the new wrapper comparison. The final typecheck passed without changing corpus records or expected finding-bearing narratives. No full preflight, deployment or live scan was run.

No deployment, flag change, public-site scan, production write, historical export rewrite, capture budget change or model/API call was performed. Recurring cost increment: **$0/month**.

## Highlights clarity follow-up

The owner requested a clarity check of what was found and what to do next. The same canonical contextual-result projection now uses plain wording for the reviewed notice and positively retained deletion-request wording. The next steps are separate sentences. When the versioned collection assessment contains cookies and/or browser storage, the action names only those positively recorded categories. Other supported collection contexts retain a general evidence-linked action; technical resource contacts cannot supply this category-specific advice. The scan/document/source binding and finding selection gates are unchanged.

The actual customer export was replayed again without a download, scan or production write. Its updated text is:

> We reviewed the privacy notice. It includes general consumer wording about requests to delete personal information. Next, review how the notice explains California privacy rights and the sale or sharing of personal information. Check whether collection notices describe the cookies and browser storage observed.

The preserved export remains SHA-256 `e1dcfabe3a5d9845f241bd79d800c72711ecbf570d59c7d7334ce15f90aa3b03`; score **86**, zero selected California top issues, and the detailed evidence are unchanged. The new preview and replay records are under `artifacts/executive-california-review-2026-10-29/highlights-clarity/`; previous preview versions remain preserved.

Validation: **269/269** tests passed in the report-highlights command, including the unchanged 80-case reviewed corpus and a new canonical fixture regression covering cookies alone, storage alone, both categories and technical-only resources. Full web typecheck and `git diff --check` passed. These are presentation and retained replay checks; no production verification or deployment is claimed. Recurring cost increment: **$0/month**, with no additional capture, paid calls or infrastructure.

## Editorial-policy alignment review

The owner requested alignment with the established canonical write-up, or an explicit proposal where an adjustment is needed. The review confirms canonical evidence lineage and preserved effects, while identifying the no-priority assessed-result narrative as a new editorial behavior that should be explicitly documented. The recommended shared rule and a shorter, result-led customer example are recorded in `docs/assessment-highlights-policy-proposal-2026-10-29.md`. That document is a proposal, not an adopted policy or a new rendered preview. It also records the existing PDF narrative distinction so shared web rendering is not mistaken for complete export parity.

No application code, rendered customer wording, score, evidence, historical report or deployment state changed during this policy review. Existing test results remain the prior validation; no new test run is claimed for this documentation-only follow-up.

## Implemented factual-only correction

The owner explicitly required removal of generic tasks derived from unresolved review statuses. `AssessmentResultSummary` now has no action field, and its shared renderer emits facts only. The California adapter no longer translates rights/sale-sharing family states or collection-notice uncertainty into recommendations. Its result leads directly with the supported observation, without the description of scanning work. Eligible projected finding actions remain unchanged. The PDF review-only fallback likewise stops appending an invented generic instruction while retaining its original explanation.

The actual saved customer export now yields: **The privacy notice includes general consumer wording about requests to delete personal information.** No disclosure-review or collection-notice task is appended. The score remains 86/100, zero selected California top issues, with the original export, findings and Detailed evidence unchanged. The factual-only rule is documented in `docs/assessment-highlights-policy.md`; it supersedes the earlier proposed generic review action.

Validation: **270/270** tests in the shared report-highlights command, including all 80 unchanged reviewed cases, and **2/2** PDF export regressions passed. Full web typecheck and `git diff --check` passed. New regressions cover unresolved collection/disclosure contexts, legacy contextual action payloads, both page/site scopes and preservation of real projected finding actions. The actual customer replay verifies source hashes, unchanged score/findings and exact rendered wording. Logs, replay and screenshot are under `artifacts/executive-california-review-2026-10-29/factual-highlights/`. Previous previews and original exports remain preserved. No scan or deployment occurred; recurring cost increment is $0/month.

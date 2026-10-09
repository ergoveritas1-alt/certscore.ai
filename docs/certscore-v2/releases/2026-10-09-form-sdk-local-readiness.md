# Form and SDK local release readiness — October 9, 2026

Source revision `2d0142d1f40be56f7220328f452a031eb997d0c5` passed `pnpm preflight:full` in an isolated managed checkout. The gate ran from 22:19:45 to 22:32:13 UTC. All 4,432 tracked source entries matched the primary checkout; no check was skipped or gate weakened. See the [receipt](2026-10-09-form-sdk-local-readiness.json). This is local readiness, not a CI typecheck receipt or production deployment. A later documentation-only commit records this result without changing the tested application source.

## Fixes

The SDK now explicitly types and exports `ScanFormsSummary` and `ScanScoreExplanation` for scan resources, scan jobs and Pulse results. Optional/null historical coverage and decision verification are preserved. A packaged consumer compilation test checks bidirectional compatibility with canonical API contract types and rejects an invalid string count. The installed-package smoke example exercises these fields. All 32 SDK tests and the package smoke check passed. The changelog marks this patch Unreleased; public npm remains 0.2.14. A separately versioned package release is required to deliver the declaration correction to SDK consumers; no package was published here.

The prior [document-bound post-Accept form reconciliation](../post-accept-form-reconciliation.md) remains included in the tested source and remains undeployed. One form-table regression expected an obsolete disclaimer; it now checks the existing limited-capture detail and asserts that the obsolete disclaimer stays absent. No customer-facing copy or new disclaimer was added.

## Form privacy disclosure audit

Reviewed the retained Termly-CMP localhost scan `0dc38682-e8b9-4da2-bdb3-0371ace904b8`. The retained main-document text passed its original hash/byte-size checks. Its Contact Us region contains field labels and general contact wording, without privacy-policy wording. The policy/privacy-choice links appear in the global footer after other sections; the CMP cookie notice is also separate from the form. The seven-field post-Accept crop contains masked controls and field labels, without a visible privacy notice. Both retained form observations contain no disclosure excerpt.

This does not establish that no disclosure exists outside the retained captures. It does mean there is no demonstrated missed form-associated disclosure to justify changing detection. Keep Not captured rather than borrowing global footer or CMP content. The existing positive/negative form-disclosure fixture passed: inside-form and adjacent scoped notices are captured, while unrelated footer/CMP text and entered values are excluded. No new site contact occurred.

## UI verification boundary

Thirty report/table/timeline/screenshot-route regressions passed. Source review found the action selector uses the selected path's title, clock and events; the native screenshot dialog closes through its Close control, backdrop and native dialog close event, restores body overflow and returns focus to the trigger. This source review is not a live interaction check.

The timestamp server-render check passed under an America/Los_Angeles server timezone: explicit UTC SSR fallback remains stable, ISO machine timestamps are retained, and Date/string/null/invalid cases behave as expected. Browser-local timezone selection runs after hydration. Hydration and actual timeline/modal interactions were not verified: the browser tool rejected opening the localhost report under its URL security policy. No alternate browser, reload, CDP or other bypass was attempted. A manual check was requested while the gate ran; no answer had arrived when this record was saved.

## Release state

No deployment, SDK publication, new scan, target contact, model call or recurring infrastructure cost increase occurred. The isolated test checkout can be archived after its receipt is saved; the running primary localhost build was not overwritten. The previously measured 4–6 second production finalization interval was not retuned or benchmarked in this cycle.

Application source is committed and the full local gate is green. Live UI sign-off and SDK version/publication remain open before claiming the fixes are fully delivered. Logs and initial harness failures remain under `artifacts/form-sdk-release-readiness-20261009/`.

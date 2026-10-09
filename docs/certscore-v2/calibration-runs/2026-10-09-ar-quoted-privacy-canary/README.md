# Local quoted privacy control and owned canary corrections

No deployment, fresh public calibration visit, baseline promotion or scoring change. This follows the local request-retention cohort; its population denominators and release timing result are unchanged. Luna reviewed the narrow classification and semantic boundaries, and independently checked the latency diagnosis in source/retained evidence. This is model-assisted review, not independent human adjudication.

## Corrections

`consent-control-label-registry.v13` adds one exact, consent-context-required, observation-only English alias for the quoted statutory label `"Do Not Sell My Personal Information"`. Curly double quotes normalize to the same alias. It resolves to `privacy_opt_out`, retained as `do_not_sell_share`, and never becomes Reject or Options. No generic quote stripping, new click recipe, action authorization, wait, lane or model call was added. Near-matches, added words and unrelated context remain unresolved.

`testar2.html` previously claimed its opaque `OptanonConsent` mutation established Accept despite denied TCF. Under the existing `semantic_consent_registration.v2` policy that is correctly unconfirmed. Updated its copy, expected metadata, both A/R manifests, documentation and tests. The older `accept-inconsistent.html` page has the same correction. Page runtime behavior and historical packets remain unchanged.

The page scenario identifier now says `post-action-unconfirmed-accept`. Both manifests retain their legacy `ergoveritas-post-action-indistinguishable` target key as a stable historical identifier, not a comparison conclusion; the authoritative expected comparison is `insufficient_evidence`.

Testar2's Accept click and bounded capture complete. Requests, instrumented writes and exact hashed storage snapshots remain after-click facts, with Succeeded execution but unconfirmed semantic consent. They do not create registered post-Accept rows, an acceptance contradiction or a registered A/R outcome comparison. Its Reject still confirms through denied TCF and retains eligible post-refusal activity. Existing independent findings are not erased.

Owned page regressions now run in the canonical predeploy consent-action semantics check, preventing stale canary expectations from being skipped by that gate.

## Local verification

- Seven owned-page tests pass, including the original five (previously four of five), the legacy unconfirmed receipt boundary and a canonical Reject observer test that makes no click on the quoted privacy-only surface.
- 205 focused tests pass across classifier, assessment, geometry, DOM inventory, virtual-time gate predicates and owned pages.
- 568 contract tests pass; contract and scan-core typechecks pass.
- 271 release action-semantics tests pass, including all seven owned-page tests.
- The release action-semantics test log and focused logs are retained under `artifacts/ar-quoted-privacy-canary-20261009/`; see the verification summary for final counts and hashes.
- Exact retained replay pins Segment's original geometry bytes to SHA-256 `e5edc6d829414fd75ebd26a93d731576b1fe15bc7b57562ad84778b46eabaa0f`, and the frozen v12 classifier source to `c22c739d5419133932129be7195a3dfc242ef1c2dad58ea97d3b2d4f1fadbe1e`. One label changes from observation `unknown` to `privacy_opt_out`; action classification stays `unknown`. The replay writes a diagnostic artifact only, without altering canonical evidence or historical assessment.

The virtual checkpoint test verifies the existing two-second stability requirement and the independent written-geometry gate. It does not measure an end-to-end latency saving or assert every partial packet must wait. Unknown near-match geometry stays partial, separate from the timing gate.

## Remaining latency gate

The original interpretation that the quoted label itself prolonged Segment's gate was too strong. The retained run contains positive paired settled-frame geometry, but `pre-consent-runtime-scanner.ts` deliberately sets `consentGeometryDiagnosticWritten = !hasConfirmedFirstLayerGeometryControls(...)` on that path. Positive geometry thus leaves the flag false until the later dedicated diagnostic, including its proof screenshot/scroll handling. The adaptive stability gate consumes that flag and records incomplete-proof continuations through the 18-second safety exit.

The alias improves classification but does not fix that independent flag lifecycle. No runtime saving is claimed. The prior nine-pair local p95 increase of 3,344 ms still exceeds the 2-second release target; no new live sample has superseded it. Next assess whether verified, same-document positive paired proof can satisfy stability earlier while preserving the required dedicated capture, document binding, screenshot safety, unresolved-control states and bounded scroll coverage. That requires its own deterministic fixtures and calibration; do not set the flag merely because an artifact exists.

Production scan compute and evidence volume are unchanged. Additional owned tests add about ten seconds to a CI invocation: conservatively below $0.25/month at 100 runs using an assumed $0.01/runner-minute, within the repository's below-$1 preapproval. No paid service, browser lane, invocation, model call, timeout or retention extension was added.

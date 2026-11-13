# CertScore.ai — bounded consent-scope hydration reads

## Evidence and reproduced defect

The retained Sanity Accept packet for `747a6d93-5e51-4681-993d-6f7f1878a9bb` contains `scope_ambiguous`, a subsequent fresh candidate, then binding-budget exhaustion at 14 seconds without a click. Its original uploaded bytes were rechecked against the retained pointer SHA-256 and byte count. A separate passive worker records overlapping Osano buttons, including one covered and one actionable “AKZEPTIEREN” control. That separate document does not establish the failed action DOM.

A reconstructed loopback fixture demonstrates a shared defect: hydration replaces a uniquely located consent scope after the count read but before `inspectConsentScopeInteraction`. The unbounded Locator.evaluate selector acquisition auto-waits for the obsolete selector, consuming the remaining search/result budget despite a valid replacement choice. Before the fix, both same-choice Accept/Reject fixtures failed with zero clicks; a Reject opposite-choice fixture also exceeded the asserted packet budget. The opposite choice was never clicked.

Static overlapping Osano instances alone do not reproduce the original failure. The exact action selector/container DOM at the historical ambiguous checkpoint was not retained, so this repair is not proof of the sole historical cause. Genuine scope ambiguity remains fail-closed.

## Canonical change

`cmp-action-target.ts` caps Locator selector acquisition for the shared scope interaction read at 100 ms (or a smaller caller limit). An unavailable stale scope yields to the existing fresh-discovery loop. ElementHandle reads retain their existing behavior. This is not a timeout on browser JavaScript execution; enclosing action deadlines continue to bound the overall work.

No site condition, CMP exception, selector allowlist, added request, retry lane, wait window, invocation, screenshot, memory increase or relaxed proof is introduced. Source/document binding, exact-target authorization, native control classification, scope eligibility, actionable uniqueness, final proof and consent confirmation remain unchanged. Existing capture/acquisition/compute budgets and deployment hold remain. This is a bounded optimization with no added recurring infrastructure or retention allocation.

## Validation

- Eight new loopback-only Chromium regressions pass: Accept/Reject replacement with the same choice, opposite choice, overlapping Osano scopes and independent competing scopes. Only the safe unique choices are clicked.
- Twenty existing scope-interaction, bounded-read and control-binding regressions pass. The first combined run had two fixture-setup failures (Reject duplicate fixtures omitted the required recipeSetId); the corrected new suite passes 8/8.
- Scan-core TypeScript passes. Regression file is included in the action reliability and predeploy gates. No deployment was run.
- One full-profile localhost Sanity scan, `fadbce13-d57d-4edc-8fbb-3e3e0fc6741c`, produced a ready report. Accept: click/confirmation/observation complete, packet 6,994 ms. Reject: all three complete, packet 11,313 ms.
- Four pre-consent form images plus two post-Accept form images were retained. All six actual localhost image responses returned 200 and matched hashes, byte counts and dimensions. Original action packet hashes/sizes and report source bindings also match.

SITS and ergoveritas were not visited. One successful public-target check is verification of this run, not a guarantee of future consistency or population coverage. Existing workspace changes and historical reports were preserved.

## Local evidence and replay

Evidence directory: `artifacts/sanity-scope-20261113/`. `retained-replay.json` records original packet binding and the separate passive-geometry limitation; `hydration-before.log`, `hydration-final.log`, `regressions.log`, `typecheck-final.log`, `final-verification.json` and `image-verification.json` retain results. `calibration-manifest.json` is the scoped operational manifest; `evidence-index.json` hashes investigation files separately.

Offline replay (network blocked by fixtures except the loopback server):

```sh
TSX_TSCONFIG_PATH=tsconfig.base.json node --import tsx --test --test-concurrency=1 packages/certscore-scan-core/src/consent-scope-hydration.test.ts packages/certscore-scan-core/src/cmp-action-target.test.ts packages/certscore-scan-core/src/consent-control-read-budget.test.ts packages/certscore-scan-core/src/consent-action-binding.test.ts
pnpm --filter @certscore/scan-core typecheck
```

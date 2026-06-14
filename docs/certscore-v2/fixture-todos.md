# CertScore v2 Fixture TODOs

These are targeted internal fixture needs from expanded calibration. They are not production behavior definitions.

## Implemented: Hydration-Delayed Global Privacy Footer

Implemented in `packages/certscore-scan-core/src/test-fixtures/static-server.ts` as `policy-global-footer-delayed`, with coverage in `packages/certscore-scan-core/src/policy-surface-scanner.test.ts`.

Coverage goal:

- homepage initially lacks static policy links
- footer links appear after delayed script execution
- links include privacy policy, cookie policy, privacy center, and Do Not Sell / Share variants
- policy-surface scan should offer hydrated observed candidates to Nano before common-path fallback

## Implemented: Multi-Step Preference-Center Reject Flow

Implemented in `packages/certscore-scan-core/src/test-fixtures/static-server.ts` as `consent-preference-center-reject-success` and `consent-preference-center-ambiguous`, with coverage in `packages/certscore-scan-core/src/consent-flow-runtime-scanner.test.ts`.

Coverage goal:

- first layer includes manage/preferences but no direct reject
- second layer includes reject all, save choices, and category toggles
- scanner records the flow as preference-center traversal
- failed or incomplete traversal remains not-testable with explicit action-confidence limitations

## Remaining Targeted Fixtures

- Hydrated regional routing where footer links are locale-relative or redirected before fetch.
- Preference centers that require category-toggle interaction rather than a clear reject-all control.
- GPC disclosure plus preference-center runtime behavior in the same controlled fixture.
- Saved-bundle fixtures for preference-center traversal and hydrated policy-surface observations, once the canonical saved-bundle snapshot set is refreshed.

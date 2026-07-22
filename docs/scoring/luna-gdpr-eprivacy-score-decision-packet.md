# Luna GDPR/ePrivacy score decision packet

## Objective

Approve or reject a versioned GDPR/ePrivacy posture model that is evidence-grounded,
coverage-aware, stable across equivalent sources and regions, and consistent across
all customer surfaces. This is not approval of an overall CertScore and does not
authorize legal-compliance claims.

## Current recommendation

- Advance `candidate-v3-rights-max-30` as Luna's selected calibration candidate;
  keep it internal and `pending_luna` until the governed public sample is available.
- Candidate-v3 raises the rights-gap family maximum from 25 to 30. A supported
  high-severity rights gap now produces `70 / Watch / Review`, using the shared
  high-severity value without a family-specific discontinuous cap.
- Luna selects **report usable evidence** as the customer-facing coverage meaning because it
  matches the exact GDPR/ePrivacy rows customers see.
- Keep **model eligibility coverage** as an internal weighted input used to withhold
  a score when model inputs are not sufficiently testable.
- Treat divergence between those metrics as a visible contradiction, never as a
  reason to silently relabel one as the other.

## Luna decisions

1. **Coverage semantics:** decided. Customer-facing coverage is exact report usable evidence; model eligibility coverage remains internal.
2. **Benchmark corpus:** approve the retained replay, owned canaries, and the canonical selector's governed public sample. The central contact-history export and selector artifacts are mandatory; live selection fails closed when unavailable or ineligible.
3. **Expected bands:** label all twelve required lanes: low signal, strong consent controls, pre-consent tracking/storage, policy gaps, session replay/fingerprinting, sensitive contexts, accessibility, transport/security, consumer protection, access-limited/no-go, cross-region equivalence, and Lambda/browser-extension source equivalence.
4. **Model parameters:** approve or revise family boundaries, weights, severity points, family maximums, critical caps, score-withholding thresholds, posture bands, and contradiction thresholds.
5. **Final sign-off:** identify the approver, timestamp the decision, and attach the final evidence artifact for the exact model version.

## Luna expected-band labels

These are calibration expectations for the GDPR/ePrivacy domain score, not an overall
CertScore and not legal conclusions. They are now machine-enforced against the
deterministic benchmark while their decision status remains `pending_luna`.

| Lane | Expected domain posture | Reason |
| --- | --- | --- |
| Low signal, complete coverage | Clear | No supported score-eligible gap; adequate evidence is required. |
| Strong consent controls | Clear | No supported score-eligible gap in the fixture. |
| Pre-consent tracking/storage | Watch | Supported high consent/tracking risk is capped at 54. |
| Policy/rights gap | Watch | Candidate-v3 contributes 30 risk points, producing 70. |
| Session replay/fingerprinting contradiction | Action Needed | Supported high contradiction activates the 49 cap. |
| Sensitive context | Action Needed | Supported high sensitive-data risk activates the 49 cap. |
| Accessibility | Clear for this domain score | Accessibility is excluded from GDPR/ePrivacy risk; overall score remains withheld. |
| Transport/security | Clear for this domain score | Transport/security is excluded from GDPR/ePrivacy risk; overall score remains withheld. |
| Consumer protection | Clear for this domain score | Consumer protection is excluded from GDPR/ePrivacy risk; overall score remains withheld. |
| Access-limited/no-go | Withheld | Evidence coverage is inadequate. |
| Cross-region equivalent inputs | Watch | Both equivalent high tracking fixtures must match exactly. |
| Lambda/browser-extension equivalent inputs | Clear | Both equivalent medium-contradiction fixtures must match exactly. |

## Acceptance evidence

- Deterministic invariants and exact report-row projection tests pass.
- Candidate-v3 has no deterministic high-severity/Clear contradiction and matches all
  twelve encoded expected bands. Any future mismatch becomes a benchmark acceptance
  blocker; changing only a label cannot make an unsupported model cutover-eligible.
- Retained replay has no projection failures or unexplained contradictions.
- Owned canaries cover the required behavioral lanes.
- At least 10 public targets are selected by the canonical cooldown-aware selector; no target is hand-picked and no cooldown is bypassed.
- Equivalent source/region score variance is within Luna's labeled tolerance.
- Formal cross-source evidence must preserve geography. Matching browser-extension and Lambda scores are useful parity evidence, but an extension scan with unknown geography cannot be relabeled as a Lambda region or counted as a same-region equivalence sample.
- Withholding, score drift, band distribution, and contradiction rates are reviewed.
- Web report, dashboard, Pulse, exports, and admin agree on kind, version, value, posture, and both named coverage measurements.
- Public methodology describes observed risk and evidence coverage without implying certification or a legal conclusion.
- The machine-readable packet passes `pnpm score:luna-cutover-gate`.

Generate the bounded deterministic lane artifact with:

```bash
node --import tsx apps/web/scripts/run-canonical-shadow-score-benchmark.ts
```

The artifact always withholds an overall score because accessibility, transport/security,
and consumer protection do not yet have approved contributions to a cross-domain model.

## Cutover and rollback

Cutover is a separate production change after approval. It must preserve the existing
versioned historical records and dual-read comparison, monitor contradiction and
withholding rates, and have a tested rollback to the prior customer score version.
Any post-cutover source/region drift, surface disagreement, unexpected band shift,
or evidence-coverage regression pauses rollout and restores the prior version while
retaining the comparison artifacts for review.

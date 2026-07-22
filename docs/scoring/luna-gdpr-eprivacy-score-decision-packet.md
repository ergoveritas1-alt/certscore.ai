# Luna GDPR/ePrivacy score decision packet

## Objective

Approve or reject a versioned GDPR/ePrivacy posture model that is evidence-grounded,
coverage-aware, stable across equivalent sources and regions, and consistent across
all customer surfaces. This is not approval of an overall CertScore and does not
authorize legal-compliance claims.

## Current recommendation

- Keep candidate-v2 internal and `pending_luna`.
- Use **report usable evidence** as the customer-facing coverage meaning because it
  matches the exact GDPR/ePrivacy rows customers see.
- Keep **model eligibility coverage** as an internal weighted input used to withhold
  a score when model inputs are not sufficiently testable.
- Treat divergence between those metrics as a visible contradiction, never as a
  reason to silently relabel one as the other.

## Luna decisions

1. **Coverage semantics:** select one customer-facing metric and attach the decision evidence.
2. **Benchmark corpus:** approve the retained replay, owned canaries, and the canonical selector's governed public sample. The central contact-history export and selector artifacts are mandatory; live selection fails closed when unavailable or ineligible.
3. **Expected bands:** label all eight required lanes: low signal, strong consent controls, pre-consent tracking/storage, policy gaps, session replay/fingerprinting, sensitive contexts, access-limited/no-go, and source/region equivalence.
4. **Model parameters:** approve or revise family boundaries, weights, severity points, family maximums, critical caps, score-withholding thresholds, posture bands, and contradiction thresholds.
5. **Final sign-off:** identify the approver, timestamp the decision, and attach the final evidence artifact for the exact model version.

## Acceptance evidence

- Deterministic invariants and exact report-row projection tests pass.
- Retained replay has no projection failures or unexplained contradictions.
- Owned canaries cover the required behavioral lanes.
- At least 10 public targets are selected by the canonical cooldown-aware selector; no target is hand-picked and no cooldown is bypassed.
- Equivalent source/region score variance is within Luna's labeled tolerance.
- Withholding, score drift, band distribution, and contradiction rates are reviewed.
- Web report, dashboard, Pulse, exports, and admin agree on kind, version, value, posture, and both named coverage measurements.
- Public methodology describes observed risk and evidence coverage without implying certification or a legal conclusion.
- The machine-readable packet passes `pnpm score:luna-cutover-gate`.

## Cutover and rollback

Cutover is a separate production change after approval. It must preserve the existing
versioned historical records and dual-read comparison, monitor contradiction and
withholding rates, and have a tested rollback to the prior customer score version.
Any post-cutover source/region drift, surface disagreement, unexpected band shift,
or evidence-coverage regression pauses rollout and restores the prior version while
retaining the comparison artifacts for review.

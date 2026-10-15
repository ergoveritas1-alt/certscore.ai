# Visual evidence regression repair

Local follow-up to `google-consent-mode-local-review-2026-10-14.md`. No push, deployment, new public scan, AWS write, historical reassessment, or report update. Incremental infrastructure/model cost: $0.

## Cause

The failing assertion in `apps/web/server/scans/local-v2-dag-report.test.ts` expected every verified visual styling difference to produce a normalized concern with `promotionEligibility: eligible`. Its fixture has equally sized Accept and Reject controls and a filled Accept button.

The owner-approved `consent_prominence_materiality.v1` policy, documented in `docs/certscore-v2/consent-prominence-materiality-policy.md` and implemented in commit `102e4756`, intentionally keeps that evidence informational and `internal_only`. Promoting a concern requires the retained styling difference and the policy's geometry corroborator. Image and geometry provenance were already passing; the failure was at the outdated promotion assertion.

## Change

Only the test is changed. Production observation, manifest verification, assessment, concern policy, scoring, persistence and presentation are unchanged.

The materialization regression now tests three deterministic synthetic layouts:

| Layout | Expected normalized result |
| --- | --- |
| Styling difference, equal button sizes | Informational, internal only, no checklist concern |
| Styling plus material geometry disadvantage | Eligible review concern |
| Equal styling | Informational comparison, no prominence concern |

Every layout is tested with both the correct image hash and a mismatched hash. Invalid image provenance removes all visual concerns, including informational ones, while preserving the observed structured Reject control. All cases assert no new visual score effect.

## Validation

- 165 tests pass across the complete report-materialization suite, visual provenance, prominence materiality and scanner visual-comparison tests.
- Web typecheck and `git diff --check` pass.
- Retained OpenAI report replay preserves score 75, findings and score explanation.
- No runtime files or historical report artifacts are changed.

Logs are retained locally at `/Users/benmasek/WC01/outputs/visual-evidence-test-fix-2026-10-14/`.

## Mistral scoring assessment

The retained original report is still 62. Its 38 deducted points comprise:

| Category | Deduction |
| --- | ---: |
| Decline / Reject path | 12 |
| Pre-consent storage | 8 |
| Pre-consent tracking | 8 |
| Accessibility | 10 |

Disclosure alone does not establish consent, necessity or compliance and should not earn automatic score credit. However, the independent EU-Ireland capture provides reasons to reassess the privacy evidence: GA4 was named with its switch initially off, a request declared storage consent denied, no Analytics cookies were observed during that capture, and the panel offered Close, Accept all and Next. The Close action was not tested, so it does not yet prove a working refusal path. Consent-preference storage also requires purpose classification rather than automatic treatment as optional tracking.

Recommendation: review the general evidence eligibility for these privacy deductions, using verified new evidence and the canonical pipeline. Do not hand-adjust Mistral, automatically exempt all consent-mode requests, infer legal compliance, remove accessibility deductions without evidence, or overwrite the historical 62. There is not yet a defensible revised score from this capture alone. Any future scoring change should be versioned and evaluated across sites rather than introduced as a Mistral exception.

Google documents that advanced consent mode can send measurements while storage consent is denied: [Google consent-mode concepts](https://developers.google.com/tag-platform/security/concepts/consent-mode). This explains a technical behavior and is not a legal determination.

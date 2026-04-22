# Financial Claims Corpus Growth And Curation

This document turns the financial-claims corpus into an explicit operating loop instead of an ad hoc append-only dataset.

The corpus already powers live `financial_review.*` findings. The goal now is to grow it without overfitting to obvious positives or regressing precision on finance-adjacent marketing copy.

## Current Baseline

Generate the live snapshot from the checked-in corpus:

```bash
pnpm --filter @website-signal-risk-scanner/validation-shared report:financial-claims-coverage
```

As of the current merged baseline, the seed corpus has 42 examples and is skewed toward:

- `positive_high_confidence`
- `financial_offer` and `homepage` contexts
- eval rows rather than train rows

The same coverage report also prints the current underrepresented page-type and finding-family cells.

## Coverage Matrix

Treat corpus growth as coverage across these axes:

- claim family: earnings, guaranteed outcomes, simulated performance, pricing opacity, urgency, superlatives
- page type: `homepage`, `marketing_page`, `pricing_page`, `lead_generation_offer`, `financial_offer`
- source style: broker, crypto/trading educator, signal seller, copy-trading, finance-adjacent non-financial negative control
- disclosure posture: clear disclosure, unclear disclosure, missing disclosure, contradictory disclosure
- review difficulty: obvious, borderline, adversarial

Minimum target:

- 8 to 12 strong examples per important positive cell
- at least 5 borderline examples per finding family over time
- at least 5 non-financial negative controls that contain finance-adjacent language

Do not optimize for total row count. Optimize for representative variety and negative-control quality.

## Intake Lanes

Use three lanes to keep corpus growth balanced:

1. high-confidence live positives
2. hard negatives
3. borderline or adversarial cases

If a batch only adds obvious positives, it is incomplete.

## Weekly Workflow

1. Extract recent candidate drafts from live findings.

```bash
pnpm --filter @website-signal-risk-scanner/validation-worker extract:financial-claims-drafts -- --help
```

2. Review a small batch and classify each candidate:

- approved
- rejected
- needs-context
- duplicate-pattern

3. Promote only reviewed examples through the promotion tool.

```bash
pnpm --filter @website-signal-risk-scanner/validation-shared promote:financial-claims -- --file <review-file>
```

4. Re-run corpus and pipeline validation before merge.

```bash
node --enable-source-maps --import tsx --test ./packages/validation-shared/src/financial-commercial-claims-draft.test.ts
node --enable-source-maps --import tsx --test ./packages/validation-shared/src/financial-commercial-claims-promote.test.ts
node --enable-source-maps --import tsx --test ./apps/validation-worker/src/validation/pipeline.test.ts
pnpm --filter @website-signal-risk-scanner/validation-shared report:financial-claims-coverage
```

## Review Rubric

Approve an example only when all of these are true:

- the page is commercially offering or promoting a financial or investment-related service
- the extracted snippet contains the operative claim, not surrounding noise alone
- the expected finding behavior is correct under the current deterministic logic
- the example adds a new phrase pattern, page context, or edge case

Reject or defer examples when:

- they are duplicates of an existing pattern
- they depend on too much missing context
- they are better expressed as negative controls
- the page is finance-adjacent but not actually a financial offer

## Negative Control Policy

Every positive batch should be paired with negative-control work. Prioritize:

- SaaS pages using words like `profit`, `performance`, or `growth`
- ecommerce urgency or superlative copy without financial offer context
- legal or FAQ pages that mention returns, fees, or APR with clear disclosure
- educational pages that discuss trading without selling a commercial offer on that page

If negative-control growth stalls, precision will drift even if corpus recall improves.

## Operational Scripts

- coverage report: `pnpm --filter @website-signal-risk-scanner/validation-shared report:financial-claims-coverage`
- draft formatter: `pnpm --filter @website-signal-risk-scanner/validation-shared draft:financial-claims-example`
- promotion tool: `pnpm --filter @website-signal-risk-scanner/validation-shared promote:financial-claims`
- live candidate extraction: `pnpm --filter @website-signal-risk-scanner/validation-worker extract:financial-claims-drafts`
- degraded scan retry list: `pnpm --filter @website-signal-risk-scanner/validation-worker list:degraded-body-retries`

## Success Criteria

The corpus program is healthy when all of these remain true:

- new `financial_review.*` examples are added from real scans every week or two
- the coverage report shows fewer empty page-type cells for core finding families
- negative_nonfinancial and positive_borderline counts keep growing, not just obvious positives
- corpus eval remains aligned with deterministic logic
- new promotions do not introduce recurring false positives in live validation

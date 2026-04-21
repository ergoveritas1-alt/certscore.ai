# Financial Claims Calibration Plan

This lane should be tuned as a `candidate selection -> nano extraction -> rule emission` system.
The model is used for narrow extraction and context gating. Product-facing findings remain deterministic.

## Calibration order

1. Candidate recall
2. Nano extraction precision
3. Finding-emission thresholds
4. Card surfacing behavior

If candidate blocks do not include the relevant homepage language, prompt tuning will not recover the miss.

## Dataset buckets

Use the shared dataset contract in [packages/validation-shared/src/financial-commercial-claims.dataset.ts](/Users/benmasek/WC01/packages/validation-shared/src/financial-commercial-claims.dataset.ts).

- `positive_high_confidence`: obvious earnings, returns, guarantee, simulated-performance, or urgency-to-convert language
- `positive_borderline`: plausible low-severity or threshold-sensitive cases
- `negative_financial`: legitimate financial pages with balancing disclosure or ordinary factual copy
- `negative_nonfinancial`: non-financial pages that contain percentages, urgency, or pricing language
- `adversarial_negative`: finance-adjacent or regulator-adjacent language that should *not* emit a v1 finding

## Labeling rules

Each example should contain:

- block-level expected nano output
- page-level expected finding ids
- page-level expected card mode: `findings`, `not_applicable`, or `omit`

Use regulator warning lists only as `target selection` provenance. They are not product evidence and should not be fed into product-facing snippets.

## What to tune

Candidate selection:

- increase recall on financial landing-page copy
- keep block windows small enough for accurate nearby-disclosure judgments

Nano prompt/schema:

- require exact claim snippets
- require exact disclosure snippets when present
- suppress non-commercial and non-financial contexts aggressively

Deterministic emission:

- calibrate thresholds per finding id
- add explicit suppression for educational/editorial and other adversarial-negative patterns
- keep adjacency/disclosure logic deterministic and testable

## Success metrics

Track these separately:

- candidate recall on the corpus
- classification agreement on block-level labels
- finding precision by finding id
- finding recall by finding id
- false-positive rate on legitimate finance pages
- false-positive rate on non-financial pages
- evidence quality pass rate
- card surfacing agreement rate

## Minimum reviewer standard

Every surfaced finding should satisfy this standard:

- observable on the page itself
- supported by exact claim text
- phrased as claim or disclosure risk, not legal wrongdoing
- specific enough that a human reviewer would accept the evidence without reading regulator context

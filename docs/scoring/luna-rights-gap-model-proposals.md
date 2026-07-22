# Luna decision: high-severity rights-gap treatment

## Decision required

Candidate-v2 produces `75 / Clear / Monitor` for a supported high-severity rights-gap
finding. The deterministic gate treats that as a contradiction. This packet offers
three bounded pending-Luna alternatives; none is approved or customer-facing.

| Proposal | Parameter change | Observed risk | Posture score | Band/action | Tradeoff |
| --- | --- | ---: | ---: | --- | --- |
| `rights-family-maximum-30` | Rights-family maximum 25 → 30 | 30 | 70 | Watch / Review | Recommended starting point. A high-severity rights gap contributes the full shared high-severity value without a special cap. |
| `high-rights-gap-cap-54` | Add high-severity rights cap at 54 | 25 | 54 | Watch / Review | Keeps current family contribution but creates a stronger discontinuous cap for high-severity cases. |
| `high-rights-gap-cap-49` | Add high-severity rights cap at 49 | 25 | 49 | Action Needed / Act | Strongest treatment; aligns with current contradiction and sensitive-data cap boundary. Requires explicit Luna evidence that high rights gaps belong below the action threshold. |

## Evidence

- All three models are registry-complete, remain `pending_luna`, preserve explicit
  weights, and pass all twelve deterministic benchmark lanes without candidate
  contradictions.
- Cross-region and Lambda/browser-extension deterministic equivalence remain exact.
- The 11-bundle retained replay is numerically unchanged for all three proposals:
  7 scored, 4 withheld, median absolute legacy delta 14, p95 28, and no projection
  failures. This is expected because the retained corpus contains no surfaced
  `rights_gap` family finding.
- All retained rows still record the separate legacy/report coverage-semantics
  contradiction. A rights-gap model choice does not resolve that independent gate.
- The governed public selector currently has 0/10 eligible targets, so no live public
  evidence has been substituted for the missing labeled rights-gap case.

## Recommendation

Use `rights-family-maximum-30` as the next calibration hypothesis because it removes
the truncation that caused a high-severity finding to land exactly on the Clear
threshold and preserves one shared severity-to-risk mapping. Do not approve it from
this deterministic result alone. Luna should label the policy-gap lane, add or approve
a retained/owned rights-gap case, and compare the resulting band with the stronger cap
alternatives before selecting a model version.

Generate the machine-readable proposal comparison with:

```bash
node --import tsx apps/web/scripts/run-canonical-shadow-score-model-proposals.ts
```

Replay an individual proposal with:

```bash
pnpm score:shadow:retained-cohort \
  --model-proposal rights-family-maximum-30 \
  --out artifacts/scoring/retained-rights-family-maximum-30.json
```

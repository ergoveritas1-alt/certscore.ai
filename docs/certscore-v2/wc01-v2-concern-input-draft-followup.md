# WC01 v2 Concern Input Draft Follow-up

Dry run only. Not production concern policy input. Not persisted normalized concerns. Not customer-facing report output.

## Scope

This pass adds an internal draft projection from saved `Wc01V2AllowlistDryRun.json` artifacts into `Wc01V2ConcernPolicyInputDraft.json` artifacts. The stage reads only allowlist dry-run output and keeps every row review-only and production-ineligible.

No production report cards, checklist builders, executive summary, top findings, scoring, regulatory lenses, normalized concerns, or unified findings are wired to this output.

## Commands Run

```bash
pnpm v2:wc01-concern-input-dry-run --help

pnpm v2:wc01-concern-input-dry-run \
  --allowlist-dir ./artifacts/v2-wc01-allowlist-dry-run-expanded-fresh-registry-tightened \
  --out-dir ./artifacts/v2-wc01-concern-input-dry-run-expanded-fresh-registry

pnpm v2:wc01-concern-input-dry-run \
  --allowlist-dir ./artifacts/v2-wc01-allowlist-dry-run-stress-fresh-registry-tightened \
  --out-dir ./artifacts/v2-wc01-concern-input-dry-run-stress-fresh-registry

pnpm v2:wc01-concern-input-dry-run \
  --allowlist-dir ./artifacts/v2-wc01-allowlist-dry-run-edge-consent-tightened-tierc \
  --out-dir ./artifacts/v2-wc01-concern-input-dry-run-edge-consent
```

## Cohort Counts

| Cohort | Allowlist files | Succeeded | Failed | Allowlist candidates | Concern input drafts | Blocked candidates | Guardrail failures | Malformed artifacts |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Expanded fresh registry | 10 | 10 | 0 | 11 | 11 | 0 | 0 | 0 |
| Stress fresh registry | 12 | 12 | 0 | 11 | 11 | 0 | 0 | 0 |
| Edge consent | 30 | 30 | 0 | 34 | 34 | 0 | 0 | 0 |
| Total | 52 | 52 | 0 | 56 | 56 | 0 | 0 | 0 |

## Concern Families

| Cohort | pre_consent_tracking | pre_consent_cookie_storage | session_replay_behavioral_analytics |
|---|---:|---:|---:|
| Expanded fresh registry | 6 | 4 | 1 |
| Stress fresh registry | 6 | 5 | 0 |
| Edge consent | 16 | 12 | 6 |
| Total | 28 | 21 | 7 |

## Suggested Draft Keys

| Draft concern key | Expanded | Stress | Edge | Total |
|---|---:|---:|---:|---:|
| `v2_draft.pre_consent_tracking.review_only` | 6 | 6 | 16 | 28 |
| `v2_draft.pre_consent_cookie_storage.review_only` | 4 | 5 | 12 | 21 |
| `v2_draft.session_replay_behavioral_analytics.review_only` | 1 | 0 | 6 | 7 |

## Vendor Purpose Counts

| Purpose | Expanded | Stress | Edge | Total |
|---|---:|---:|---:|---:|
| advertising | 58 | 76 | 99 | 233 |
| analytics | 9 | 16 | 28 | 53 |
| tag_management | 5 | 9 | 23 | 37 |
| session_replay | 2 | 0 | 13 | 15 |

`tag_management` remains diagnostic metadata only in this draft output. It does not create supporting concern inputs on its own.

## Guardrails

| Guardrail | Count |
|---|---:|
| Production-eligible outputs | 0 |
| Top-finding-eligible outputs | 0 |
| Gap-eligible outputs | 0 |
| Forbidden gap status token matches | 0 |
| Raw blocked field matches | 0 |
| Forbidden legal-style term matches | 0 |
| Malformed input artifacts | 0 |
| Batch failures | 0 |

The generated artifact directories were scanned for forbidden gap status tokens, raw blocked field names, and forbidden legal-style terms. No matches were found.

## Sites With Inputs

Expanded fresh registry: `bestbuy.com`, `cnn.com`, `consumerfinance.gov`, `hubspot.com`, `target.com`, `weather.com`.

Stress fresh registry: `airbnb.com`, `bankofamerica.com`, `booking.com`, `homedepot.com`, `nike.com`, `webmd.com`.

Edge consent: `booking.com`, `cloudflare.com`, `fullstory.com`, `geico.com`, `healthline.com`, `hotjar.com`, `macys.com`, `mozilla.org`, `notion.so`, `plannedparenthood.org`, `progressive.com`, `segment.com`, `spotify.com`, `unilever.com`, `usa.gov`, `walmart.com`.

## Sites With Zero Inputs

Expanded fresh registry: `chase.com`, `ikea.com`, `mayoclinic.org`, `salesforce.com`.

Stress fresh registry: `costco.com`, `expedia.com`, `lowes.com`, `reuters.com`, `sephora.com`, `statefarm.com`.

Edge consent: `bbc.com`, `etsy.com`, `fidelity.com`, `forbes.com`, `ftc.gov`, `linear.app`, `nih.gov`, `nytimes.com`, `openai.com`, `supabase.com`, `theguardian.com`, `vercel.com`, `washingtonpost.com`, `wayfair.com`.

## Recommendation

The draft shape is ready for policy-owner review as an internal-only input design. The next review should focus on whether the three draft concern families, suggested concern keys, regulatory lens candidate metadata, evidence families, and required review gates are the right shape for a future concern policy implementation.

Keep this stage dry-run-only until policy owners explicitly approve the concern-policy input contract and the production WC01 pipeline work is scoped separately.

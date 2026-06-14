# WC01 v2 Excerpt Retention Tuning Follow-Up

Internal diagnostic only. Not customer-facing report output.

## Executive Summary

Run 001 showed that grouped evidence preview was usable for queue triage and evidence-shape review, but high-volume packets still forced upstream inspection for exhaustive first-pass adjudication. The two repeated blockers were `weather.com` and `webmd.com`.

This pass tuned internal upstream display-safe excerpt retention and source-ref ID coherence. The high-volume blocker pattern improved materially:

- `weather.com` unresolved refs: 8,207 -> 0
- `webmd.com` unresolved refs: 5,555 -> 0
- Expanded cohort unresolved refs: 0
- Stress cohort unresolved refs: 0
- Policy-stress cohort unresolved refs: 0
- Edge cohort unresolved refs: 24, isolated to `fullstory.com` ambiguous display-safe excerpt lineage

No production report, checklist, executive, scoring, regulatory-lens, app UI, persistence, normalized concern persistence, or customer-facing output was added.

## Where The Mismatch Occurred

The mismatch was between retained display-safe excerpt objects and the IDs carried downstream:

1. `V2ReportProjectionDraft` retained only a very small display-safe excerpt object set per row.
2. The WC01 shadow path carried broad `evidenceExcerptIds` and `sourceEvidenceRefs` forward.
3. Reviewer packets and evidence previews therefore referenced many IDs whose bounded display-safe excerpt objects were not retained in the upstream artifacts.
4. Evidence preview correctly failed closed on those unbacked IDs, but high-volume rows produced large unresolved-ref lists.

The fix keeps bounded retention and fail-closed behavior, but improves coherence: IDs carried into WC01 shadow and downstream reviewer artifacts are now backed by retained display-safe excerpt objects and matching retained source refs.

## Retention Strategy

Representative display-safe excerpts are retained deterministically by safe grouping dimensions already present in display-safe evidence:

- evidence kind
- source scanner
- scenario
- consent state at time
- hostname
- normalized path
- vendor ref
- cookie-name bucket

WC01 shadow now carries retained excerpt IDs from the retained display-safe excerpt objects, and retained source-ref IDs only when the source ref event ID matches a retained display-safe excerpt event ID.

Evidence preview also uses the queue item `sourceFindingKey` as a lineage hint when resolving duplicated source refs across rows. This removes cross-row ambiguity while preserving fail-closed behavior for same-row ambiguous evidence.

## Cap Values

Current internal caps:

| Cap | Value |
|---|---:|
| Max retained display-safe excerpts per row | 72 |
| Max representative groups per row | 72 |
| Max retained excerpts per group | 2 |
| Max representative excerpts shown per preview group | 5 |
| Max representative source refs shown per preview group | 10 |

The goal remains representative retention, not retaining everything.

## Focus Sample Before/After

| Site | Cohort | Queue items | Resolved excerpts before | Resolved excerpts after | Resolved source refs before | Resolved source refs after | Unresolved refs before | Unresolved refs after | Warning entries before | Warning entries after |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `weather.com` | expanded | 2 | 24 | 144 | 2,499 | 144 | 8,207 | 0 | 5 | 0 |
| `webmd.com` | stress | 2 | 19 | 144 | 1,612 | 144 | 5,555 | 0 | 5 | 2 |

Source for before values: `docs/certscore-v2/wc01-v2-internal-reviewer-run-001.md`.

The resolved source-ref count decreased because downstream source refs are now bounded to refs matching retained display-safe excerpts instead of carrying every broad row-level source ref.

## Regression Sample Results

| Site | Cohort | Queue items | Representative groups | Resolved excerpts | Resolved source refs | Unresolved refs | Warning entries | Notes |
|---|---|---:|---:|---:|---:|---:|---:|---|
| `hotjar.com` | policy-stress | 3 | 36 | 163 | 163 | 0 | 2 | Behavioral analytics reference remains reviewable. |
| `fullstory.com` | edge | 2 | 31 | 120 | 144 | 24 | 2 | Remaining unresolved refs are ambiguous display-safe excerpt lineage and stay fail-closed. |
| `greenhouse.com` | policy-stress | 2 | 43 | 144 | 144 | 0 | 2 | Employment / HR sensitive-context packet remains bounded. |
| `plannedparenthood.org` | policy-stress | 3 | 35 | 107 | 107 | 0 | 3 | Reproductive-health sensitive-context packet remains bounded. |
| `target.com` | expanded | 3 | 31 | 104 | 104 | 0 | 2 | Ecommerce standard-lane packet remains reviewable. |
| `cloudflare.com` | policy-stress | 2 | 28 | 86 | 86 | 0 | 0 | Compact standard-lane packet remains clean. |

## Cohort Preview Results

| Cohort | Sites succeeded | Queue items | Representative groups | Resolved excerpts | Resolved source refs | Unresolved refs | Warning entries | Guardrail failures |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| expanded-fresh-registry | 10/10 | 11 | 159 | 587 | 587 | 0 | 8 | 0 |
| stress-fresh-registry | 12/12 | 11 | 192 | 552 | 552 | 0 | 12 | 0 |
| edge-consent | 30/30 | 34 | 424 | 1,542 | 1,566 | 24 | 28 | 0 |
| policy-stress-consent | 20/20 | 25 | 274 | 1,059 | 1,059 | 0 | 16 | 0 |

Aggregate after tuning:

- Sites succeeded: 72/72
- Queue items: 81
- Representative groups: 1,049
- Resolved excerpts: 3,740
- Resolved source refs: 3,764
- Unresolved refs: 24
- Warning entries: 64
- Guardrail failures: 0

The previously reported grouped-preview aggregate was 32,614 unresolved refs and 188 warning entries. The remaining unresolved total is now 24, and all remaining unresolved refs are fail-closed.

## Guardrails

Guardrail scans found no forbidden status token, raw blocked field names, or prohibited legal-style wording in the regenerated preview artifacts or this follow-up doc.

The adapter tests also continue to cover:

- high-volume representative retention
- per-group and per-row caps
- deterministic retention order
- retained excerpt IDs resolving to bounded text
- unbacked IDs remaining fail-closed
- raw blocked fields not retained
- long opaque values staying redacted
- ambiguous same-row lineage staying fail-closed
- cross-row source-ref ambiguity resolved only when the queue item source finding key matches
- compact and sensitive-context packet regressions
- no production report/checklist/executive/scoring/regulatory/shared-scan-detail imports

## Run 002 Recommendation

Run 002 should be performed with the same internal reviewer workflow sample, keeping `weather.com` and `webmd.com` in the high-volume set.

Expected result: grouped preview should now support first-pass adjudication for those high-volume packets without upstream inspection. If reviewers still report blockers, the next refinement should focus on same-row duplicate excerpt lineage in the specific remaining packet shape, not broad retention increases.

## Explicit Non-Goals

- No app UI.
- No persistence.
- No production integration.
- No production concern policy calls.
- No persisted normalized concerns.
- No unified findings.
- No report/checklist/executive/top-finding/scoring/regulatory-lens output.
- No customer-facing output.
- No forbidden status mapping.

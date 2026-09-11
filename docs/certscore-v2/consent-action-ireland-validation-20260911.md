# Ireland paired action validation — September 11, 2026

**Later September 11 follow-up:** the bounded early-exit defect is fixed and fresh Ireland pairs passed all five targeted paths. See the [follow-up report](consent-action-followup-20260911.md) for the current release recommendation and limitations. The original pass below is preserved unchanged.

The two final semantic gaps are fixed, but this diagnostic pass does not establish a net click-completion improvement. Keep deployment on hold pending the unresolved Mackolik and Blick losses.

## Design and evidence gates

- Deployed baseline `6f704ff2d4f226165d130b40479d2f039fbb379d` versus the uncommitted semantic/action-binding changes, with per-run source hashes checked against each source.
- Nineteen completed localhost full six-lane scans across ten ledger-selected public domains. Both browser and HTTP/TLS egress verified as `63.33.9.201`, AWS `eu-west-1` (Ireland). ErgoVeritas excluded.
- Nine complete pairs. Freenet received a no-go signal on the first/current scan, so the second/baseline scan was skipped. No target retries.
- All 19 retained packet/projection checks passed; each had one canonical terminal result and a successful local API read. No post-action drops. Every completed unconfirmed click retained its full configured after-click window. Confirmed registration and ordinary after-click facts remain distinct.
- Deterministic validation: 60 focused tests, 12 real-Chromium action tests, and fast preflight with 2,080 test executions plus typechecks passed. Counts overlap. The two Next dev aliases were separately syntax/API checked.

## Comparable outcomes

| Measure | Baseline | Changed build |
| --- | ---: | ---: |
| Completed clicks across 18 scheduled A/R slots in nine matched domains | 14 | 13 |
| Verified registrations in those matched domains | 10 | 9 |
| Completed clicks among the 13 matched historical candidate paths | 12 | 10 |
| Scanner median across matched domains | 17.844 s | 17.977 s |
| Median local handoff (runner wall time minus scanner time) | 3.379 s | 3.469 s |

Scheduled slots include sides without a current actionable control; they are not a candidate-denominator success rate. The historical candidate set is fixed rather than deleting failures or counting newly recognized Reject candidates as recovered historical paths. All ten current scans complete 11 of the original 14 historical candidate paths; seven of eight historically verified paths still click. The unmatched Freenet result is excluded from the paired totals. This selected sample is too small and nonrepresentative to estimate production error rates or uplift.

| Domain | Baseline completed clicks | Changed build completed clicks |
| --- | --- | --- |
| blick.ch | Accept | None |
| francetvinfo.fr | Accept | Accept |
| freenet.de | Skipped after no-go | Accept |
| fyber.com | Accept, Reject | Accept, Reject |
| mackolik.com | Accept, Reject | None |
| mailerlite.com | Accept, Reject | Accept, Reject |
| n8n.io | Accept, Reject | Accept, Reject |
| pestpac.com | None | Accept, Reject |
| qobuz.com | Accept, Reject | Accept, Reject |
| tmdb.org | Accept, Reject | Accept, Reject |

PestPac is the demonstrated semantic recovery: two labels formerly competed as Accept; the corrected negative refusal yields one Accept and one Reject. Both actions complete their full capture with unconfirmed registration. The retained after-click request counts are 62 for Accept and 77 for Reject; these counts are observed requests, not an assertion that every request is tracking.

Mackolik loses both clicks. Accept discovers the Turkish candidate but fails label binding, then falls back to a named CMP control that fails the confidence check. Reject does not retain a canonical actionable candidate in its action session and the named CMP control is unclassified. Retained passive HTML excerpts show the same Turkish controls and exact label replay remains correct. Passive geometry cannot substitute for the missing failing action-session locator state. The baseline/current runs were separated by approximately eleven minutes because of local publication setup, adding a timing confound. A code regression or dynamic page cause is not established.

Blick loses Accept. Its current action session repeatedly sees no visible candidate until the existing budget ends; the baseline sees `Akzeptieren` later in discovery and confirms consent. The current failure is discovery/readiness, not a recorded semantic veto. Do not extend timeouts or loosen click authorization to remove this limitation.

The median paired scanner delta is +73 ms, ranging from −4.207 s to +1.340 s. These nine pairs do not establish production p95 or latency equivalence; failed paths may finish sooner. The first baseline report publication was delayed by local artifact-path setup. That operational delay is excluded from scanner timing and is not representative report-readiness latency.

## Implementation and operational notes

The classifier recognizes exact registered category qualifiers (for example, non-essential cookies) without treating them as decision negation. Separate opposed decisions within one label remain unknown. Necessary-only decisions and negatives outside registered spans retain conservative handling. Versioned canonical locale/label classification and last-mile proof share the policy. No added overall action deadline, invocation, retry, model call, or relaxed registration/evidence guard.

Local Next dev aliases for two GPC contract modules were added to allow the existing scan API to compile. The two checkouts share verified local artifact stores. Baseline local artifact-directory metadata was rebound to identical mirrored files, with truthful local metadata events where needed to invalidate stale materialization caches. No evidence bytes or conclusions were synthesized. The first baseline was verified from retained files without rescanning.

Logged validation model cost is approximately $0.03142; moderation is free. The one-time estimate including existing proxy/ledger diagnostics remains below $0.50. The implementation’s recurring planning estimate remains up to $2/month at 100,000 scans, within the prior $5/month approval; recovered clicks can consume more of existing capture windows. No new infrastructure.

All 19 actual contacts were persisted idempotently and verified by a fresh central export. The reviewed per-run repository ledger records nine cooldown entries and one blocked entry (Freenet); the canonical 51-target ledger is unchanged. The Ireland tunnel and its exact temporary SSH rule were removed and independently verified absent.

No production deployment occurred. Before release, reproduce the failing final locator/binding state for Mackolik and the delayed-control discovery for Blick in bounded local fixtures, with baseline/current comparison. Keep source changes reviewable and preserve the failed results. Do not claim that the historical completion projection was achieved.

Artifacts: `artifacts/action-path-review-20260911-14h/implementation/final-validation/`, including `release-evaluation.json`, `check-scan.ts`, per-scan retained verifications, egress proofs, source hashes, model cost summary, and contact accounting.

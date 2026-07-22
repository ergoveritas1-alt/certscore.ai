# Scoring redesign goal completion audit

Status: **incomplete; goal remains active**. Last audited 2026-07-22 against the
current repository and production revision `d2c002b4`.

This audit separates proved implementation from remaining cutover work. A green test
or deployed shadow endpoint is not evidence that the replacement has been approved or
made customer-facing.

| Goal requirement | Current evidence | Status |
| --- | --- | --- |
| Stop report/admin reads from overwriting scores | Score persistence occurs in completion lifecycle; repository and lifecycle tests enforce idempotency and the historical cutoff. Production canary repeat reads retained one immutable assessment. | Proved for current legacy evidence score |
| Separate score, coverage, source, version, time, and finding lineage | `scan_score_assessments` stores separate typed fields; report, Pulse, dashboard, and admin projections retain metadata. The forward projection now uses canonical presentation status `surface`; the former `surfaced` typo could omit finding IDs from already-immutable provenance rows, which remain unmodified. | Proved forward; historical rows preserved rather than rewritten |
| Preserve historical meaning | Pre-cutoff records remain `Legacy scan score`; version identity is immutable by scan/kind/version. | Proved |
| Precisely label current headline | Current headline is `GDPR/ePrivacy evidence`, not overall CertScore. | Proved in current surfaces |
| Remove AI domain-name expected overall score | Domain benchmark prompt explicitly forbids estimating CertScore/overall score; repository search finds no expected-overall-score comparison. | Proved |
| Consume only canonical WC01 projections | Shadow input accepts typed GDPR/ePrivacy checklist rows and surfaced/reportable unified findings from the concern/policy pipeline; raw and diagnostic fields are absent. | Proved |
| Explicit complete registries and no fallback weights | Checklist registry equality, model audit, unknown-row rejection, stale/missing-family tests, and required weight lookup are present. | Proved |
| Separate risk from coverage | Candidate emits observed risk independently and withholds posture for inadequate coverage; comparison schema v3 separately names model eligibility and report usable evidence. Luna selected exact report usable evidence as the customer-facing metric and retained model eligibility coverage as an internal withholding input. | Proved and Luna-selected |
| Monotonicity and family deduplication | Deterministic scorer tests cover finding addition, severity ordering configuration, and sibling deduplication. | Proved at scorer level |
| Critical caps prevent misleadingly strong core-gap scores | Consent/tracking, contradiction, and sensitive-data caps work. Luna selected candidate-v3's rights-family maximum of 30, moving the deterministic high-severity rights gap to `70 / Watch / Review`. The benchmark contradiction is resolved, but retained replay still lacks a rights-gap input and the model remains pending. | Deterministic contradiction resolved; live corpus validation pending |
| Align score bands, posture, action, and top findings | Score/posture/action share one band table. Customer top-finding alignment cannot be verified until replacement integration exists. | Partial |
| Versioned bounded shadow comparisons | Schema v3 artifacts are bounded, versioned, read-only, carry projection fingerprints, both coverage meanings, deltas, and contradictions. | Proved |
| Deterministic fixtures | Twelve required lanes are represented; structural, cross-region, and source-equivalence invariants run. Luna's expected bands are explicit and future mismatches are acceptance blockers. | Proved for deterministic candidate-v3 benchmark |
| Retained replay | 11/11 bundles projected; 7 scored, 4 withheld, 0 projection failures; all 11 exposed legacy/report coverage divergence. | Proved for current retained corpus, not Luna-approved corpus |
| Owned canaries | Production org and anonymous canaries verified legacy persistence and Pulse/report consistency; exact report coverage is 27/30 and 28/30. A post-lineage-fix owned canary (`52d2ca2e-5913-428a-8f5d-f162c68eca0d`) persisted score 94, an empty finding-ID set matching its zero promoted findings, and a stable projection fingerprint. No post-deploy production row with non-empty finding lineage existed at the audit time, so the non-empty live case remains unproved. | Empty-lineage case proved forward; non-empty live case pending |
| Governed rotating public sample | Central export refreshed successfully at `2026-07-22T07:44:51Z`; selector failed closed with 0/10 eligible targets (47 cooldown, 1 blocked, 2 do-not-calibrate). Earliest current cooldown expiry is `2026-07-24T01:51:27Z`. | **Incomplete** |
| Luna corpus, bands, weights, caps, thresholds, and sign-off | Luna selected candidate-v3 and labeled all twelve expected bands. Machine-readable gate still requires the governed corpus, parameter approval, and exact model-version sign-off. Packet remains `pending_luna`. | **Partial; corpus and final approval incomplete** |
| Accessibility, transport/security, and consumer protection | Deterministic cases prove these do not silently enter the GDPR/ePrivacy candidate and overall score remains withheld. They do not yet have approved domain-score contracts for an overall model. | Partial; overall appropriately withheld |
| Cross-region and Lambda/browser-extension equivalence | Deterministic reordered-input cases pass. Live repeated evidence across regions and equivalent capture sources is not yet accepted by Luna. | Partial |
| Registry, contradiction, historical, and Pulse/report regression gates | Focused tests and production canaries exist; contradiction monitoring is present in cohort summaries. | Partial; replacement surface tests remain impossible before integration |
| Public methodology | Existing methodology avoids certification claims, but replacement score/coverage methodology has not been published because model is unapproved. | **Incomplete** |
| Controlled rollout flag and rollback | No customer-facing replacement integration or controlled cutover flag exists yet. This is intentionally deferred until Luna approval but remains required. | **Incomplete** |
| Web, Pulse, dashboard, exports, and admin agreement | Current legacy evidence score agrees across verified web/Pulse/dashboard/admin paths. Replacement is internal only; export metadata and replacement equivalence are not yet production-verified. | **Incomplete** |
| Production monitoring | Cohort summaries calculate score drift, contradiction rate, region range, and withheld rate. Production alerting/rollout monitoring for the replacement is not deployed. | **Incomplete** |
| Final approved replacement deployed and verified | Candidate-v2 is shadow-only and cutover-ineligible. | **Incomplete** |

## Current hard gates

1. The canonical public selector produces at least 10 cooldown-eligible targets after a successful central-history export.
2. Validate candidate-v3's labeled bands against retained, owned-canary, governed-public, cross-region, and source-equivalence evidence.
3. Luna approves the benchmark corpus, parameters, and exact model version with attached evidence.
4. Add the controlled customer cutover, export consistency, public methodology, monitoring, and rollback path.
5. Pass `pnpm score:luna-cutover-gate`, deploy the exact approved version, and verify all production consumers before claiming completion.

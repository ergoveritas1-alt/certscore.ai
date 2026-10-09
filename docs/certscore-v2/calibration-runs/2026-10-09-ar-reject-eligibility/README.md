# Local Reject activation verification

The approved Reject eligibility changes now exercise the reviewed necessary-only controls on Adecco/Sodexo and exact Portuguese “Rejeitar” on Receitas Nestlé. This is a local diagnostic comparison, with no deployment.

| Site | Reject clicks before | Reject clicks after | Confirmed refusal after |
| --- | ---: | ---: | ---: |
| Adecco | 0/2 | 2/2 | 0/2 |
| Sodexo | 0/2 | 2/2 | 0/2 |
| Receitas Nestlé | 0/2 | 2/2 | 0/2 |
| Unleashed control | 2/2 | 2/2 | 2/2 |
| Total | 2/8 | 8/8 | 2/8 |

Accept stayed at 8/8 completed clicks and 2/8 confirmed registrations. All sixteen final visits completed; all sixteen passive visits observed Accept and Reject. This separates control observation, activation, and semantic registration. The six newly activated Reject sessions retained the existing bounded after-click capture and remained unknown/unverified for decision registration. All three affected sites logged incomplete OneTrust pre-click category coverage; no verified fresh refusal receipt was established. Missing category values were not guessed. These results measure selected-site activation improvement, not population reliability, absence precision, or production latency.

Two repeats per source/site used fresh independent consent-proof, Accept and Reject sessions, balanced ABBA/BAAB order, the same ConsentCheckBot HTTP identity/native Chromium navigator, local California egress, en-IE/Europe-Dublin settings, 13-second search and 30-second terminal action budgets. Accept retained its 3-second window and Reject its 8-second window. Baseline is the frozen previous working source, including earlier reliability fixes, not the last deployed revision. Candidate source bytes were frozen before contact and verified unchanged afterward. See `run-verified.mts`, `visit.mts`, `source-manifests-verified.json`, and `retained-visit-references.json`. Manifested files include one incidental .DS_Store; it has no runtime role and is excluded from the text patch.

The two earlier 16-visit trials are failed diagnostic iterations, excluded from final improvement counts. The first exposed necessary-only routing through a generic geometry recipe rather than the required named recipe. The second exposed real OneTrust buttons omitting HTML type, while the initial fixture used explicit type=button. The correction permits omitted type only on a native button outside enclosing/associated forms and without a form attribute. Explicit submit/reset controls remain blocked. Fixtures now reproduce the real markup. All 144 browser-session contacts across the three trials were persisted centrally under the idempotent run key ar-reject-eligibility-20261009. Four generated cooldown entries were reviewed and retained in this diagnostic inventory; unrelated inventory entries and unique work remain preserved.

Safety checks require the exact OneTrust registered control, one visible banner, visible instructions naming the exact necessary-only choice, unique actionability, consistent label sources, and exact-target authorization. The final dispatch guard rebuilds proof before the click. Drift causes no click, lifecycle dispatch event, after-action capture or semantic confirmation, even if a fresh consent cookie appears independently. Portuguese recognition remains exact and consent-context-bound. Generic necessary-only wording remains observation-only; existing confirmation and finding/scoring policies are unchanged.

The final 212 action regressions, 564 contract tests, scan-core/contracts typechecks, and calibration registry check passed. All 26 completed-click proofs in the final comparison pass the canonical schema; unconfirmed completed clicks retain bounded capture. `cycle-source.patch.json` records this cycle's local implementation/test delta. Earlier failed fixture/regression attempts were corrected before the final source freeze and live comparison; only the passing final logs count as local verification evidence. Local log hashes and summaries are retained in verification-log-references.json.

Owner-approved incremental cost remains capped at $110 per 100,000 affected scans. Bounded proof storage is estimated below $0.10/month at that affected volume, within the approval; one-time contact bookkeeping is estimated below $0.10. The selected prior sample's 3/11 affected sites is not a production incidence estimate. Semantic confirmation on the three affected sites remains unresolved. Owned canary/rotating release acceptance and production verification have not been performed for this cycle.

# CertScore.ai internal score and findings audit

Owner diagnostic only. Point calculations below are not added to customer reports, highlights, tooltips or exports.

## Score reconciliation

Report: `thisisvisceral.com`, scan `2e5f9f25-964e-4ce2-b52f-b90dd54f7f65`. The saved export, a fresh read of the live California report and a local canonical score replay all show **86/100**. The owner confirmed that 84 was a misreading. The actual total is **14**, not 16.

| Canonical score contribution | Points | Existing California highlight treatment |
| --- | ---: | --- |
| Non-discrimination wording not found in the inspected policy | 3 | Deliberately detailed-only when this is the sole missing rights topic; other rights needing interpretation are not turned into additional omissions. |
| Analytics collection under GPC, with sale/sharing purpose unresolved | 7 | Deliberately detailed-only as analytics-only potential collection risk. It does not establish sale/sharing or an ignored opt-out. |
| Semantic/ARIA accessibility finding | 4 | Erroneously excluded by a second, narrower top-finding rule list. Repaired locally as described below. |
| Total | 14 | Score remains 86. |

The persisted policy is `california-regulatory-posture.v21-combined-opt-out`. Its original input export SHA-256 remains `e1dcfabe3a5d9845f241bd79d800c72711ecbf570d59c7d7334ce15f90aa3b03`. The independent recomputation matches all three original effects. Highlight exclusion does not remove an approved canonical score effect.

## Other retained findings and exclusions

The canonical export contains eleven unified packets. Their treatment is:

| Packet or result | Reason it is not a California priority issue |
| --- | --- |
| Privacy-policy presence | Positive supporting context, not an independent ranked risk finding. |
| California rights-disclosure finding | The sole unlocated right is non-discrimination; existing editorial demotion `non_discrimination_only` preserves it in detail. |
| Post-Accept consent-dependent activity | Informational baseline, not an enforcement failure; low priority. |
| Accept more prominent than Reject | Persisted `audit_only`; no executive upgrade from visual imbalance alone. |
| Frictionless GPC exception | Contextual assessment, not a failed choice mechanism. |
| Bounded sale/sharing opt-out assessment | Retained inventory/assessment context; no qualifying failure is promoted by its presence. |
| Pre-consent tracking | Existing EU privacy-framework finding; not relabeled as a California failure. |
| Session replay signal | Existing EU privacy-framework finding; library/activity context does not establish a California sale/sharing failure. |
| California collection review | `analytics_only_collection` editorial demotion; the retained row is Google LLC analytics, request `net_1539`, first at +3,143 ms from GPC visit start, with a non-personalized-advertising declaration. Successful collection and sale/sharing purpose remain separate questions. |
| GPC response | Observed signal/comparison context; no qualifying choice-enforcement score effect supplies a California risk priority. |
| Semantic accessibility finding | Complete canonical evidence existed, but downstream rule-list drift excluded it. |

The canonical checklist also projects pre-consent storage and device-identification signals. Their EU-only selection remains unchanged. The raw accessibility audit contains `aria-hidden-focus` as well as `aria-prohibited-attr`; this repair does not invent a separate keyboard/focus finding from the raw audit or claim a reproduced keyboard trap.

## Recovered useful finding

`semantic_labeling_accessibility_issue` is already reportable, high severity, good confidence and direct. Its canonical `aria-prohibited-attr` evidence contains three concrete paragraph selectors, sanitized `<p class aria-label>` snippets and the failure summary that `aria-label` cannot be used on a `p` without a valid role. The first selector is `.has-large-3-font-size.split-heading.wp-block-paragraph:nth-child(2)`.

`accessibility-evidence.ts` already classifies this rule as semantic accessibility and accepts its promotion-grade evidence. `top-finding-eligibility.ts` separately recognized only a narrower list of name/label rules, so it falsely reported missing rule IDs, selectors, snippets and failure summaries even though those fields were present.

The local fix replaces that duplicate rule list with `getAccessibilityFindingIdForRuleCode`. The same concrete-node requirements, confidence/directness gates and canonical packet eligibility remain mandatory. Missing selectors, snippets or failure summaries, unknown rules, unrelated rule families, audit-only packets and low-confidence evidence still cannot become priorities. No new rule or finding identity, severity, evidence, scoring weight or deduction was created.

The retained replay now selects one existing accessibility group in California highlights (zero before). The source-bound neutral policy sentence yields to that substantive finding, using the established shared writer and the finding's existing remediation. Its exact output is saved in `score-findings-audit/highlights.json`. Scores, canonical packets, source bytes and Detailed evidence remain unchanged. Both regulatory views receive the same repaired accessibility selection.

## Validation and limitations

- 308/308 shared report-highlights tests passed, including the unchanged 80-case reviewed corpus.
- 48/48 focused eligibility/accessibility/scoring tests passed; these overlap the shared suite.
- 154/154 accessibility-evidence, executive projection, full-site score and release-gate tests passed; counts overlap other suites.
- Full web typecheck and `git diff --check` passed.
- The actual retained export replay verifies 86 before/after, matching deductions and one newly selected existing accessibility priority.
- Positive and negative tests cover recognized semantic rules, required node proof, unrelated/unknown rules, canonical priority projection and both regulatory views. Fast web and full preflight select the new regression files through the report test command.

Initial checks are preserved: one invocation used a JSX configuration that left React undefined in older component modules; the suite was rerun using the existing web test configuration. A new fixture's URL field was corrected to the contract's `documentUrl`. Two existing assertions expected the older generic accessibility lead/order rather than the current reviewed observation-first writer; they now assert the specific projected barriers, retained privacy lead and included consent finding. The fixture's original label/button/contrast rules have identical classification before and after this repair; the 80-case reviewed corpus was not rewritten.

Artifacts are under `artifacts/executive-california-review-2026-10-29/score-findings-audit/`. This is a local candidate and retained replay, not production verification. No new scan, deployment, flag change, production write, historical export rewrite, budget increase or recurring infrastructure cost increase occurred. The live report still uses the prior presentation. Recurring cost increment: $0/month.

## Follow-up: whether the ten-point highlight exclusions remain justified

Owner-requested retained-only audit, October 29. This section revises the editorial recommendation above; it does not change the implemented selector, canonical scoring, or historical report.

The two exclusions are deliberate editorial rules, not missing findings or insufficient proof for their existing qualified claims. `california-priority-selection.ts` removes analytics-only potential-risk rows and sole non-discrimination omissions before regulatory selection. `assessment-brief.ts` applies the same filter again. Consequently, these findings cannot appear even as secondary highlights or when there are otherwise no California privacy findings. Existing tests explicitly require this total omission while retaining the score effects; passing those tests establishes current behavior, not that the editorial policy remains appropriate.

Both saved packets are reportable and have presentation status `surface`. The collection packet has canonical surface tier `support`; the disclosure packet has tier `headline`, with rationale favoring context rather than a lead risk. Neither designation requires total exclusion from assessment highlights. The approved collection-review policy expressly supports a qualified finding from verified successful collection while purpose remains unresolved, and routes it into report priorities. The disclosure-scoring policy expressly preserves the smaller sole-omission effect without converting other rights under review into omissions. Neither scoring policy requires the corresponding blanket highlight ban.

**Recommendation:** replace these two blanket bans with lower-ranked, qualified summary eligibility in the shared editorial policy. Preserve the existing canonical findings, evidence, statuses, source binding, score versions and weights. Keep the concrete accessibility issue prominent; do not count every score effect as a separate urgent issue. A supported secondary observation may appear without becoming a confirmed enforcement failure. A finite summary can still omit lower-ranked items for space, but the two finding classes should not be categorically ineligible.

| Finding | Recommendation | Required scope |
| --- | --- | --- |
| Analytics collection under GPC | Include as qualified supporting evidence. Analytics-only purpose is a reason to avoid a sale/sharing or ignored-GPC claim, not a reason to hide positively verified collection. | Preserve Google LLC, the retained request, +3,143 ms timing, the non-personalized-ads declaration and unresolved sale/sharing purpose. Do not claim an opt-out failure or legal violation. |
| Sole non-discrimination disclosure omission | Keep below concrete runtime/accessibility issues, but permit a concise secondary disclosure result. | State only that wording was not found in the inspected policy scope, assessed assuming CCPA/CPRA applies. Do not claim actual discrimination, refused requests, or additional rights omissions. |

Illustrative secondary wording, proposed rather than rendered product output:

> Google LLC received one analytics request 3.1 seconds into the Global Privacy Control visit; non-personalized ads were declared. The request's sale/sharing purpose remains unresolved.

> Non-discrimination wording was not found in the inspected policy and material linked supplements. This is a scoped disclosure finding, assessed assuming CCPA/CPRA applies.

These statements summarize existing canonical findings, not unresolved coverage statuses. Any action must come from the applicable finding's supported question or correction; no generic disclosure, collection-notice or repeat-scan task should be generated from an unknown status. Scores must not drive summary eligibility or appear as deduction explanations in customer copy. Retain agent-registration detail treatment, uncorroborated choice-absence demotion, exact-source duplicate grouping, EU/California framework boundaries and audit-only evidence gates.

Fresh validation: 46/46 focused disclosure, collection-risk, scoring and priority-selection tests passed. `artifacts/executive-california-review-2026-10-29/highlight-exclusions-audit/replay.ts` independently verifies the unchanged export hash, both reportable packets, their exact editorial exclusions, the 3+7 effects and the unchanged 86 score with identical saved deductions. This audit changes no product behavior and claims no implementation or production improvement. No scan, deployment, flag change, historical rewrite or recurring cost increase; $0/month increment.

## Subsequent owner decision

The owner authorized the shared supporting selection, then explicitly removed the analytics-only top-issue exclusion and requested that sole non-discrimination disclosure omissions and authorized-agent registration findings be skipped in highlights. The current candidate includes the qualified GPC collection review in California's top list and preserves both disclosure exclusions. All original effects still reproduce 86/100. The current [implementation, replay and remaining ranking audit](qualified-collection-priority-2026-10-29.md) supersedes the earlier editorial recommendations, without rewriting the retained export or earlier artifacts.

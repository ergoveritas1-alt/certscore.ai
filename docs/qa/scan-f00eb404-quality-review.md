# Scan quality review: f00eb404-ba47-40be-830e-21c1f0ca4154

Reviewed September 11, 2026 (local time). Target: https://ergoveritas.com/.

Verdict: useful detection, but not ready for unqualified report sign-off. The report captures the main observed runtime risks, while homepage projection inconsistencies and comparison limitations need attention.

This review compares the rendered local report with its persisted canonical checklist, consent assessment, full-site projection, retained evidence references, and crawl configuration. It does not rerun the target or establish exhaustive recall against independent ground truth.

## What checks out

- Scope: maxPages=1, stop reason=max_pages_homepage_only, one completed page. Missing additional-page forms and embeds are not demonstrated misses in this run.
- Score: 62 = 100 - 12 refusal-availability review - 8 pre-consent storage - 12 pre-consent tracking review - 6 session replay. No post-Reject or GPC deduction appears in the canonical checklist effects.
- Arithmetic: storage 8 = 7 cookies + 1 browser-storage item; requests 20 = 8 non-essential + 12 review; embeds 1 = 1 contextual. Total distinct resources 29 = 20 + 7 + 1 + 1. Evidence mix 29 = 8 non-essential + 20 review + 1 contextual. Relationship mix 29 = 18 first-party + 11 third-party.
- Relevant findings: pre-consent storage, Clarity/Google Analytics tracking evidence, refusal availability, and Clarity session replay are represented. Storage evidence references explicitly identify CLID, MUID, and SM as non-essential.
- GPC: main-document header and navigator signal delivery are verified. Comparison is explicitly indeterminate, with baseline_settle_not_completed; the report does not claim GPC honoring or suppression.
- Policy: privacy surface and evidence for purposes and recipients are retained. Eight other disclosure topics remain not confirmed, with no asserted absence.

## Issues requiring correction

### High: homepage storage classification does not reconcile

The overview says zero non-essential and eight review items. The canonical storage finding is gap_observed and cites CLID, MUID, and SM as non-essential. The full-site score projection has an empty assessedStorageRecords array and assessedNonEssentialStorage=null despite that finding. The prior additional-page identity correction did not cover this homepage projection shape. An empty record array also suppresses the unmatched diagnostic, hiding the discrepancy. Reconcile the homepage's canonical retained item-level classification and scope through the same contract used by the inventory; do not hardcode a count from prose.

### High: passive Reject inventory and action coverage are conflated

Persisted ConsentControlAssessment 2.1 is complete and records Accept, Reject, and Options as not_observed. The rendered snapshot and consent evidence instead show Reject=Unknown. Post-Reject retained fields simultaneously include not_applicable_no_reject_control and reject_path_incomplete_at_passive_barrier with a reason that control absence was not established in that independent action session. Preserve passive control presence separately from the action session's outcome. No additional deduction is warranted solely by incomplete action evidence.

### Medium: tracking prominence exceeds the selected evidence status

The canonical tracking row is review_signal, selected evidence strength is limited, and trackingEvidenceAssessment says not_confirmed_from_grouped_inventory. Its top issue is presented as POTENTIAL GAP alongside strong storage evidence. Keep a clearly review-level description unless the retained request-sequence contract supports promotion. The 12-point review effect already exists in the scoring policy; this observation is about faithful presentation and confidence, not a proposal to change scoring.

### Medium: comparison and policy coverage constrain the conclusion

GPC observation completes, but comparative behavior cannot be determined because baseline settling did not finish. Post-choice behavior is not established. Eight of eleven policy checks are not confirmed, so a score of 62 is not evidence that all remaining disclosure topics passed. These limitations should remain visible in the report's confidence/coverage presentation.

### Low: wording

Both sitewide detailed cards say "1 assessed pages". For this deliberately single-page scan, "Top issues across your site" can also suggest broader coverage than occurred; the one-page scope should be unmistakable.

## Recommended order

1. Extend item-level reconciliation to the canonical homepage storage projection.
2. Reconcile Reject control state without using action-session failure to overwrite passive inventory.
3. Align top-finding labels with canonical review versus observed-gap status.
4. Investigate the baseline settle limitation and summarize comparison/policy coverage without treating unknowns as passes.
5. Correct singular-page language.

No scan, score, or production code was changed during this assessment.

## Corrections verified

The owner authorized implementation after this review. The homepage's canonical storage assessment now takes precedence over the legacy executive summary when constructing its checklist row. Item identities are preserved from verified browser snapshots through runtime normalization, concern policy, persisted checklist, and inventory reconciliation. The current local report was rematerialized from its retained bundle through the standard persistence function; no new scan was run.

- Storage: 5 non-essential + 3 review = 8; all five classified identities reconcile.
- Score: 52 = 100 - 12 refusal availability - 18 storage - 12 tracking review - 6 replay. Storage alone changed from 8 to 18 because the existing policy now receives the canonical item-level assessment. The other deductions are unchanged.
- Passive Accept/Reject/Options: all not observed, from the persisted typed assessment. The separately incomplete Reject action remains limited and neutral rather than being relabeled inapplicable.
- Tracking priority: Partial concern, matching review-level evidence.
- Scope language: Top issues on this page; 1 assessed page.
- Overview explicitly separates verified GPC signal delivery from the incomplete comparison, and names unestablished post-Reject behavior and the eight unconfirmed policy checks. Copy no longer implies a consent surface was observed when no such event exists.
- Browser checks and TypeScript pass; 292 focused regression tests pass.

GPC delivery remains verified, while its paired comparison retains baseline_settle_not_completed and a 1,331 ms compared interval. The evidence card now states "Signal verified · Comparison incomplete" and explains the baseline quiet-window limit without exposing the internal reason code. Missing settling evidence cannot be retroactively created. No capture budget, invocation count, wait, or model call was increased. Unknown policy topics were not converted to successes or absence findings.

Incremental identity/projection metadata storage is estimated below $1/month at 100,000 scans/month; no new infrastructure or paid-service calls were added. No deployment was performed.

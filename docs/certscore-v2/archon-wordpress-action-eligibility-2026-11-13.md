# CertScore.ai Archon and WordPress action eligibility

November 13, 2026. Retained investigation and localhost verification only. Existing budgets and prior workspace work preserved. No deployment, production query, target visit or new public scan occurred; SITS and ergoveritas were not visited.

## What prevents completion

Archon scan `3c8a8de3-0c6e-4cd3-9123-36438b43d341` captured a notice stating that analytics and ad-measurement tags are used, with **Privacy choices** (`#aphnb-pc`, `do_not_sell_share`, link to the same document) and **Dismiss** (`#aphnb-x`, button, `other`/dismiss). The retained screenshot independently shows those controls. There is no retained first-layer Accept or Reject control. The inspection is partial, with `unresolved_visible_consent_decision`; its existing action-routing policy permits only work up to required passive finalization. Both independent workers had no verified terminal action packet by that boundary. Accept's last checkpoint is resolver work, not a click.

WordPress scan `fa9383b2-0511-4dfd-aa84-074097afc83f` retains `complete_empty` first-layer inventory, completed DOM/accessibility/geometry channels, no observed consent surface or CMP runtime, and no Accept/Reject controls. Its ordinary Privacy link is not a consent action. Both independent action workers remained unfinished when required passive finalization ended.

The prior shared-finalization fix remains valid: it retains a verified action reply that returns during required coordinator work. Neither of these runs supplied such a reply. Additional waiting does not establish that a valid control exists. Clicking Privacy choices, opening settings, treating dismissal as consent/refusal, or labeling a canceled independent test successful would change action scope or evidence meaning, not repair a demonstrated resolver defect.

These statements are limited to the retained visits. The aborted action sessions did not retain complete HTML or every resolver snapshot, so the evidence cannot prove their contents at every instant or rule out a later/region-specific control. No claim is made that either site never offers privacy choices.

## Regression verification

`packages/certscore-contracts/fixtures/retained-no-first-layer-actions-20261113.json` preserves exact original consent observations, inspection records, scan IDs, source paths and SHA-256 values. The compressed Archon source's decoded hash/size and both scan IDs were checked before extraction.

`apps/v2-dag-lambda/src/absent-first-layer-retained.test.ts` replays the canonical availability helper against both retained inputs: neither action is observed; Archon remains partial/passive-barrier-only; WordPress remains complete-empty. No original observation is mutated.

`packages/certscore-scan-core/src/absent-first-layer-actions.test.ts` runs both real action observers against temporary localhost HTTP fixtures with all external requests blocked. These are minimal semantic reconstructions from retained labels and context, not copies of missing source HTML:

- Original controls: both actions leave Privacy choices, Dismiss and ordinary Privacy links untouched, return not-attempted, and perform zero clicks.
- A separate positive fixture inserts a genuine Accept/Reject button after 500 ms within the bounded search. Both actions dispatch exactly one click; the original non-action controls remain untouched.
- The explicit local Accept recipe confirms its known storage value. Generic Reject completes its click/capture but remains semantically unconfirmed because the arbitrary local storage value is not a registered complete consent receipt. Initial fixture assertions incorrectly expected generic confirmation and a shared capture field; those assertions were corrected to the actual contracts, without weakening scanner behavior.

Final results: **8/8 localhost observer cases**, **2/2 retained routing cases**, and core/Lambda TypeScript checks pass. The cases are included in the retained-action reliability and predeploy action-semantics gates. Fixture search/observation limits are smaller than production limits; no production budget/configuration changes were made.

## Outcome

No new scanner runtime defect was reproduced. Runtime eligibility, resolver, cutoff and confirmation behavior remain unchanged. New regression tests protect against falsely treating navigation/dismissal as consent actions while ensuring real late-arriving controls remain actionable. No new recurring infrastructure cost is introduced.

Evidence and logs: `artifacts/archon-wordpress-action-eligibility-20261113/`. The manifest binds test sources, portable retained fixtures and verification logs. Historical scan reports and artifacts were preserved. The original independent action paths remain incomplete; there is no basis to promote them to successful Accept/Reject.

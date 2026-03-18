# Taxonomy Finalization Review

Date: 2026-03-18

Scope: review of the current canonical taxonomy in [packages/shared/src/taxonomy/report-pillars.ts](/Users/benmasek/WC01/packages/shared/src/taxonomy/report-pillars.ts), with emphasis on taxonomy stability, signal-to-evidence-category fit, and what should be locked now versus revisited after the field-collection implementation thread lands.

## Bottom Line

The current model is structurally sound enough to lock at the pillar, section, and evidence-category ID level now.

Decision for this phase:

- canonical pillar IDs are locked
- canonical section IDs are locked
- canonical evidence-category IDs are locked
- label refinements are allowed
- signal mappings remain the active layer for iteration

There is not a fundamental structural flaw in the five-pillar shape:

- `policies_rights_disclosures`
- `consent_tracking_data_collection`
- `consumer_protection_commercial_practices`
- `accessibility`
- `regulatory_enforcement_overlay`

The main weaknesses are not taxonomy-shape problems. They are:

- incomplete population of several evidence categories
- a few signal mappings whose primary category does not match the question the category label implies
- a few labels that are narrower than the evidence they currently hold

That means the stable thing to lock now is the domain model. The flexible thing to keep evolving is the signal mapping layer.

## Canonical Model Review

### What looks correct and should stay

- The primary pillars are cleanly separated into observable evidence domains plus a regulator-oriented overlay.
- The overlay is correctly modeled as secondary context rather than the main taxonomy.
- The policy/consent/tracking/sensitive-data/commercial/accessibility split is understandable to both reviewers and downstream product surfaces.
- Most sections ask a coherent reviewer question.
- Most evidence-category IDs are durable enough to survive additional fields over time.

### What is structurally strong

- `privacy_notices_rights_data_handling`
- `consent_controls_enforcement`
- `tracking_third_party_ecosystem`
- `sensitive_data_collection`
- `us_consumer_protection_ftc_coppa`
- `eu_privacy_consent_gdpr_eprivacy_edpb`
- `ca_privacy_rights_controls_ccpa_cpra_cppa`

These sections already behave like stable evidence domains rather than temporary implementation buckets.

### What is structurally acceptable but under-populated

- `terms_legal_disclosures`
- `offers_pricing_claims`
- `billing_cancellation_post_purchase_rights`
- `access_barriers_task_completion`
- `accessibility_commitments_conformance_support`
- `international_privacy_comparators`

These are not bad sections. They just need more mapped evidence from the implementation thread before a harder lock on signal placement.

## Density Review

Current evidence-category density from the signal registry shows these zero-signal categories:

- `cross_document_consistency`
- `price_fee_transparency`
- `conformance_vpat_references`
- `navigation_interaction_barriers`
- `form_task_completion_barriers`
- `navigation_interaction_form_barriers`

These near-empty categories also need attention:

- `notice_scope_entity_identity`
- `billing_renewal_refund_terms`
- `cancellation_termination_disclosures`
- `checkout_payment_disclosures`
- `claim_consistency_accessibility_posture`
- `cross_border_data_handling_transparency`
- `offer_framing_promotional_mechanics`
- `preconsent_tracking_incidents`
- `refunds_credits_post_purchase_remedies`

Interpretation:

- Most of this is implementation sparsity, not evidence-domain failure.
- The main risk is premature certainty about signal placement inside these categories.
- Empty categories are acceptable for the provisional lock if they correspond to stable domains that already have known or planned fields.

## Weak Or Misfit Mappings

These are the main mappings I would treat as weak today.

### 1. `privacy.privacy_policy_present` -> `notice_scope_entity_identity`

Why weak:

- A privacy policy being present does not primarily evidence scope or entity identity.
- It more directly supports notice/disclosure presence.

Recommendation:

- Do not change the category ID.
- Revisit the mapping so this signal is either primarily `data_handling_disclosures` or the category label is broadened.

### 2. `commerce.checkout_or_payment_form_present` -> `checkout_payment_disclosures`

Why weak:

- Detection of a checkout form is evidence of a collection or payment surface.
- It is not direct evidence that disclosures are present.

Recommendation:

- Revisit the signal mapping after implementation lands.
- Short term, this is a candidate to map primarily to `collection_surface_entry_points` and secondarily to `checkout_payment_disclosures`, unless a disclosure-specific field is added.

### 3. `commerce.free_trial_detected` -> `billing_recurring_charge_mechanics`

Why weak:

- A free trial is first an offer mechanic.
- It only becomes billing-mechanics evidence when paired with renewal or conversion behavior.

Recommendation:

- Revisit the mapping.
- Likely better as primary `offer_framing_promotional_mechanics`, secondary `billing_recurring_charge_mechanics`.

### 4. `accessibility.accessibility_widget_present` -> `support_accommodation_contact_paths`

Why weak:

- A widget is not a contact path.
- It is closer to a public accessibility support/tooling signal.

Recommendation:

- Keep the ID.
- Refine the label or remap the signal after implementation adds more accessibility-support fields.

### 5. `accessibility.accessibility_litigation_risk_score` -> `representative_rule_level_evidence`

Why weak:

- A derived risk score is not rule-level evidence.
- This makes the category read narrower than the evidence it actually contains.

Recommendation:

- Keep the category ID for now.
- Revisit the mapping and/or broaden the label before second lock.

## Categories That Are More Label Problems Than Structure Problems

These do not require ID changes. They are good candidates for label refinement now.

### `notice_scope_entity_identity`

Issue:

- Current label is too narrow for the signals likely to land there.

Suggested label direction:

- `notice presence, scope & entity identity`

### `terms_coverage_enforceability_signals`

Issue:

- Current signals include effective date, governing law, and arbitration. The label is fine, but slightly abstract.

Suggested label direction:

- `terms, legal coverage & enforceability signals`

### `representative_rule_level_evidence`

Issue:

- Current mappings include summary counts and a derived risk score, not just representative rule examples.

Suggested label direction:

- `automated issue summary & rule-level evidence`

### `support_accommodation_contact_paths`

Issue:

- Current mappings include widgets, which are neither accommodation nor contact paths in the narrow sense.

Suggested label direction:

- `support, accommodation, tooling & contact paths`

## Contextual Logic Boundary

The current taxonomy mostly respects the rule that contextual relevance should stay separate from the taxonomy. That boundary should remain explicit.

What is acceptable:

- derived context signals being mapped as evidence signals
- overlay logic using context to prioritize relevance

What should not happen:

- creating evidence categories whose meaning depends on industry or audience context
- making contextual relevance the reason a signal belongs in a category

Practical rule:

- taxonomy answers "what kind of evidence is this?"
- context answers "when does this matter more?"

That boundary should be locked now.

## Lock Now vs Revisit Later

### Lock now

- all pillar IDs
- all section IDs
- all evidence-category IDs
- pillar ordering
- section membership under each pillar
- separation of primary taxonomy from regulatory overlay
- the principle that signal mappings may evolve independently from taxonomy IDs
- the rule that contextual relevance stays outside taxonomy structure

### Lock now, but allow label refinements

- `notice_scope_entity_identity`
- `terms_coverage_enforceability_signals`
- `representative_rule_level_evidence`
- `support_accommodation_contact_paths`

### Revisit after implementation lands

- primary mapping for `privacy.privacy_policy_present`
- primary mapping for `commerce.checkout_or_payment_form_present`
- primary mapping for `commerce.free_trial_detected`
- primary mapping for `accessibility.accessibility_widget_present`
- primary mapping for `accessibility.accessibility_litigation_risk_score`
- whether `price_fee_transparency` gets enough direct evidence to stay dense
- whether the accessibility barrier categories are populated distinctly enough to justify their current split

### Updated post-implementation stance

With the newer accessibility, consumer-protection, terms/legal, and policy-consistency fields in place, the immediate next taxonomy work is narrower:

- finalize mappings for the newly landed fields
- keep only the genuinely ambiguous primary mappings provisional
- use the second-lock rubric as a gate on those provisional mappings, not on the taxonomy structure itself

The main mapping correction from this phase:

- cross-document conflict signals such as `context.policy_terms_conflict_detected` and `context.privacy_cookie_policy_conflict_detected` should populate `cross_document_consistency`, not `policy_to_behavior_contradictions`

Updated decisions on the formerly provisional mappings:

- keep `privacy.privacy_policy_present` under `notice_scope_entity_identity` after the label broadened to include notice presence
- move `commerce.checkout_or_payment_form_present` to primary `collection_surface_entry_points`, secondary `checkout_payment_disclosures`
- move `commerce.free_trial_detected` to primary `offer_framing_promotional_mechanics`, secondary `billing_recurring_charge_mechanics`
- keep `accessibility.accessibility_widget_present` under `support_accommodation_contact_paths` after the label broadened to include tooling
- keep `accessibility.accessibility_litigation_risk_score` under `representative_rule_level_evidence` for now, with the broadened label carrying the heuristic-summary meaning

## Recommended Second-Lock Rubric

Second lock should happen after the new field collection/extraction thread has landed and a calibration sample has been reviewed.

Use this rubric.

### 1. Evidence-domain stability

Lock a category only if the reviewer question is stable and singular.

Test:

- Can a reviewer ask one clear question for the category?
- If the category needs two different questions, it is too broad.

### 2. Primary mapping clarity

Every signal should have one obvious primary category.

Test:

- If two adjacent categories both feel equally correct, the mapping is not ready.
- Resolve by moving one category to secondary or refining a label.

### 3. Density threshold

Every non-overlay evidence category should be one of:

- populated by at least two distinct implemented signal families
- populated by one high-precision sentinel signal with clear enforcement relevance
- explicitly marked as intentionally rare but material

If a category is still empty after implementation, do not second-lock its mapping assumptions.

### 4. Population realism

Use a calibration set, not just theoretical fit.

Test:

- Does the category populate across real scans often enough to stay visible?
- If it is almost always empty, it needs either more evidence, a narrower promise, or rare-material treatment.

### 5. Enforcement usefulness

A category should help a reviewer reach a regulator-relevant follow-up question.

Test:

- Does the category cleanly support at least one compliance or enforcement review path?
- If not, it is probably too implementation-shaped.

### 6. Upgradability

New fields should slot into the taxonomy without forcing ID churn.

Test:

- Can likely future signals fit by mapping changes alone?
- If future fields would require renaming or reparenting the category, it is not ready to second-lock.

### 7. Context separation

Context should not be needed to define the category.

Test:

- If the category only makes sense when filtered by audience, sector, or risk context, keep that logic outside taxonomy.

## Proposed Decision

Recommended decision for this thread:

- hard-lock pillar, section, and evidence-category IDs now
- allow label refinements now
- keep signal mappings provisional until the implementation thread materially increases field coverage
- run second lock only after reviewing populated scan output against the rubric above

That approach preserves stability where stability matters and keeps the changeable part in the right layer: signal mapping, not taxonomy structure.

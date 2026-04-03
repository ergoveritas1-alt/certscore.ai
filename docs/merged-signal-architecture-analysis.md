# Merged Signal Architecture Analysis

This document is the companion analysis for the `WS01 + nano` merged-signal plan.

It reflects the current canonical inventory in [report-pillars.ts](/Users/benmasek/WC01/packages/shared/src/taxonomy/report-pillars.ts) and classifies each unified finding by the minimum merged-signal contract needed to surface it safely.

## Summary

- Direct scanner findings: 57
  - 53 snapshot-backed
  - 4 runtime-backed
- Findings that require nano signal backfill: 9
- Findings that should stay in the canonical pipeline but need narrower merged-signal gating: 16
- Findings that should move to validation/internal-only unless a stronger signal contract is added: 6
- Findings with taxonomy or trigger-path debt that should be suppressed or reworked before relying on them: 14

## Directly Supportable From WS01

These are already supportable from retained scanner evidence and should remain scanner-owned at the signal layer:

- disclosure surface and availability findings
- consent surface, dark-pattern, and pre-consent tracking findings
- runtime reject/GPC/cookie-security findings
- sensitive-form-collection findings
- accessibility rule and support-path findings
- commercial/financial surface findings that are already snapshot-backed

The implementation keeps these as scanner-populated signals and gives them precedence when nano also produces a value for the same key.

## Requires Nano Backfill

These findings are currently driven by `policy_enrichment_signal` and should move to nano-owned signal population:

- `privacy_rights_path_present`
- `privacy_contact_path_present`
- `gpc_disclosure_present`
- `tracking_technologies_disclosure_present`
- `arbitration_clause_present`
- `targeted_advertising_disclosure_present`
- `third_party_advertising_disclosure_present`
- `behavioral_analytics_disclosure_present`
- `children_privacy_disclosure_present`

These remain canonical unified findings, but they should only be surfaced from merged signals after nano emits structured signal records with provenance and confidence.

## Needs Narrower Merged-Signal Gating

These findings currently mix scanner and non-scanner evidence or depend on broad trigger paths:

- policy clarity / obstruction findings
- privacy contact mismatch and cookie disclosure gap findings
- contradiction and functional-misalignment findings
- minors context findings
- aggregate accessibility score/summary findings

These should remain in the canonical pipeline, but only after their merged-signal contract is explicit and fail-closed when one side is missing.

## Validation/Internal Candidates

These are primarily validation-rule findings today:

- provider / extraction failure findings
- missing DSAR / retention / transfer disclosures
- rule-only policy row presence

Unless nano emits stable signal-layer replacements, these should stay validation-only or internal.

## Suppress Or Rework

These findings do not currently have a stable scanner-backed or merged-signal-backed trigger path:

- `data_categories_disclosure_missing`
- `third_party_recipient_disclosure_missing`
- `purpose_of_use_disclosure_missing`
- `regulator_operated_mock_investment_example`
- `consent_gated_tracking_claim_conflict`
- `do_not_sell_sharing_disclosure_conflict`
- `consent_surface_required_deeper_sweep`
- `accept_flow_unavailable_after_reject`
- `session_replay_on_sensitive_input_surface`
- `sensitive_data_collection_with_third_party_tracking_present`
- `surface_title_mismatch`
- `affiliate_disclosure_scope_limited`
- `critical_form_completion_barrier`
- `keyboard_only_task_completion_blocked`

These should not inherit coverage accidentally from broad aliases or synthetic finding remaps. They need either:

- a new explicit merged-signal contract
- a move to validation/internal-only
- suppression until stronger evidence exists

## Scanner Signal Inventory

`WS01` can already populate these signal families from [snapshots.ts](/Users/benmasek/WC01/packages/shared/src/types/snapshots.ts):

- legal/disclosure surface presence
- contact/entity surface signals
- consent/CMP/banner and choice signals
- tracker, cookie, and pre-consent runtime signals
- form and sensitive-data collection signals
- accessibility signals
- commercial and financial-promotion surface signals
- access posture and tier metadata

Tier and access-posture metadata remain execution context only and are not treated as substantive evidence by the merged-signal layer.

## Nano-Owned Gaps

Nano should own signal backfill for:

- policy text and disclosure language extraction
- legal-document classification
- document-derived semantic rights/governance/disclosure signals
- policy-side contradiction anchors
- any critical non-policy signal that the scanner did not retain directly but can still be substantiated from retrieved evidence

Nano does not emit findings directly. It emits typed signal records with confidence, provenance, evidence refs, and population status.

## Current Nano Ingestion Shape

`WC01` now reads persisted nano signal rows from [scan_runtime_artifacts.hybrid_runtime_evidence](/Users/benmasek/WC01/packages/db/migrations/0081_runtime_hybrid_evidence.sql) before concern normalization and unified-finding promotion.

Accepted payload keys under `hybrid_runtime_evidence`:

- `nano_signals`
- `nanoSignals`
- `signal_populations`
- `signalPopulations`

Expected row fields:

- `key`
- `label`
- `value`
- `confidence`
- `report_signal_source`
- `evidence_refs`
- `population_status`
- optional provenance detail via `provenance_detail`, `provenanceDetail`, or `provenance`

These rows are normalized into `source: "nano"` signal-population records and merged with scanner-owned populations before any downstream finding derivation.

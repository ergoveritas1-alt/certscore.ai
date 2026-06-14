# WC01 v2 Production-Readiness Gate Design

Internal design only. Not customer-facing report output.

## Executive Summary

This design defines the gates required before any WC01 v2 internal reviewer result could be considered for a future production/report/checklist/executive/scoring/regulatory proposal.

The production-readiness gate solves a workflow problem: internal evidence review can confirm that a v2 packet is understandable, bounded, and routed correctly, but internal review alone is not enough to make that packet suitable for product surfaces. A separate gate is needed to check evidence sufficiency, policy/copy decisions, guardrails, regression consistency, approval records, and rollback/suppression handling.

This design does not approve:

- implementation
- app UI
- persistence
- production integration
- production concern policy calls
- persisted normalized concerns
- unified findings
- report/checklist/executive/top-finding/scoring/regulatory output
- customer-facing copy
- legal-conclusion language
- forbidden status mapping

Internal evidence review is not enough for production output because reviewer actions are evidence-workflow decisions, not product eligibility decisions. A reviewer can confirm evidence shape, escalate sensitive context, or request policy/copy review, but no reviewer action alone should create production eligibility.

## Current Internal-Only Chain

Current and proposed internal chain:

```text
Wc01V2EvidencePreviewPacket.summary.md
-> Wc01V2EvidencePreviewPacket.json
-> manual reviewer log
-> policy/copy review design
-> production-readiness gate
```

The first four stages remain artifact-only, internal-only, and non-persistent. The production-readiness gate described here is also design-only and would remain artifact-only unless separately approved.

## Gate Principles

The production-readiness gate must follow these principles:

- Evidence-led only.
- No legal conclusions.
- No customer-facing wording without copy approval.
- No sensitive-context promotion.
- No production eligibility from internal reviewer action alone.
- No unresolved blocking evidence.
- No raw or unsafe evidence.
- Explicit human approval required.
- Separate policy/product approval required.
- Fail closed on missing, ambiguous, unsupported, or unsafe context.
- Preserve traceability to source artifacts, reviewer notes, refs, excerpts, and guardrail scans.

## Required Gates

| Gate | Purpose | Required inputs | Pass condition | Fail condition | Owner | Output if passed |
|---|---|---|---|---|---|---|
| Evidence sufficiency gate | Confirm the evidence shape is strong enough for next-stage consideration. | Preview packet, queue item, source refs, excerpt refs, family context, confidence/directness. | Required refs, excerpts, family-specific context, confidence, and directness are present and display-safe. | Missing refs/excerpts, weak directness, missing family context, or unsupported evidence shape. | Evidence reviewer | `evidence_sufficient_for_gate_review` |
| Reviewer confirmation gate | Confirm a human reviewer has completed internal review. | Manual reviewer log entry, reviewer action, reviewer notes. | Reviewer action and notes are present, understandable, and tied to the queue item. | No reviewer action, unclear notes, or action not tied to the artifact. | Evidence reviewer | `reviewer_confirmed` |
| Unresolved-ref gate | Confirm unresolved refs do not block evidence review. | Preview unresolved-ref summary, reviewer notes, JSON detail if opened. | No unresolved refs, or unresolved refs are documented as non-blocking fail-closed context. | Unresolved refs affect evidence sufficiency or require upstream inspection. | Evidence reviewer | `unresolved_refs_non_blocking` |
| Sensitive-context gate | Confirm sensitive-context handling remains routing-only and separately reviewed. | Sensitive-context categories, reviewer action, policy/copy notes. | Sensitive context is routed, not promoted; policy owner review is recorded when required. | Sensitive context is used as a stronger evidence claim or lacks required escalation. | Policy owner | `sensitive_context_reviewed` |
| Policy/copy gate | Confirm any future wording has explicit policy and copy approval. | Policy/copy decision, approved internal phrasing, blocked phrasing check. | Approved wording exists for the intended surface or item remains internal-only. | Wording is missing, overbroad, definitive beyond evidence, or unapproved. | Policy/copy owner | `policy_copy_approved_for_next_stage` |
| Guardrail/sanitization gate | Confirm no unsafe content or forbidden wording is present. | Guardrail scan result, sanitizer result, artifact summary. | Guardrail scan and sanitizer checks are clean, or warnings are explicitly non-blocking and display-safe. | Unsafe fields, unbounded text, raw values, or blocked wording are present. | Engineering reviewer | `guardrails_clean` |
| Consistency/regression gate | Confirm behavior is stable against fixture/cohort expectations. | Relevant fixtures, cohort summaries, regression test results. | Similar packets produce consistent outcomes and expected blocks. | Regression drift, surprising promotion, missing blocks, or changed family behavior. | Engineering reviewer | `regression_consistent` |
| Product-surface mapping gate | Confirm the intended surface has an approved mapping design. | Product-surface proposal, mapping rules, allowed families/statuses. | The target surface and mapping are explicitly approved and separate from internal reviewer status. | No approved mapping design or attempted direct use of internal statuses. | Product owner | `surface_mapping_approved_for_proposal` |
| Approval-record gate | Confirm human approvals are recorded in the artifact trail. | Reviewer, policy owner, product owner, timestamp, notes. | Required owner decisions and timestamps are present. | Missing owner, missing decision, missing timestamp, or unclear scope. | Gate owner | `approval_record_complete` |
| Rollback/suppression gate | Confirm there is a way to suppress or reverse future movement. | Suppression reason schema, rollback note, blocked reason. | Suppression/rollback reason is available and item can be held back. | No documented suppression path or unclear blocked state. | Product/engineering owner | `suppression_path_ready` |

Passing all gates would produce only an internal next-step artifact. It would not itself create product output.

## Production Surface Classes

These classes are internal planning classes only. They are not customer-facing final statuses.

| Class | Meaning | Allowed handling |
|---|---|---|
| `internal_only_reviewer_workflow` | The item belongs only in the grouped preview and manual reviewer workflow. | Manual review and internal notes. |
| `internal_policy_copy_candidate` | Evidence shape is reviewable, but policy/copy decisions are needed. | Policy/copy review artifacts only. |
| `internal_production_candidate_draft` | Gates may be ready for a future production proposal. | Artifact-only draft; still not product output. |
| `limited_product_surface_candidate` | A future approved proposal may define a limited surface. | Requires explicit product, policy, copy, and engineering approval. |
| `blocked_suppressed` | The item is held back. | Suppression reason and audit trail only. |

Do not define customer-facing final statuses at this stage.

## Reviewer Action Mapping

No reviewer action alone should produce production eligibility.

| Reviewer action | Gate interpretation | Possible next internal class | Production eligibility |
|---|---|---|---|
| `evidence_shape_confirmed` | Evidence is understandable for internal review. | `internal_policy_copy_candidate` only if other gates are ready. | No |
| `sensitive_context_escalated` | Sensitive context requires stricter policy/product routing. | `internal_policy_copy_candidate` after policy owner review. | No |
| `policy_copy_review_required` | Copy/policy owner decision is required. | `internal_policy_copy_candidate`. | No |
| `internal_only` | Item should remain internal. | `internal_only_reviewer_workflow`. | No |
| `needs_more_evidence` | Evidence is not sufficient for next-stage movement. | `blocked_suppressed` or held for evidence work. | No |
| `rejected_overbroad` | Item is too broad for current workflow shape. | `blocked_suppressed`. | No |

## Sensitive-Context Special Handling

Sensitive-context categories require policy owner approval before any production-candidate draft because context can increase interpretive risk without changing the underlying evidence.

| Category | Special handling |
|---|---|
| health | Requires policy owner review before any wording references health context. Do not infer medical status, treatment interest, symptoms, or condition context. |
| reproductive health | Requires the strictest policy/copy review. Do not infer user intent, care seeking, or personal circumstances. |
| finance | Requires purpose separation so security, fraud-prevention, and infrastructure evidence remain diagnostic unless separately supported. Do not infer account, credit, transaction, or financial-condition context. |
| public benefits | Requires policy owner review before any wording references public-benefits context. Do not infer eligibility, benefit seeking, or service dependency. |
| employment / HR | Requires policy owner review before any wording references applicant or employment context. Do not infer applicant status, worker status, eligibility, or outcomes. |
| behavioral analytics reference sites | Requires collection endpoint or equivalent strong runtime signal for session replay/behavioral analytics handling. Reference-site context must not become customer-facing copy. |

Sensitive-context labels remain routing metadata only. They must not promote an item, harden a claim, or create product eligibility.

## Blocked Patterns

The following patterns must block production-candidate movement:

- category-only inference
- library-only session replay evidence without collection endpoint or equivalent strong runtime signal
- unresolved blocker
- ambiguous lineage that affects evidence sufficiency
- unsupported sensitive-data claims
- raw or unsafe evidence
- legal-conclusion copy
- customer-facing copy not approved
- diagnostic-only purpose support
- security/fraud/infrastructure-only evidence
- tag-management-only evidence
- consent-management-only evidence
- missing source refs or display-safe excerpt refs
- missing confidence/directness
- missing required family-specific evidence context

Blocked movement should produce a suppression or hold reason, not a product output.

## Audit Trail Requirements

Future artifact-only audit metadata should include:

- source artifact path
- reviewer action
- reviewer notes
- policy/copy decision
- gate decision
- gate owner
- timestamp
- evidence refs and excerpt refs
- guardrail scan result
- suppression reason if blocked

No persistence is approved. This is only a future artifact shape.

## Future Artifact Shape

Proposed artifact name:

```text
Wc01V2ProductionReadinessGateDraft
```

Proposed fields:

| Field | Purpose |
|---|---|
| `packetVersion` | Supported gate draft contract version. |
| `sourcePreviewPacketPath` | Path to the source evidence preview packet. |
| `sourceReviewerLogPath` | Path to the manual reviewer log. |
| `siteDomain` | Site/domain under review. |
| `queueItemId` | Queue item identifier from the preview packet. |
| `candidateFamily` | Candidate family under review. |
| `reviewerAction` | Manual reviewer action. |
| `sensitiveContextCategories` | Routing categories, if present. |
| `gateResults` | Per-gate result objects with owner, decision, and notes. |
| `overallGateOutcome` | Internal-only aggregate outcome. |
| `allowedNextStep` | Next internal step, if any. |
| `blockedReason` | Hold/suppression reason when movement is blocked. |
| `auditTrail` | Source paths, refs, excerpts, owners, timestamps, and scan results. |
| `productionEligible` | Always `false` by default. |
| `customerFacingEligible` | Always `false` by default. |
| `explicitApprovalRequired` | Always `true`. |

Allowed draft outcomes:

- `hold_internal_only`
- `ready_for_policy_copy_review`
- `ready_for_production_proposal_review`
- `blocked_needs_more_evidence`
- `blocked_overbroad`
- `blocked_guardrail`

These outcomes are internal planning states only.

## Non-Goals

This design does not approve:

- implementation
- app UI
- persistence
- production integration
- production concern policy calls
- persisted normalized concerns
- unified findings
- report/checklist/executive/top-finding/scoring/regulatory-lens output
- customer-facing copy
- legal-conclusion language
- forbidden status mapping
- changes to `apps/web/components/scans/shared-scan-detail-view.tsx`

## Future Implementation Prompt: Not Approved

The following prompt is for a future implementation discussion only. It is not approved for implementation.

```text
Implement an artifact-only WC01 v2 production-readiness gate draft generator.

Inputs:
- Wc01V2EvidencePreviewPacket.summary.md
- Wc01V2EvidencePreviewPacket.json
- manual reviewer log
- optional policy/copy review artifact

Output:
- Wc01V2ProductionReadinessGateDraft.json
- Wc01V2ProductionReadinessGateDraft.summary.md

Requirements:
- validate supported packet versions
- validate source preview packet path and reviewer log path
- evaluate evidence sufficiency, reviewer confirmation, unresolved refs, sensitive context, policy/copy, guardrail/sanitization, consistency/regression, product-surface mapping, approval-record, and rollback/suppression gates
- keep productionEligible false by default
- keep customerFacingEligible false by default
- keep explicitApprovalRequired true
- preserve artifact paths, reviewer notes, evidence refs, excerpt refs, gate owners, timestamps, guardrail scan result, and suppression reasons
- fail closed on missing refs/excerpts, unresolved blockers, ambiguous lineage affecting evidence sufficiency, unsafe evidence, unsupported sensitive-context movement, diagnostic-only purpose support, or missing approvals

Boundaries:
- no app UI
- no persistence
- no production integration
- no production concern policy calls
- no persisted normalized concerns
- no unified findings
- no report/checklist/executive/top-finding/scoring/regulatory-lens output
- no customer-facing copy
- no legal-conclusion language
- no forbidden status mapping
- no changes to apps/web/components/scans/shared-scan-detail-view.tsx
```

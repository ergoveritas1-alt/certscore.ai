# WC01 v2 Sensitive-Context Policy/Copy Review Design

Internal design only. Not customer-facing report output.

## Executive Summary

This design defines how WC01 v2 should handle sensitive-context evidence during internal review before any production or customer-facing proposal.

The problem it solves: grouped evidence preview can now support internal evidence review, but sensitive-context labels need stricter policy and copy rules so reviewers do not accidentally treat routing metadata as stronger evidence, product language, or production eligibility.

This design does not approve:

- app UI
- persistence
- production integration
- customer-facing output
- report/checklist/executive/scoring/regulatory output
- legal-conclusion language
- forbidden status mapping

Sensitive-context handling needs stricter review because the surrounding site context can increase interpretive risk. Context may justify routing, escalation, and copy review. Context alone must not create a stronger finding, infer harm, identify users, or support definitive claims beyond the bounded evidence.

## Current State

Grouped evidence preview is adopted as the WC01 v2 internal reviewer workflow.

The workflow is:

- artifact-only
- internal-only
- non-persistent
- based on `Wc01V2EvidencePreviewPacket.summary.md` and `Wc01V2EvidencePreviewPacket.json`
- supported by manual reviewer logging

Sensitive context is currently review routing metadata only.

Reviewer actions include:

- `sensitive_context_escalated`
- `internal_only`
- `policy_copy_review_required`
- `needs_more_evidence`
- `rejected_overbroad`
- `evidence_shape_confirmed`

Run 002 confirmed that grouped preview supports first-pass internal review for the tuned high-volume cases. The remaining `fullstory.com` fail-closed unresolved refs did not block review.

## Sensitive-Context Handling Principles

Sensitive-context handling must follow these principles:

- Evidence-led only: reviewer action must be tied to bounded evidence groups, display-safe excerpts, source refs, confidence, directness, and family context.
- No legal conclusions: internal notes must avoid definitive legal determinations.
- No inferred harm: do not claim user harm, exposure, or misuse unless directly supported by bounded evidence and separately approved for the intended surface.
- No user/person identification claims: do not infer individual identity, individual behavior, or individual profile details.
- No sensitive-data collection claims unless directly supported: category context alone is not enough to say sensitive data was collected.
- No definitive compliance-failure claims: internal review may say evidence requires review, not that a site failed a legal duty.
- No customer-facing copy without policy owner approval.
- No stronger finding solely because the site is sensitive.
- Sensitive-context labels are routing metadata only.
- Fail closed when evidence is ambiguous, missing, overbroad, or not display-safe.

## Internal Reviewer Rules

| Reviewer action | Use when | Required note |
|---|---|---|
| `sensitive_context_escalated` | Evidence shape is reviewable and the site/category requires stricter internal routing. | Name the sensitive category and state that the label is routing metadata only. |
| `internal_only` | Evidence shape is reviewable but should not leave internal workflows. | Explain why the item should remain internal, such as sensitivity, copy risk, or insufficient production policy. |
| `policy_copy_review_required` | Evidence shape is reviewable, but any future wording would need policy/copy approval. | Record the copy risk without drafting customer-facing text. |
| `needs_more_evidence` | The preview is not enough for evidence-shape review or first-pass review. | Identify the missing refs, excerpts, directness, confidence, or family context. |
| `rejected_overbroad` | The item appears too broad for the current internal workflow shape. | Explain the overbreadth, such as category-only inference, tag-only support, or weak family context. |
| `evidence_shape_confirmed` | Standard-lane evidence shape is understandable and no sensitive-context escalation is needed. | Use only when sensitive-context routing is not present. |

Sensitive-context items should generally use `sensitive_context_escalated`, `internal_only`, or `policy_copy_review_required`, depending on the review purpose.

## Copy Posture

Allowed internal phrasing examples:

- "Sensitive-context review route."
- "Observed evidence requires policy/copy review before any product-surface use."
- "Evidence shape is reviewable internally."
- "Do not convert to customer-facing language without approval."
- "Sensitive-context label is routing metadata only."
- "Resolved representative evidence supports internal review of evidence shape."
- "Unresolved refs remain fail-closed and are not treated as supporting evidence."

Blocked phrasing patterns:

- definitive compliance conclusions
- definitive legal-duty failure language
- statements that sensitive data was sold or shared
- statements that users were tracked in a legally prohibited way
- statements that recording occurred unless bounded evidence directly supports collection behavior and the wording is approved
- statements that personal information was exposed
- statements that identify or profile individual users
- any definitive claim not directly supported by bounded evidence
- any customer-facing wording without policy owner approval

Blocked internal examples should be recorded as pattern descriptions, not copied into product copy. For example:

- `[blocked: definitive compliance conclusion]`
- `[blocked: unsupported sensitive-data sharing claim]`
- `[blocked: unsupported user recording claim]`
- `[blocked: unsupported personal-information exposure claim]`
- `[blocked: unsupported individual-identification claim]`

## Category-Specific Notes

### Health

Extra caution:

- Avoid claims about medical status, treatment interest, symptoms, or condition inference.
- Treat health context as routing metadata only.

Evidence that may support internal review:

- pre-consent tracking evidence with display-safe source refs and excerpts
- pre-consent cookie/storage evidence with party and storage context
- session replay or behavioral analytics evidence with collection endpoint or equivalent strong runtime signal

Must remain blocked:

- inferred health-interest claims
- inferred patient/user status
- claims about sensitive-data collection without direct bounded evidence
- customer-facing wording without policy owner approval

Policy owner escalation is required when:

- future copy would mention the health context
- reviewer action would move beyond internal-only routing
- evidence uses ambiguous category inference

### Reproductive Health

Extra caution:

- Treat this as the strictest sensitive-context category.
- Avoid claims about user intent, care seeking, or personal circumstances.

Evidence that may support internal review:

- directly observed pre-consent tracking or storage evidence
- bounded evidence groups with source refs and excerpts
- clear vendor, purpose, confidence, directness, and consent-state context

Must remain blocked:

- inferred reproductive-health interest claims
- any wording that suggests individual user behavior or intent
- customer-facing wording without explicit policy and copy approval

Policy owner escalation is required when:

- any reviewer wants wording beyond "sensitive-context review route"
- any evidence is ambiguous or category-derived
- any production proposal is contemplated

### Finance

Extra caution:

- Avoid claims about account status, credit status, transaction behavior, or financial condition.
- Treat finance context as routing metadata only.

Evidence that may support internal review:

- pre-consent tracking evidence tied to runtime source refs
- pre-consent cookie/storage evidence with storage context
- clear separation between ad/analytics evidence and security or fraud-prevention evidence

Must remain blocked:

- inferred consumer financial condition claims
- claims based on security, fraud-prevention, or infrastructure purposes alone
- copy that implies financial user profiling without direct bounded evidence

Policy owner escalation is required when:

- evidence mixes ad/analytics purposes with security or fraud-prevention diagnostic purposes
- copy would mention finance sensitivity
- reviewer selects `policy_copy_review_required`

### Public Benefits

Extra caution:

- Avoid claims about benefit eligibility, benefit-seeking behavior, or public-service dependency.
- Treat public-benefits context as routing metadata only.

Evidence that may support internal review:

- clear pre-consent runtime evidence
- bounded policy-safe excerpts when available
- source refs tied to retained display-safe evidence

Must remain blocked:

- inferred benefit-seeking claims
- claims about individual eligibility or service use
- customer-facing language without policy owner approval

Policy owner escalation is required when:

- future wording would mention public-benefits context
- unresolved refs or missing excerpts make evidence shape uncertain
- reviewer marks `needs_more_evidence`

### Employment / HR

Extra caution:

- Avoid claims about applicants, employment status, eligibility, or hiring outcomes.
- Treat employment / HR context as routing metadata only.

Evidence that may support internal review:

- pre-consent tracking evidence on applicant or HR flow surfaces
- pre-consent cookie/storage evidence with party and storage context
- session replay evidence with strong runtime collection context

Must remain blocked:

- inferred applicant tracking claims beyond observed runtime evidence
- claims about employment decisions or individual worker/applicant status
- customer-facing language without policy owner approval

Policy owner escalation is required when:

- future copy would reference employment / HR context
- reviewer action depends on a page-flow inference rather than bounded evidence
- session replay evidence lacks collection endpoint or equivalent strong runtime context

### Behavioral Analytics Reference Sites

Extra caution:

- Reference sites can make vendor behavior easier to inspect, but should not be treated as customer-facing examples.
- Avoid saying recording occurred unless collection behavior is directly supported and wording is approved.

Evidence that may support internal review:

- session replay or behavioral analytics evidence with collection endpoint or equivalent strong runtime signal
- clear vendor labels, purposes, confidence, and directness
- bounded excerpts/source refs showing why the evidence entered review

Must remain blocked:

- library-only evidence without collection or equivalent strong runtime signal
- category-only claims
- product-surface copy without policy owner approval

Policy owner escalation is required when:

- reviewer wants to use a reference-site example in policy/copy guidance
- evidence is library-only or ambiguous
- future wording would describe recording, replay, or behavioral capture

## Graduation Gates

Before any sensitive-context item could move beyond internal review, all of the following would be required:

| Gate | Requirement |
|---|---|
| Reviewer confirmation | Manual reviewer confirms evidence shape and records action. |
| Policy owner approval | Policy owner approves the category, family, and allowed handling. |
| Copy approval | Approved wording exists for the intended product surface. |
| Evidence sufficiency threshold | Evidence includes source refs, display-safe excerpts, confidence/directness, family context, and required family-specific evidence. |
| Redaction/sanitization check | No unsafe fields, unbounded text, raw values, or redaction blockers are present. |
| No unresolved blocker | Unresolved refs are either absent or explicitly recorded as non-blocking fail-closed context. |
| Explicit production proposal | A separate proposal exists and is approved before any production work. |

Passing these gates would only make an item eligible for a future approved implementation plan. It would not itself create product output.

## Non-Goals

This design does not approve:

- app UI
- persistence
- production integration
- report/checklist/executive/top-finding/scoring/regulatory output
- customer-facing copy
- legal-conclusion language
- forbidden status mapping
- changes to `apps/web/components/scans/shared-scan-detail-view.tsx`

## Decision Matrix

| Evidence shape | Sensitive category | Reviewer action | Allowed internal handling | Blocked customer-facing handling | Escalation required? |
|---|---|---|---|---|---|
| Clear pre-consent tracking evidence with source refs and excerpts | health | `sensitive_context_escalated` | Internal review route; policy/copy review required before any future surface. | Any definitive claim about medical interest or user status. | yes |
| Clear pre-consent cookie/storage evidence | reproductive health | `sensitive_context_escalated` | Internal-only routing with strict copy hold. | Any claim about user intent or personal circumstances. | yes |
| Clear tracking/storage evidence with mixed diagnostic purposes | finance | `policy_copy_review_required` | Internal review with purpose separation notes. | Any claim based on security/fraud-prevention purposes alone. | yes |
| Clear runtime evidence but public-benefits context | public benefits | `sensitive_context_escalated` | Internal routing and policy owner review. | Any claim about benefit seeking or eligibility. | yes |
| Reviewable evidence on applicant/HR flow | employment / HR | `sensitive_context_escalated` | Internal routing with page-flow caveat. | Any claim about applicant or employment status. | yes |
| Session replay evidence with collection endpoint or equivalent strong signal | behavioral analytics reference sites | `sensitive_context_escalated` | Internal review of evidence shape. | Any product-surface recording/replay wording without copy approval. | yes |
| Library-only behavioral analytics evidence | any sensitive category | `needs_more_evidence` | Record missing collection/equivalent runtime context. | Any use as supporting customer-facing evidence. | yes |
| Category-only inference without bounded evidence | any sensitive category | `rejected_overbroad` | Record overbreadth and suppress from next-stage handling. | Any product-surface use. | yes |
| Reviewable evidence but no approved copy path | any sensitive category | `internal_only` | Keep in internal reviewer workflow. | Any customer-facing conversion. | yes |

## Future Implementation Prompt: Not Approved

The following prompt is for a future implementation discussion only. It is not approved for implementation.

```text
Design an artifact-only, non-persistent extension to WC01 v2 internal reviewer artifacts that carries sensitive-context policy/copy review metadata.

Scope:
- read existing Wc01V2EvidencePreviewPacket artifacts
- add internal-only policy/copy review metadata
- preserve sensitive-context labels as routing metadata only
- preserve reviewer action, evidence refs, excerpt refs, confidence, directness, family context, caveats, and unresolved-ref disposition
- emit internal diagnostic JSON/Markdown only

Required boundaries:
- no app UI
- no persistence
- no production integration
- no production concern policy calls
- no persisted normalized concerns
- no unified findings
- no report/checklist/executive/top-finding/scoring/regulatory output
- no customer-facing copy
- no legal-conclusion language
- no forbidden status mapping
- no changes to apps/web/components/scans/shared-scan-detail-view.tsx

Guardrails:
- fail closed on unsupported artifact version
- fail closed on missing source refs or excerpts
- fail closed on unresolved refs that block review
- fail closed on unsafe text or raw values
- keep sensitive context as routing metadata only
- do not promote eligibility based on sensitive category
```

# WC01 v2 Evidence Rehydration Preview Design

## Executive Summary

The refined `Wc01V2ManualReviewerPacket` artifacts are sufficient for queue triage and evidence-shape adjudication. They carry safe source refs, excerpt refs/counts, vendor metadata, confidence/directness, family context, and sensitive-context categories.

They are not yet sufficient for full evidence review because reviewers still need the exact bounded display-safe excerpt text behind those IDs. The next step should be an internal evidence preview / rehydration tool that opens upstream artifacts by safe source and excerpt IDs.

Rehydration is preferable to copying excerpt text into every reviewer packet because it keeps reviewer packets small, avoids duplicated evidence surfaces, and lets the preview apply a single strict sanitizer before showing bounded excerpt content. It also preserves the current packet contract as a traceability and queue artifact rather than turning it into another evidence store.

This design does not implement code. It does not add app UI, persistence, production concern policy calls, persisted normalized concerns, unified findings, report output, checklist output, executive output, top-finding output, scoring output, regulatory-lens output, customer-facing copy, or `gap_observed` mappings.

## Boundary

### Inputs

The preview reads only saved internal artifacts:

- `Wc01V2ManualReviewerPacket`
- upstream artifact directories containing one or more of:
  - `Wc01V2ConcernPolicyComparisonDryRun`
  - `V2NormalizedConcernCandidateDraft`
  - `Wc01V2ConcernPolicyInputDraft`
  - `Wc01V2AllowlistDryRun`
  - `Wc01V2ShadowProjection`
  - `V2ReportProjectionDraft`

The preview can accept explicit artifact roots so the reviewer or operator controls which cohort is searched.

### Outputs

The first version should emit an internal artifact-only evidence preview packet:

- `Wc01V2EvidencePreviewPacket.json`
- `Wc01V2EvidencePreviewPacket.summary.md`
- optional batch summary JSON/Markdown

No production artifacts are created.

## Rehydration Strategy Options

| Option | Description | Strengths | Risks / limits | Recommendation |
|---|---|---|---|---|
| A. CLI-generated evidence preview packet | CLI reads reviewer packets plus upstream artifact roots and writes bounded evidence preview artifacts. | Smallest surface, easiest to test, no app UI, no persistence, explicit inputs. | Less ergonomic than a browser view; reviewers open files manually. | Recommended first version. |
| B. Admin-only internal preview page | Internal route loads reviewer packets and rehydrates evidence for browser inspection. | Better reviewer ergonomics; easier side-by-side review. | App surface, access-control questions, larger blast radius. | Later only after CLI trial. |
| C. Local artifact browser | Local-only browser or static viewer over artifacts. | No production app dependency; easier visual navigation. | Still requires frontend-like implementation and careful local file handling. | Possible later. |
| D. Copy bounded excerpt text into reviewer packets | Add display-safe excerpt text directly to packets. | Fully portable packets; simplest for offline reading. | Duplicates evidence, grows packet size, creates another display-safe evidence surface. | Fallback only if reviewers require portable single-file packets. |

Recommended safest first version: **A. CLI-generated evidence preview packet**.

## Evidence Lookup Model

The preview should resolve evidence from safe identifiers already carried by `Wc01V2ManualReviewerPacket`.

### Inputs For Lookup

Each queue item can provide:

- `queueItemId`
- `candidateId`
- `sourceFindingKey`
- `sourceRowId`
- `candidateFamily`
- `sourceRefIds`
- `displaySafeExcerptIds`
- source URL / domain
- family-specific context

The CLI should also receive one or more artifact roots:

```bash
pnpm v2:wc01-evidence-preview \
  --reviewer-packet ./artifacts/v2-wc01-reviewer-packets-edge-consent/hotjar.com/Wc01V2ManualReviewerPacket.json \
  --artifact-root ./artifacts/v2-wc01-reviewer-packets-edge-consent \
  --artifact-root ./artifacts/v2-wc01-concern-policy-comparison-edge-consent \
  --artifact-root ./artifacts/v2-wc01-normalized-concern-adapter-edge-consent \
  --artifact-root ./artifacts/v2-wc01-shadow-edge-consent \
  --out ./artifacts/v2-wc01-evidence-preview-edge-consent/hotjar.com/Wc01V2EvidencePreviewPacket.json
```

### Resolution Order

1. Locate the site/domain folder that corresponds to the reviewer packet source URL or packet path.
2. Match `queueItemId` and `candidateId` to comparison and normalized adapter artifacts.
3. Use `sourceRowId` or `sourceFindingKey` to locate matching rows in shadow or projection artifacts.
4. Resolve each `displaySafeExcerptId` against display-safe excerpt collections.
5. Resolve each `sourceRefId` against source evidence refs.
6. Return only bounded display-safe excerpt text and redacted source ref metadata.

### Lineage Rules

The preview should preserve lineage without inventing evidence:

- reviewer packet path
- source URL/domain
- queue item ID
- candidate ID
- candidate family
- source finding key
- source row ID, when present
- source artifact path
- resolved source ref IDs
- resolved excerpt IDs

If multiple artifact paths can satisfy the same lineage and the tool cannot disambiguate by site/domain, candidate ID, row ID, or excerpt ID, it must fail closed for that queue item.

## Safe Evidence Display Rules

### Allowed

The preview may display:

- bounded display-safe excerpt text
- excerpt IDs
- redacted source refs
- redacted URLs
- vendor labels
- purpose labels
- confidence/directness
- consent-state context
- cookie/storage context
- session replay collection context
- caveats and limitations
- redaction notes
- sanitizer warnings

### Blocked

The preview must not display:

- raw cookies
- raw cookie values
- raw request bodies
- raw response bodies
- sensitive query values
- unbounded DOM text
- full policy text
- raw Nano reasoning
- legal-conclusion language
- production report statuses
- customer-facing copy

The preview should reuse the existing blocked-field and forbidden-term guardrails from the report-adapter diagnostics where possible.

## Preview Packet Shape

Proposed artifact:

```ts
type Wc01V2EvidencePreviewPacket = {
  packetVersion: "wc01.v2_evidence_preview_packet.1";
  sourceReviewerPacketPath: string;
  sourceArtifactRoots: string[];
  sourceUrl?: string;
  domain?: string;
  productionEligible: false;
  topFindingEligible: false;
  gapEligible: false;
  status: "evidence_preview_internal_only";
  queueItems: Wc01V2EvidencePreviewQueueItem[];
  unresolvedEvidenceRefs: Wc01V2EvidencePreviewUnresolvedRef[];
  redactionWarnings: Wc01V2EvidencePreviewWarning[];
  guardrails: {
    noPersistence: true;
    noProductionConcernPolicyCall: true;
    noUnifiedFindings: true;
    noReportMutation: true;
    noChecklistExecutiveScoringImports: true;
    noCustomerFacingCopy: true;
    noGapObserved: true;
    noLegalConclusionLanguage: true;
    noRawBlockedFields: true;
    noProductionEligibility: true;
    noTopFindingEligibility: true;
    noGapEligibility: true;
  };
};

type Wc01V2EvidencePreviewQueueItem = {
  queueItemId: string;
  candidateId: string;
  candidateFamily: string;
  sourceFindingKey?: string;
  sourceRowId?: string;
  queueLane: string;
  sensitiveContextCategories: string[];
  sourceRefIds: string[];
  displaySafeExcerptIds: string[];
  resolvedEvidenceExcerpts: Array<{
    excerptId: string;
    sourceRefIds: string[];
    evidenceKind?: string;
    displayLabel?: string;
    boundedText: string;
    hostname?: string;
    redactionApplied: boolean;
    sourceArtifactPath: string;
  }>;
  resolvedSourceRefs: Array<{
    sourceRefId: string;
    label?: string;
    url?: string;
    artifactPath: string;
    redactionApplied: boolean;
  }>;
  unresolvedEvidenceRefs: Wc01V2EvidencePreviewUnresolvedRef[];
  vendorLabels: string[];
  supportingPurposes: string[];
  diagnosticPurposes: string[];
  confidence?: string;
  directness?: string;
  familyEvidenceContext: unknown;
  caveats: string[];
  coverageLimitations: string[];
  productionEligible: false;
  topFindingEligible: false;
  gapEligible: false;
};
```

The exact type can be refined during implementation. The important constraint is that preview packets contain only bounded display-safe excerpt text and redacted source metadata.

## Failure Behavior

The preview must fail closed for an item or artifact when:

- contract version is unsupported
- artifact root is missing
- reviewer packet is malformed
- source ref ID is not found
- excerpt ID is not found
- raw blocked field is detected
- legal-conclusion phrase is detected
- unbounded evidence text is detected
- artifact lineage is ambiguous
- source URL/domain folder does not match the packet source
- requested evidence resolves to more than one incompatible artifact

Batch mode should continue across independent sites, but each failed site or queue item must be reported honestly in the batch summary.

## Sensitive-Context Handling

Sensitive-context preview is internal review evidence only.

Sensitive items should:

- retain sensitive-context categories in the preview
- require stricter sanitizer checks
- keep all eligibility flags false
- avoid customer-facing copy
- avoid summarizing implications beyond the observed evidence shape
- optionally require two-reviewer workflow in a later design

The first CLI version should not implement reviewer authorization or decision workflow. It should only make the sensitive category visible and keep the artifact internal-only.

## Test Plan

Implementation should add focused tests for:

- valid evidence lookup by `sourceRefId`
- valid evidence lookup by `displaySafeExcerptId`
- missing source ref fail-closed behavior
- missing excerpt ref fail-closed behavior
- ambiguous lineage fail-closed behavior
- raw blocked field rejection
- long opaque value sanitization
- sensitive-context preview output
- unsupported contract version rejection
- malformed reviewer packet rejection
- bounded excerpt text only
- no production policy imports
- no shared scan detail import
- no report/checklist/executive/top-finding/scoring/regulatory-lens imports
- batch mode continuing on malformed or incomplete sites

Suggested fixture coverage:

- standard pre-consent tracking item
- sensitive reproductive-health item
- public-benefits item
- employment/HR item
- session replay collection endpoint item
- item with large source-ref count and capped excerpts
- item with diagnostic `tag_management` purpose

## Rollout Plan

1. Design
   - Review this document with engineering and policy/product owners.

2. CLI artifact-only preview packet
   - Implement a CLI in `@certscore/report-adapter`.
   - Input: reviewer packet plus explicit artifact roots.
   - Output: JSON/Markdown evidence preview artifacts.
   - No persistence, no app UI.

3. Internal reviewer trial
   - Run the CLI over expanded, stress, edge, and policy-stress cohorts.
   - Ask reviewers whether bounded excerpts are enough for full evidence review.

4. Optional admin preview later
   - Consider a flag-gated internal route only after the CLI packet shape is stable.
   - Keep it separate from production report/checklist/executive surfaces.

5. Optional persistence only after separate approval
   - Reviewer decisions, annotations, or workflow state require a separate proposal and explicit approval.

## Open Questions

- Should the preview packet include bounded excerpt text or only clickable local artifact references?
- How much excerpt text is enough for full evidence review?
- Should sensitive-context evidence require extra reviewer authorization?
- Should evidence previews expire or remain local artifacts?
- Should reviewers be able to annotate preview packets?
- Should high-volume source refs be grouped by vendor, purpose, evidence kind, or representative excerpt?
- Should exact excerpt text be duplicated in preview artifacts or loaded on demand from upstream artifacts?

## Future Implementation Prompt

The following is a future implementation prompt. It is not approved by this design document.

```text
Implement a dry-run-only WC01 v2 evidence rehydration preview CLI in @certscore/report-adapter.

Input:
- Wc01V2ManualReviewerPacket.json
- one or more explicit upstream artifact roots

Output:
- Wc01V2EvidencePreviewPacket.json
- Wc01V2EvidencePreviewPacket.summary.md
- optional batch summaries

Requirements:
- resolve queue item sourceRefIds and displaySafeExcerptIds against upstream artifacts
- include only bounded display-safe excerpt text and redacted source refs
- preserve source URL/domain, queue item ID, candidate ID, candidate family, sourceFindingKey, sourceRowId, vendor labels, purposes, confidence/directness, sensitive categories, and family context
- fail closed on unsupported versions, missing refs, missing excerpts, ambiguous lineage, raw blocked fields, legal-conclusion phrases, unbounded evidence text, or unsafe source metadata
- keep productionEligible, topFindingEligible, and gapEligible false
- no persistence
- no app UI
- no production concern policy calls
- no persisted normalized concerns
- no unified findings
- no report/checklist/executive/top-finding/scoring/regulatory-lens output
- no customer-facing copy
- no gap_observed mapping
- do not import or modify apps/web/components/scans/shared-scan-detail-view.tsx

Verification:
- pnpm --filter @certscore/report-adapter test
- pnpm --filter @certscore/report-adapter typecheck
- CLI --help smoke command
- guardrail scan over generated preview artifacts
```

## Acceptance Criteria

- Documentation only.
- No code changes.
- No app UI implementation.
- No persistence.
- No production integration.
- No customer-facing output.
- No changes to `apps/web/components/scans/shared-scan-detail-view.tsx`.

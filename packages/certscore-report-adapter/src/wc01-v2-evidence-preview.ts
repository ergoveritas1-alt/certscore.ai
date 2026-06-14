import { readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import {
  containsBlockedRawFields,
  containsForbiddenGapObservedToken,
} from "./wc01-shadow-output";
import {
  type Wc01V2ManualReviewerPacket,
  type Wc01V2ManualReviewerQueueItem,
  WC01_V2_MANUAL_REVIEWER_PACKET_VERSION,
} from "./wc01-v2-manual-reviewer-packet";

export const WC01_V2_EVIDENCE_PREVIEW_PACKET_VERSION =
  "wc01.v2_evidence_preview_packet.1";

export type Wc01V2EvidencePreviewPacket = {
  packetVersion: typeof WC01_V2_EVIDENCE_PREVIEW_PACKET_VERSION;
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

export type Wc01V2EvidencePreviewQueueItem = {
  queueItemId: string;
  candidateId: string;
  candidateFamily: string;
  sourceFindingKey?: string;
  sourceRowId?: string;
  queueLane: string;
  sensitiveContextCategories: string[];
  sourceRefIds: string[];
  displaySafeExcerptIds: string[];
  resolvedEvidenceExcerpts: Wc01V2EvidencePreviewExcerpt[];
  resolvedSourceRefs: Wc01V2EvidencePreviewSourceRef[];
  unresolvedEvidenceRefs: Wc01V2EvidencePreviewUnresolvedRef[];
  representativeEvidenceGroups: Wc01V2EvidencePreviewRepresentativeGroup[];
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

export type Wc01V2EvidencePreviewRepresentativeGroup = {
  groupId: string;
  groupKey: string;
  groupLabel: string;
  family: string;
  evidenceKind?: string;
  vendorLabels: string[];
  supportingPurposes: string[];
  diagnosticPurposes: string[];
  confidence?: string;
  directness?: string;
  totalResolvedExcerpts: number;
  totalResolvedSourceRefs: number;
  totalUnresolvedRefs: number;
  totalRedactionWarnings: number;
  representativeExcerpts: Array<{
    excerptId: string;
    boundedText: string;
    sourceRefIds: string[];
    redactionApplied: boolean;
    sourceArtifactPath: string;
  }>;
  representativeSourceRefs: Array<{
    sourceRefId: string;
    label?: string;
    url?: string;
    redactionApplied: boolean;
    artifactPath: string;
  }>;
};

export type Wc01V2EvidencePreviewExcerpt = {
  excerptId: string;
  sourceRefIds: string[];
  evidenceKind?: string;
  displayLabel?: string;
  boundedText: string;
  hostname?: string;
  redactionApplied: boolean;
  sourceArtifactPath: string;
};

export type Wc01V2EvidencePreviewSourceRef = {
  sourceRefId: string;
  label?: string;
  url?: string;
  artifactPath: string;
  redactionApplied: boolean;
  redactedFields: Array<"label" | "url">;
};

export type Wc01V2EvidencePreviewUnresolvedRef = {
  queueItemId: string;
  refId: string;
  refType: "source_ref" | "display_safe_excerpt";
  reason: "missing" | "ambiguous" | "unsafe";
  reasonCode:
    | "excerpt_id_not_found"
    | "source_ref_id_not_found"
    | "ambiguous_lineage"
    | "unsafe_to_display"
    | "artifact_not_found";
  detail: string;
};

export type Wc01V2EvidencePreviewWarning = {
  queueItemId?: string;
  groupId?: string;
  refId?: string;
  category:
    | "opaque_value_redacted"
    | "opaque_query_param_name_redacted"
    | "source_ref_label_redacted"
    | "source_ref_url_redacted"
    | "bounded_excerpt_value_redacted"
    | "unresolved_ref_not_displayed"
    | "evidence_not_found_fail_closed"
    | "ambiguous_lineage_fail_closed";
  label: string;
  count: number;
  displayDisposition: "displayed_with_redaction" | "omitted_fail_closed";
  warning: string;
  detail: string;
};

export type GenerateEvidencePreviewInput = {
  artifactRoots: string[];
  reviewerPacketPath: string;
};

export type GenerateEvidencePreviewFromPacketInput = {
  artifactRoots: string[];
  reviewerPacket: Wc01V2ManualReviewerPacket;
  reviewerPacketPath: string;
};

type EvidenceIndex = {
  excerptById: Map<string, IndexedEntry<IndexedExcerpt>[]>;
  sourceRefById: Map<string, IndexedEntry<IndexedSourceRef>[]>;
  warnings: Wc01V2EvidencePreviewWarning[];
};

type IndexedEntry<T> = T & {
  contextFindingKey?: string;
  identity: string;
  sourceArtifactPath: string;
};

type IndexedExcerpt = {
  excerptId: string;
  sourceRefIds: string[];
  evidenceKind?: string;
  displayLabel?: string;
  boundedText: string;
  hostname?: string;
  redactionApplied: boolean;
};

type IndexedSourceRef = {
  sourceRefId: string;
  label?: string;
  url?: string;
  redactionApplied: boolean;
  redactedFields: Array<"label" | "url">;
};

const LEGAL_CONCLUSION_PATTERN =
  /\b(gap_observed|violation|violates|illegal|unlawful|noncompliant|non-compliant|non_compliant|breach)\b/i;
const LONG_OPAQUE_VALUE_PATTERN = /\b[A-Za-z0-9_-]{48,}\b/g;
const MAX_BOUNDED_TEXT_LENGTH = 600;
const MAX_REPRESENTATIVE_EXCERPTS_PER_GROUP = 5;
const MAX_REPRESENTATIVE_SOURCE_REFS_PER_GROUP = 10;

export async function generateWc01V2EvidencePreviewPacket(
  input: GenerateEvidencePreviewInput,
): Promise<Wc01V2EvidencePreviewPacket> {
  const raw = await readFile(input.reviewerPacketPath, "utf8");
  const reviewerPacket = parseWc01V2ManualReviewerPacketJson(raw);
  return generateWc01V2EvidencePreviewPacketFromPacket({
    artifactRoots: input.artifactRoots,
    reviewerPacket,
    reviewerPacketPath: input.reviewerPacketPath,
  });
}

export async function generateWc01V2EvidencePreviewPacketFromPacket(
  input: GenerateEvidencePreviewFromPacketInput,
): Promise<Wc01V2EvidencePreviewPacket> {
  const reviewerPacket = input.reviewerPacket;
  const domain = domainForUrl(reviewerPacket.sourceArtifact.sourceUrl) ??
    basename(dirname(input.reviewerPacketPath));
  const siteKey = basename(dirname(input.reviewerPacketPath));
  const artifactFiles = await findSiteArtifactJsonFiles(input.artifactRoots, siteKey, domain);
  const index = await buildEvidenceIndex(artifactFiles);
  const queueItems = reviewerPacket.queueItems.map((item) =>
    buildPreviewQueueItem(item, index)
  );
  const unresolvedEvidenceRefs = queueItems.flatMap((item) => item.unresolvedEvidenceRefs);
  const redactionWarnings = [
    ...index.warnings,
    ...queueItems.flatMap((item) => buildWarningSummariesForQueueItem(item)),
  ];

  const preview: Wc01V2EvidencePreviewPacket = {
    packetVersion: WC01_V2_EVIDENCE_PREVIEW_PACKET_VERSION,
    sourceReviewerPacketPath: input.reviewerPacketPath,
    sourceArtifactRoots: input.artifactRoots,
    sourceUrl: reviewerPacket.sourceArtifact.sourceUrl,
    domain,
    productionEligible: false,
    topFindingEligible: false,
    gapEligible: false,
    status: "evidence_preview_internal_only",
    queueItems,
    unresolvedEvidenceRefs,
    redactionWarnings,
    guardrails: {
      noPersistence: true,
      noProductionConcernPolicyCall: true,
      noUnifiedFindings: true,
      noReportMutation: true,
      noChecklistExecutiveScoringImports: true,
      noCustomerFacingCopy: true,
      noGapObserved: true,
      noLegalConclusionLanguage: true,
      noRawBlockedFields: true,
      noProductionEligibility: true,
      noTopFindingEligibility: true,
      noGapEligibility: true,
    },
  };

  assertPreviewGuardrails(preview);
  return preview;
}

export function parseWc01V2ManualReviewerPacketJson(raw: string): Wc01V2ManualReviewerPacket {
  if (containsForbiddenGapObservedToken(raw)) {
    throw new Error("Wc01V2ManualReviewerPacket contains forbidden gap status token.");
  }
  if (containsBlockedRawFields(raw)) {
    throw new Error("Wc01V2ManualReviewerPacket contains raw blocked evidence fields.");
  }
  if (LEGAL_CONCLUSION_PATTERN.test(raw)) {
    throw new Error("Wc01V2ManualReviewerPacket contains legal-conclusion language.");
  }

  const parsed = JSON.parse(raw) as unknown;
  validateReviewerPacket(parsed);
  return parsed;
}

function buildPreviewQueueItem(
  item: Wc01V2ManualReviewerQueueItem,
  index: EvidenceIndex,
): Wc01V2EvidencePreviewQueueItem {
  const unresolvedEvidenceRefs: Wc01V2EvidencePreviewUnresolvedRef[] = [];
  const resolvedEvidenceExcerpts: Wc01V2EvidencePreviewExcerpt[] = [];
  const resolvedSourceRefs: Wc01V2EvidencePreviewSourceRef[] = [];

  for (const excerptId of item.evidence.displaySafeExcerptIds) {
    const resolved = resolveEntry(index.excerptById.get(excerptId) ?? [], {
      sourceFindingKey: item.sourceFindingKey,
    });
    if (resolved.status === "resolved") {
      resolvedEvidenceExcerpts.push({
        excerptId: resolved.entry.excerptId,
        sourceRefIds: resolved.entry.sourceRefIds,
        evidenceKind: resolved.entry.evidenceKind,
        displayLabel: resolved.entry.displayLabel,
        boundedText: resolved.entry.boundedText,
        hostname: resolved.entry.hostname,
        redactionApplied: resolved.entry.redactionApplied,
        sourceArtifactPath: resolved.entry.sourceArtifactPath,
      });
    } else {
      unresolvedEvidenceRefs.push({
        queueItemId: item.queueItemId,
        refId: excerptId,
        refType: "display_safe_excerpt",
        reason: resolved.status,
        reasonCode: unresolvedReasonCode("display_safe_excerpt", resolved.status),
        detail: resolved.detail,
      });
    }
  }

  for (const sourceRefId of item.evidence.sourceRefIds) {
    const resolved = resolveEntry(index.sourceRefById.get(sourceRefId) ?? [], {
      sourceFindingKey: item.sourceFindingKey,
    });
    if (resolved.status === "resolved") {
      resolvedSourceRefs.push({
        sourceRefId: resolved.entry.sourceRefId,
        label: resolved.entry.label,
        url: resolved.entry.url,
        artifactPath: resolved.entry.sourceArtifactPath,
        redactionApplied: resolved.entry.redactionApplied,
        redactedFields: resolved.entry.redactedFields,
      });
    } else {
      unresolvedEvidenceRefs.push({
        queueItemId: item.queueItemId,
        refId: sourceRefId,
        refType: "source_ref",
        reason: resolved.status,
        reasonCode: unresolvedReasonCode("source_ref", resolved.status),
        detail: resolved.detail,
      });
    }
  }

  const common = {
    candidateFamily: item.candidateFamily,
    confidence: item.evidenceQuality.confidence ?? undefined,
    diagnosticPurposes: item.vendorDiagnostics.diagnosticPurposes,
    directness: item.evidenceQuality.directness ?? undefined,
    supportingPurposes: item.vendorDiagnostics.supportingPurposes,
    vendorLabels: item.vendorDiagnostics.vendorNames,
  };
  const representativeEvidenceGroups = buildRepresentativeEvidenceGroups({
    ...common,
    resolvedEvidenceExcerpts,
    resolvedSourceRefs,
    unresolvedEvidenceRefs,
  });

  return {
    queueItemId: item.queueItemId,
    candidateId: item.candidateId,
    candidateFamily: item.candidateFamily,
    sourceFindingKey: item.sourceFindingKey,
    sourceRowId: item.sourceFindingKey,
    queueLane: item.queueLane,
    sensitiveContextCategories: item.sensitiveContext.categories,
    sourceRefIds: item.evidence.sourceRefIds,
    displaySafeExcerptIds: item.evidence.displaySafeExcerptIds,
    resolvedEvidenceExcerpts,
    resolvedSourceRefs,
    unresolvedEvidenceRefs,
    representativeEvidenceGroups,
    vendorLabels: item.vendorDiagnostics.vendorNames,
    supportingPurposes: item.vendorDiagnostics.supportingPurposes,
    diagnosticPurposes: item.vendorDiagnostics.diagnosticPurposes,
    confidence: item.evidenceQuality.confidence ?? undefined,
    directness: item.evidenceQuality.directness ?? undefined,
    familyEvidenceContext: item.familyEvidenceContext,
    caveats: item.caveats,
    coverageLimitations: item.coverageLimitations,
    productionEligible: false,
    topFindingEligible: false,
    gapEligible: false,
  };
}

function buildRepresentativeEvidenceGroups(input: {
  candidateFamily: string;
  confidence?: string;
  diagnosticPurposes: string[];
  directness?: string;
  resolvedEvidenceExcerpts: Wc01V2EvidencePreviewExcerpt[];
  resolvedSourceRefs: Wc01V2EvidencePreviewSourceRef[];
  supportingPurposes: string[];
  unresolvedEvidenceRefs: Wc01V2EvidencePreviewUnresolvedRef[];
  vendorLabels: string[];
}): Wc01V2EvidencePreviewRepresentativeGroup[] {
  type MutableGroup = {
    keyParts: string[];
    labelParts: string[];
    evidenceKind?: string;
    excerpts: Wc01V2EvidencePreviewExcerpt[];
    sourceRefs: Wc01V2EvidencePreviewSourceRef[];
    unresolved: Wc01V2EvidencePreviewUnresolvedRef[];
  };
  const groups = new Map<string, MutableGroup>();

  const groupFor = (keyParts: string[], labelParts: string[], evidenceKind?: string) => {
    const safeKeyParts = keyParts.map(safeGroupPart);
    const key = safeKeyParts.join("|");
    const existing = groups.get(key);
    if (existing) {
      return existing;
    }
    const group: MutableGroup = {
      keyParts: safeKeyParts,
      labelParts,
      evidenceKind,
      excerpts: [],
      sourceRefs: [],
      unresolved: [],
    };
    groups.set(key, group);
    return group;
  };

  const sourceRefIdsByGroupKey = new Map<string, Set<string>>();
  for (const excerpt of input.resolvedEvidenceExcerpts) {
    const evidenceKind = safeEvidenceKind(excerpt.evidenceKind);
    const host = safeHost(excerpt.hostname) ?? "unknown_host";
    const group = groupFor(
      [
        input.candidateFamily,
        evidenceKind,
        primaryPurpose(input.supportingPurposes),
        host,
      ],
      [
        input.candidateFamily,
        evidenceKind,
        host,
      ],
      evidenceKind,
    );
    group.excerpts.push(excerpt);
    const sourceRefIds = sourceRefIdsByGroupKey.get(group.keyParts.join("|")) ?? new Set<string>();
    for (const sourceRefId of excerpt.sourceRefIds) {
      sourceRefIds.add(sourceRefId);
    }
    sourceRefIdsByGroupKey.set(group.keyParts.join("|"), sourceRefIds);
  }

  for (const sourceRef of input.resolvedSourceRefs) {
    const host = safeHostFromSourceRef(sourceRef) ?? "unknown_host";
    const existingKey = [...sourceRefIdsByGroupKey.entries()]
      .find(([, refIds]) => refIds.has(sourceRef.sourceRefId))?.[0];
    if (existingKey && groups.has(existingKey)) {
      groups.get(existingKey)!.sourceRefs.push(sourceRef);
      continue;
    }
    const group = groupFor(
      [
        input.candidateFamily,
        "source_ref",
        primaryPurpose(input.supportingPurposes),
        host,
      ],
      [
        input.candidateFamily,
        "source_ref",
        host,
      ],
      "source_ref",
    );
    group.sourceRefs.push(sourceRef);
  }

  for (const unresolved of input.unresolvedEvidenceRefs) {
    const group = groupFor(
      [
        input.candidateFamily,
        "unresolved_ref",
        unresolved.reasonCode,
        unresolved.refType,
      ],
      [
        input.candidateFamily,
        unresolved.reasonCode,
        unresolved.refType,
      ],
      "unresolved_ref",
    );
    group.unresolved.push(unresolved);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([groupKey, group], index): Wc01V2EvidencePreviewRepresentativeGroup => {
      const groupId = `group_${index + 1}_${shortHash(groupKey)}`;
      return {
        groupId,
        groupKey,
        groupLabel: group.labelParts.join(" / "),
        family: input.candidateFamily,
        evidenceKind: group.evidenceKind,
        vendorLabels: input.vendorLabels,
        supportingPurposes: input.supportingPurposes,
        diagnosticPurposes: input.diagnosticPurposes,
        confidence: input.confidence,
        directness: input.directness,
        totalResolvedExcerpts: group.excerpts.length,
        totalResolvedSourceRefs: group.sourceRefs.length,
        totalUnresolvedRefs: group.unresolved.length,
        totalRedactionWarnings:
          group.excerpts.filter((excerpt) => excerpt.redactionApplied).length +
          group.sourceRefs.filter((ref) => ref.redactionApplied).length,
        representativeExcerpts: group.excerpts
          .slice(0, MAX_REPRESENTATIVE_EXCERPTS_PER_GROUP)
          .map((excerpt) => ({
            excerptId: excerpt.excerptId,
            boundedText: excerpt.boundedText,
            sourceRefIds: excerpt.sourceRefIds,
            redactionApplied: excerpt.redactionApplied,
            sourceArtifactPath: excerpt.sourceArtifactPath,
          })),
        representativeSourceRefs: group.sourceRefs
          .slice(0, MAX_REPRESENTATIVE_SOURCE_REFS_PER_GROUP)
          .map((ref) => ({
            sourceRefId: ref.sourceRefId,
            label: ref.label,
            url: ref.url,
            redactionApplied: ref.redactionApplied,
            artifactPath: ref.artifactPath,
          })),
      };
    });
}

function buildWarningSummariesForQueueItem(
  item: Wc01V2EvidencePreviewQueueItem,
): Wc01V2EvidencePreviewWarning[] {
  const warnings: Wc01V2EvidencePreviewWarning[] = [];
  const groupsByKey = new Map(item.representativeEvidenceGroups.map((group) => [group.groupKey, group]));
  const groupIdForExcerpt = (excerptId: string) =>
    item.representativeEvidenceGroups.find((group) =>
      group.representativeExcerpts.some((excerpt) => excerpt.excerptId === excerptId)
    )?.groupId;
  const groupIdForSourceRef = (sourceRefId: string) =>
    item.representativeEvidenceGroups.find((group) =>
      group.representativeSourceRefs.some((ref) => ref.sourceRefId === sourceRefId)
    )?.groupId;

  const excerptRedactions = item.resolvedEvidenceExcerpts.filter((excerpt) => excerpt.redactionApplied);
  if (excerptRedactions.length > 0) {
    warnings.push({
      queueItemId: item.queueItemId,
      groupId: groupIdForExcerpt(excerptRedactions[0]!.excerptId),
      category: "bounded_excerpt_value_redacted",
      label: "Bounded excerpt value redacted",
      count: excerptRedactions.length,
      displayDisposition: "displayed_with_redaction",
      warning: "bounded_excerpt_value_redacted",
      detail: "Opaque values were redacted from bounded display-safe excerpt text.",
    });
  }

  const sourceLabelRedactions = item.resolvedSourceRefs.filter((ref) =>
    ref.redactedFields?.includes("label")
  );
  if (sourceLabelRedactions.length > 0) {
    warnings.push({
      queueItemId: item.queueItemId,
      groupId: groupIdForSourceRef(sourceLabelRedactions[0]!.sourceRefId),
      category: "source_ref_label_redacted",
      label: "Source ref label redacted",
      count: sourceLabelRedactions.length,
      displayDisposition: "displayed_with_redaction",
      warning: "source_ref_label_redacted",
      detail: "Opaque values were redacted from source ref labels.",
    });
  }

  const sourceUrlRedactions = item.resolvedSourceRefs.filter((ref) =>
    ref.redactedFields?.includes("url")
  );
  if (sourceUrlRedactions.length > 0) {
    warnings.push({
      queueItemId: item.queueItemId,
      groupId: groupIdForSourceRef(sourceUrlRedactions[0]!.sourceRefId),
      category: "source_ref_url_redacted",
      label: "Source ref URL redacted",
      count: sourceUrlRedactions.length,
      displayDisposition: "displayed_with_redaction",
      warning: "source_ref_url_redacted",
      detail: "Opaque values were redacted from source ref URLs.",
    });
  }

  const unresolvedByReason = new Map<
    Wc01V2EvidencePreviewUnresolvedRef["reasonCode"],
    Wc01V2EvidencePreviewUnresolvedRef[]
  >();
  for (const unresolved of item.unresolvedEvidenceRefs) {
    const key = unresolved.reasonCode;
    const refs = unresolvedByReason.get(key) ?? [];
    refs.push(unresolved);
    unresolvedByReason.set(key, refs);
  }
  for (const [reasonCode, refs] of [...unresolvedByReason.entries()].sort()) {
    const category = reasonCode === "ambiguous_lineage"
      ? "ambiguous_lineage_fail_closed"
      : "evidence_not_found_fail_closed";
    const groupKey = [
      item.candidateFamily,
      "unresolved_ref",
      reasonCode,
      refs[0]?.refType ?? "unknown",
    ].map(safeGroupPart).join("|");
    warnings.push({
      queueItemId: item.queueItemId,
      groupId: groupsByKey.get(groupKey)?.groupId,
      category,
      label: reasonLabel(reasonCode),
      count: refs.length,
      displayDisposition: "omitted_fail_closed",
      warning: category,
      detail: "Evidence refs were not displayed because matching safe evidence could not be resolved.",
    });
  }

  return warnings;
}

async function findSiteArtifactJsonFiles(artifactRoots: string[], siteKey: string, domain?: string) {
  const files = new Set<string>();
  for (const root of artifactRoots) {
    if (!await exists(root)) {
      throw new Error(`Artifact root does not exist: ${root}`);
    }
    const candidates = uniqueStrings([
      join(root, siteKey),
      domain ? join(root, domain) : undefined,
      root.endsWith(siteKey) || (domain && root.endsWith(domain)) ? root : undefined,
    ]);
    for (const candidate of candidates) {
      if (await exists(candidate)) {
        for (const file of await findJsonFiles(candidate)) {
          files.add(file);
        }
      }
    }
  }
  return [...files].sort();
}

async function buildEvidenceIndex(files: string[]): Promise<EvidenceIndex> {
  const index: EvidenceIndex = {
    excerptById: new Map(),
    sourceRefById: new Map(),
    warnings: [],
  };

  for (const file of files) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(file, "utf8"));
    } catch {
      continue;
    }
    collectEvidence(parsed, file, index);
  }

  return index;
}

function collectEvidence(
  value: unknown,
  sourceArtifactPath: string,
  index: EvidenceIndex,
  context: { sourceFindingKey?: string } = {},
) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectEvidence(item, sourceArtifactPath, index, context);
    }
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  const nextContext = contextForRecord(value, context);

  const excerpt = indexedExcerpt(value, sourceArtifactPath, nextContext);
  if (excerpt) {
    addIndexEntry(index.excerptById, excerpt.excerptId, excerpt);
  }

  const sourceRef = indexedSourceRef(value, sourceArtifactPath, nextContext);
  if (sourceRef) {
    addIndexEntry(index.sourceRefById, sourceRef.sourceRefId, sourceRef);
  }
  if (Array.isArray(value.sourceRefIds)) {
    for (const sourceRefId of value.sourceRefIds.filter(isString)) {
      addIndexEntry(index.sourceRefById, sourceRefId, {
        contextFindingKey: nextContext.sourceFindingKey,
        sourceRefId,
        redactionApplied: false,
        redactedFields: [],
        identity: JSON.stringify({ sourceRefId }),
        sourceArtifactPath,
      });
    }
  }

  for (const child of Object.values(value)) {
    collectEvidence(child, sourceArtifactPath, index, nextContext);
  }
}

function indexedExcerpt(
  value: Record<string, unknown>,
  sourceArtifactPath: string,
  context: { sourceFindingKey?: string },
): IndexedEntry<IndexedExcerpt> | null {
  if (typeof value.excerptId !== "string") {
    return null;
  }
  const rawText = firstString([
    value.displayValueRedacted,
    value.displayText,
    value.text,
    value.displayLabel,
  ]);
  if (!rawText) {
    return null;
  }
  const sanitized = sanitizeBoundedText(rawText);
  const sourceRefIds = uniqueStrings([
    ...(typeof value.sourceRefId === "string" ? [value.sourceRefId] : []),
    ...(typeof value.sourceEventId === "string" ? [`ref_${value.sourceEventId}`] : []),
    ...(Array.isArray(value.sourceRefIds) ? value.sourceRefIds.filter(isString) : []),
  ]);
  const excerpt: IndexedExcerpt = {
    excerptId: value.excerptId,
    sourceRefIds,
    evidenceKind: typeof value.evidenceKind === "string" ? value.evidenceKind : undefined,
    displayLabel: typeof value.displayLabel === "string" ? sanitizeBoundedText(value.displayLabel).text : undefined,
    boundedText: sanitized.text,
    hostname: typeof value.hostname === "string" ? sanitizeBoundedText(value.hostname).text : undefined,
    redactionApplied: sanitized.redactionApplied,
  };
  return {
    ...excerpt,
    contextFindingKey: context.sourceFindingKey,
    identity: JSON.stringify({
      excerptId: excerpt.excerptId,
      evidenceKind: excerpt.evidenceKind,
      displayLabel: excerpt.displayLabel,
      boundedText: excerpt.boundedText,
      hostname: excerpt.hostname,
    }),
    sourceArtifactPath,
  };
}

function indexedSourceRef(
  value: Record<string, unknown>,
  sourceArtifactPath: string,
  context: { sourceFindingKey?: string },
): IndexedEntry<IndexedSourceRef> | null {
  const refId = typeof value.refId === "string"
    ? value.refId
    : typeof value.sourceRefId === "string"
      ? value.sourceRefId
      : null;
  if (!refId) {
    return null;
  }
  const label = typeof value.label === "string" ? sanitizeBoundedText(value.label) : null;
  const url = typeof value.url === "string" ? sanitizeBoundedText(value.url) : null;
  if (!label && !url) {
    return null;
  }
  const sourceRef: IndexedSourceRef = {
    sourceRefId: refId,
    label: label?.text,
    url: url?.text,
    redactionApplied: Boolean(label?.redactionApplied || url?.redactionApplied),
    redactedFields: [
      ...(label?.redactionApplied ? ["label" as const] : []),
      ...(url?.redactionApplied ? ["url" as const] : []),
    ],
  };
  return {
    ...sourceRef,
    contextFindingKey: context.sourceFindingKey,
    identity: JSON.stringify({
      sourceRefId: sourceRef.sourceRefId,
      label: sourceRef.label,
      url: sourceRef.url,
    }),
    sourceArtifactPath,
  };
}

function resolveEntry<T extends { identity: string; sourceArtifactPath?: string }>(
  entries: Array<T>,
  context: { sourceFindingKey?: string } = {},
): { status: "resolved"; entry: T } | { status: "missing" | "ambiguous"; detail: string } {
  if (entries.length === 0) {
    return { status: "missing", detail: "No matching safe evidence object found." };
  }
  const richEntries = entries.filter((entry) =>
    ("label" in entry && typeof entry.label === "string") ||
    ("url" in entry && typeof entry.url === "string")
  );
  const candidatesBeforeContext = richEntries.length > 0 ? richEntries : entries;
  const contextMatched = context.sourceFindingKey
    ? candidatesBeforeContext.filter((entry) =>
      "contextFindingKey" in entry && entry.contextFindingKey === context.sourceFindingKey
    )
    : [];
  const candidates = contextMatched.length > 0 ? contextMatched : candidatesBeforeContext;
  const preferredCandidates = preferNormalizedShadowEntries(candidates);
  const byIdentity = new Map<string, T>();
  for (const entry of preferredCandidates) {
    byIdentity.set(entry.identity, entry);
  }
  if (byIdentity.size > 1) {
    return {
      status: "ambiguous",
      detail: "Multiple non-equivalent evidence objects matched the same ref ID.",
    };
  }
  return { status: "resolved", entry: [...byIdentity.values()][0]! };
}

function preferNormalizedShadowEntries<T extends { sourceArtifactPath?: string }>(entries: T[]) {
  const normalizedShadowEntries = entries.filter((entry) =>
    typeof entry.sourceArtifactPath === "string" &&
    entry.sourceArtifactPath.includes("v2-wc01-shadow") &&
    entry.sourceArtifactPath.endsWith("Wc01V2ShadowProjection.json")
  );
  return normalizedShadowEntries.length > 0 ? normalizedShadowEntries : entries;
}

function contextForRecord(
  value: Record<string, unknown>,
  context: { sourceFindingKey?: string },
) {
  const sourceFindingKey = firstString([
    value.sourceFindingKey,
    value.findingKey,
  ]);
  return {
    sourceFindingKey: sourceFindingKey ?? context.sourceFindingKey,
  };
}

function addIndexEntry<T extends { identity: string }>(
  map: Map<string, T[]>,
  key: string,
  entry: T,
) {
  const entries = map.get(key) ?? [];
  entries.push(entry);
  map.set(key, entries);
}

function validateReviewerPacket(value: unknown): asserts value is Wc01V2ManualReviewerPacket {
  if (!isRecord(value)) {
    throw new Error("Wc01V2ManualReviewerPacket must be a JSON object.");
  }
  if (value.packetVersion !== WC01_V2_MANUAL_REVIEWER_PACKET_VERSION) {
    throw new Error("Unsupported Wc01V2ManualReviewerPacket version.");
  }
  if (value.productionEligible !== false || value.topFindingEligible !== false || value.gapEligible !== false) {
    throw new Error("Wc01V2ManualReviewerPacket contains forbidden eligibility.");
  }
  if (!Array.isArray(value.queueItems)) {
    throw new Error("Wc01V2ManualReviewerPacket.queueItems must be an array.");
  }
  if (!isRecord(value.guardrails)) {
    throw new Error("Wc01V2ManualReviewerPacket.guardrails must be an object.");
  }
  const guardrailFailures = Object.entries(value.guardrails)
    .filter(([, passed]) => passed !== true)
    .map(([key]) => key);
  if (guardrailFailures.length > 0) {
    throw new Error(`Wc01V2ManualReviewerPacket guardrails failed: ${guardrailFailures.join(", ")}.`);
  }
}

function assertPreviewGuardrails(preview: Wc01V2EvidencePreviewPacket) {
  const serialized = JSON.stringify(preview);
  if (containsForbiddenGapObservedToken(serialized)) {
    throw new Error("Evidence preview contains forbidden gap status token.");
  }
  if (containsBlockedRawFields(serialized)) {
    throw new Error("Evidence preview contains raw blocked evidence fields.");
  }
  if (LEGAL_CONCLUSION_PATTERN.test(serialized)) {
    throw new Error("Evidence preview contains legal-conclusion language.");
  }
  if (preview.productionEligible || preview.topFindingEligible || preview.gapEligible) {
    throw new Error("Evidence preview contains forbidden eligibility.");
  }
  if (preview.queueItems.some((item) => item.productionEligible || item.topFindingEligible || item.gapEligible)) {
    throw new Error("Evidence preview contains eligible queue items.");
  }
  for (const item of preview.queueItems) {
    for (const excerpt of item.resolvedEvidenceExcerpts) {
      if (excerpt.boundedText.length > MAX_BOUNDED_TEXT_LENGTH) {
        throw new Error("Evidence preview contains unbounded evidence text.");
      }
    }
  }
}

async function findJsonFiles(root: string) {
  const results: string[] = [];
  async function walk(current: string) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        results.push(entryPath);
      }
    }
  }
  await walk(root);
  return results.sort();
}

async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function sanitizeBoundedText(value: string) {
  let text = value.replace(LONG_OPAQUE_VALUE_PATTERN, "<redacted_opaque_value>");
  let redactionApplied = text !== value;
  if (text.length > MAX_BOUNDED_TEXT_LENGTH) {
    text = `${text.slice(0, MAX_BOUNDED_TEXT_LENGTH)}...`;
    redactionApplied = true;
  }
  return { text, redactionApplied };
}

function unresolvedReasonCode(
  refType: Wc01V2EvidencePreviewUnresolvedRef["refType"],
  reason: Wc01V2EvidencePreviewUnresolvedRef["reason"],
): Wc01V2EvidencePreviewUnresolvedRef["reasonCode"] {
  if (reason === "ambiguous") {
    return "ambiguous_lineage";
  }
  if (reason === "unsafe") {
    return "unsafe_to_display";
  }
  return refType === "display_safe_excerpt"
    ? "excerpt_id_not_found"
    : "source_ref_id_not_found";
}

function reasonLabel(reasonCode: Wc01V2EvidencePreviewUnresolvedRef["reasonCode"]) {
  switch (reasonCode) {
    case "ambiguous_lineage":
      return "Ambiguous evidence lineage";
    case "artifact_not_found":
      return "Artifact not found";
    case "excerpt_id_not_found":
      return "Excerpt ID not found";
    case "source_ref_id_not_found":
      return "Source ref ID not found";
    case "unsafe_to_display":
      return "Unsafe to display";
  }
}

function primaryPurpose(purposes: string[]) {
  return purposes[0] ?? "unknown_purpose";
}

function safeEvidenceKind(value: string | undefined) {
  return safeGroupPart(value ?? "unknown_evidence");
}

function safeHost(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  const lower = value.toLowerCase().replace(/^https?:\/\//, "").split(/[/?#]/)[0];
  if (!lower || !/^[a-z0-9.-]+$/.test(lower)) {
    return "redacted_or_unknown_host";
  }
  return lower.replace(/^www\./, "");
}

function safeHostFromSourceRef(ref: Wc01V2EvidencePreviewSourceRef) {
  for (const value of [ref.url, ref.label]) {
    const host = safeHostFromUrlLike(value);
    if (host) {
      return host;
    }
  }
  return undefined;
}

function safeHostFromUrlLike(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  try {
    return safeHost(new URL(value).hostname);
  } catch {
    const match = value.match(/\b([a-z0-9.-]+\.[a-z]{2,})(?:[/:?#]|$)/i);
    return safeHost(match?.[1]);
  }
}

function safeGroupPart(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/<redacted_opaque_value>/g, "redacted")
    .replace(/[^a-z0-9_.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!normalized || normalized.length > 80 || /\b[A-Za-z0-9_-]{48,}\b/.test(normalized)) {
    return "redacted_or_unknown";
  }
  return normalized;
}

function shortHash(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function domainForUrl(url: string | undefined) {
  if (!url) {
    return undefined;
  }
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function firstString(values: unknown[]) {
  return values.find((value): value is string =>
    typeof value === "string" && value.trim().length > 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function uniqueStrings(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string =>
    typeof value === "string" && value.trim().length > 0
  ))].sort();
}

export function siteKeyForReviewerPacketPath(inputDir: string, inputPath: string) {
  const relativeDir = dirname(relative(inputDir, inputPath));
  return relativeDir === "." ? "root" : relativeDir.split(/[\\/]+/g).join("/");
}

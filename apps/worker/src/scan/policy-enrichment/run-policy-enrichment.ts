import { randomUUID } from "node:crypto";
import { createAdminClient } from "@website-signal-risk-scanner/db";
import type { PolicyEnrichment, PolicyReviewQueueItem } from "@website-signal-risk-scanner/shared";
import type { StaticPageResult } from "../snapshot/types";
import { chunkPolicyText } from "./chunk";
import { buildPolicyEvidenceRecords } from "./evidence";
import { createPolicyLlmClient, loadPolicyPrompt, POLICY_EXTRACTION_CONFIG } from "./llm-client";
import { mergePolicyChunkExtractions } from "./merge";
import { ruleBasedPolicyPreprocess } from "./rules";
import { validatePolicyChunkJson } from "./schema";
import type { EnrichPolicyPagesInput, PolicyEnrichmentBundle, PolicyLlmClient } from "./types";

const CONFIDENCE_THRESHOLD_HIGH = 0.8;
const CONFIDENCE_THRESHOLD_MODERATE = 0.6;

async function getCachedPolicyEnrichment(input: { normalizedPolicyHash: string }) {
  let supabase;
  try {
    supabase = createAdminClient();
  } catch {
    return null;
  }
  const { data } = await supabase
    .from("policy_enrichment")
    .select("*")
    .eq("normalized_policy_hash", input.normalizedPolicyHash)
    .eq("policy_ai_model", POLICY_EXTRACTION_CONFIG.model)
    .eq("policy_ai_model_version", POLICY_EXTRACTION_CONFIG.modelVersion)
    .eq("policy_ai_prompt_version", POLICY_EXTRACTION_CONFIG.promptVersion)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as Record<string, unknown> | null) ?? null;
}

function shouldRunLlm(input: {
  forceLlm?: boolean;
  hasClient: boolean;
  isArchive: boolean;
  needLlm: boolean;
}) {
  if (!input.hasClient) {
    return false;
  }

  if (input.forceLlm) {
    return true;
  }

  if (!input.isArchive) {
    return true;
  }

  return input.needLlm;
}

function buildPolicyEvidenceSnippetMap(input: {
  chunkSnippets: Array<Record<string, string | null>>;
  ruleSnippets: Record<string, string>;
}) {
  const merged: Record<string, string | null> = {};

  for (const [key, value] of Object.entries(input.ruleSnippets)) {
    merged[key] = value;
  }

  for (const snippetMap of input.chunkSnippets) {
    for (const [key, value] of Object.entries(snippetMap)) {
      if (!merged[key] && value) {
        merged[key] = value;
      }
    }
  }

  return merged;
}

function buildChunkSnippetMap(chunkExtraction: ReturnType<typeof validatePolicyChunkJson>) {
  return {
    dsar: chunkExtraction.dsarMechanism.snippet,
    do_not_sell: chunkExtraction.doNotSell.snippet,
    gdpr: chunkExtraction.mentionsGdpr.snippet,
    children: chunkExtraction.childrenReference.snippet,
    retention: chunkExtraction.retentionStatements[0]?.snippet ?? null,
    transfer: chunkExtraction.transferMechanisms[0]?.snippet ?? null
  };
}

function maybeQueueReview(input: {
  enrichment: PolicyEnrichment;
  euExposureLikely: boolean;
  californiaExposureLikely: boolean;
  sessionReplayWithoutDisclosureDetected: boolean;
}) {
  const reasons: string[] = [];

  if (input.enrichment.policyBehaviorConflictCandidate) {
    reasons.push("policy_behavior_conflict_candidate");
  }

  if (input.sessionReplayWithoutDisclosureDetected) {
    reasons.push("session_replay_without_disclosure_detected");
  }

  if (
    input.enrichment.policyDsarMechanism === "absent" &&
    (input.euExposureLikely || input.californiaExposureLikely)
  ) {
    reasons.push("missing_dsar_high_exposure");
  }

  if (input.enrichment.policySemanticConfidence !== null && input.enrichment.policySemanticConfidence < CONFIDENCE_THRESHOLD_MODERATE) {
    reasons.push("low_confidence_critical_fields");
  }

  return reasons.map((reason) => ({
    id: randomUUID(),
    policyEnrichmentId: input.enrichment.id,
    scanId: input.enrichment.scanId,
    reason,
    assignedTo: null,
    reviewStatus: "pending",
    reviewerNotes: null,
    reviewedAt: null,
    reviewVerdict: null
  } satisfies PolicyReviewQueueItem));
}

async function extractChunkWithLlm(input: {
  chunkText: string;
  chunkId: string;
  llmClient: PolicyLlmClient;
}) {
  const promptText = loadPolicyPrompt("policy_extraction_v1.txt");
  const response = await input.llmClient.extractPolicyChunk({
    chunk: {
      chunkId: input.chunkId,
      offsetStart: 0,
      offsetEnd: input.chunkText.length,
      text: input.chunkText
    },
    promptName: "policy_extraction_v1.txt",
    promptText
  });

  return {
    extraction: validatePolicyChunkJson({
      chunkText: input.chunkText,
      rawJson: response.rawJson
    }),
    meta: response
  };
}

function buildPolicyMentionsFromRuleResult(pageType: StaticPageResult["pageType"], topics: ReturnType<typeof ruleBasedPolicyPreprocess>["mentions"]) {
  return topics.map((topic) => ({
    confidence: topic.confidence,
    topic: pageType === "cookie_policy" ? `cookie_${topic.topic}` : topic.topic
  }));
}

function toCachedEnrichment(input: {
  cached: Record<string, unknown>;
  page: StaticPageResult;
  scanId: string;
}): PolicyEnrichment {
  return {
    id: randomUUID(),
    scanId: input.scanId,
    pageType: input.page.pageType,
    pageUrl: input.page.pageUrl,
    normalizedPolicyHash: String(input.cached.normalized_policy_hash ?? ""),
    policySummaryShort: (input.cached.policy_summary_short as string | null) ?? null,
    privacyContactChannelType: (input.cached.privacy_contact_channel_type as PolicyEnrichment["privacyContactChannelType"]) ?? null,
    policyRetentionDisclosure: (input.cached.policy_retention_disclosure as PolicyEnrichment["policyRetentionDisclosure"]) ?? null,
    policyClaimNoSale: (input.cached.policy_claim_no_sale as boolean | null) ?? null,
    policyClaimNoTracking: (input.cached.policy_claim_no_tracking as boolean | null) ?? null,
    policyClaimPrivacyProtective: (input.cached.policy_claim_privacy_protective as boolean | null) ?? null,
    policyMentions: Array.isArray(input.cached.policy_mentions) ? (input.cached.policy_mentions as PolicyEnrichment["policyMentions"]) : [],
    policyDataCategories: Array.isArray(input.cached.policy_data_categories) ? (input.cached.policy_data_categories as string[]) : [],
    policyRetentionPeriods: Array.isArray(input.cached.policy_retention_periods)
      ? (input.cached.policy_retention_periods as PolicyEnrichment["policyRetentionPeriods"])
      : [],
    policyDsarMechanism: (input.cached.policy_dsar_mechanism as PolicyEnrichment["policyDsarMechanism"]) ?? "unknown",
    policyDsarConfidence: (input.cached.policy_dsar_confidence as number | null) ?? null,
    policyDoNotSell: (input.cached.policy_do_not_sell as PolicyEnrichment["policyDoNotSell"]) ?? "unknown",
    policyDoNotSellConfidence: (input.cached.policy_do_not_sell_confidence as number | null) ?? null,
    policySubprocessorsListed: (input.cached.policy_subprocessors_listed as boolean | null) ?? null,
    policyTransferMechanisms: Array.isArray(input.cached.policy_transfer_mechanisms)
      ? (input.cached.policy_transfer_mechanisms as PolicyEnrichment["policyTransferMechanisms"])
      : [],
    policyChildrenReference: (input.cached.policy_children_reference as PolicyEnrichment["policyChildrenReference"]) ?? "unknown",
    policyAmbiguityScore: (input.cached.policy_ambiguity_score as number | null) ?? null,
    policyBehaviorConflictCandidate: (input.cached.policy_behavior_conflict_candidate as boolean | null) ?? null,
    policyActionableFlags: Array.isArray(input.cached.policy_actionable_flags) ? (input.cached.policy_actionable_flags as string[]) : [],
    policyEvidenceSnippets:
      input.cached.policy_evidence_snippets && typeof input.cached.policy_evidence_snippets === "object"
        ? (input.cached.policy_evidence_snippets as Record<string, string | string[] | null>)
        : {},
    policySemanticConfidence: (input.cached.policy_semantic_confidence as number | null) ?? null,
    policyAiModel: (input.cached.policy_ai_model as string | null) ?? POLICY_EXTRACTION_CONFIG.model,
    policyAiModelVersion: (input.cached.policy_ai_model_version as string | null) ?? POLICY_EXTRACTION_CONFIG.modelVersion,
    policyAiPromptVersion: (input.cached.policy_ai_prompt_version as string | null) ?? POLICY_EXTRACTION_CONFIG.promptVersion,
    policyAiRunAt: (input.cached.policy_ai_run_at as string | null) ?? null,
    archiveSource: null
  };
}

export async function enrichPolicyPages(input: EnrichPolicyPagesInput): Promise<PolicyEnrichmentBundle> {
  const llmClient = createPolicyLlmClient();
  const evidences = new Map<string, ReturnType<typeof buildPolicyEvidenceRecords>["evidences"][number]>();
  const enrichments: PolicyEnrichment[] = [];
  const reviewQueueItems: PolicyReviewQueueItem[] = [];
  let primaryPolicyEnrichmentId: string | null = null;
  const snapshotOverrides: PolicyEnrichmentBundle["snapshotOverrides"] = {};

  for (const page of input.pages.filter((candidate) =>
    ["privacy_policy", "terms_of_service", "cookie_policy"].includes(candidate.pageType)
  )) {
    const ruleResult = ruleBasedPolicyPreprocess({
      html: page.html,
      text: page.textContent
    });
    const cachedEnrichment = await getCachedPolicyEnrichment({
      normalizedPolicyHash: ruleResult.normalizedPolicyHash
    });
    if (cachedEnrichment) {
      const explicitSessionReplayDisclosure = Array.isArray(cachedEnrichment.policy_mentions)
        ? (cachedEnrichment.policy_mentions as Array<{ topic?: string; confidence?: number }>).some(
            (mention) => mention.topic === "session_replay_disclosure" && Number(mention.confidence ?? 0) >= CONFIDENCE_THRESHOLD_MODERATE
          )
        : false;
      const cached = toCachedEnrichment({
        cached: cachedEnrichment,
        page,
        scanId: input.scanId
      });
      const cachedConflict =
        Boolean(cached.policyClaimNoSale) && input.advertisingTrackerCount > 0;
      const cachedSessionReplayWithoutDisclosure = input.sessionReplayTrackerCount > 0 && !explicitSessionReplayDisclosure;
      cached.policyBehaviorConflictCandidate = cachedConflict;
      cached.policyActionableFlags = Array.from(
        new Set([
          ...cached.policyActionableFlags,
          ...(cachedConflict ? ["policy_behavior_conflict_candidate"] : []),
          ...(cachedSessionReplayWithoutDisclosure ? ["session_replay_undisclosed"] : [])
        ])
      ).sort();
      enrichments.push(cached);
      reviewQueueItems.push(
        ...maybeQueueReview({
          enrichment: cached,
          euExposureLikely: input.euExposureLikely,
          californiaExposureLikely: input.californiaExposureLikely,
          sessionReplayWithoutDisclosureDetected: cachedSessionReplayWithoutDisclosure
        })
      );

      if (page.pageType === "privacy_policy" && primaryPolicyEnrichmentId === null) {
        primaryPolicyEnrichmentId = cached.id;
        snapshotOverrides.policyEnrichmentId = cached.id;
        snapshotOverrides.privacyPolicyHash = cached.normalizedPolicyHash;
        snapshotOverrides.mentionsGdpr = cached.policyMentions.some((mention) => mention.topic === "gdpr" && mention.confidence >= CONFIDENCE_THRESHOLD_MODERATE);
        snapshotOverrides.dsarRequestMechanismPresent = cached.policyDsarMechanism === "present" || cached.policyDsarMechanism === "partial";
        snapshotOverrides.dataAccessRequestPresent = cached.policyActionableFlags.includes("data_access_request_present");
        snapshotOverrides.dataDeletionRequestPresent = cached.policyActionableFlags.includes("data_deletion_request_present");
        snapshotOverrides.privacyContactChannelType = cached.privacyContactChannelType ?? "none";
        snapshotOverrides.mentionsCrossBorderTransfer = cached.policyMentions.some(
          (mention) => mention.topic === "cross_border_transfer" && mention.confidence >= CONFIDENCE_THRESHOLD_MODERATE
        );
        snapshotOverrides.mentionsDataRetention = cached.policyMentions.some((mention) => mention.topic === "data_retention");
        snapshotOverrides.dataRetentionSpecificPeriodDetected = cached.policyRetentionDisclosure === "specific";
        snapshotOverrides.mentionsSensitiveData = cached.policyMentions.some((mention) => mention.topic === "sensitive_data");
        snapshotOverrides.mentionsUnder13 = cached.policyChildrenReference === "under_13";
        snapshotOverrides.mentionsUnder16 = cached.policyChildrenReference === "under_16";
        snapshotOverrides.policyBehaviorConflictDetected = cachedConflict;
        snapshotOverrides.sessionReplayWithoutDisclosureDetected = cachedSessionReplayWithoutDisclosure;
      }
      continue;
    }

    const runLlm = shouldRunLlm({
      forceLlm: input.forceLlm,
      hasClient: Boolean(llmClient),
      isArchive: false,
      needLlm: ruleResult.needLlm
    });

    let chunkExtractions: Array<ReturnType<typeof validatePolicyChunkJson>> = [];
    let modelMeta: { model: string | null; modelVersion: string | null; promptVersion: string | null } = {
      model: null,
      modelVersion: null,
      promptVersion: null
    };
    const llmChunkSnippetMaps: Array<Record<string, string | null>> = [];
    let invalidJsonFallback = false;

    if (runLlm && llmClient) {
      const chunks = chunkPolicyText({
        text: ruleResult.normalizedText
      });

      for (const chunk of chunks) {
        try {
          const result = await extractChunkWithLlm({
            chunkId: chunk.chunkId,
            chunkText: chunk.text,
            llmClient
          });

          chunkExtractions.push(result.extraction);
          llmChunkSnippetMaps.push(buildChunkSnippetMap(result.extraction));
          modelMeta = {
            model: result.meta.model,
            modelVersion: result.meta.modelVersion,
            promptVersion: result.meta.promptVersion
          };
        } catch {
          invalidJsonFallback = true;
          chunkExtractions = [];
          break;
        }
      }
    }

    const merged =
      chunkExtractions.length > 0
        ? mergePolicyChunkExtractions({
            chunkExtractions,
            highThreshold: CONFIDENCE_THRESHOLD_HIGH,
            moderateThreshold: CONFIDENCE_THRESHOLD_MODERATE,
            ruleResult
          })
        : {
            policyActionableFlags: Array.from(new Set([...ruleResult.actionableFlags, ...(invalidJsonFallback ? ["invalid_llm_json", "low_confidence"] : [])])),
            policyAmbiguityScore: ruleResult.needLlm ? 68 : 34,
            policyChildrenReference: ruleResult.childrenReference,
            privacyContactChannelType: ruleResult.privacyContactChannelType,
            policyRetentionDisclosure: ruleResult.retentionDisclosure,
            policyClaimNoSale: ruleResult.policyClaimNoSale,
            policyClaimNoTracking: ruleResult.policyClaimNoTracking,
            policyClaimPrivacyProtective: ruleResult.policyClaimPrivacyProtective,
            policyDataCategories: ruleResult.dataCategories,
            dataAccessRequestPresent: ruleResult.dataAccessRequestPresent,
            dataDeletionRequestPresent: ruleResult.dataDeletionRequestPresent,
            policyDoNotSell: ruleResult.doNotSell,
            policyDoNotSellConfidence: ruleResult.doNotSell === "unknown" ? 0 : ruleResult.doNotSell === "absent" ? 0.55 : 0.76,
            policyDsarConfidence: ruleResult.dsarMechanism === "present" ? 0.78 : ruleResult.dsarMechanism === "partial" ? 0.62 : 0.45,
            policyDsarMechanism: ruleResult.dsarMechanism,
            policyMentions: buildPolicyMentionsFromRuleResult(page.pageType, ruleResult.mentions),
            policyRetentionPeriods: ruleResult.retentionStatements,
            policySemanticConfidence: ruleResult.semanticConfidence,
            policySubprocessorsListed: ruleResult.mentions.some((mention) => mention.topic === "cross_border_transfer") ? true : null,
            policySummaryShort: ruleResult.summary,
            policyTransferMechanisms: ruleResult.transferMechanisms
          };

    const policyBehaviorConflictCandidate = Boolean(merged.policyClaimNoSale) && input.advertisingTrackerCount > 0;
    const explicitSessionReplayDisclosure = merged.policyMentions.some(
      (mention) => mention.topic === "session_replay_disclosure" && mention.confidence >= CONFIDENCE_THRESHOLD_MODERATE
    );
    const sessionReplayWithoutDisclosureDetected = input.sessionReplayTrackerCount > 0 && !explicitSessionReplayDisclosure;
    const policyEvidence = buildPolicyEvidenceRecords({
      pageUrl: page.pageUrl,
      snippets: buildPolicyEvidenceSnippetMap({
        chunkSnippets: llmChunkSnippetMaps,
        ruleSnippets: ruleResult.evidenceSnippets
      })
    });

    for (const evidence of policyEvidence.evidences) {
      evidences.set(evidence.evidenceHash, evidence);
    }

    const enrichment: PolicyEnrichment = {
      id: randomUUID(),
      scanId: input.scanId,
      pageType: page.pageType,
      pageUrl: page.pageUrl,
      normalizedPolicyHash: ruleResult.normalizedPolicyHash,
      policySummaryShort: merged.policySummaryShort,
      privacyContactChannelType: merged.privacyContactChannelType,
      policyRetentionDisclosure: merged.policyRetentionDisclosure,
      policyClaimNoSale: merged.policyClaimNoSale,
      policyClaimNoTracking: merged.policyClaimNoTracking,
      policyClaimPrivacyProtective: merged.policyClaimPrivacyProtective,
      policyMentions: merged.policyMentions,
      policyDataCategories: merged.policyDataCategories,
      policyRetentionPeriods: merged.policyRetentionPeriods.map((item) => ({
        category: item.category,
        confidence: item.confidence,
        periodText: item.periodText,
        snippetHash:
          ("snippetHash" in item ? item.snippetHash : null) ?? policyEvidence.references[`retention:${item.periodText.slice(0, 24)}`] ?? null
      })),
      policyDsarMechanism: merged.policyDsarMechanism,
      policyDsarConfidence: merged.policyDsarConfidence,
      policyDoNotSell: merged.policyDoNotSell,
      policyDoNotSellConfidence: merged.policyDoNotSellConfidence,
      policySubprocessorsListed: merged.policySubprocessorsListed,
      policyTransferMechanisms: merged.policyTransferMechanisms.map((item) => ({
        mechanism: item.mechanism,
        confidence: item.confidence,
        snippetHash: ("snippetHash" in item ? item.snippetHash : null) ?? policyEvidence.references.transfer ?? null
      })),
      policyChildrenReference: merged.policyChildrenReference,
      policyAmbiguityScore: merged.policyAmbiguityScore,
      policyBehaviorConflictCandidate,
      policyActionableFlags: Array.from(
        new Set([
          ...merged.policyActionableFlags,
          ...(policyBehaviorConflictCandidate ? ["policy_behavior_conflict_candidate"] : []),
          ...(input.sessionReplayTrackerCount > 0 && !explicitSessionReplayDisclosure ? ["session_replay_undisclosed"] : [])
        ])
      ).sort(),
      policyEvidenceSnippets: policyEvidence.references,
      policySemanticConfidence: merged.policySemanticConfidence,
      policyAiModel: modelMeta.model,
      policyAiModelVersion: modelMeta.modelVersion,
      policyAiPromptVersion: modelMeta.promptVersion,
      policyAiRunAt: runLlm ? new Date().toISOString() : null,
      archiveSource: input.archiveSource ?? null
    };

    enrichments.push(enrichment);
    reviewQueueItems.push(
      ...maybeQueueReview({
        enrichment,
        euExposureLikely: input.euExposureLikely,
        californiaExposureLikely: input.californiaExposureLikely,
        sessionReplayWithoutDisclosureDetected
      })
    );

    if (page.pageType === "privacy_policy" && primaryPolicyEnrichmentId === null) {
      primaryPolicyEnrichmentId = enrichment.id;
      snapshotOverrides.policyEnrichmentId = enrichment.id;
      snapshotOverrides.privacyPolicyHash = enrichment.normalizedPolicyHash;
      snapshotOverrides.privacyPolicyLastUpdatedFound = ruleResult.updateDate;
      snapshotOverrides.privacyPolicyLastUpdatedDate = ruleResult.updateDate;
      snapshotOverrides.mentionsGdpr = enrichment.policyMentions.some(
        (mention) => mention.topic === "gdpr" && mention.confidence >= CONFIDENCE_THRESHOLD_MODERATE
      );
      snapshotOverrides.dsarRequestMechanismPresent =
        (enrichment.policyDsarMechanism === "present" || enrichment.policyDsarMechanism === "partial") &&
        (enrichment.policyDsarConfidence ?? 0) >= CONFIDENCE_THRESHOLD_MODERATE;
      snapshotOverrides.dataAccessRequestPresent = merged.dataAccessRequestPresent;
      snapshotOverrides.dataDeletionRequestPresent = merged.dataDeletionRequestPresent;
      snapshotOverrides.privacyContactChannelType = merged.privacyContactChannelType ?? "none";
      snapshotOverrides.mentionsCrossBorderTransfer = enrichment.policyMentions.some(
        (mention) => mention.topic === "cross_border_transfer" && mention.confidence >= CONFIDENCE_THRESHOLD_MODERATE
      );
      snapshotOverrides.mentionsDataRetention = enrichment.policyMentions.some((mention) => mention.topic === "data_retention");
      snapshotOverrides.dataRetentionSpecificPeriodDetected = enrichment.policyRetentionDisclosure === "specific";
      snapshotOverrides.mentionsSensitiveData = enrichment.policyMentions.some((mention) => mention.topic === "sensitive_data");
      snapshotOverrides.mentionsHealthData = enrichment.policyDataCategories.includes("health");
      snapshotOverrides.mentionsBiometricData = enrichment.policyDataCategories.includes("biometric");
      snapshotOverrides.mentionsFinancialData = enrichment.policyDataCategories.includes("payment");
      snapshotOverrides.mentionsUnder13 = enrichment.policyChildrenReference === "under_13";
      snapshotOverrides.mentionsUnder16 = enrichment.policyChildrenReference === "under_16";
      snapshotOverrides.policyBehaviorConflictDetected = policyBehaviorConflictCandidate;
      snapshotOverrides.sessionReplayWithoutDisclosureDetected = sessionReplayWithoutDisclosureDetected;
    }
  }

  return {
    enrichments,
    evidences: [...evidences.values()],
    reviewQueueItems,
    primaryPolicyEnrichmentId,
    snapshotOverrides
  };
}

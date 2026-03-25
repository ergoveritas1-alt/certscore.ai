import { randomUUID } from "node:crypto";
import { createAdminClient } from "@website-signal-risk-scanner/db";
import type { PolicyEnrichment, PolicyReviewQueueItem } from "@website-signal-risk-scanner/shared";
import { assessPolicyPageContentQuality } from "../snapshot/extractors";
import type { StaticPageResult } from "../snapshot/types";
import { chunkPolicyText, selectPolicyChunksForLlm } from "./chunk";
import { buildPolicyEvidenceRecords } from "./evidence";
import { createPolicyLlmClient, loadPolicyPrompt, POLICY_EXTRACTION_CONFIG, PolicyLlmError, resolvePolicyPromptName } from "./llm-client";
import { mergePolicyChunkExtractions } from "./merge";
import { ruleBasedPolicyPreprocess } from "./rules";
import { validatePolicyChunkJson } from "./schema";
import type { EnrichPolicyPagesInput, PolicyEnrichmentBundle, PolicyLlmChunkDiagnostic, PolicyLlmClient } from "./types";

const CONFIDENCE_THRESHOLD_HIGH = 0.8;
const CONFIDENCE_THRESHOLD_MODERATE = 0.6;
const FAILURE_PREVIEW_MAX_CHARS = 600;
const DEFAULT_LLM_ATTEMPTS = 1;
const DEFAULT_TOTAL_LLM_BUDGET_MS = 12_000;
const DEFAULT_CHUNK_TIMEOUT_MS = 5_000;
const POLICY_RULES_CACHE_VERSION = "rules_v2";

function getMaxLlmAttempts(env: NodeJS.ProcessEnv = process.env) {
  const parsed = Number.parseInt(env.LLM_ENRICHMENT_MAX_ATTEMPTS ?? String(DEFAULT_LLM_ATTEMPTS), 10);
  return Number.isFinite(parsed) ? Math.max(1, parsed) : DEFAULT_LLM_ATTEMPTS;
}

function getMaxLlmChunks(env: NodeJS.ProcessEnv = process.env) {
  const parsed = Number.parseInt(env.LLM_ENRICHMENT_MAX_CHUNKS ?? "3", 10);
  return Number.isFinite(parsed) ? Math.max(1, parsed) : 3;
}

function getMaxLlmChunksForPageType(pageType: StaticPageResult["pageType"], env: NodeJS.ProcessEnv = process.env) {
  const base = getMaxLlmChunks(env);
  return pageType === "terms_of_service" ? Math.max(base, 3) : base;
}

function getTotalLlmBudgetMs(env: NodeJS.ProcessEnv = process.env) {
  const parsed = Number.parseInt(env.LLM_ENRICHMENT_TOTAL_BUDGET_MS ?? String(DEFAULT_TOTAL_LLM_BUDGET_MS), 10);
  return Number.isFinite(parsed) ? Math.max(1, parsed) : DEFAULT_TOTAL_LLM_BUDGET_MS;
}

function getChunkTimeoutMs(env: NodeJS.ProcessEnv = process.env) {
  const parsed = Number.parseInt(env.LLM_ENRICHMENT_TIMEOUT_MS ?? String(DEFAULT_CHUNK_TIMEOUT_MS), 10);
  return Number.isFinite(parsed) ? Math.max(1_000, parsed) : DEFAULT_CHUNK_TIMEOUT_MS;
}

function shouldPreferLastChunk(env: NodeJS.ProcessEnv = process.env) {
  return env.LLM_ENRICHMENT_FORCE_LAST_CHUNK !== "0";
}

function summarizeFailureDetail(value: unknown) {
  if (value instanceof Error) {
    return value.message.slice(0, FAILURE_PREVIEW_MAX_CHARS);
  }

  return String(value).slice(0, FAILURE_PREVIEW_MAX_CHARS);
}

function buildFailurePreview(rawJson: unknown) {
  if (typeof rawJson !== "string" || rawJson.length === 0) {
    return null;
  }

  return rawJson.slice(0, FAILURE_PREVIEW_MAX_CHARS);
}

async function getCachedPolicyEnrichment(input: {
  normalizedPolicyHash: string;
  pageType: StaticPageResult["pageType"];
  promptVersion: string;
}) {
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
    .eq("page_type", input.pageType)
    .eq("policy_ai_model", POLICY_EXTRACTION_CONFIG.model)
    .eq("policy_ai_model_version", POLICY_EXTRACTION_CONFIG.modelVersion)
    .eq("policy_ai_prompt_version", input.promptVersion)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as Record<string, unknown> | null) ?? null;
}

function shouldRunLlm(input: {
  allowLlm?: boolean;
  forceLlm?: boolean;
  hasClient: boolean;
  isArchive: boolean;
  llmTriggerReasons?: string[];
  needLlm: boolean;
}) {
  if (input.allowLlm === false) {
    return false;
  }

  if (!input.hasClient) {
    return false;
  }

  if (input.forceLlm) {
    return true;
  }

  if ((input.llmTriggerReasons?.length ?? 0) > 0) {
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
    effective_date: chunkExtraction.effectiveDate.snippet,
    governing_law: chunkExtraction.governingLaw.snippet,
    arbitration: chunkExtraction.arbitrationPresent.snippet,
    dsar: chunkExtraction.dsarMechanism.snippet,
    do_not_sell: chunkExtraction.doNotSell.snippet,
    gdpr: chunkExtraction.mentionsGdpr.snippet,
    children: chunkExtraction.childrenReference.snippet,
    retention: chunkExtraction.retentionStatements[0]?.snippet ?? null,
    transfer: chunkExtraction.transferMechanisms[0]?.snippet ?? null
  };
}

function allowTermsOnlyLegalClauses(pageType: StaticPageResult["pageType"]) {
  return pageType === "terms_of_service";
}

function hasPolicyClaimSnippet(
  snippets: Record<string, string | string[] | null> | null | undefined,
  keys: string[]
) {
  if (!snippets) {
    return false;
  }

  return keys.some((key) => {
    const value = snippets[key];
    if (typeof value === "string") {
      return value.trim().length > 0;
    }

    if (Array.isArray(value)) {
      return value.some((entry) => typeof entry === "string" && entry.trim().length > 0);
    }

    return false;
  });
}

function scorePolicyPageForEnrichment(page: StaticPageResult) {
  const quality = assessPolicyPageContentQuality(page);
  return (quality.insufficientContent ? 0 : 1_000) + quality.textLength + quality.wordCount * 2;
}

function selectPolicyPagesForEnrichment(pages: StaticPageResult[]) {
  const eligible = pages.filter((candidate) => ["privacy_policy", "terms_of_service", "cookie_policy"].includes(candidate.pageType));
  const bestByType = new Map<StaticPageResult["pageType"], StaticPageResult>();

  for (const page of eligible) {
    const existing = bestByType.get(page.pageType);
    if (!existing || scorePolicyPageForEnrichment(page) > scorePolicyPageForEnrichment(existing)) {
      bestByType.set(page.pageType, page);
    }
  }

  return [...bestByType.values()]
    .sort((left, right) => scorePolicyPageForEnrichment(right) - scorePolicyPageForEnrichment(left))
    .slice(0, 3);
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
  pageType: StaticPageResult["pageType"];
}) {
  const promptName = resolvePolicyPromptName(input.pageType);
  const promptText = loadPolicyPrompt(promptName);
  const response = await input.llmClient.extractPolicyChunk({
    chunk: {
      chunkId: input.chunkId,
      offsetStart: 0,
      offsetEnd: input.chunkText.length,
      text: input.chunkText
    },
    promptName,
    promptText
  });

  return {
    extraction: (() => {
      try {
        return validatePolicyChunkJson({
          chunkText: input.chunkText,
          rawJson: response.rawJson
        });
      } catch (error) {
        throw Object.assign(
          new PolicyLlmError("invalid_json", error instanceof Error ? error.message : "Invalid policy chunk JSON."),
          {
            rawJson: response.rawJson,
            validationMessage: summarizeFailureDetail(error)
          }
        );
      }
    })(),
    meta: response
  };
}

async function extractChunkWithRetry(input: {
  chunkText: string;
  chunkId: string;
  llmClient: PolicyLlmClient;
  pageType: StaticPageResult["pageType"];
}) {
  let lastError: unknown = null;
  const maxAttempts = getMaxLlmAttempts();
  const chunkTimeoutMs = getChunkTimeoutMs();

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      let timeoutId: NodeJS.Timeout | null = null;
      let result: Awaited<ReturnType<typeof extractChunkWithLlm>>;
      try {
        result = await Promise.race([
          extractChunkWithLlm(input),
          new Promise<Awaited<ReturnType<typeof extractChunkWithLlm>>>((_, reject) => {
            timeoutId = setTimeout(() => {
              reject(new PolicyLlmError("timeout", `Policy chunk extraction timed out after ${chunkTimeoutMs}ms.`));
            }, chunkTimeoutMs);
          })
        ]);
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
      return {
        ...result,
        attemptCount: attempt + 1
      };
    } catch (error) {
      lastError = error;

      const retryable =
        error instanceof PolicyLlmError &&
        (error.code === "timeout" || error.code === "provider_error" || error.code === "empty_response");

      if (!retryable || attempt === maxAttempts - 1) {
        throw Object.assign(error instanceof Error ? error : new Error("Unknown policy chunk extraction failure."), {
          attemptCount: attempt + 1
        });
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unknown policy chunk extraction failure.");
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
    policyEffectiveDate: (input.cached.policy_effective_date as string | null) ?? null,
    policyGoverningLaw: (input.cached.policy_governing_law as string | null) ?? null,
    policyArbitrationPresent: (input.cached.policy_arbitration_present as boolean | null) ?? null,
    policyNoticeContactPresent: (input.cached.policy_notice_contact_present as boolean | null) ?? null,
    policyTerminationOrSuspensionPresent: (input.cached.policy_termination_or_suspension_present as boolean | null) ?? null,
    policyCancellationOrRefundPresent: (input.cached.policy_cancellation_or_refund_present as boolean | null) ?? null,
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
    policyFieldCoverage:
      input.cached.policy_field_coverage && typeof input.cached.policy_field_coverage === "object"
        ? (input.cached.policy_field_coverage as PolicyEnrichment["policyFieldCoverage"])
        : {},
    policyCoverageRatio: (input.cached.policy_coverage_ratio as number | null) ?? null,
    policySnippetCount: (input.cached.policy_snippet_count as number | null) ?? null,
    policyStructurallyWeak: (input.cached.policy_structurally_weak as boolean | null) ?? null,
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
  const llmBudgetStartedAt = Date.now();
  const totalLlmBudgetMs = getTotalLlmBudgetMs();
  const diagnostics: PolicyEnrichmentBundle["diagnostics"] = [];
  const evidences = new Map<string, ReturnType<typeof buildPolicyEvidenceRecords>["evidences"][number]>();
  const enrichments: PolicyEnrichment[] = [];
  const reviewQueueItems: PolicyReviewQueueItem[] = [];
  let primaryPolicyEnrichmentId: string | null = null;
  const snapshotOverrides: PolicyEnrichmentBundle["snapshotOverrides"] = {};

  for (const page of selectPolicyPagesForEnrichment(input.pages)) {
    const allowTermsClauses = allowTermsOnlyLegalClauses(page.pageType);
    const promptName = resolvePolicyPromptName(page.pageType);
    const promptVersion = `${promptName.replace(".txt", "")}:${POLICY_RULES_CACHE_VERSION}`;
    const ruleResult = ruleBasedPolicyPreprocess({
      html: page.html,
      pageType: page.pageType,
      text: page.textContent
    });
    const contentQuality = assessPolicyPageContentQuality(page);
    const insufficientContentFlags = contentQuality.insufficientContent
      ? ["policy_fetch_insufficient_content", "low_confidence"]
      : [];
    const cachedEnrichment = await getCachedPolicyEnrichment({
      normalizedPolicyHash: ruleResult.normalizedPolicyHash,
      pageType: page.pageType,
      promptVersion
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
        Boolean(cached.policyClaimNoSale) &&
        input.advertisingTrackerCount > 0 &&
        hasPolicyClaimSnippet(cached.policyEvidenceSnippets, ["do_not_sell", "policy_claim_no_sale", "policy_claim_no_tracking"]);
      const cachedSessionReplayWithoutDisclosure = input.sessionReplayTrackerCount > 0 && !explicitSessionReplayDisclosure;
      cached.policyBehaviorConflictCandidate = cachedConflict;
      if (!allowTermsClauses) {
        cached.policyGoverningLaw = null;
        cached.policyArbitrationPresent = null;
      }
      cached.policyActionableFlags = Array.from(
        new Set([
          ...cached.policyActionableFlags,
          ...(input.llmTriggerReasons ?? []),
          ...(cachedConflict ? ["policy_behavior_conflict_candidate"] : []),
          ...(cachedSessionReplayWithoutDisclosure ? ["session_replay_undisclosed"] : [])
        ])
      )
        .filter((flag) => allowTermsClauses || flag !== "arbitration_clause_present")
        .sort();
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

    const llmBudgetRemainingMs = totalLlmBudgetMs - (Date.now() - llmBudgetStartedAt);
    const llmBudgetExhaustedBeforePage = llmBudgetRemainingMs <= 0;
    const runLlm = !llmBudgetExhaustedBeforePage && shouldRunLlm({
      allowLlm: input.allowLlm,
      forceLlm: input.forceLlm,
      hasClient: Boolean(llmClient),
      isArchive: false,
      llmTriggerReasons: input.llmTriggerReasons,
      needLlm: ruleResult.needLlm
    }) && !contentQuality.insufficientContent;

    let chunkExtractions: Array<ReturnType<typeof validatePolicyChunkJson>> = [];
    let modelMeta: { model: string | null; modelVersion: string | null; promptVersion: string | null } = {
      model: null,
      modelVersion: null,
      promptVersion: null
    };
    const llmChunkSnippetMaps: Array<Record<string, string | null>> = [];
    let llmFailureFlags: string[] = [];
    let llmPartialCoverage = false;

    if (runLlm && llmClient) {
      const chunks = chunkPolicyText({
        text: ruleResult.normalizedText
      });
      const selectedChunks = selectPolicyChunksForLlm({
        chunks,
        maxChunks: getMaxLlmChunksForPageType(page.pageType),
        pageType: page.pageType,
        preferLastChunk: shouldPreferLastChunk()
      });
      const chunkDiagnostics: PolicyLlmChunkDiagnostic[] = [];

      for (const chunk of selectedChunks) {
        if (Date.now() - llmBudgetStartedAt >= totalLlmBudgetMs) {
          llmFailureFlags = Array.from(new Set([...llmFailureFlags, "llm_budget_exhausted", "low_confidence"]));
          llmPartialCoverage = chunkExtractions.length > 0;
          chunkDiagnostics.push({
            chunkId: chunk.chunkId,
            selectedReason: chunk.reason,
            score: chunk.score,
            attemptCount: 0,
            success: false,
            failureCode: "timeout",
            failureDetail: `Policy LLM budget exhausted after ${totalLlmBudgetMs}ms for this scan.`,
            rawPreview: null,
            rawLength: null
          });
          break;
        }

        try {
          const result = await extractChunkWithRetry({
            chunkId: chunk.chunkId,
            chunkText: chunk.text,
            llmClient,
            pageType: page.pageType
          });

          chunkExtractions.push(result.extraction);
          llmChunkSnippetMaps.push(buildChunkSnippetMap(result.extraction));
          modelMeta = {
            model: result.meta.model,
            modelVersion: result.meta.modelVersion,
            promptVersion: result.meta.promptVersion
          };
          chunkDiagnostics.push({
            chunkId: chunk.chunkId,
            selectedReason: chunk.reason,
            score: chunk.score,
            attemptCount: result.attemptCount,
            success: true,
            failureCode: null,
            failureDetail: null,
            rawPreview: null,
            rawLength: result.meta.rawJson.length
          });
        } catch (error) {
          const failureCode =
            error instanceof PolicyLlmError
              ? error.code
              : "provider_error";
          llmFailureFlags = Array.from(
            new Set([
              ...llmFailureFlags,
              ...(error instanceof PolicyLlmError
                ? [
                    error.code === "invalid_json"
                      ? "invalid_llm_json"
                      : error.code === "timeout"
                        ? "llm_timeout"
                        : error.code === "empty_response"
                          ? "llm_empty_response"
                          : "llm_provider_error",
                    "low_confidence"
                  ]
                : ["llm_provider_error", "low_confidence"])
            ])
          );
          chunkDiagnostics.push({
            chunkId: chunk.chunkId,
            selectedReason: chunk.reason,
            score: chunk.score,
            attemptCount: typeof (error as { attemptCount?: unknown }).attemptCount === "number" ? (error as { attemptCount: number }).attemptCount : 1,
            success: false,
            failureCode,
            failureDetail:
              typeof (error as { validationMessage?: unknown }).validationMessage === "string"
                ? summarizeFailureDetail((error as { validationMessage: string }).validationMessage)
                : error instanceof Error
                  ? summarizeFailureDetail(error)
                  : "Unknown policy chunk extraction failure.",
            rawPreview: buildFailurePreview((error as { rawJson?: unknown }).rawJson),
            rawLength: null
          });
          llmPartialCoverage = chunkExtractions.length > 0;
          continue;
        }
      }

      diagnostics.push({
        pageType: page.pageType,
        pageUrl: page.pageUrl,
        selectedChunkCount: selectedChunks.length,
        totalChunkCount: chunks.length,
        chunkDiagnostics
      });
    } else {
      const totalChunks = chunkPolicyText({
        text: ruleResult.normalizedText
      }).length;
      diagnostics.push({
        pageType: page.pageType,
        pageUrl: page.pageUrl,
        selectedChunkCount: 0,
        totalChunkCount: totalChunks,
        chunkDiagnostics: llmBudgetExhaustedBeforePage
          ? [
              {
                chunkId: "budget-skip",
                selectedReason: "llm_budget_exhausted",
                score: 0,
                attemptCount: 0,
                success: false,
                failureCode: "timeout",
                failureDetail: `Policy LLM budget exhausted after ${totalLlmBudgetMs}ms for this scan.`,
                rawPreview: null,
                rawLength: null
              }
            ]
          : []
      });
      if (llmBudgetExhaustedBeforePage) {
        llmFailureFlags = Array.from(new Set([...llmFailureFlags, "llm_budget_exhausted", "low_confidence"]));
      }
    }

    const merged =
      chunkExtractions.length > 0
        ? mergePolicyChunkExtractions({
            chunkExtractions,
            highThreshold: CONFIDENCE_THRESHOLD_HIGH,
            moderateThreshold: CONFIDENCE_THRESHOLD_MODERATE,
            pageType: page.pageType,
            ruleResult
          })
        : {
            policyActionableFlags: Array.from(
              new Set([
        ...ruleResult.actionableFlags,
        ...insufficientContentFlags,
        ...llmFailureFlags
      ])
    ),
            policyAmbiguityScore: contentQuality.insufficientContent ? 90 : ruleResult.needLlm ? 68 : 34,
            policyArbitrationPresent: allowTermsClauses ? ruleResult.arbitrationPresent : null,
            policyCancellationOrRefundPresent: allowTermsClauses ? ruleResult.cancellationOrRefundPresent : null,
            policyChildrenReference: ruleResult.childrenReference,
            policyCookieDisclosures: (ruleResult.cookieDisclosures ?? []).map((item) => ({
              confidence: item.confidence,
              cookieName: item.cookieName,
              duration: item.duration,
              provider: item.provider,
              purpose: item.purpose,
              snippetHash: null
            })),
            policyEffectiveDate: ruleResult.updateDate,
            policyFieldCoverage: {},
            policyCoverageRatio: null,
            policyGoverningLaw: allowTermsClauses ? ruleResult.governingLaw : null,
            policyNoticeContactPresent: allowTermsClauses ? ruleResult.noticeContactPresent : null,
            policySnippetCount: Object.keys(ruleResult.evidenceSnippets).length,
            policyStructurallyWeak: contentQuality.insufficientContent || Object.keys(ruleResult.evidenceSnippets).length === 0,
            policyTerminationOrSuspensionPresent: allowTermsClauses ? ruleResult.terminationOrSuspensionPresent : null,
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
            policySemanticConfidence: contentQuality.insufficientContent ? Math.min(ruleResult.semanticConfidence, 0.2) : ruleResult.semanticConfidence,
            policySubprocessorsListed: ruleResult.mentions.some((mention) => mention.topic === "cross_border_transfer") ? true : null,
            policySummaryShort: contentQuality.insufficientContent
              ? "Insufficient policy content fetched for semantic review."
              : ruleResult.summary,
            policyTransferMechanisms: ruleResult.transferMechanisms
          };

    const mergedActionableFlags = Array.from(
      new Set([
        ...merged.policyActionableFlags,
        ...llmFailureFlags,
        ...(llmPartialCoverage ? ["llm_partial_coverage"] : [])
      ])
    ).filter((flag) => allowTermsClauses || flag !== "arbitration_clause_present");

    const policyEvidence = buildPolicyEvidenceRecords({
      pageUrl: page.pageUrl,
      snippets: buildPolicyEvidenceSnippetMap({
        chunkSnippets: llmChunkSnippetMaps,
        ruleSnippets: ruleResult.evidenceSnippets
      })
    });
    const policyBehaviorConflictCandidate =
      Boolean(merged.policyClaimNoSale) &&
      input.advertisingTrackerCount > 0 &&
      hasPolicyClaimSnippet(policyEvidence.references, ["do_not_sell", "policy_claim_no_sale", "policy_claim_no_tracking"]);
    const explicitSessionReplayDisclosure = merged.policyMentions.some(
      (mention) => mention.topic === "session_replay_disclosure" && mention.confidence >= CONFIDENCE_THRESHOLD_MODERATE
    );
    const sessionReplayWithoutDisclosureDetected = input.sessionReplayTrackerCount > 0 && !explicitSessionReplayDisclosure;

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
      policyEffectiveDate: merged.policyEffectiveDate,
      policyGoverningLaw: allowTermsClauses ? merged.policyGoverningLaw : null,
      policyArbitrationPresent: allowTermsClauses ? merged.policyArbitrationPresent : null,
      policyNoticeContactPresent: allowTermsClauses ? merged.policyNoticeContactPresent : null,
      policyTerminationOrSuspensionPresent: allowTermsClauses ? merged.policyTerminationOrSuspensionPresent : null,
      policyCancellationOrRefundPresent: allowTermsClauses ? merged.policyCancellationOrRefundPresent : null,
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
      policyCookieDisclosures: (merged.policyCookieDisclosures ?? []).map((item) => {
        const cookieSnippetHash =
          item.cookieName ? policyEvidence.references[`cookie:${item.cookieName.toLowerCase()}`] : null;
        const providerSnippetHash =
          item.provider ? policyEvidence.references[`cookie-provider:${item.provider.toLowerCase()}`] : null;

        return {
          confidence: item.confidence,
          cookieName: item.cookieName,
          duration: item.duration,
          provider: item.provider,
          purpose: item.purpose,
          snippetHash: cookieSnippetHash ?? providerSnippetHash ?? item.snippetHash ?? null
        };
      }),
      policyAmbiguityScore: merged.policyAmbiguityScore,
      policyBehaviorConflictCandidate,
      policyActionableFlags: Array.from(
        new Set([
          ...mergedActionableFlags,
          ...(input.llmTriggerReasons ?? []),
          ...(policyBehaviorConflictCandidate ? ["policy_behavior_conflict_candidate"] : []),
          ...(input.sessionReplayTrackerCount > 0 && !explicitSessionReplayDisclosure ? ["session_replay_undisclosed"] : [])
        ])
      ).sort(),
      policyEvidenceSnippets: policyEvidence.references,
      policyFieldCoverage: Object.fromEntries(
        Object.entries(merged.policyFieldCoverage).map(([key, value]) => [
          key,
          {
            confidence: value.confidence,
            found: value.found,
            snippetHash: value.snippetKey ? (policyEvidence.references[value.snippetKey] ?? null) : null
          }
        ])
      ),
      policyCoverageRatio: merged.policyCoverageRatio,
      policySnippetCount: merged.policySnippetCount,
      policyStructurallyWeak: merged.policyStructurallyWeak,
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
    diagnostics,
    enrichments,
    evidences: [...evidences.values()],
    reviewQueueItems,
    primaryPolicyEnrichmentId,
    snapshotOverrides
  };
}

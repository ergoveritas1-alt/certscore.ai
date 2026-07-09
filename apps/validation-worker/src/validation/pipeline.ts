import { createHash } from "node:crypto";
import {
  SCAN_EVENT_TYPES,
  buildFindingComparisonKey,
  deriveValidationFindingTaxonomy
} from "@website-signal-risk-scanner/shared";
import {
  getKnownCmpVendorName,
  isKnownCmpInfrastructureUrl
} from "../../../../packages/shared/src/known-cmps";
import {
  appendScanWorkflowEvent,
  claimNextAutomaticTarget,
  createScanForValidationRun,
  createValidationRun,
  ensureCompletedValidationRunForScan,
  ensureValidationSettings,
  failValidationRun,
  finalizeValidationRun,
  getValidationDerivationStateForScan,
  getValidationPipelineState,
  getValidationRun,
  listRecentValidationRuns,
  loadCompletedScanArtifacts,
  loadNanoDocRetrievalInputs,
  loadReusableNanoDocumentExtractions,
  loadNanoSignalEnrichmentInputs,
  loadValidationRunFindings,
  markValidationSchedule,
  persistDerivedNanoPolicySignals,
  replaceScanDocumentSources,
  replaceValidationRunFindings,
  syncTrancoTargets,
  updateScanDocumentSourceExtractions,
  updateScanStatus,
  updateValidationRun,
  upsertValidationVerdict
} from "./repository";
import { validateFinancialFindingWithLlm, validateFindingWithLlm } from "./llm-client";
import { buildNanoDocCandidateUrls, selectNanoDocCandidates } from "./nano-document-discovery";
import {
  extractNanoDocumentSourceWithLlm,
  hasRetentionInferenceCue,
  NANO_DOCUMENT_NORMALIZATION_VERSION
} from "./nano-document-extraction";
import { enrichUnknownScanVendors } from "./vendor-enrichment";
import { buildValidationWorkerDocumentHeaders } from "../web-bot-auth";
import { getWorkerEnv } from "../env";
import { runAccessibilityValidationJob } from "./run-accessibility-validation-job";
import { deriveFinancialCommercialExpectedFindingIds } from "@website-signal-risk-scanner/validation-shared";
import { cleanupRuntimeScanArtifacts, getRuntimeScanArtifactOptions } from "./runtime-scan-artifacts";

export { buildNanoDocCandidateUrls, selectNanoDocCandidates } from "./nano-document-discovery";

const VALIDATION_SCAN_HANDOFF_POLL_MS = 5_000;
const NANO_DOC_RETRIEVAL_POLL_MS = 1_000;
const MAX_NANO_DOC_RETRIEVAL_POLLS = 20;
const NANO_SIGNAL_POLICY_ROW_RECHECK_MS = 250;
const NANO_SIGNAL_TERMINAL_STATUS_RECHECK_MS = 1_000;
const NANO_SIGNAL_ENRICHMENT_POLL_MS = 2_000;
const MAX_NANO_SIGNAL_ENRICHMENT_POLLS = 20;
const NANO_DOCUMENT_EXTRACTION_BATCH_SIZE = 4;
const VALIDATION_VERDICT_BATCH_SIZE = 3;
const FINANCIAL_JUDGE_CANDIDATE_IDS = new Set([
  "fee_disclosure_present",
  "apr_or_interest_rate_disclosure_present",
  "past_performance_disclaimer_present"
]);

const FINANCIAL_COMMERCIAL_SIGNAL_KEYS = new Set([
  "financial.performance_claim_text_present",
  "financial.return_or_yield_percentage_present",
  "financial.investment_outperformance_language_present",
  "financial.guaranteed_return_language_present",
  "financial.low_risk_high_return_language_present",
  "financial.hypothetical_or_backtest_language_present",
  "financial.testimonial_or_review_block_near_financial_claim_present",
  "financial.risk_disclosure_text_present",
  "financial.claim_cta_block_present",
  "financial.apr_or_interest_rate_disclosure_text_present",
  "financial.past_performance_disclaimer_text_present",
  "commercial.pricing_page_present",
  "commercial.fee_related_text_present",
  "commercial.explicit_fee_disclosure_text_present",
  "commercial.fee_schedule_table_present",
  "commercial.withdrawal_redemption_terms_text_present",
  "commercial.cancellation_terms_text_present",
  "commercial.account_closure_terms_text_present",
  "commercial.promo_price_or_free_claim_present",
  "commercial.variable_fee_language_present_without_explanation"
]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requeueNanoSignalEnrichmentPoll(input: {
  delayMs?: number;
  pollCount: number;
  reason: string;
  scanId: string;
}) {
  const delayMs = input.delayMs ?? NANO_SIGNAL_ENRICHMENT_POLL_MS;
  const recheckAt = new Date(Date.now() + delayMs);

  await appendScanWorkflowEvent({
    eventType: SCAN_EVENT_TYPES.nanoSignalEnrichmentQueued,
    message: "Nano document signal enrichment recheck scheduled.",
    metadataJson: {
      pollCount: input.pollCount,
      reason: input.reason,
      recheckAfter: recheckAt.toISOString(),
      recheckAfterEpochMs: recheckAt.getTime(),
      recheckDelayMs: delayMs,
      stage: "nano_doc_signals"
    },
    scanId: input.scanId
  }).catch(() => undefined);
}

async function deriveAndPersistUnifiedFindingsForScan(input: {
  recoveryMode?: "browser_extension_signal_reprojection" | "completed_scan_backfill" | "missing_unified_projection" | null;
  scanId: string;
  suppressWorkflowEvents?: boolean;
  validationRunId?: string | null;
}) {
  if (input.suppressWorkflowEvents) {
    const refreshedArtifacts = await loadCompletedScanArtifacts(input.scanId);
    const findings = deriveValidationFindings(refreshedArtifacts);
    const targetRun = input.validationRunId ? { id: input.validationRunId } : await ensureCompletedValidationRunForScan(input.scanId);
    await replaceValidationRunFindings(targetRun.id, findings);
    return findings;
  }

  await appendScanWorkflowEvent({
    eventType: SCAN_EVENT_TYPES.signalMergeStarted,
    message: "Merged signal derivation started.",
    metadataJson: {
      ...(input.recoveryMode ? { recoveryMode: input.recoveryMode } : {}),
      stage: "signal_merge"
    },
    scanId: input.scanId
  }).catch(() => undefined);

  const refreshedArtifacts = await loadCompletedScanArtifacts(input.scanId);

  await appendScanWorkflowEvent({
    eventType: SCAN_EVENT_TYPES.signalMergeCompleted,
    message: "Merged signal derivation completed.",
    metadataJson: {
      mergedSignalCount: refreshedArtifacts.mergedSignals.length,
      ...(input.recoveryMode ? { recoveryMode: input.recoveryMode } : {}),
      stage: "signal_merge"
    },
    scanId: input.scanId
  }).catch(() => undefined);

  await appendScanWorkflowEvent({
    eventType: SCAN_EVENT_TYPES.unifiedFindingsDerivedStarted,
    message: "Unified finding derivation started.",
    metadataJson: {
      ...(input.recoveryMode ? { recoveryMode: input.recoveryMode } : {}),
      stage: "unified_findings"
    },
    scanId: input.scanId
  }).catch(() => undefined);

  const findings = await deriveUnifiedFindingsWithWorkflowEvents({
    completionMetadata: (findings) => ({
      cookieDisclosureGapDiagnostic: deriveCookieDisclosureGapDiagnostic(
        {
          policySemanticRows: refreshedArtifacts.policySemanticRows ?? refreshedArtifacts.policySemanticInputs ?? refreshedArtifacts.policyEnrichments ?? [],
          runtimeArtifacts: refreshedArtifacts.runtimeArtifacts
        },
        findings
      ),
      ...(input.recoveryMode ? { recoveryMode: input.recoveryMode } : {})
    }),
    deriveFindings: () => deriveValidationFindings(refreshedArtifacts),
    scanId: input.scanId
  });

  const targetRun = input.validationRunId ? { id: input.validationRunId } : await ensureCompletedValidationRunForScan(input.scanId);
  await replaceValidationRunFindings(targetRun.id, findings);

  return findings;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripHtmlToText(html: string) {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractLegalTitleHeading(title: string | null) {
  if (!title) {
    return null;
  }

  const primary = title.split("|")[0]?.trim() ?? title.trim();
  return primary.length > 0 ? primary : null;
}

function findDocumentStartIndex(text: string, heading: string | null) {
  if (!heading) {
    return 0;
  }

  const escapedHeading = escapeRegExp(heading);
  const matches = [...text.matchAll(new RegExp(escapedHeading, "gi"))];
  if (matches.length >= 2) {
    return matches[1]?.index ?? matches[0]?.index ?? 0;
  }

  return matches[0]?.index ?? 0;
}

export function isolateLikelyLegalDocumentText(input: { html: string; title: string | null }) {
  const fullText = stripHtmlToText(input.html);
  if (fullText.length === 0) {
    return fullText;
  }

  const titleHeading = extractLegalTitleHeading(input.title);
  const startIndex = findDocumentStartIndex(fullText, titleHeading);
  let candidate = startIndex > 0 ? fullText.slice(startIndex).trim() : fullText;

  const footerMarkers = [
    "Table of Contents",
    "Back to Legal Home",
    "© ",
    "Why Lookout",
    "Why Example",
    "Partners Partner Programs",
    "Company About Us",
    "Support Enterprise Support Login",
    "Contact Us"
  ];

  for (const marker of footerMarkers) {
    const index = candidate.indexOf(marker);
    if (index >= 120) {
      candidate = candidate.slice(0, index).trim();
      break;
    }
  }

  return candidate.length > 0 ? candidate : fullText;
}

function extractTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripHtmlToText(match[1] ?? "") : null;
}

export function buildNanoDocumentContentHash(documentText: string) {
  const normalized = documentText.replace(/\s+/g, " ").trim();
  return createHash("sha256").update(normalized).digest("hex");
}

export function determineValidationCollectAction(scanStatus: string | null | undefined) {
  if (scanStatus === "queued") {
    return "wait_for_scan" as const;
  }

  if (scanStatus === "running" || scanStatus === "processing") {
    return "wait_for_completion" as const;
  }

  if (scanStatus === "completed") {
    return "rank" as const;
  }

  if (scanStatus === "failed") {
    return "fail" as const;
  }

  return "unexpected" as const;
}

function severityWeight(severity: string) {
  if (severity === "high") {
    return 300;
  }
  if (severity === "medium") {
    return 200;
  }
  if (severity === "low") {
    return 100;
  }
  return 0;
}

function humanizeReason(reason: string) {
  return reason
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function reviewIssueDefinition(reason: string) {
  switch (reason) {
    case "policy_behavior_conflict_candidate":
      return {
        description: "The scan flagged a possible conflict between observed site behavior and policy language.",
        severity: "high" as const,
        title: "Possible policy-to-behavior conflict"
      };
    case "session_replay_without_disclosure_detected":
      return {
        description: "The scan flagged possible session replay behavior without clear matching policy disclosure.",
        severity: "high" as const,
        title: "Possible undisclosed session replay"
      };
    case "missing_dsar_high_exposure":
      return {
        description: "The scan flagged a likely missing or weak DSAR path despite higher regulatory exposure.",
        severity: "high" as const,
        title: "Possible missing DSAR path"
      };
    case "low_confidence_critical_fields":
      return {
        description: "The scan marked critical policy extraction fields as low confidence and in need of manual review.",
        severity: "medium" as const,
        title: "Low-confidence policy extraction"
      };
    default:
      return {
        description: `The scan report queued this item for review: ${humanizeReason(reason)}.`,
        severity: "medium" as const,
        title: humanizeReason(reason)
      };
  }
}

function getRecordBoolean(record: Record<string, unknown> | null, key: string) {
  return record?.[key] === true;
}

function getSnapshotNumber(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

type UnifiedFindingsWorkflowEventAppender = (input: {
  eventType: string;
  message: string;
  metadataJson?: Record<string, unknown>;
  scanId: string;
}) => Promise<unknown>;

export async function deriveUnifiedFindingsWithWorkflowEvents<TFinding extends { ruleKey?: unknown }>(input: {
  appendEvent?: UnifiedFindingsWorkflowEventAppender;
  completionMetadata?: (findings: TFinding[]) => Record<string, unknown>;
  deriveFindings: () => TFinding[];
  scanId: string;
}) {
  const appendEvent = input.appendEvent ?? appendScanWorkflowEvent;

  try {
    const findings = input.deriveFindings();
    const extraMetadata = input.completionMetadata?.(findings) ?? {};

    await appendEvent({
      eventType: SCAN_EVENT_TYPES.unifiedFindingsDerivedCompleted,
      message: "Unified finding derivation completed.",
      metadataJson: {
        ...extraMetadata,
        findingCount: findings.length,
        stage: "unified_findings"
      },
      scanId: input.scanId
    }).catch(() => undefined);

    return findings;
  } catch (error) {
    await appendEvent({
      eventType: SCAN_EVENT_TYPES.unifiedFindingsDerivedFailed,
      message: "Unified finding derivation failed.",
      metadataJson: {
        error: error instanceof Error ? error.message : String(error),
        stage: "unified_findings"
      },
      scanId: input.scanId
    }).catch(() => undefined);
    throw error;
  }
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "Not observed";
  }

  return `${Math.round(value * 100)}%`;
}

function pageTypeLabel(pageType: string | null) {
  return (pageType ?? "policy")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isMetaSectionFinding(ruleKey: string | null) {
  if (!ruleKey) {
    return false;
  }

  return (
    ruleKey === "scan_report_review.low_confidence_critical_fields" ||
    ruleKey === "section_review.low_confidence_critical_fields" ||
    ruleKey === "section_review.low_extraction_confidence" ||
    ruleKey.startsWith("section_review.clarity_risk_") ||
    ruleKey.startsWith("section_review.confidence_") ||
    ruleKey === "section_review.rule_only_row_present"
  );
}

function isLowSignalPolicyNoiseFinding(ruleKey: string | null) {
  if (!ruleKey) {
    return false;
  }

  return (
    ruleKey === "scan_report_review.low_confidence_critical_fields" ||
    ruleKey === "section_review.low_confidence_critical_fields" ||
    ruleKey === "section_review.low_extraction_confidence" ||
    ruleKey === "policy_runtime.disclosure_likely_obstructed" ||
    ruleKey === "cookie_runtime.cookie_policy_obstructed" ||
    ruleKey.startsWith("section_review.clarity_risk_") ||
    ruleKey.startsWith("section_review.confidence_") ||
    ruleKey === "section_review.rule_only_row_present"
  );
}

function isRuntimePrivacyFinding(ruleKey: string | null) {
  return typeof ruleKey === "string" && ruleKey.startsWith("runtime_privacy.");
}

function findingSortBucket(ruleKey: string) {
  if (ruleKey.startsWith("access_review.")) {
    return 0;
  }
  if (ruleKey.startsWith("runtime_privacy.")) {
    return 1;
  }
  if (ruleKey.startsWith("cookie_runtime.")) {
    return 2;
  }
  if (ruleKey.startsWith("policy_runtime.")) {
    return 3;
  }
  if (ruleKey.startsWith("section_review.")) {
    return 4;
  }
  return 5;
}

function buildFindingSortBucket(ruleKeys: string[]) {
  const hasLegalCoverageGap = ruleKeys.includes("access_review.legal_coverage_unverified");
  const hasConsentInterfaceFinding = ruleKeys.includes("runtime_privacy.consent_interface_obstructive");
  const hasPreconsentFinding = ruleKeys.includes("runtime_privacy.preconsent_tracking_observed");

  return (ruleKey: string) => {
    if (ruleKey.startsWith("scan_report_review.")) {
      return 0;
    }

    if (ruleKey === "access_review.public_access_blocked") {
      return 1;
    }

    if (ruleKey === "access_review.legal_coverage_unverified") {
      return hasPreconsentFinding ? 1 : hasConsentInterfaceFinding ? 3 : 1;
    }

    if (ruleKey === "runtime_privacy.preconsent_tracking_observed") {
      return hasLegalCoverageGap ? 2 : 1;
    }

    if (ruleKey === "runtime_privacy.consent_interface_obstructive") {
      return hasLegalCoverageGap && hasPreconsentFinding ? 3 : 1;
    }

    return findingSortBucket(ruleKey) + 4;
  };
}

function getFindingSelectionScore(input: {
  evidence?: Record<string, unknown>;
  pageUrl: string | null;
  severity: string;
}) {
  const severityScore = severityWeight(input.severity) * 100;
  const evidenceScore =
    typeof input.evidence?.financialEvidenceScore === "number" && Number.isFinite(input.evidence.financialEvidenceScore)
      ? input.evidence.financialEvidenceScore
      : 0;
  const urlAdjustment = input.pageUrl === null ? -10 : Math.max(0, 20 - input.pageUrl.length / 10);

  return severityScore + evidenceScore + urlAdjustment;
}

function collapseSingletonRuleFindings<T extends { evidence?: Record<string, unknown>; pageUrl: string | null; ruleKey: string; severity: string }>(findings: T[]) {
  const singletonRuleKeys = new Set<string>([
    "section_review.no_transfer_mechanism_noted",
    "scan_report_review.low_confidence_critical_fields",
    "section_review.low_confidence_critical_fields",
    "section_review.low_extraction_confidence",
    "financial_review.fee_disclosure_present",
    "financial_review.apr_or_interest_rate_disclosure_present",
    "financial_review.past_performance_disclaimer_present"
  ]);
  const collapsed = new Map<string, T>();

  for (const finding of findings) {
    if (!singletonRuleKeys.has(finding.ruleKey) && !finding.ruleKey.startsWith("financial_review.")) {
      const uniqueKey = `${finding.ruleKey}::${finding.pageUrl ?? ""}::${collapsed.size}`;
      collapsed.set(uniqueKey, finding);
      continue;
    }

    const existing = collapsed.get(finding.ruleKey);
    if (!existing) {
      collapsed.set(finding.ruleKey, finding);
      continue;
    }

    const existingScore = getFindingSelectionScore(existing);
    const candidateScore = getFindingSelectionScore(finding);
    if (candidateScore > existingScore) {
      collapsed.set(finding.ruleKey, finding);
      continue;
    }

    if (
      candidateScore === existingScore &&
      (existing.pageUrl === null || (finding.pageUrl !== null && finding.pageUrl.length < existing.pageUrl.length))
    ) {
      collapsed.set(finding.ruleKey, finding);
    }
  }

  return [...collapsed.values()];
}

function isSupplementalSupportPolicyPage(input: { pageType: string | null; pageUrl: string | null }) {
  const haystack = `${input.pageType ?? ""}\n${input.pageUrl ?? ""}`.toLowerCase();

  if (input.pageType === "privacy_policy") {
    return /\/help\/|\/privacy-center\b|\/your-privacy-choices\b|\/do-not-share-my-data\b|\/guest\/settings\/privacy\b|\/guest\/settings\/do-not-share-my-data\b/.test(
      haystack
    );
  }

  if (input.pageType === "terms_of_service") {
    return /agreementservice|agreementtype=|\/api\/|\/graphql\b|\/rest\/|\/v\d+\//.test(haystack);
  }

  return false;
}

function hasSparsePolicyExtraction(input: {
  confidence: number | null;
  coverageRatio?: number | null;
  flags: string[];
  mentions: unknown[];
  snippetCount?: number | null;
  structurallyWeak?: boolean | null;
  summaryShort: unknown;
}) {
  if (input.structurallyWeak === true) {
    return true;
  }

  if (input.confidence !== null && input.confidence < 0.6) {
    return true;
  }

  if (input.coverageRatio !== null && input.coverageRatio !== undefined && input.coverageRatio < 0.5) {
    return true;
  }

  if (input.flags.includes("llm_provider_error") || input.flags.includes("low_confidence")) {
    return true;
  }

  if (input.snippetCount !== null && input.snippetCount !== undefined && input.snippetCount === 0) {
    return true;
  }

  if (input.mentions.length === 0) {
    return true;
  }

  return typeof input.summaryShort !== "string" || input.summaryShort.trim().length === 0;
}

function derivePolicyExtractionStatus(input: {
  confidence: number | null;
  flags: string[];
  pageType: string | null;
  snippetCount: number | null;
  structurallyWeak: boolean;
}) {
  if (input.flags.includes("policy_fetch_insufficient_content")) {
    return "parser_incomplete";
  }

  if (input.flags.includes("llm_partial_coverage") || input.flags.includes("llm_budget_exhausted")) {
    return "llm_partial";
  }

  if (
    input.structurallyWeak ||
    input.flags.includes("low_confidence") ||
    (typeof input.confidence === "number" && input.confidence < 0.6) ||
    (typeof input.snippetCount === "number" && input.snippetCount === 0)
  ) {
    return "structurally_weak";
  }

  return "fetched";
}

function getPolicyRightsSignals(enrichment: Record<string, unknown>) {
  const candidates =
    Array.isArray(enrichment.policy_rights_signals)
      ? enrichment.policy_rights_signals
      : Array.isArray(enrichment.policyRightsSignals)
        ? enrichment.policyRightsSignals
        : [];

  return candidates.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function getPolicyMentions(enrichment: Record<string, unknown>) {
  return Array.isArray(enrichment.policy_mentions)
    ? enrichment.policy_mentions.filter(
        (value): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
      )
    : [];
}

function getPolicyMentionTopics(enrichment: Record<string, unknown>) {
  return [...new Set(
    getPolicyMentions(enrichment)
      .map((mention) => (typeof mention.topic === "string" ? mention.topic.trim() : ""))
      .filter((value) => value.length > 0)
  )];
}

function getPolicyCookieDisclosures(enrichment: Record<string, unknown>) {
  return Array.isArray(enrichment.policy_cookie_disclosures)
    ? enrichment.policy_cookie_disclosures.filter(
        (value): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
      )
    : [];
}

function stringIncludesTransferCue(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return false;
  }

  return /data privacy framework|\bdpf\b|standard contractual clauses|\bsccs?\b|binding corporate rules|adequacy decision|cross-border transfer|international transfer/i.test(
    value
  );
}

function hasSubstantivePolicySemantics(input: {
  dsarMechanism: string | null;
  enrichment: Record<string, unknown>;
  pageType: string | null;
  policyRightsSignals: string[];
  retentionPeriods: unknown[];
  summaryShort: unknown;
  transferMechanisms: unknown[];
}) {
  const mentionTopics = getPolicyMentionTopics(input.enrichment);
  const cookieDisclosures = getPolicyCookieDisclosures(input.enrichment);
  const policyDoNotSell =
    typeof input.enrichment.policy_do_not_sell === "string" ? input.enrichment.policy_do_not_sell : null;
  const privacyContactChannelType =
    typeof input.enrichment.privacy_contact_channel_type === "string"
      ? input.enrichment.privacy_contact_channel_type
      : null;
  const policyChildrenReference =
    typeof input.enrichment.policy_children_reference === "string" ? input.enrichment.policy_children_reference : null;

  if (input.dsarMechanism === "present" || input.dsarMechanism === "partial") {
    return true;
  }

  if (input.policyRightsSignals.length > 0) {
    return true;
  }

  if (Array.isArray(input.transferMechanisms) && input.transferMechanisms.length > 0) {
    return true;
  }

  if (Array.isArray(input.retentionPeriods) && input.retentionPeriods.length > 0) {
    return true;
  }

  if (cookieDisclosures.length > 0) {
    return true;
  }

  if (mentionTopics.length >= 2) {
    return true;
  }

  if (policyDoNotSell === "present_link" || policyDoNotSell === "present_text") {
    return true;
  }

  if (privacyContactChannelType && privacyContactChannelType !== "none") {
    return true;
  }

  if (policyChildrenReference && policyChildrenReference !== "unknown" && policyChildrenReference !== "none") {
    return true;
  }

  if (stringIncludesTransferCue(input.summaryShort)) {
    return true;
  }

  if (
    input.pageType === "cookie_policy" &&
    typeof input.summaryShort === "string" &&
    /cookie settings|third-party cookies|targeting cookies|analytical cookies|measurement\/performance|marketing\/targeting/i.test(
      input.summaryShort
    )
  ) {
    return true;
  }

  if (
    input.pageType === "terms_of_service" &&
    (input.enrichment.policy_arbitration_present === true ||
      (Array.isArray(input.enrichment.policy_actionable_flags) &&
        input.enrichment.policy_actionable_flags.some(
          (value) =>
            value === "warranty_disclaimer_present" ||
            value === "liability_waiver_present" ||
            value === "content_use_restrictions_present"
        )) ||
      (typeof input.summaryShort === "string" &&
        /arbitration|binding contract|class action|governing law|limitation of liability/i.test(input.summaryShort)))
  ) {
    return true;
  }

  return false;
}

function hasConcreteSessionReplayEvidence(flags: string[]) {
  return flags.includes("session_replay_vendor_artifact_present");
}

function buildDomainPolicyCoverageSummary(policySemanticRows: Array<Record<string, unknown>>) {
  let hasRetentionDisclosure = false;
  let hasTransferDisclosure = false;
  let hasRightsDisclosure = false;
  let hasPrivacyContactDisclosure = false;
  let hasPrivacyChoiceDisclosure = false;

  for (const enrichment of policySemanticRows) {
    const retentionPeriods = Array.isArray(enrichment.policy_retention_periods) ? enrichment.policy_retention_periods : [];
    const transferMechanisms = Array.isArray(enrichment.policy_transfer_mechanisms) ? enrichment.policy_transfer_mechanisms : [];
    const policyRightsSignals = getPolicyRightsSignals(enrichment);
    const mentionTopics = getPolicyMentionTopics(enrichment);
    const dsarMechanism = typeof enrichment.policy_dsar_mechanism === "string" ? enrichment.policy_dsar_mechanism : null;
    const policyDoNotSell =
      typeof enrichment.policy_do_not_sell === "string" ? enrichment.policy_do_not_sell : null;
    const privacyContactChannelType =
      typeof enrichment.privacy_contact_channel_type === "string"
        ? enrichment.privacy_contact_channel_type
        : null;
    const summaryShort = enrichment.policy_summary_short ?? null;

    if (hasRetentionDisclosureEvidence({ enrichment, retentionPeriods, summaryShort })) {
      hasRetentionDisclosure = true;
    }

    if (transferMechanisms.length > 0 || stringIncludesTransferCue(summaryShort)) {
      hasTransferDisclosure = true;
    }

    if (
      dsarMechanism === "present" ||
      dsarMechanism === "partial" ||
      policyRightsSignals.length > 0
    ) {
      hasRightsDisclosure = true;
    }

    if (privacyContactChannelType && privacyContactChannelType !== "none" && privacyContactChannelType !== "unknown") {
      hasPrivacyContactDisclosure = true;
    }

    if (
      policyDoNotSell === "present_link" ||
      policyDoNotSell === "present_text" ||
      mentionTopics.includes("gpc_disclosure") ||
      mentionTopics.includes("targeted_advertising_disclosure") ||
      mentionTopics.includes("third_party_advertising_disclosure")
    ) {
      hasPrivacyChoiceDisclosure = true;
    }
  }

  return {
    hasPrivacyChoiceDisclosure,
    hasPrivacyContactDisclosure,
    hasRetentionDisclosure,
    hasRightsDisclosure,
    hasTransferDisclosure
  };
}

function getConsentChoicePolicyAnchor(policySemanticRows: Array<Record<string, unknown>>) {
  const rankedRows = policySemanticRows
    .map((row) => {
      const pageType = getString(row.page_type) ?? getString(row.pageType);
      const pageUrl = getString(row.page_url) ?? getString(row.pageUrl) ?? getString(row.source_url) ?? getString(row.sourceUrl);
      const summary = getString(row.policy_summary_short) ?? getString(row.policySummaryShort);
      const topics = getPolicyMentionTopics(row);
      const rightsSignals = getPolicyRightsSignals(row);
      const doNotSell = getString(row.policy_do_not_sell) ?? getString(row.policyDoNotSell);
      const privacyContactChannel =
        getString(row.privacy_contact_channel_type) ?? getString(row.privacyContactChannelType);
      const hasChoiceSignal =
        topics.some((topic) =>
          /gpc_disclosure|targeted_advertising_disclosure|third_party_advertising_disclosure|tracking_technologies_disclosure|session_replay_disclosure/i.test(
            topic
          )
        ) ||
        rightsSignals.some((signal) => /opt[-_]?out|privacy_controls/i.test(signal)) ||
        doNotSell === "present_link" ||
        doNotSell === "present_text" ||
        (typeof summary === "string" && /cookie settings|cookie preferences|your choices about cookies|privacy choices|opt[- ]out/i.test(summary));
      const score =
        (pageType === "cookie_policy" ? 30 : pageType === "privacy_policy" ? 20 : 0) +
        (pageUrl && /privacy\.[^/]+\/policies/i.test(pageUrl) ? 10 : 0) +
        (hasChoiceSignal ? 10 : 0) +
        (privacyContactChannel && privacyContactChannel !== "none" && privacyContactChannel !== "unknown" ? 1 : 0);

      return { hasChoiceSignal, pageType, pageUrl, row, score, summary };
    })
    .filter((row) => row.hasChoiceSignal && row.pageUrl && isSpecificConsentChoicePolicySnippet(row.summary))
    .sort((left, right) => right.score - left.score);

  const selected = rankedRows[0];
  if (!selected?.pageUrl || !selected.summary) {
    return null;
  }

  return {
    charEnd: getNumberValue(selected.row, "char_end") ?? getNumberValue(selected.row, "charEnd"),
    charStart: getNumberValue(selected.row, "char_start") ?? getNumberValue(selected.row, "charStart"),
    confidence: 0.72,
    documentType: selected.pageType ?? "policy",
    extractedBy: "wc01.validation_worker.policy_semantic_rows",
    extractionVersion: "policy_claim_candidate:v1",
    extractionStatus: "fetched",
    headingPath: getStringValue(selected.row, "heading_path") ?? getStringValue(selected.row, "headingPath"),
    id: buildPolicyClaimCandidateId({
      claimType: "cookie_preferences_available",
      snippet: selected.summary,
      sourceUrl: selected.pageUrl
    }),
    normalizedClaim: "The policy surface describes cookie, tracking, or privacy-choice controls available to visitors.",
    sectionPath: getStringValue(selected.row, "section_path") ?? getStringValue(selected.row, "sectionPath"),
    snippet: selected.summary,
    snippetHash: buildNanoDocumentContentHash(selected.summary),
    sourceUrl: selected.pageUrl
  };
}

function buildPolicyClaimCandidateId(input: { claimType: string; snippet: string; sourceUrl: string }) {
  const digest = createHash("sha256")
    .update([input.claimType, input.sourceUrl, input.snippet].join("\n"))
    .digest("hex")
    .slice(0, 16);
  return `policy_claim:${input.claimType}:${digest}`;
}

function buildRuntimeBehaviorArtifactId(input: { artifactType: string; phase: string; value: string }) {
  const digest = createHash("sha256")
    .update([input.artifactType, input.phase, input.value].join("\n"))
    .digest("hex")
    .slice(0, 16);
  return `runtime_artifact:${input.artifactType}:${input.phase}:${digest}`;
}

function buildPolicyRuntimeBridgeCandidateId(input: { bridgeRuleId: string; policyAnchorRef: string; runtimeAnchorRef: string }) {
  const digest = createHash("sha256")
    .update([input.bridgeRuleId, input.policyAnchorRef, input.runtimeAnchorRef].join("\n"))
    .digest("hex")
    .slice(0, 16);
  return `policy_runtime_bridge:${digest}`;
}

function isSpecificConsentChoicePolicySnippet(value: string | null | undefined) {
  const snippet = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (snippet.length < 32) {
    return false;
  }
  if (/insufficient policy content fetched|semantic review|error page|page not found/i.test(snippet)) {
    return false;
  }
  if (/^(?:privacy policy|cookie policy|terms of use|terms and conditions|legal|privacy center)$/i.test(snippet)) {
    return false;
  }
  if (!/(cookie|tracking|analytics|advertis(?:e|ing)|marketing|sale|share|consent|opt[- ]?out|preferences?|personal information|personal data|third part(?:y|ies)|data collection|collect(?:ed|ion)?|data use|use of data)/i.test(snippet)) {
    return false;
  }
  return /\b(?:collect|use|share|sell|disclose|store|process|track|consent|choose|control|disable|reject|opt[- ]?out|preference)\b/i.test(snippet);
}

function buildConsentGatedTrackingContradictionEvidence(input: {
  policySemanticRows: Array<Record<string, unknown>>;
  runtimeRequestUrls: string[];
  runtimeVendors: string[];
}) {
  const policyAnchor = getConsentChoicePolicyAnchor(input.policySemanticRows);
  const runtimeRequestUrls = input.runtimeRequestUrls.filter((value) => /^https?:\/\//i.test(value));
  const runtimeVendors = input.runtimeVendors.filter((value) => value.trim().length > 0);

  if (!policyAnchor || runtimeRequestUrls.length === 0 || runtimeVendors.length === 0) {
    return null;
  }

  const runtimeArtifact = {
    artifactType: "request",
    cmpVisibleMs: null,
    confidence: 0.82,
    consentActionObserved: false,
    host: (() => {
      try {
        return new URL(runtimeRequestUrls[0] ?? "").hostname;
      } catch {
        return null;
      }
    })(),
    id: buildRuntimeBehaviorArtifactId({
      artifactType: "request",
      phase: "pre_consent",
      value: runtimeRequestUrls[0] ?? runtimeVendors[0] ?? "unknown"
    }),
    phase: "pre_consent",
    sourceArtifactRef: runtimeRequestUrls[0] ?? runtimeVendors[0] ?? "runtime_preconsent_request_urls",
    timestampMs: null,
    url: runtimeRequestUrls[0] ?? null,
    vendor: runtimeVendors[0] ?? null,
    cookieName: null,
    storageKey: null
  };
  const bridgeRuleId = "validation_worker.consent_choice_policy_preconsent_runtime_v1";
  const bridgeCandidate = {
    bridgeRuleId,
    confidence: 0.78,
    generatedBy: "wc01.validation_worker",
    id: buildPolicyRuntimeBridgeCandidateId({
      bridgeRuleId,
      policyAnchorRef: policyAnchor.id,
      runtimeAnchorRef: runtimeArtifact.id
    }),
    mappingType: "deterministic_policy_runtime_mapping",
    mappingVersion: "policy_behavior_conflict_map:v1",
    policyAnchorRef: policyAnchor.id,
    reasoning:
      "Choice-control policy evidence is paired with concrete pre-consent runtime request URLs and attributed non-essential vendors.",
    runtimeAnchorRef: runtimeArtifact.id,
    sourceEvidenceIds: [policyAnchor.id, runtimeArtifact.id],
    supportsPromotionCandidate: true
  };
  const policyClaimCandidate = {
    charEnd: policyAnchor.charEnd,
    charStart: policyAnchor.charStart,
    claimType: "cookie_preferences_available",
    confidence: policyAnchor.confidence,
    documentType: policyAnchor.documentType,
    extractedBy: policyAnchor.extractedBy,
    extractionStatus: policyAnchor.extractionStatus,
    extractionVersion: policyAnchor.extractionVersion,
    headingPath: policyAnchor.headingPath,
    id: policyAnchor.id,
    sectionPath: policyAnchor.sectionPath,
    snippet: policyAnchor.snippet,
    snippetHash: policyAnchor.snippetHash,
    sourceUrl: policyAnchor.sourceUrl
  };

  return {
    claim: policyAnchor.normalizedClaim,
    contradictionBasis:
      "The policy and consent surfaces describe visitor choice controls, but non-essential advertising, analytics, or marketing requests were observed before a visitor choice was completed.",
    conflictBridge: {
      conflictType: "declared_cookie_choices_available_but_non_essential_tracking_fired_pre_choice",
      provenance: {
        bridgeRuleId: bridgeCandidate.bridgeRuleId,
        generatedBy: bridgeCandidate.generatedBy,
        mappingType: bridgeCandidate.mappingType,
        mappingVersion: bridgeCandidate.mappingVersion,
        policyAnchorRef: bridgeCandidate.policyAnchorRef,
        runtimeAnchorRef: bridgeCandidate.runtimeAnchorRef,
        sourceEvidenceIds: bridgeCandidate.sourceEvidenceIds
      },
      reasoning: bridgeCandidate.reasoning,
      supportsPromotion: bridgeCandidate.supportsPromotionCandidate
    },
    evidenceSufficiency: {
      conflictBridgePresent: true,
      policyAnchorPresent: true,
      promotionEligible: true,
      reviewStatus: "complete",
      runtimeAnchorPresent: true
    },
    policyAnchor: {
      claimType: "cookie_preferences_available",
      confidence: policyAnchor.confidence,
      extractionStatus: policyAnchor.extractionStatus,
      normalizedClaim: policyAnchor.normalizedClaim,
      snippet: policyAnchor.snippet,
      sourceUrl: policyAnchor.sourceUrl
    },
    policySnippet: policyAnchor.snippet,
    policySourceUrl: policyAnchor.sourceUrl,
    policyClaimCandidates: [policyClaimCandidate],
    policyRuntimeBridgeCandidates: [bridgeCandidate],
    runtimeAnchor: {
      confidence: 0.82,
      cookies: [],
      observationType: "marketing_vendor_fired_pre_consent",
      phase: "pre_consent",
      requests: runtimeRequestUrls,
      sourceUrl: null,
      storageArtifacts: [],
      vendors: runtimeVendors
    },
    runtimeBehaviorArtifacts: [runtimeArtifact],
    runtimeEvidenceArtifacts: runtimeRequestUrls,
    runtimeSummary:
      "Non-essential advertising, analytics, or marketing requests were observed before the visitor completed a consent choice.",
    runtimeVendors,
    sourceUrls: [policyAnchor.sourceUrl],
    supportingSignals: ["consent_choice_policy_anchor", "preconsent_runtime_request_urls"]
  };
}

function hasStrongPrivacyGovernanceCuesForPartialExtraction(input: {
  domainPolicyCoverage: ReturnType<typeof buildDomainPolicyCoverageSummary>;
  enrichment: Record<string, unknown>;
  flags: string[];
  pageType: string | null;
  policyExtractionStatus: string;
  summaryShort: unknown;
}) {
  if (input.pageType !== "privacy_policy" || input.policyExtractionStatus !== "llm_partial") {
    return false;
  }

  if (!input.flags.includes("llm_budget_exhausted") && !input.flags.includes("blocked_homepage_direct_policy_page")) {
    return false;
  }

  const snippets =
    input.enrichment.policy_evidence_snippets && typeof input.enrichment.policy_evidence_snippets === "object"
      ? (input.enrichment.policy_evidence_snippets as Record<string, unknown>)
      : null;
  const cueCount = [
    input.domainPolicyCoverage.hasRightsDisclosure,
    input.domainPolicyCoverage.hasRetentionDisclosure,
    input.domainPolicyCoverage.hasPrivacyContactDisclosure,
    input.domainPolicyCoverage.hasPrivacyChoiceDisclosure,
    typeof input.summaryShort === "string" &&
      /privacy|security|personal information|personal data|cookies?|your privacy/i.test(input.summaryShort),
    snippets !== null &&
      (Array.isArray(snippets.policy_rights_signals) ||
        "dsar" in snippets ||
        "notice_contact" in snippets ||
        "rights_signal:access" in snippets ||
        "rights_signal:delete" in snippets ||
        "rights_signal:manage" in snippets)
  ].filter(Boolean).length;

  return cueCount >= 3;
}

function isLikelyMisroutedMarketingPageExtraction(input: {
  dsarMechanism: string | null;
  flags: string[];
  mentions: Array<string | { confidence?: unknown; topic?: unknown }>;
  pageType: string | null;
  retentionPeriods: unknown[];
  summaryShort: unknown;
}) {
  if (input.pageType !== "privacy_policy") {
    return false;
  }

  if (!input.flags.includes("blocked_homepage_direct_policy_page")) {
    return false;
  }

  if (input.dsarMechanism && input.dsarMechanism !== "absent" && input.dsarMechanism !== "unknown") {
    return false;
  }

  if (Array.isArray(input.retentionPeriods) && input.retentionPeriods.length > 0) {
    return false;
  }

  const summary = typeof input.summaryShort === "string" ? input.summaryShort : "";
  if (summary.trim().length === 0) {
    return false;
  }

  const marketingCueMatches =
    summary.match(
      /experience cloud|home products|request demo|book a demo|product tour|pricing|solutions|customers|resources|marketing automation|commerce|business\.adobe\.com/gi
    ) ?? [];

  if (marketingCueMatches.length < 2) {
    return false;
  }

  const mentionTopics = input.mentions
    .map((mention) => {
      if (typeof mention === "string") {
        return mention;
      }

      return typeof mention.topic === "string" ? mention.topic : null;
    })
    .filter((value): value is string => value !== null);

  if (
    mentionTopics.some((topic) =>
      /privacy_rights|dsar|notice_contact|cookies?|tracking|personal_data|personal_information/i.test(topic)
    )
  ) {
    return false;
  }

  return mentionTopics.length <= 1;
}

function stringIncludesRetentionCue(value: unknown) {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.toLowerCase();
  if (
    /does not provide .*retention|no concrete retention|no retention periods|retention periods? (?:not|were not) (?:provided|noted|disclosed)|without (?:any )?retention/i.test(
      normalized
    )
  ) {
    return false;
  }

  return /how long do we keep|retain(?:ed)? .* personal data|retain(?:ed)? .* personal information|deleted after|deleted within|stored for approximately|as long as reasonably necessary|retention period varies/i.test(
    normalized
  );
}

function hasRetentionDisclosureEvidence(input: {
  enrichment: Record<string, unknown>;
  retentionPeriods: unknown[];
  summaryShort: unknown;
}) {
  if (Array.isArray(input.retentionPeriods) && input.retentionPeriods.length > 0) {
    return true;
  }

  if (stringIncludesRetentionCue(input.summaryShort)) {
    return true;
  }

  const retentionDisclosure =
    getString(input.enrichment.policy_retention_disclosure) ?? getString(input.enrichment.policyRetentionDisclosure);
  if (retentionDisclosure && retentionDisclosure !== "absent" && retentionDisclosure !== "unknown") {
    return true;
  }

  const fieldCoverage = getRecord(input.enrichment.policy_field_coverage) ?? getRecord(input.enrichment.policyFieldCoverage);
  const retentionCoverage = getRecord(fieldCoverage?.retention);
  return retentionCoverage?.found === true;
}

function hasMatchingDocumentSourceRetentionCue(input: {
  documentSources: Array<Record<string, unknown>>;
  pageType: string | null;
  pageUrl: string | null;
}) {
  if (input.pageType !== "privacy_policy") {
    return false;
  }

  const normalizedPageUrl = getString(input.pageUrl);
  const matchingRows = input.documentSources.filter((row) => {
    const documentType = getString(row.document_type) ?? getString(row.documentType);
    const sourceStatus = getString(row.source_status) ?? getString(row.sourceStatus) ?? "ready";
    const documentText = getString(row.document_text) ?? getString(row.documentText);

    if (documentType !== "privacy_policy" || sourceStatus !== "ready" || !documentText) {
      return false;
    }

    return true;
  });

  const exactMatch = matchingRows.find((row) => {
    const canonicalUrl =
      getString(row.canonical_url) ?? getString(row.canonicalUrl) ?? getString(row.source_url) ?? getString(row.sourceUrl);
    return normalizedPageUrl && canonicalUrl === normalizedPageUrl;
  });

  if (exactMatch) {
    const documentText = getString(exactMatch.document_text) ?? getString(exactMatch.documentText);
    if (hasRetentionInferenceCue(documentText)) {
      return true;
    }
  }

  const bestFallback = [...matchingRows]
    .sort((left, right) => getPrivacyDocumentSpecificityScore(right) - getPrivacyDocumentSpecificityScore(left))[0];
  const fallbackText = getString(bestFallback?.document_text) ?? getString(bestFallback?.documentText);
  return hasRetentionInferenceCue(fallbackText);
}

function hasStrongCookieCategoryDisclosure(input: {
  disclosures: Array<Record<string, unknown>>;
  flags: string[];
  mentionTopics?: string[];
  summaryShort: unknown;
}) {
  if (input.flags.includes("low_confidence")) {
    return false;
  }

  if (typeof input.summaryShort !== "string") {
    return Array.isArray(input.mentionTopics)
      ? input.mentionTopics.some((topic) =>
          /cookie_(tracking_technologies_disclosure|third_party_advertising_disclosure|data_retention)|third_party_advertising_disclosure|tracking_technologies_disclosure/i.test(
            topic
          )
        )
      : false;
  }

  return (
    /cookie preferences|cookie settings|required cookies|functional cookies|advertising cookies|targeting cookies|measurement\/performance|prior consent|manage(?: your)? cookie/i.test(
      input.summaryShort
    ) ||
    (Array.isArray(input.mentionTopics) &&
      input.mentionTopics.some((topic) =>
        /cookie_(tracking_technologies_disclosure|third_party_advertising_disclosure|data_retention)|third_party_advertising_disclosure|tracking_technologies_disclosure/i.test(
          topic
        )
      ))
  );
}

function shouldApplyCookieCategoryDisclosureSafeHarbor(input: {
  disclosures: Array<Record<string, unknown>>;
  flags: string[];
  mentionTopics?: string[];
  summaryShort: unknown;
}) {
  return input.disclosures.length === 0 && hasStrongCookieCategoryDisclosure(input);
}

function isObstructedCookiePolicyUrl(value: string | null) {
  return /(?:captcha|blocked|challenge|interstitial|splashui)/i.test(value ?? "");
}

function buildPolicyRuntimeFinding(input: {
  description: string;
  evidence: Record<string, unknown>;
  pageType: string | null;
  pageUrl: string | null;
  ruleKey: string;
  severity: "high" | "medium" | "low";
  title: string;
}) {
  const taxonomy = deriveValidationFindingTaxonomy({
    category: "scan_report_review",
    ruleKey: input.ruleKey,
    subtype: "policy_runtime_review"
  });

  return {
    category: "scan_report_review" as const,
    description: input.description,
    evidence: {
      ...input.evidence,
      external_surfacing_requires_normalized_concern_policy: true,
      validation_surfacing_scope: "internal_validation_only"
    },
    findingFamily: taxonomy.familyId,
    findingScope: taxonomy.scope,
    findingSource: taxonomy.source,
    findingSubject: taxonomy.subject,
    pageUrl: input.pageUrl,
    rank: 0,
    ruleKey: input.ruleKey,
    severity: input.severity,
    subtype: "policy_runtime_review" as const,
    title: input.title
  };
}

function classifyFinancialValidationPage(
  pageType: string | null,
  input?: {
    blockText?: string | null;
    candidateSignals?: string[];
  }
) {
  const raw = (pageType ?? "").toLowerCase();
  const candidateSignals = new Set((input?.candidateSignals ?? []).map((value) => value.toLowerCase()));
  const blockText = input?.blockText ?? "";

  if (/pricing|fee/.test(raw)) {
    return "pricing_or_fees" as const;
  }
  if (/privacy|terms|disclosure|legal|policy/.test(raw)) {
    return "disclosure_or_legal" as const;
  }
  if (/contact|about|support/.test(raw)) {
    return "identity_or_contact" as const;
  }
  if (/product|offer|account|card|loan|trading|invest|savings|apy|apr/.test(raw)) {
    return "financial_offer" as const;
  }
  if (/checkout|bnpl|installment|finance/.test(raw)) {
    return "quasi_financial_offer" as const;
  }
  if (/homepage|landing/.test(raw)) {
    if (
      candidateSignals.has("investment_context") ||
      candidateSignals.has("returns") ||
      candidateSignals.has("simulated") ||
      candidateSignals.has("earnings") ||
      /\b(apy|apr|yield|return|returns|profit|profits|trading|invest|copy trading|backtest|backtested|capital at risk)\b/i.test(
        blockText
      )
    ) {
      return "financial_offer" as const;
    }
    if (
      candidateSignals.has("pricing") ||
      candidateSignals.has("pricing_fee") ||
      /\b(price|pricing|fee|fees|commission|spread|charges?)\b/i.test(blockText)
    ) {
      return "pricing_or_fees" as const;
    }
  }

  return "unknown" as const;
}

type ValidationFindingRow = {
  category: "scan_report_review";
  description: string;
  evidence: Record<string, unknown>;
  findingFamily: string;
  findingScope: string;
  findingSource: string;
  findingSubject: string;
  pageUrl: string | null;
  rank: number;
  ruleKey: string;
  severity: "high" | "medium" | "low";
  subtype: string | null;
  title: string;
};

const SECTION_FINANCIAL_REVIEW_SUFFIXES = new Set([
  "simulated_performance_without_disclosure",
  "unqualified_superlative_claim_detected",
  "financial_urgency_pressure_tactic_detected"
]);

function getEvidenceBoolean(evidence: Record<string, unknown>, key: string) {
  return evidence[key] === true;
}

function getEvidenceStringArray(evidence: Record<string, unknown>, key: string) {
  return Array.isArray(evidence[key])
    ? (evidence[key] as unknown[]).filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
}

function getPromotableFinancialSectionSuffix(finding: ValidationFindingRow) {
  if (!finding.ruleKey.startsWith("section_review.")) {
    return null;
  }

  const suffix = finding.ruleKey.replace(/^section_review\./, "");
  if (!SECTION_FINANCIAL_REVIEW_SUFFIXES.has(suffix)) {
    return null;
  }

  const evidence = getRecord(finding.evidence) ?? {};
  const candidateSignals = getEvidenceStringArray(evidence, "candidate_signals");
  const blockText =
    getString(evidence.candidate_block_text) ??
    getString(evidence.claim_text) ??
    getString(evidence.matchedSnippet) ??
    null;
  const pageType = getString(evidence.page_type);
  const pageClassification = classifyFinancialValidationPage(pageType, {
    blockText,
    candidateSignals
  });
  const commercialContext = getEvidenceBoolean(evidence, "commercial_context");
  const claimPresent = getEvidenceBoolean(evidence, "claim_present") || Boolean(blockText);
  if (!commercialContext || !claimPresent) {
    return null;
  }

  if (!["financial_offer", "quasi_financial_offer", "pricing_or_fees"].includes(pageClassification)) {
    return null;
  }

  return suffix;
}

export function promoteSectionFinancialReviewFindings(findings: ValidationFindingRow[]) {
  const promoted = [...findings];
  const existingRuleKeys = new Set(findings.map((finding) => finding.ruleKey));

  for (const finding of findings) {
    const suffix = getPromotableFinancialSectionSuffix(finding);
    if (!suffix) {
      continue;
    }

    const definition = getFinancialCommercialDefinition(suffix);
    if (!definition || existingRuleKeys.has(definition.ruleKey)) {
      continue;
    }

    const evidence = getRecord(finding.evidence) ?? {};
    const candidateSignals = getEvidenceStringArray(evidence, "candidate_signals");
    const blockText =
      getString(evidence.candidate_block_text) ??
      getString(evidence.claim_text) ??
      getString(evidence.matchedSnippet) ??
      null;
    const pageType = getString(evidence.page_type);
    const pageClassification = classifyFinancialValidationPage(pageType, {
      blockText,
      candidateSignals
    });
    const pageUrl = finding.pageUrl ?? getString(evidence.page_url);
    const taxonomy = deriveValidationFindingTaxonomy({
      category: "scan_report_review",
      ruleKey: definition.ruleKey,
      subtype: "financial_review"
    });

    promoted.push({
      category: "scan_report_review",
      description: definition.description,
      evidence: {
        ...evidence,
        claimText: getString(evidence.claim_text) ?? blockText,
        matchedPhrase: getString(evidence.claim_text) ?? blockText,
        matchedSnippet: blockText,
        pageClassification,
        pageType,
        pageUrl,
        policySnippets: blockText ? [blockText] : [],
        sourceUrls: pageUrl ? [pageUrl] : [],
        supportingHeadings: getString(evidence.candidate_block_heading) ? [getString(evidence.candidate_block_heading)] : [],
        supportingSignals: candidateSignals,
        unifiedFindingId: suffix
      },
      findingFamily: taxonomy.familyId,
      findingScope: taxonomy.scope,
      findingSource: taxonomy.source,
      findingSubject: taxonomy.subject,
      pageUrl,
      rank: 0,
      ruleKey: definition.ruleKey,
      severity: definition.severity,
      subtype: "financial_review",
      title: definition.title
    });
    existingRuleKeys.add(definition.ruleKey);
  }

  return promoted;
}

type ValidationArtifactBundle = {
  accessibilityRuleExamples?: Array<Record<string, unknown>>;
  documentSources?: Array<Record<string, unknown>>;
  macroEnrichment?: Record<string, unknown> | null;
  pageEvidence: Array<Record<string, unknown>>;
  pages: Array<Record<string, unknown>>;
  policyEnrichments?: Array<Record<string, unknown>>;
  policySemanticRows?: Array<Record<string, unknown>>;
  policySemanticInputs?: Array<Record<string, unknown>>;
  policyReviewQueue: Array<Record<string, unknown>>;
  preferDocumentSources?: boolean;
  preconsentViolations: Array<Record<string, unknown>>;
  rawPolicyEnrichmentRows?: Array<Record<string, unknown>>;
  runtimeArtifacts: Record<string, unknown> | null;
  scan: Record<string, unknown> | null;
  signalHits: Array<Record<string, unknown>>;
  snapshot: Record<string, unknown> | null;
  trackerVendors: Array<Record<string, unknown>>;
};

function getAccessibilityStringValue(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function getAccessibilityNumberValue(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function getAccessibilityStringArrayValue(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (Array.isArray(value)) {
      return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
    }
    if (typeof value === "string" && value.trim().length > 0) {
      try {
        const parsed = JSON.parse(value) as unknown;
        if (Array.isArray(parsed)) {
          return parsed.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
        }
      } catch {
        return [value.trim()];
      }
    }
  }

  return [];
}

function deriveAccessFindings(input: {
  documentSources?: Array<Record<string, unknown>>;
  pages: Array<Record<string, unknown>>;
  runtimeArtifacts: Record<string, unknown> | null;
  snapshot: Record<string, unknown> | null;
}) {
  const snapshot = input.snapshot;
  if (!snapshot) {
    return [] as Array<ReturnType<typeof buildSectionIssueFinding>>;
  }

  const blockedFlag = getRecordBoolean(snapshot, "blocked_flag");
  const partialScan = getRecordBoolean(snapshot, "partial_scan");
  const authWallDetected = getRecordBoolean(snapshot, "auth_wall_detected");
  const captchaFlag = getRecordBoolean(snapshot, "captcha_flag");
  const authWallSuspected = getRecordBoolean(snapshot, "auth_wall_suspected");
  const challengeSuspected = getRecordBoolean(snapshot, "challenge_suspected");
  const cookieBannerPresent = getRecordBoolean(snapshot, "cookie_banner_present");
  const granularPreferencesPresent = getRecordBoolean(snapshot, "granular_preferences_present");
  const blockPageClassification = getStringValue(snapshot, "block_page_classification");
  const homepageFetchStatus = getStringValue(snapshot, "homepage_fetch_status");
  const stopReasonCode = getStringValue(snapshot, "stop_reason_code");
  const stopReasonLabel = getStringValue(snapshot, "stop_reason_label");
  const stopReasonDetail = getStringValue(snapshot, "stop_reason_detail");
  const stopReasonHttpStatus =
    typeof snapshot.stop_reason_http_status === "number" && Number.isFinite(snapshot.stop_reason_http_status)
      ? snapshot.stop_reason_http_status
      : null;
  const coverageLevel = getStringValue(snapshot, "coverage_level");
  const verifiedSurfaceCount =
    typeof snapshot.verified_public_surfaces_count === "number" && Number.isFinite(snapshot.verified_public_surfaces_count)
      ? snapshot.verified_public_surfaces_count
      : 0;
  const readyDocumentCount = (input.documentSources ?? []).filter((row) => row.source_status === "ready").length;
  const accessLimitedByProtection =
    homepageFetchStatus === "forbidden" ||
    stopReasonHttpStatus === 403 ||
    captchaFlag ||
    stopReasonCode === "reachability_blocked_captcha" ||
    stopReasonCode === "reachability_blocked_auth_wall";

  const hybridRuntimeEvidence = getRecord(input.runtimeArtifacts?.hybrid_runtime_evidence ?? input.runtimeArtifacts?.hybridRuntimeEvidence);
  const consentSummary = getRecord(hybridRuntimeEvidence?.consentSummary);
  const browserReachedPublicContent =
    cookieBannerPresent ||
    granularPreferencesPresent ||
    getRecordBoolean(consentSummary, "cmpDetected") ||
    getRecordBoolean(consentSummary, "managePresent") ||
    getRecordBoolean(consentSummary, "acceptPresent") ||
    getRecordBoolean(consentSummary, "rejectPresent");
  const vendorInterstitialOnly =
    !blockedFlag &&
    !captchaFlag &&
    !authWallSuspected &&
    (challengeSuspected || blockPageClassification === "vendor_interstitial_probable");

  if (!partialScan || !accessLimitedByProtection) {
    return [] as Array<ReturnType<typeof buildSectionIssueFinding>>;
  }

  if (readyDocumentCount > 0 || verifiedSurfaceCount > 0) {
    return [] as Array<ReturnType<typeof buildSectionIssueFinding>>;
  }

  if (vendorInterstitialOnly && browserReachedPublicContent) {
    return [] as Array<ReturnType<typeof buildSectionIssueFinding>>;
  }

  const homepageRow =
    input.pages.find((row) => getStringValue(row, "page_type") === "homepage") ?? null;
  const pageUrl = getStringValue(homepageRow, "page_url");

  return [
    buildSectionIssueFinding({
      description:
        stopReasonDetail ??
        "The scan could not verify public-facing legal or homepage content because site protections blocked access early in the run.",
      evidence: {
        access_posture_class: getStringValue(snapshot, "access_posture_class"),
        auth_wall_detected: authWallDetected,
        auth_wall_suspected: authWallSuspected,
        blocked_flag: blockedFlag,
        block_page_classification: blockPageClassification,
        captcha_flag: captchaFlag,
        challenge_suspected: challengeSuspected,
        coverage_level: coverageLevel,
        homepage_fetch_status: homepageFetchStatus,
        partial_scan: partialScan,
        stop_reason_code: stopReasonCode,
        stop_reason_http_status: stopReasonHttpStatus,
        stop_reason_label: stopReasonLabel,
        verified_public_surfaces_count: verifiedSurfaceCount
      },
      pageType: "homepage",
      pageUrl,
      ruleKey: "access_review.public_access_blocked",
      severity: authWallDetected || captchaFlag ? "high" : "medium",
      title: "Public access blocked during scan"
    })
  ];
}

function deriveLegalCoverageFindings(input: {
  documentSources?: Array<Record<string, unknown>>;
  snapshot: Record<string, unknown> | null;
}) {
  const snapshot = input.snapshot;
  if (!snapshot) {
    return [] as Array<ReturnType<typeof buildSectionIssueFinding>>;
  }

  const blockedFlag = getRecordBoolean(snapshot, "blocked_flag");
  const captchaFlag = getRecordBoolean(snapshot, "captcha_flag");
  const partialScan = getRecordBoolean(snapshot, "partial_scan");
  const privacyPolicyPresent = getRecordBoolean(snapshot, "privacy_policy_present");
  const termsPresent = getRecordBoolean(snapshot, "terms_of_service_present");
  const cookiePolicyPresent = getRecordBoolean(snapshot, "cookie_policy_present");
  const verifiedSurfaceCount =
    typeof snapshot.verified_public_surfaces_count === "number" && Number.isFinite(snapshot.verified_public_surfaces_count)
      ? snapshot.verified_public_surfaces_count
      : 0;
  const readyDocumentCount = (input.documentSources ?? []).filter((row) => row.source_status === "ready").length;

  if (!partialScan || blockedFlag || captchaFlag) {
    return [] as Array<ReturnType<typeof buildSectionIssueFinding>>;
  }

  if (verifiedSurfaceCount > 0 || readyDocumentCount > 0) {
    return [] as Array<ReturnType<typeof buildSectionIssueFinding>>;
  }

  if (privacyPolicyPresent || termsPresent || cookiePolicyPresent) {
    return [] as Array<ReturnType<typeof buildSectionIssueFinding>>;
  }

  return [
    buildSectionIssueFinding({
      description:
        "The scan completed only partially and could not verify public privacy, cookie, or terms documents, so policy-side validation remains incomplete.",
      evidence: {
        blocked_flag: blockedFlag,
        captcha_flag: captchaFlag,
        coverage_level: getStringValue(snapshot, "coverage_level"),
        partial_scan: partialScan,
        privacy_policy_present: privacyPolicyPresent,
        terms_of_service_present: termsPresent,
        cookie_policy_present: cookiePolicyPresent,
        verified_public_surfaces_count: verifiedSurfaceCount
      },
      pageType: null,
      pageUrl: null,
      ruleKey: "access_review.legal_coverage_unverified",
      severity: "medium",
      title: "Legal coverage could not be verified"
    })
  ];
}

function getStringArray(record: Record<string, unknown> | null | undefined, key: string) {
  return Array.isArray(record?.[key])
    ? (record?.[key] as unknown[]).filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
}

function getStringValue(record: Record<string, unknown> | null | undefined, key: string) {
  return typeof record?.[key] === "string" && String(record[key]).trim().length > 0 ? String(record[key]).trim() : null;
}

function getNumberValue(record: Record<string, unknown> | null | undefined, key: string) {
  return typeof record?.[key] === "number" && Number.isFinite(record[key]) ? Number(record[key]) : null;
}

function getEvidenceSiblingIndex(row: Record<string, unknown>) {
  return getNumberValue(row, "sibling_index") ?? getNumberValue(row, "siblingIndex");
}

function getEvidenceTokenStart(row: Record<string, unknown>) {
  return getNumberValue(row, "token_start") ?? getNumberValue(row, "tokenStart");
}

function getEvidenceTokenEnd(row: Record<string, unknown>) {
  return getNumberValue(row, "token_end") ?? getNumberValue(row, "tokenEnd");
}

function getFinancialValidationDefinition(signalKey: string) {
  switch (signalKey) {
    case "commercial.explicit_fee_disclosure_text_present":
      return {
        description: "The scan retained explicit fee disclosure text on a public-facing pricing or offer page.",
        ruleKey: "financial_review.fee_disclosure_present",
        severity: "medium" as const,
        title: "Fee disclosure present",
        unifiedFindingId: "fee_disclosure_present" as const
      };
    case "financial.apr_or_interest_rate_disclosure_text_present":
      return {
        description: "The scan retained explicit APR or interest-rate disclosure text on a public-facing financial offer page.",
        ruleKey: "financial_review.apr_or_interest_rate_disclosure_present",
        severity: "medium" as const,
        title: "APR or interest-rate disclosure present",
        unifiedFindingId: "apr_or_interest_rate_disclosure_present" as const
      };
    case "financial.past_performance_disclaimer_text_present":
      return {
        description: "The scan retained an explicit past-performance disclaimer on a public-facing strategy, offer, or disclosure page.",
        ruleKey: "financial_review.past_performance_disclaimer_present",
        severity: "low" as const,
        title: "Past-performance disclaimer present",
        unifiedFindingId: "past_performance_disclaimer_present" as const
      };
    default:
      return null;
  }
}

function getFinancialCommercialDefinition(findingId: string) {
  switch (findingId) {
    case "simulated_performance_without_disclosure":
      return {
        description:
          "The scan retained hypothetical, simulated, or backtest-style performance language without nearby qualifying disclosure evidence.",
        ruleKey: "financial_review.simulated_performance_without_disclosure",
        severity: "high" as const,
        title: "Simulated performance without disclosure"
      };
    case "unqualified_superlative_claim_detected":
      return {
        description:
          "The scan retained unqualified superlative financial-promotion language that appears to overstate comparative or performance superiority.",
        ruleKey: "financial_review.unqualified_superlative_claim_detected",
        severity: "medium" as const,
        title: "Unqualified superlative claim detected"
      };
    case "financial_urgency_pressure_tactic_detected":
      return {
        description:
          "The scan retained urgency or scarcity language tied to a financial conversion prompt without nearby balancing disclosure evidence.",
        ruleKey: "financial_review.financial_urgency_pressure_tactic_detected",
        severity: "medium" as const,
        title: "Financial urgency pressure tactic detected"
      };
    default:
      return null;
  }
}

function hasKeyword(value: string | null, pattern: RegExp) {
  return value ? pattern.test(value) : false;
}

const FINANCIAL_SUPERLATIVE_MARKETING_PATTERN =
  /\b(?:best|leading|highest|number\s*1|#1|ultimate|premier|most[-\s]?(?:profitable|accurate|successful|trusted|popular|effective)|fastest[-\s]?(?:growing|returns?|profits?|signals?|execution)|top[-\s]?(?:rated|performing|signals?|traders?|brokers?|platform|service|strategy))\b/i;
const FINANCIAL_OUTPERFORMANCE_MARKETING_PATTERN = /\b(?:outperform(?:ance)?|beat(?:ing)?|better than)\b/i;
const FINANCIAL_NEGATED_GUARANTEE_PATTERN =
  /\?|do\b.*\bguarantee|does\b.*\bguarantee|no\b[\w\s-]{0,40}\bguarantee(?:d)?|does not guarantee|don[’']t guarantee|cannot guarantee/i;
const FINANCIAL_PRICING_TRANSPARENCY_PATTERN =
  /\b(?:transparent pricing|simple (?:and|&) transparent pricing|no hidden charges?|no extra cost|cancel anytime|secure, simple, and transparent payment process)\b/i;
const FINANCIAL_REFUND_ONLY_PATTERN =
  /\b(?:money-back guarantee|full refund|refund within|refund period|risk-free|try .* risk-free)\b/i;
const FINANCIAL_EDUCATIONAL_EXPLAINER_PATTERN =
  /\b(?:is a type of trading strategy|what is\b|learn\b|guide\b|tutorial\b|the goal is to identify|price action trading|swing trading strategy|naked trading)\b/i;
const FINANCIAL_COMMERCIAL_PACKAGE_PATTERN =
  /\b(?:vip access|vip signals|buy now|choose plan|subscription|package|accuracy|pips|per month|per day|monthly profit|weekly profit|daily profit|limited time offer)\b/i;
const FINANCIAL_TESTIMONIAL_PATTERN =
  /\b(?:i['’]?m|i['’]?ve|i have|my account|thank you|god bless|awesome|speechless|happy customer|customer feedback|subscriber|review|reviews|testimonial|testimonials)\b/i;
const FINANCIAL_TITLE_LIKE_PATTERN = /^[^.!?\n]{0,140}\|\s*[^.!?\n]{0,120}$/i;
const FINANCIAL_STRUCTURED_PERFORMANCE_PATTERN =
  /\b(?:\d{1,3}(?:-\d{1,3})?(?:\.\d+)?%\s+accuracy|\+?\d{2,6}(?:-\d{2,6})?\s*pips?\b(?:.{0,24}\b(?:guaranteed|per month|weekly|daily))?|(?:\$|usd|eur|gbp)\s?\d.{0,32}\b(?:package|plan|subscription|membership|access)\b|\b\d(?:-\d)?\s*figure\s+returns\b)\b/i;
const FINANCIAL_SIGNAL_SERVICE_CONTEXT_PATTERN =
  /\b(?:forex|futures?|options?|cfds?|spread betting|trading signals?|signal service|copy our trades|copy trading|mirror trading|prop firm|funded accounts?|funded trader|fundednext|we fund traders|challenge fee|evaluation fee|profit split|keep \d{1,3}% of profits|pips?|win rate|accuracy)\b/i;
const FINANCIAL_REGISTRATION_DISCLOSURE_PATTERN =
  /\b(?:NFA\s*(?:member\s*)?(?:ID|registration|number)|CFTC\s+registration|registered\s+(?:CTA|CPO|FCM)|commodity trading advisor|commodity pool operator|SEC\s+(?:RIA|registered investment adviser|registered investment advisor)|Form\s+ADV|CRD\s*(?:number|#)|FCA\s+(?:registration|reference)\s*(?:number|no\.?)|FRN\s*\d|ASIC\s+(?:AFS|license|licence|registration)|AFSL\s*\d|FSCA\s+(?:FSP|registration)|FSP\s*(?:number|no\.?)|MAS\s+(?:regulated|license|licence|registration))\b/i;
const FINANCIAL_RISK_DISCLOSURE_PATTERN =
  /\b(?:past performance is not indicative of future results|past performance does not guarantee future results|individual results may vary|trading involves risk|risk of loss|you can lose money|not investment advice|educational purposes only|informational purposes only|not a registered (?:investment adviser|investment advisor|cta|cpo)|not registered with (?:the )?(?:sec|cftc|nfa))\b/i;

function scoreFinancialCommercialSnippet(text: string | null, signalKeys: string[] = []) {
  if (!text) {
    return Number.NEGATIVE_INFINITY;
  }

  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length === 0) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = Math.min(32, normalized.length / 10);

  if (/\b(earn|earned|earning|earnings|income|profit|profits|profitable|make money|cash flow|passive income)\b/i.test(normalized)) {
    score += 24;
  }
  if (/\b(return|returns|yield|apy|apr|roi|performance)\b/i.test(normalized)) {
    score += 18;
  }
  if (/\b\d+(?:\.\d+)?%\b/.test(normalized)) {
    score += 16;
  }
  if (/\b(monthly|weekly|daily|annual|yearly|per month|per year)\b/i.test(normalized)) {
    score += 10;
  }
  if (/\b(backtest(?:ed)?|hypothetical|simulated|historical performance)\b/i.test(normalized)) {
    score += 18;
  }
  if (/\b(guarantee|guaranteed|assured|risk[- ]free)\b/i.test(normalized)) {
    score += 18;
  }
  if (FINANCIAL_SUPERLATIVE_MARKETING_PATTERN.test(normalized)) {
    score += 8;
  }
  if (/\b(trading|trader|forex|crypto|investment|investing|funded|copy trading|signals?)\b/i.test(normalized)) {
    score += 8;
  }
  if (/\b(join|sign up|subscribe|apply|open account|get started|start now|claim|buy now)\b/i.test(normalized)) {
    score += 6;
  }
  if (/\b(price|pricing|fee|fees|cost|charge|commission|spread|billing)\b/i.test(normalized)) {
    score += 4;
  }
  if (FINANCIAL_STRUCTURED_PERFORMANCE_PATTERN.test(normalized)) {
    score += 32;
  }
  if (/\b(i am|i've|i have|my |me |we |our experience|user|users|member|members|review|reviews|testimonial|testimonials)\b/i.test(normalized)) {
    score -= 24;
  }
  if (FINANCIAL_TESTIMONIAL_PATTERN.test(normalized)) {
    score -= 40;
  }
  if (FINANCIAL_TITLE_LIKE_PATTERN.test(normalized)) {
    score -= 36;
  }

  if (normalized.split(/\s+/).length <= 2) {
    score -= 25;
  }
  if (normalized.split(/\s+/).length <= 4 && !/\b\d+(?:\.\d+)?%\b/.test(normalized)) {
    score -= 12;
  }
  if (/^(free|pricing|fee|fees|commission|cost|charge|spread|profit|profits|return|returns)$/i.test(normalized)) {
    score -= 40;
  }

  if (signalKeys.includes("financial.performance_claim_text_present")) {
    score += 8;
  }
  if (signalKeys.includes("financial.return_or_yield_percentage_present")) {
    score += 8;
  }
  if (signalKeys.includes("financial.guaranteed_return_language_present")) {
    score += 8;
  }
  if (signalKeys.includes("financial.hypothetical_or_backtest_language_present")) {
    score += 8;
  }

  return score;
}

function selectFinancialCommercialMatchedText(input: { matchedTexts: string[]; signalKeys: string[] }) {
  return [...input.matchedTexts].sort((left, right) => {
    const scoreDelta =
      scoreFinancialCommercialSnippet(right, input.signalKeys) -
      scoreFinancialCommercialSnippet(left, input.signalKeys);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return right.length - left.length;
  })[0] ?? null;
}

function scoreFinancialCommercialFindingSnippet(input: {
  findingId: string;
  signalKeys: string[];
  text: string;
}) {
  const normalized = input.text.replace(/\s+/g, " ").trim();
  let score = scoreFinancialCommercialSnippet(normalized, input.signalKeys);

  switch (input.findingId) {
    case "simulated_performance_without_disclosure":
      if (/\b(backtest(?:ed)?|hypothetical|simulated|paper trading|historical performance)\b/i.test(normalized)) {
        score += 48;
      } else {
        score -= 60;
      }
      break;
    case "unqualified_superlative_claim_detected":
      if (
        FINANCIAL_SUPERLATIVE_MARKETING_PATTERN.test(normalized) ||
        FINANCIAL_OUTPERFORMANCE_MARKETING_PATTERN.test(normalized)
      ) {
        score += 36;
      } else {
        score -= 60;
      }
      if (FINANCIAL_STRUCTURED_PERFORMANCE_PATTERN.test(normalized)) {
        score += 18;
      }
      if (
        /\b(in this example|for example|example of|learn how|what is|guide|tutorial|analy(?:s|z)e|historical pricing trends|future direction|chosen asset)\b/i.test(
          normalized
        )
      ) {
        score -= 28;
      }
      if (FINANCIAL_TITLE_LIKE_PATTERN.test(normalized)) {
        score -= 30;
      }
      break;
    case "financial_urgency_pressure_tactic_detected":
      if (/\b(limited|hurry|ending soon|act now|spots left|last chance|expires?|deadline)\b/i.test(normalized)) {
        score += 42;
      } else {
        score -= 50;
      }
      if (/\b(join|sign up|subscribe|apply|open account|get started|start now|claim|buy now|free)\b/i.test(normalized)) {
        score += 12;
      }
      break;
    default:
      break;
  }

  return score;
}

function selectFinancialCommercialMatchedTextForFinding(input: {
  findingId: string;
  matchedTexts: string[];
  signalKeys: string[];
}) {
  return [...input.matchedTexts].sort((left, right) => {
    const scoreDelta =
      scoreFinancialCommercialFindingSnippet({
        findingId: input.findingId,
        signalKeys: input.signalKeys,
        text: right
      }) -
      scoreFinancialCommercialFindingSnippet({
        findingId: input.findingId,
        signalKeys: input.signalKeys,
        text: left
      });
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return right.length - left.length;
  })[0] ?? null;
}

function hasStrongFinancialCommercialSnippet(text: string | null) {
  if (!text) {
    return false;
  }

  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length < 12) {
    return false;
  }

  const wordCount = normalized.split(/\s+/).length;
  if (/\b\d+(?:\.\d+)?%\b/.test(normalized) && /\b(profit|profits|return|returns|yield|apy|apr|roi|performance|monthly|annual|weekly)\b/i.test(normalized)) {
    return true;
  }

  return (
    wordCount >= 5 &&
    /\b(earn|earned|earning|earnings|income|profit|profits|profitable|return|returns|yield|apy|apr|roi|performance|guarantee|guaranteed|backtest(?:ed)?|simulated|historical performance)\b/i.test(
      normalized
    )
  );
}

function hasStrongFinancialCommercialSnippetForFinding(input: {
  findingId: string;
  pageType?: string | null;
  signalKeys?: string[];
  text: string | null;
}) {
  if (!input.text) {
    return false;
  }

  const normalized = input.text.replace(/\s+/g, " ").trim();
  const wordCount = normalized.split(/\s+/).length;
  const pageType = input.pageType?.toLowerCase() ?? "";
  const signalKeys = new Set(input.signalKeys ?? []);

  switch (input.findingId) {
    case "simulated_performance_without_disclosure":
      return (
        wordCount >= 3 &&
        /\b(backtest(?:ed)?|hypothetical|simulated|paper trading|historical performance)\b/i.test(normalized)
      );
    case "unqualified_superlative_claim_detected":
      return (
        wordCount >= 4 &&
        (FINANCIAL_SUPERLATIVE_MARKETING_PATTERN.test(normalized) ||
          FINANCIAL_OUTPERFORMANCE_MARKETING_PATTERN.test(normalized)) &&
        !/\b(in this example|for example|example of|learn how|what is|guide|tutorial|analy(?:s|z)e|historical pricing trends|future direction|chosen asset)\b/i.test(
          normalized
        )
      );
    case "financial_urgency_pressure_tactic_detected":
      return (
        wordCount >= 4 &&
        /\b(limited|hurry|ending soon|act now|spots left|last chance|expires?|deadline)\b/i.test(normalized) &&
        /\b(join|sign up|subscribe|apply|open account|get started|start now|claim|buy now|free)\b/i.test(normalized)
      );
    default:
      return hasStrongFinancialCommercialSnippet(normalized);
  }
}

function scoreFinancialCommercialPageGroup(input: {
  blockText: string | null;
  matchedText: string | null;
  pageType: string | null;
  signalKeys: string[];
  supportingHeadings: string[];
}) {
  let score = scoreFinancialCommercialSnippet(input.matchedText, input.signalKeys);
  score += Math.max(0, Math.min(24, (input.blockText?.length ?? 0) / 24));
  score += input.supportingHeadings.length > 0 ? 4 : 0;

  const pageType = input.pageType?.toLowerCase() ?? "";
  if (/homepage/.test(pageType)) {
    score += 6;
  }
  if (/offer|product|pricing|checkout|account|trading|invest|loan/.test(pageType)) {
    score += 10;
  }
  if (/blog|news|article|academy|education|learn|support|help/.test(pageType)) {
    score -= 10;
  }

  return score;
}

function isMainstreamInvestmentContext(input: {
  blockText: string | null;
  pageType: string | null;
  supportingHeadings: string[];
}) {
  const corpus = [input.blockText ?? "", input.pageType ?? "", ...input.supportingHeadings].join(" ").toLowerCase();

  const mainstreamContextPresent =
    /\b(brokerage account|brokerage|investment account|retirement account|ira|roth ira|401k|portfolio|advisor|wealth|wealth management|managed investing|managed portfolios?|stock slices|etf|etfs|mutual fund|retirement|long-term|long term|investing platform|investment platform|trading platform|self-directed|self directed|asset management|institutional|institutional investors?|investment process|portfolio construction)\b/.test(
      corpus
    ) ||
    /\b(manage your money|build wealth|grow your wealth|grow your money|save for retirement|invest for retirement|open an account|open your account|compare accounts|account features|portfolio management)\b/.test(corpus);

  if (!mainstreamContextPresent) {
    return false;
  }

  const suspiciousSpeculativeCuePresent =
    /\b(forex|signal|signals|copy trading|copytrading|prop firm|funded trader|pips|vip|accuracy|backtest|backtested|risk to reward|telegram|discord|ea\b|expert advisor)\b/.test(
      corpus
    ) ||
    /\b(guaranteed|guarantee|profit per day|per month|per week|6[\s-]?7 figure|most accurate)\b/.test(corpus);

  return !suspiciousSpeculativeCuePresent;
}

function isDepositYieldDisclosureContext(input: {
  blockText: string | null;
  matchedText: string | null;
  supportingHeadings: string[];
}) {
  const corpus = [input.matchedText ?? "", input.blockText ?? "", ...input.supportingHeadings].join(" ").toLowerCase();

  const yieldCuePresent =
    /\b(apy|apr|annual percentage yield|interest rate|yield|returns?)\b/.test(corpus) ||
    /\b\d+(?:\.\d+)?%\b/.test(corpus);
  const depositAccountCuePresent =
    /\b(cd|certificate of deposit|high yield cd|cash funds?|money market instruments?|money market fund|cash account|savings account|high-yield cash|high yield cash|high-yield savings|high yield savings|checking account|ordinary bank account|bank accounts?|premium savings|direct deposit|deposits?|deposit balance|program banks?|member fdic|fdic-insured|fdic insured|bank accounts offered|not a bank|base apy|promotional apy|standard apy|fees may reduce earnings)\b/.test(
      corpus
    );

  return yieldCuePresent && depositAccountCuePresent;
}

function hasMainstreamPerformanceDisclosureCue(input: {
  blockText: string | null;
  matchedText: string | null;
  supportingHeadings: string[];
}) {
  const corpus = [input.matchedText ?? "", input.blockText ?? "", ...input.supportingHeadings].join(" ").toLowerCase();

  return (
    /\b(annualized returns?|average annual returns?|since inception|as of \d{1,2}\/\d{1,2}\/\d{2,4}|as of [a-z]{3,9}\.?\s+\d{1,2},?\s+\d{2,4}|1-year|5-year|10-year)\b/.test(
      corpus
    ) &&
    /\b(investing|investment account|brokerage account|portfolio|wealth|advisor|managed|cash account|retirement)\b/.test(corpus)
  );
}

function isTaxAdvantagedAccountContext(input: {
  blockText: string | null;
  matchedText: string | null;
  supportingHeadings: string[];
}) {
  const corpus = [input.matchedText ?? "", input.blockText ?? "", ...input.supportingHeadings].join(" ").toLowerCase();

  const taxAdvantagedCuePresent =
    /\b(hsa|health savings account|529|roth|ira|education expenses|medical expenses|tax-deductible|tax deductible|tax-deferred|tax deferred|tax-free withdrawals?|tax free withdrawals?|retirement)\b/.test(
      corpus
    );
  const accountFeeCuePresent =
    /\b(no account fees|account fees|no minimums|commissions? free|commission free|\$0 commissions?|\$0 account fees)\b/.test(corpus);

  return taxAdvantagedCuePresent && (accountFeeCuePresent || /\b(earnings|investment growth|grow more)\b/.test(corpus));
}

function hasIllustrativeHypotheticalDisclosureCue(input: {
  blockText: string | null;
  matchedText: string | null;
  supportingHeadings: string[];
}) {
  const corpus = [input.matchedText ?? "", input.blockText ?? "", ...input.supportingHeadings].join(" ").toLowerCase();

  return (
    /\b(illustrative purposes only|hypothetical calculation|illustration of the power of compounding|does not include .* fees|would reduce returns over time|no guarantee investment return|please consider your objectives|risk tolerance)\b/.test(
      corpus
    ) &&
    /\b(hypothetical|annual rate of return|average annual return|return will achieve|compounding)\b/.test(corpus)
  );
}

function hasAdvisoryDisclosureCue(input: {
  blockText: string | null;
  matchedText: string | null;
  supportingHeadings: string[];
}) {
  const corpus = [input.matchedText ?? "", input.blockText ?? "", ...input.supportingHeadings].join(" ").toLowerCase();

  return (
    /\b(form adv|disclosures and agreements|conflicts of interest|important information about .* services?, fees|all investments have inherent risks|protect against loss|does not guarantee profit)\b/.test(
      corpus
    ) &&
    /\b(simpleinvest|advised services|financial planning|investments?|portfolios?)\b/.test(corpus)
  );
}

function isConsumerCreditDisclosureContext(input: {
  blockText: string | null;
  matchedText: string | null;
  supportingHeadings: string[];
}) {
  const corpus = [input.matchedText ?? "", input.blockText ?? "", ...input.supportingHeadings].join(" ").toLowerCase();

  const rewardsCuePresent =
    /\b(cash back|credit card|cardmember|purchases?|restaurants?|home improvement stores?|activate)\b/.test(corpus) &&
    /\bearn(?:ing)?\s+(?:up to\s+)?\d{1,4}(?:\.\d+)?%/.test(corpus);
  const creditOfferDisclosureCuePresent =
    /\b(pre-approval offer|pre-approved offers?|does not guarantee approval|offer terms|apr rates?|origination fees?|fixed monthly payment|prepayment penalty|estimate your payments?|personal loans?)\b/.test(
      corpus
    ) &&
    /\b(apr|credit card|loan|approval|offer terms?|fees?)\b/.test(corpus);

  return rewardsCuePresent || creditOfferDisclosureCuePresent;
}

function isRetailEcommerceContext(input: {
  blockText: string | null;
  matchedText: string | null;
  pageType: string | null;
  supportingHeadings: string[];
}) {
  const corpus = [input.matchedText ?? "", input.blockText ?? "", input.pageType ?? "", ...input.supportingHeadings].join(" ").toLowerCase();

  const ecommerceCuePresent =
    /\b(free shipping|shipping policy|returns? & exchanges|return labels?|refund|final sale|first order|newsletter|product launches|coupon|promo code|cart|checkout|prices are listed|pricing and payment|warranty|manufacturer|orders? over \$?\d+)\b/.test(
      corpus
    ) ||
    /\b(products?|services?)\b/.test(corpus) && /\b(order|shipping|return|refund|payment)\b/.test(corpus);
  const financeCuePresent =
    /\b(apy|apr|brokerage|investment|investing|portfolio|trading|trader|forex|signals?|copy trading|funded|yield|cash account|savings account|retirement)\b/.test(
      corpus
    );

  return ecommerceCuePresent && !financeCuePresent;
}

function suppressMainstreamInvestmentFalsePositiveFinding(input: {
  blockText: string | null;
  findingId: string;
  matchedText: string | null;
  signalKeys: string[];
  supportingHeadings: string[];
  pageType: string | null;
}) {
  if (
    ![
      "simulated_performance_without_disclosure",
      "unqualified_superlative_claim_detected"
    ].includes(input.findingId)
  ) {
    return false;
  }

  if (
    isRetailEcommerceContext({
      blockText: input.blockText,
      matchedText: input.matchedText,
      pageType: input.pageType,
      supportingHeadings: input.supportingHeadings
    })
  ) {
    return true;
  }

  const signalSet = new Set(input.signalKeys);
  const illustrativeHypotheticalDisclosureCuePresent = hasIllustrativeHypotheticalDisclosureCue({
    blockText: input.blockText,
    matchedText: input.matchedText,
    supportingHeadings: input.supportingHeadings
  });
  const advisoryDisclosureCuePresent = hasAdvisoryDisclosureCue({
    blockText: input.blockText,
    matchedText: input.matchedText,
    supportingHeadings: input.supportingHeadings
  });
  if (
    signalSet.has("financial.guaranteed_return_language_present") ||
    signalSet.has("financial.low_risk_high_return_language_present") ||
    (signalSet.has("financial.hypothetical_or_backtest_language_present") && !illustrativeHypotheticalDisclosureCuePresent)
  ) {
    return false;
  }

  const text = `${input.matchedText ?? ""} ${input.blockText ?? ""}`.toLowerCase();
  const explicitSuspiciousCuePresent =
    /\b(forex|signal|signals|copy trading|copytrading|pips|accuracy|backtest|backtested|telegram|discord|vip)\b/.test(text) ||
    /\b(guaranteed|profit per day|profit per month|profit per week|most accurate)\b/.test(text);

  const mainstreamGrowthOrComparisonCuePresent =
    /\b(build wealth|grow your wealth|grow your money|long-term returns|long term returns|retirement goals|investment account|brokerage account|compare accounts|account features|managed portfolios?|portfolio construction|wealth management|asset management|institutional investors?)\b/.test(
      text
    );
  const taxAdvantagedAccountContextPresent = isTaxAdvantagedAccountContext({
    blockText: input.blockText,
    matchedText: input.matchedText,
    supportingHeadings: input.supportingHeadings
  });
  const depositYieldDisclosureContextPresent = isDepositYieldDisclosureContext({
    blockText: input.blockText,
    matchedText: input.matchedText,
    supportingHeadings: input.supportingHeadings
  });
  const consumerCreditDisclosureContextPresent = isConsumerCreditDisclosureContext({
    blockText: input.blockText,
    matchedText: input.matchedText,
    supportingHeadings: input.supportingHeadings
  });
  const mainstreamPerformanceDisclosureCuePresent = hasMainstreamPerformanceDisclosureCue({
    blockText: input.blockText,
    matchedText: input.matchedText,
    supportingHeadings: input.supportingHeadings
  });
  const mainstreamInvestmentContextPresent = isMainstreamInvestmentContext({
    blockText: input.blockText,
    pageType: input.pageType,
    supportingHeadings: input.supportingHeadings
  });
  const eligibleMainstreamContextPresent =
    mainstreamInvestmentContextPresent ||
    depositYieldDisclosureContextPresent ||
    consumerCreditDisclosureContextPresent ||
    mainstreamPerformanceDisclosureCuePresent ||
    taxAdvantagedAccountContextPresent ||
    illustrativeHypotheticalDisclosureCuePresent ||
    advisoryDisclosureCuePresent;

  if (!eligibleMainstreamContextPresent) {
    return false;
  }

  if (input.findingId === "unqualified_superlative_claim_detected") {
    return (
      (
        mainstreamGrowthOrComparisonCuePresent ||
        depositYieldDisclosureContextPresent ||
        consumerCreditDisclosureContextPresent ||
        mainstreamPerformanceDisclosureCuePresent ||
        taxAdvantagedAccountContextPresent ||
        illustrativeHypotheticalDisclosureCuePresent ||
        advisoryDisclosureCuePresent
      ) &&
      !explicitSuspiciousCuePresent
    );
  }

  return (
    depositYieldDisclosureContextPresent ||
    consumerCreditDisclosureContextPresent ||
    taxAdvantagedAccountContextPresent ||
    illustrativeHypotheticalDisclosureCuePresent ||
    advisoryDisclosureCuePresent ||
    !explicitSuspiciousCuePresent
  );
}

function shouldSuppressFinancialFindingForDomainContext(
  finding: ValidationFindingRow,
  domainContext: {
    domainIndustryPrimary: string | null;
    investorOrSecuritiesPromotion: boolean | null;
  }
) {
  // Never suppress finance/crypto domains
  if (
    domainContext.domainIndustryPrimary === "finance" ||
    domainContext.domainIndustryPrimary === "crypto"
  ) {
    return false;
  }

  // Never suppress if investor promotion flag is set
  if (domainContext.investorOrSecuritiesPromotion === true) {
    return false;
  }

  // No domain classification → defer to downstream logic
  if (!domainContext.domainIndustryPrimary) {
    return false;
  }

  // For explicitly non-finance domains, require strong financial offer evidence
  const evidence = getRecord(finding.evidence) ?? {};
  const pageClassification = getString(evidence.pageClassification);
  const financialEvidenceScore =
    typeof evidence.financialEvidenceScore === "number" ? evidence.financialEvidenceScore : null;

  // Strong page classification → keep
  if (
    pageClassification === "financial_offer" ||
    pageClassification === "quasi_financial_offer" ||
    pageClassification === "pricing_or_fees"
  ) {
    return false;
  }

  // High evidence score → keep
  if (financialEvidenceScore !== null && financialEvidenceScore >= 0.7) {
    return false;
  }

  // Explicit high-confidence signals → keep
  const supportingSignals = getEvidenceStringArray(evidence, "supportingSignals");
  const signalKey = getString(evidence.signalKey);
  const allSignals = [...supportingSignals, signalKey].filter((s): s is string => Boolean(s));
  const strongSignalKeys = [
    "financial.guaranteed_return_language_present",
    "financial.low_risk_high_return_language_present",
    "financial.apr_or_interest_rate_disclosure_text_present"
  ];
  if (allSignals.some((s) => strongSignalKeys.includes(s))) {
    return false;
  }

  // Suppress on non-finance domain without strong financial evidence
  return true;
}

function normalizeFinancialCommercialCandidateSignals(signalKeys: string[], blockText: string | null) {
  const candidateSignals = new Set<string>();

  for (const signalKey of signalKeys) {
    switch (signalKey) {
      case "financial.performance_claim_text_present":
        candidateSignals.add("returns");
        break;
      case "financial.return_or_yield_percentage_present":
        candidateSignals.add("returns");
        candidateSignals.add("percentage");
        break;
      case "financial.investment_outperformance_language_present":
        candidateSignals.add("returns");
        candidateSignals.add("superlative");
        candidateSignals.add("investment_context");
        break;
      case "financial.guaranteed_return_language_present":
      case "financial.low_risk_high_return_language_present":
        candidateSignals.add("guarantee");
        candidateSignals.add("returns");
        candidateSignals.add("investment_context");
        break;
      case "financial.hypothetical_or_backtest_language_present":
        candidateSignals.add("simulated");
        candidateSignals.add("returns");
        candidateSignals.add("investment_context");
        break;
      case "financial.testimonial_or_review_block_near_financial_claim_present":
        candidateSignals.add("results_social_proof");
        candidateSignals.add("investment_context");
        break;
      case "financial.claim_cta_block_present":
        candidateSignals.add("cta");
        candidateSignals.add("investment_context");
        break;
      case "commercial.pricing_page_present":
        candidateSignals.add("pricing");
        break;
      case "commercial.fee_related_text_present":
        candidateSignals.add("pricing_fee");
        break;
      case "commercial.promo_price_or_free_claim_present":
        candidateSignals.add("pricing");
        candidateSignals.add("cta");
        break;
      case "commercial.variable_fee_language_present_without_explanation":
        candidateSignals.add("pricing");
        candidateSignals.add("pricing_fee");
        break;
      default:
        break;
    }
  }

  if (hasKeyword(blockText, /\b(earn|earned|earning|earnings|income|profit|profitable|make money|cash flow|passive income)\b/i)) {
    candidateSignals.add("earnings");
  }
  if (hasKeyword(blockText, /\b(?:\$|usd|eur|gbp)\s?\d|\b\d+(?:\.\d+)?%\b/i)) {
    candidateSignals.add("currency");
    candidateSignals.add("percentage");
  }
  if (hasKeyword(blockText, FINANCIAL_SUPERLATIVE_MARKETING_PATTERN)) {
    candidateSignals.add("superlative");
  }
  if (hasKeyword(blockText, /\b(now|today|join|sign up|subscribe|apply|open account|get started|start now|claim)\b/i)) {
    candidateSignals.add("cta");
  }
  if (hasKeyword(blockText, /\b(limited|hurry|ending soon|act now|spots left|last chance|expires?|deadline)\b/i)) {
    candidateSignals.add("urgency");
  }
  if (hasKeyword(blockText, /\b(invest|investing|trading|crypto|yield|apy|apr|portfolio|fund|returns?)\b/i)) {
    candidateSignals.add("investment_context");
  }
  if (hasKeyword(blockText, FINANCIAL_SIGNAL_SERVICE_CONTEXT_PATTERN)) {
    candidateSignals.add("investment_context");
    candidateSignals.add("signal_service");
  }

  return [...candidateSignals];
}

function inferFinancialCommercialSignalKeysFromText(text: string | null) {
  const signalKeys = new Set<string>();
  if (!text) {
    return [];
  }
  const suspiciousFinancialSignalContext = FINANCIAL_SIGNAL_SERVICE_CONTEXT_PATTERN.test(text);
  if (!suspiciousFinancialSignalContext) {
    return [];
  }

  if (
    /\b(?:\d{1,3}(?:\.\d+)?%\s*(?:accuracy|win rate|profitable|returns?|roi)|\d+\s+out\s+of\s+\d+\s+signals?\s+(?:profitable|winning)|\+?\d{2,6}\s*pips?\s+(?:per|a)\s+(?:day|week|month)|make\s+(?:\$|usd|eur|gbp)?\s?\d|subscribers?\s+make\s+their\s+fee\s+back|profit split|keep\s+\d{1,3}%\s+of\s+profits?)\b/i.test(text)
  ) {
    signalKeys.add("financial.performance_claim_text_present");
    signalKeys.add("financial.return_or_yield_percentage_present");
  }
  if (/\b(?:guaranteed?|assured|risk[-\s]?free|steady profit|guaranteed profit|guaranteed returns?)\b/i.test(text)) {
    signalKeys.add("financial.guaranteed_return_language_present");
  }
  if (/\b(?:backtest|backtested|hypothetical|simulated performance|model portfolio)\b/i.test(text)) {
    signalKeys.add("financial.hypothetical_or_backtest_language_present");
  }
  if (FINANCIAL_SUPERLATIVE_MARKETING_PATTERN.test(text)) {
    signalKeys.add("financial.investment_outperformance_language_present");
  }
  if (FINANCIAL_TESTIMONIAL_PATTERN.test(text) && FINANCIAL_SIGNAL_SERVICE_CONTEXT_PATTERN.test(text)) {
    signalKeys.add("financial.testimonial_or_review_block_near_financial_claim_present");
  }
  if (/\b(?:join|subscribe|buy now|get started|start now|sign up|copy our trades|mirror trading|challenge fee|evaluation fee|funded account)\b/i.test(text)) {
    signalKeys.add("financial.claim_cta_block_present");
  }
  if (FINANCIAL_RISK_DISCLOSURE_PATTERN.test(text)) {
    signalKeys.add("financial.risk_disclosure_text_present");
  }
  if (/\b(?:past performance is not indicative of future results|past performance does not guarantee future results)\b/i.test(text)) {
    signalKeys.add("financial.past_performance_disclaimer_text_present");
  }

  return [...signalKeys];
}

function isFinancialClaimsSuppressedLegalSurface(input: { pageType: string | null; pageUrl: string | null }) {
  const pageType = input.pageType?.toLowerCase() ?? "";
  const pageUrl = input.pageUrl?.toLowerCase() ?? "";

  if (/(cookie_policy|privacy_policy|terms_of_service|risk_disclosure|legal)/.test(pageType)) {
    return true;
  }

  return /\/cookies?(?:\/|$)|\/cookie-policy(?:\/|$)|\/privacy(?:\/|$)|\/terms(?:\/|$)|\/legal(?:\/|$)|risk[-_/ ]disclosure/.test(
    pageUrl
  );
}

const FINANCIAL_CLAIM_CLUSTER_SIBLING_RADIUS = 1;
const FINANCIAL_CLAIM_CLUSTER_TOKEN_RADIUS = 80;
const FINANCIAL_PRIMARY_CLAIM_SIGNAL_KEYS = new Set([
  "financial.performance_claim_text_present",
  "financial.return_or_yield_percentage_present",
  "financial.investment_outperformance_language_present",
  "financial.guaranteed_return_language_present",
  "financial.low_risk_high_return_language_present",
  "financial.hypothetical_or_backtest_language_present",
  "financial.claim_cta_block_present",
  "commercial.promo_price_or_free_claim_present",
  "commercial.variable_fee_language_present_without_explanation"
]);

function rowsAreFinanciallyLocal(left: Record<string, unknown>, right: Record<string, unknown>) {
  const leftSiblingIndex = getEvidenceSiblingIndex(left);
  const rightSiblingIndex = getEvidenceSiblingIndex(right);
  if (leftSiblingIndex !== null && rightSiblingIndex !== null) {
    return Math.abs(leftSiblingIndex - rightSiblingIndex) <= FINANCIAL_CLAIM_CLUSTER_SIBLING_RADIUS;
  }

  const leftTokenStart = getEvidenceTokenStart(left);
  const leftTokenEnd = getEvidenceTokenEnd(left);
  const rightTokenStart = getEvidenceTokenStart(right);
  const rightTokenEnd = getEvidenceTokenEnd(right);
  if (leftTokenStart !== null && leftTokenEnd !== null && rightTokenStart !== null && rightTokenEnd !== null) {
    const tokenDistance = Math.min(
      Math.abs(rightTokenStart - leftTokenEnd),
      Math.abs(leftTokenStart - rightTokenEnd)
    );
    return tokenDistance <= FINANCIAL_CLAIM_CLUSTER_TOKEN_RADIUS;
  }

  return false;
}

function buildLocalFinancialCommercialPageGroups(input: {
  evidenceById: Map<string, Record<string, unknown>>;
  hits: Array<Record<string, unknown>>;
}) {
  const allEvidenceRows = input.hits
    .flatMap((hit) => getStringArray(hit, "evidence_refs").map((evidenceId) => input.evidenceById.get(evidenceId) ?? null))
    .filter((row): row is Record<string, unknown> => Boolean(row));
  const claimAnchors = input.hits
    .filter((hit) => {
      const signalKey = getStringValue(hit, "signal_key");
      return signalKey ? FINANCIAL_PRIMARY_CLAIM_SIGNAL_KEYS.has(signalKey) : false;
    })
    .flatMap((hit) => getStringArray(hit, "evidence_refs").map((evidenceId) => input.evidenceById.get(evidenceId) ?? null))
    .filter((row): row is Record<string, unknown> => Boolean(row));

  if (claimAnchors.length === 0 || allEvidenceRows.length === 0) {
    return [
      {
        evidenceRows: allEvidenceRows,
        hits: input.hits
      }
    ];
  }

  const localGroups = new Map<
    string,
    {
      evidenceRows: Record<string, unknown>[];
      hits: Array<Record<string, unknown>>;
    }
  >();

  for (const anchor of claimAnchors) {
    const anchorSiblingIndex = getEvidenceSiblingIndex(anchor);
    const anchorTokenStart = getEvidenceTokenStart(anchor);
    const anchorTokenEnd = getEvidenceTokenEnd(anchor);
    const localEvidenceRows =
      anchorSiblingIndex === null && anchorTokenStart === null && anchorTokenEnd === null
        ? allEvidenceRows
        : allEvidenceRows.filter((row) => rowsAreFinanciallyLocal(anchor, row));
    const localEvidenceIds = new Set(
      localEvidenceRows
        .map((row) => getStringValue(row, "evidence_id"))
        .filter((value): value is string => Boolean(value))
    );
    const localHits = input.hits.filter((hit) =>
      getStringArray(hit, "evidence_refs").some((evidenceId) => localEvidenceIds.has(evidenceId))
    );
    const pageUrl = getStringValue(anchor, "page_url") ?? "unknown";
    const siblingIndex = getEvidenceSiblingIndex(anchor);
    const tokenStart = getEvidenceTokenStart(anchor);
    const groupKey = `${pageUrl}::${siblingIndex ?? "na"}::${tokenStart ?? "na"}`;
    if (!localGroups.has(groupKey)) {
      localGroups.set(groupKey, {
        evidenceRows: localEvidenceRows,
        hits: localHits
      });
    }
  }

  return [...localGroups.values()].filter((group) => group.evidenceRows.length > 0 && group.hits.length > 0);
}

function deriveFinancialCommercialClaimFindings(input: ValidationArtifactBundle) {
  const evidenceById = new Map(
    input.pageEvidence.map((row) => [String(row.evidence_id ?? ""), row])
  );
  const groupedHits = new Map<string, Array<Record<string, unknown>>>();

  for (const hit of input.signalHits) {
    const signalKey = getStringValue(hit, "signal_key");
    if (!signalKey || !FINANCIAL_COMMERCIAL_SIGNAL_KEYS.has(signalKey)) {
      continue;
    }

    const pageUrl = getStringValue(hit, "page_url") ?? "unknown";
    const pageType = getStringValue(hit, "page_type") ?? "unknown";
    const groupKey = `${pageUrl}::${pageType}`;
    const existing = groupedHits.get(groupKey) ?? [];
    existing.push(hit);
    groupedHits.set(groupKey, existing);
  }

  for (const row of input.pageEvidence) {
    const evidenceId = getStringValue(row, "evidence_id");
    const matchedText = getStringValue(row, "matched_text");
    const inferredSignalKeys = inferFinancialCommercialSignalKeysFromText(matchedText);
    if (!evidenceId || inferredSignalKeys.length === 0) {
      continue;
    }

    const pageUrl = getStringValue(row, "page_url") ?? "unknown";
    const pageType = getStringValue(row, "page_type") ?? "unknown";
    const groupKey = `${pageUrl}::${pageType}`;
    const existing = groupedHits.get(groupKey) ?? [];
    const existingKeys = new Set(existing.map((hit) => getStringValue(hit, "signal_key")).filter(Boolean));

    for (const signalKey of inferredSignalKeys) {
      if (existingKeys.has(signalKey)) {
        continue;
      }
      existing.push({
        evidence_refs: [evidenceId],
        id: `inferred-${evidenceId}-${signalKey}`,
        page_role: getStringValue(row, "page_role") ?? "primary",
        page_type: pageType,
        page_url: pageUrl,
        payload: {
          matchedText,
          source: "deterministic_financial_claim_text_inference"
        },
        signal_key: signalKey
      });
      existingKeys.add(signalKey);
    }

    groupedHits.set(groupKey, existing);
  }

  const findings: Array<{
    category: "scan_report_review";
    description: string;
    evidence: Record<string, unknown>;
    findingFamily: string;
    findingScope: string;
    findingSource: string;
    findingSubject: string;
    pageUrl: string | null;
    rank: number;
    ruleKey: string;
    severity: "high" | "medium" | "low";
    subtype: string | null;
    title: string;
  }> = [];

  for (const hits of groupedHits.values()) {
    const localGroups = buildLocalFinancialCommercialPageGroups({
      evidenceById,
      hits
    });

    for (const localGroup of localGroups) {
      const evidenceRows = localGroup.evidenceRows;
      const localHits = localGroup.hits;
      const signalKeys = [...new Set(
        localHits
          .map((hit) => getStringValue(hit, "signal_key"))
          .filter((value): value is string => Boolean(value))
      )];
      const payloadMatchedTexts = [...new Set(
        localHits.flatMap((hit) => {
          const payload = getRecord(hit.payload);
          const explicitMatches = Array.isArray(payload?.matchedTexts)
            ? (payload?.matchedTexts as unknown[]).filter((value): value is string => typeof value === "string" && value.trim().length > 0)
            : [];
          const singleMatch = [
            getStringValue(payload, "matchedText"),
            getStringValue(payload, "matchedTerm"),
            getStringValue(payload, "matchedPhrase")
          ].filter((value): value is string => Boolean(value));
          return [...explicitMatches, ...singleMatch];
        })
      )];
      const matchedTexts = [...new Set([
        ...payloadMatchedTexts,
        ...evidenceRows
          .map((row) => getStringValue(row, "matched_text"))
          .filter((value): value is string => Boolean(value))
      ])];
      const sortedMatchedTexts = [...matchedTexts].sort((left, right) => {
        const scoreDelta = scoreFinancialCommercialSnippet(right, signalKeys) - scoreFinancialCommercialSnippet(left, signalKeys);
        if (scoreDelta !== 0) {
          return scoreDelta;
        }

        return right.length - left.length;
      });
      const blockText = sortedMatchedTexts.join(" ").trim() || null;
      const matchedText = selectFinancialCommercialMatchedText({
        matchedTexts: sortedMatchedTexts,
        signalKeys
      });
      const pageType =
        localHits.map((hit) => getStringValue(hit, "page_type")).find((value): value is string => Boolean(value)) ??
        evidenceRows.map((row) => getStringValue(row, "page_type")).find((value): value is string => Boolean(value)) ??
        null;
      const pageUrl =
        localHits.map((hit) => getStringValue(hit, "page_url")).find((value): value is string => Boolean(value)) ??
        evidenceRows.map((row) => getStringValue(row, "page_url")).find((value): value is string => Boolean(value)) ??
        null;
      if (isFinancialClaimsSuppressedLegalSurface({ pageType, pageUrl })) {
        continue;
      }
      const supportingHeadings = [...new Set(
        evidenceRows
          .map((row) => {
            const metadata = getRecord(row.metadata);
            return getStringValue(metadata, "surroundingHeading") ?? getStringValue(metadata, "surrounding_heading");
          })
          .filter((value): value is string => Boolean(value))
      )];
      const financialEvidenceScore = scoreFinancialCommercialPageGroup({
        blockText,
        matchedText,
        pageType,
        signalKeys,
        supportingHeadings
      });
      const candidateSignals = normalizeFinancialCommercialCandidateSignals(signalKeys, blockText);
      const strongMatchedSnippet = hasStrongFinancialCommercialSnippet(matchedText);
      const strongBlockSnippet = hasStrongFinancialCommercialSnippet(blockText);
      const hasPerformanceDisclosure =
        signalKeys.includes("financial.past_performance_disclaimer_text_present");
      const hasFeeTermsDisclosure =
        signalKeys.includes("commercial.explicit_fee_disclosure_text_present") ||
        signalKeys.includes("financial.apr_or_interest_rate_disclosure_text_present");
      const hasGlobalRiskBoilerplate = signalKeys.includes("financial.risk_disclosure_text_present");
      const classification = {
      adjacentDisclosurePresent: hasPerformanceDisclosure,
      adjacentDisclosureText: null,
      adjacentDisclosureType: hasFeeTermsDisclosure
        ? signalKeys.includes("commercial.explicit_fee_disclosure_text_present")
          ? "fee_schedule"
          : "pricing_terms"
        : hasPerformanceDisclosure
          ? "simulation_disclaimer"
          : hasGlobalRiskBoilerplate
            ? "risk_disclosure"
            : null,
      claimPresent:
        signalKeys.some((signalKey) =>
          [
            "financial.performance_claim_text_present",
            "financial.return_or_yield_percentage_present",
            "financial.investment_outperformance_language_present",
            "financial.guaranteed_return_language_present",
            "financial.low_risk_high_return_language_present",
            "financial.hypothetical_or_backtest_language_present",
            "financial.claim_cta_block_present",
            "commercial.promo_price_or_free_claim_present",
            "commercial.variable_fee_language_present_without_explanation"
          ].includes(signalKey)
        ) || strongMatchedSnippet || strongBlockSnippet,
      claimText: matchedText,
      claimType: signalKeys.includes("financial.guaranteed_return_language_present") ||
        signalKeys.includes("financial.low_risk_high_return_language_present")
        ? "guaranteed_outcome_claim"
        : signalKeys.includes("financial.hypothetical_or_backtest_language_present")
          ? "simulated_performance_claim"
            : hasKeyword(
                  blockText,
                  /\b(earn|earned|earning|earnings|income|profit|profitable|make money|cash flow|passive income|return|returns|yield|apy|apr|roi|accuracy)\b/i
                )
              ? "earnings_claim"
              : signalKeys.includes("financial.investment_outperformance_language_present") ||
                hasKeyword(blockText, FINANCIAL_SUPERLATIVE_MARKETING_PATTERN)
              ? "superlative_claim"
              : signalKeys.includes("commercial.variable_fee_language_present_without_explanation")
                ? "pricing_fee_claim"
                  : signalKeys.includes("financial.performance_claim_text_present") ||
                    signalKeys.includes("financial.return_or_yield_percentage_present")
                  ? "return_performance_claim"
                  : signalKeys.includes("financial.claim_cta_block_present") &&
                      hasKeyword(blockText, /\b(limited|hurry|ending soon|act now|spots left|last chance|expires?|deadline)\b/i)
                    ? "urgency_conversion_claim"
                    : "other",
      commercialContext:
        candidateSignals.includes("investment_context") ||
        candidateSignals.includes("pricing") ||
        Boolean(pageType && /pricing|offer|checkout|product|invest|trading|loan|account|subscription/i.test(pageType)),
      confidence: signalKeys.length >= 3 ? 0.88 : signalKeys.length === 2 ? 0.8 : 0.74,
      contextType:
        pageType && /pricing/i.test(pageType)
          ? "pricing_page"
          : pageType && /checkout/i.test(pageType)
            ? "checkout_offer"
            : pageType && /offer|product|account|invest|trading|loan/i.test(pageType)
              ? "financial_offer"
              : pageType && /legal|policy|terms|privacy/i.test(pageType)
                ? "legal_disclosure"
                : candidateSignals.includes("pricing")
                  ? "pricing_page"
                  : candidateSignals.includes("investment_context")
                    ? "financial_offer"
                    : "unknown",
      feeDisclosurePresent:
        hasFeeTermsDisclosure ||
        signalKeys.includes("commercial.fee_schedule_table_present"),
      guaranteeLanguage:
        signalKeys.includes("financial.guaranteed_return_language_present") ||
        signalKeys.includes("financial.low_risk_high_return_language_present"),
      pricingPresent:
        signalKeys.includes("commercial.pricing_page_present") ||
        signalKeys.includes("commercial.fee_related_text_present") ||
        signalKeys.includes("commercial.promo_price_or_free_claim_present") ||
        signalKeys.includes("commercial.variable_fee_language_present_without_explanation") ||
        hasKeyword(blockText, /\b(price|pricing|fee|fees|cost|billing|rate|charge|commission|spread)\b/i),
      rationaleShort: "Deterministic financial-commercial claim derivation from retained scan signals and page evidence.",
      simulatedPerformanceLanguage: signalKeys.includes("financial.hypothetical_or_backtest_language_present"),
      superlativeLanguage:
        signalKeys.includes("financial.investment_outperformance_language_present") ||
        hasKeyword(blockText, FINANCIAL_SUPERLATIVE_MARKETING_PATTERN),
      urgencyPresent:
        signalKeys.includes("financial.claim_cta_block_present") &&
          hasKeyword(blockText, /\b(limited|hurry|ending soon|act now|spots left|last chance|expires?|deadline)\b/i) ||
        hasKeyword(blockText, /\b(limited|hurry|ending soon|act now|spots left|last chance|expires?|deadline)\b/i),
      urgencyTiedToConversion:
        signalKeys.includes("financial.claim_cta_block_present") ||
        hasKeyword(blockText, /\b(join|sign up|subscribe|apply|open account|get started|start now|claim|buy now|free)\b/i)
      } as const;

      if (!strongMatchedSnippet && !strongBlockSnippet) {
        continue;
      }

      const derivedFindingIds = deriveFinancialCommercialExpectedFindingIds({
        candidate: {
          adjacentAfter: null,
          adjacentBefore: null,
          blockHeading: supportingHeadings[0] ?? null,
          blockText: blockText ?? matchedText ?? signalKeys.join(" "),
          candidateSignals,
          pageType,
          pageUrl,
          sourceType: "signal_hit"
        },
        classification
      });
      const normalizedFindingIds: string[] = [...new Set(derivedFindingIds)];
      for (const findingId of normalizedFindingIds) {
        const definition = getFinancialCommercialDefinition(findingId);
        if (!definition) {
          continue;
        }

        const findingMatchedText = selectFinancialCommercialMatchedTextForFinding({
          findingId,
          matchedTexts: sortedMatchedTexts,
          signalKeys
        });
        if (
          !hasStrongFinancialCommercialSnippetForFinding({
            findingId,
            pageType,
            signalKeys,
            text: findingMatchedText
          })
        ) {
          continue;
        }

        if (
          suppressMainstreamInvestmentFalsePositiveFinding({
            blockText,
            findingId,
            matchedText: findingMatchedText,
            pageType,
            signalKeys,
            supportingHeadings
          })
        ) {
          continue;
        }

        const taxonomy = deriveValidationFindingTaxonomy({
          category: "scan_report_review",
          ruleKey: definition.ruleKey,
          subtype: "financial_review"
        });

        findings.push({
          category: "scan_report_review",
          description: definition.description,
          evidence: {
            adjacentDisclosurePresent: classification.adjacentDisclosurePresent,
            candidateSignals,
            claimText: findingMatchedText,
            confidence: classification.confidence,
            financialEvidenceScore,
            matchedPhrase: findingMatchedText,
            matchedSnippet: findingMatchedText,
            pageClassification: classifyFinancialValidationPage(pageType, {
              blockText,
              candidateSignals
            }),
            pageType,
            pageUrl,
            policySnippets: sortedMatchedTexts,
            signalKey: signalKeys[0] ?? null,
            sourceUrls: pageUrl ? [pageUrl] : [],
            supportingHeadings,
            supportingSignals: signalKeys,
            unifiedFindingId: findingId
          },
          findingFamily: taxonomy.familyId,
          findingScope: "page",
          findingSource: "supplemental_validation",
          findingSubject: "disclosure",
          pageUrl,
          rank: 0,
          ruleKey: definition.ruleKey,
          severity: definition.severity,
          subtype: "financial_review",
          title: definition.title
        });
      }
    }
  }

  return findings;
}

const FINANCIAL_REGULATORY_CONTEXT_BENCHMARK_PATTERN =
  /\b(?:forex|futures?|options?|crypto_derivatives|investment_signals?|trading_signals?|prop_trading|funded_accounts?|cfd|spread_betting|financial_advisory|investment_newsletter|copy_trading|signal_service|trading signals?|funded account|prop trading)\b/i;

function getSnapshotText(input: ValidationArtifactBundle) {
  return [
    getStringValue(input.snapshot, "benchmark_category"),
    getStringValue(input.snapshot, "benchmarkCategory"),
    getStringValue(input.snapshot, "benchmark_industry"),
    getStringValue(input.snapshot, "benchmarkIndustry"),
    getStringValue(input.snapshot, "domain_risk_profile"),
    getStringValue(input.snapshot, "domainRiskProfile")
  ].filter((value): value is string => Boolean(value)).join(" ");
}

function deriveRegulatoryRegistrationTransparencyFindings(input: ValidationArtifactBundle) {
  void input;
  return [] satisfies ValidationFindingRow[];
}

function deriveFinancialContextTextClaimFindings(_input: ValidationArtifactBundle) {
  return [] satisfies ValidationFindingRow[];
}

function deriveFinancialValidationFindings(input: ValidationArtifactBundle) {
  const evidenceById = new Map(
    input.pageEvidence.map((row) => [String(row.evidence_id ?? ""), row])
  );

  const findings: Array<{
    category: "scan_report_review";
    description: string;
    evidence: Record<string, unknown>;
    findingFamily: string;
    findingScope: string;
    findingSource: string;
    findingSubject: string;
    pageUrl: string | null;
    rank: number;
    ruleKey: string;
    severity: "high" | "medium" | "low";
    subtype: string | null;
    title: string;
  }> = [];

  for (const hit of input.signalHits) {
    const signalKey = typeof hit.signal_key === "string" ? hit.signal_key : null;
    const definition = signalKey ? getFinancialValidationDefinition(signalKey) : null;
    if (!definition) {
      continue;
    }

    const payload = hit.payload && typeof hit.payload === "object" ? (hit.payload as Record<string, unknown>) : null;
    const evidenceRows = getStringArray(hit, "evidence_refs")
      .map((evidenceId) => evidenceById.get(evidenceId) ?? null)
      .filter((row): row is Record<string, unknown> => Boolean(row));
    const matchedTexts = [...new Set(
      evidenceRows
        .map((row) => getStringValue(row, "matched_text"))
        .filter((value): value is string => Boolean(value))
    )];
    const supportingHeadings = [...new Set(
      evidenceRows
        .map((row) => {
          const metadata = row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : null;
          return getStringValue(metadata, "surroundingHeading") ?? getStringValue(metadata, "surrounding_heading");
        })
        .filter((value): value is string => Boolean(value))
    )];
    const matchedTerm =
      getStringValue(payload, "matchedTerm") ??
      getStringValue(payload, "matched_term") ??
      getStringValue(payload, "matchedPhrase") ??
      getStringValue(payload, "matched_phrase") ??
      getStringValue(payload, "matchedRateTerm") ??
      getStringValue(payload, "matched_rate_term") ??
      matchedTexts[0] ??
      null;
    const pageType =
      getStringValue(hit, "page_type") ??
      evidenceRows.map((row) => getStringValue(row, "page_type")).find((value): value is string => Boolean(value)) ??
      null;
    const pageUrl =
      getStringValue(hit, "page_url") ??
      evidenceRows.map((row) => getStringValue(row, "page_url")).find((value): value is string => Boolean(value)) ??
      null;
    const taxonomy = deriveValidationFindingTaxonomy({
      category: "scan_report_review",
      ruleKey: definition.ruleKey,
      subtype: "financial_review"
    });

    findings.push({
      category: "scan_report_review",
      description: definition.description,
      evidence: {
        matchedPhrase: matchedTerm,
        matchedSnippet: matchedTexts[0] ?? null,
        pageClassification: classifyFinancialValidationPage(pageType),
        pageType,
        pageUrl,
        policySnippets: matchedTexts,
        signalKey,
        sourceUrls: pageUrl ? [pageUrl] : [],
        supportingHeadings,
        supportingSignals: [signalKey],
        unifiedFindingId: definition.unifiedFindingId
      },
      findingFamily: taxonomy.familyId,
      findingScope: "page",
      findingSource: "supplemental_validation",
      findingSubject: "disclosure",
      pageUrl,
      rank: 0,
      ruleKey: definition.ruleKey,
      severity: definition.severity,
      subtype: "financial_review",
      title: definition.title
    });
  }

  const hasSubstantiveFinding = findings.some((finding) => !isMetaSectionFinding(finding.ruleKey));
  if (!hasSubstantiveFinding) {
    return findings;
  }

  return findings.filter((finding) => !isMetaSectionFinding(finding.ruleKey));
}

type CookieDisclosureRow = {
  confidence: number;
  cookieName: string | null;
  duration: string | null;
  provider: string | null;
  purpose: string | null;
  snippetHash: string | null;
};

const COOKIE_PROVIDER_HINTS: Array<{
  category?: string;
  name: string;
  prefixes: string[];
  provider: string;
}> = [
  { name: "google_analytics", prefixes: ["_ga", "_gid", "_gat", "_gac_", "_gcl_"], provider: "Google Analytics", category: "analytics" },
  { name: "doubleclick", prefixes: ["ide", "test_cookie"], provider: "DoubleClick", category: "advertising" },
  { name: "meta", prefixes: ["_fbp", "fr"], provider: "Meta", category: "advertising" },
  { name: "segment", prefixes: ["ajs_"], provider: "Segment", category: "analytics" },
  { name: "hotjar", prefixes: ["_hj"], provider: "Hotjar", category: "analytics" }
];

function normalizeCookieName(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return value.trim().toLowerCase();
}

function normalizeCookieTokenList(values: string[]) {
  return [...new Set(values.map((value) => normalizeCookieName(value)).filter((value): value is string => Boolean(value)))];
}

function isInfrastructureRuntimeCookie(cookieName: string) {
  const normalized = normalizeCookieName(cookieName);
  if (!normalized) {
    return false;
  }

  return (
    normalized === "awsalb" ||
    normalized === "awsalbcors" ||
    normalized === "__cf_bm" ||
    normalized === "cf_clearance" ||
    normalized === "optanonconsent" ||
    normalized === "optanonalertboxclosed" ||
    normalized === "geo_country" ||
    normalized === "trp-country" ||
    normalized === "trp-language"
  );
}

function inferCookieProvider(cookieName: string) {
  const normalized = normalizeCookieName(cookieName);
  if (!normalized) {
    return null;
  }

  return COOKIE_PROVIDER_HINTS.find((hint) => hint.prefixes.some((prefix) => normalized.startsWith(prefix.toLowerCase()))) ?? null;
}

function matchRuntimeCookie(input: { cookieName: string; disclosures: CookieDisclosureRow[] }) {
  const runtimeName = normalizeCookieName(input.cookieName);
  if (!runtimeName) {
    return null;
  }

  for (const disclosure of input.disclosures) {
    const disclosedName = normalizeCookieName(disclosure.cookieName);
    if (disclosedName && (runtimeName === disclosedName || runtimeName.startsWith(disclosedName) || disclosedName.startsWith(runtimeName))) {
      return { disclosure, method: disclosedName === runtimeName ? "exact" : "prefix" as const };
    }
  }

  const inferred = inferCookieProvider(runtimeName);
  if (!inferred) {
    return null;
  }

  for (const disclosure of input.disclosures) {
    const provider = disclosure.provider?.toLowerCase() ?? "";
    const purpose = disclosure.purpose?.toLowerCase() ?? "";
    if (provider.includes(inferred.provider.toLowerCase()) || (inferred.category && purpose.includes(inferred.category))) {
      return { disclosure, method: provider.includes(inferred.provider.toLowerCase()) ? ("provider" as const) : ("category" as const) };
    }
  }

  return null;
}

function deriveCookieRuntimeFindings(input: {
  policySemanticRows: Array<Record<string, unknown>>;
  runtimeArtifacts: Record<string, unknown> | null;
}) {
  const cookiePolicyEnrichment =
    input.policySemanticRows.find((row) => (row.page_type ?? row.pageType) === "cookie_policy") ?? null;

  if (!cookiePolicyEnrichment) {
    return [] as Array<ReturnType<typeof buildPolicyRuntimeFinding>>;
  }

  const pageUrl = typeof cookiePolicyEnrichment.page_url === "string" ? cookiePolicyEnrichment.page_url : null;
  const pageType = typeof cookiePolicyEnrichment.page_type === "string" ? cookiePolicyEnrichment.page_type : "cookie_policy";
  const hybrid =
    input.runtimeArtifacts &&
    typeof input.runtimeArtifacts.hybrid_runtime_evidence === "object" &&
    input.runtimeArtifacts.hybrid_runtime_evidence !== null &&
    !Array.isArray(input.runtimeArtifacts.hybrid_runtime_evidence)
      ? (input.runtimeArtifacts.hybrid_runtime_evidence as Record<string, unknown>)
      : null;
  const cookieWriteObservations =
    hybrid && Array.isArray(hybrid.cookieWriteObservations)
      ? hybrid.cookieWriteObservations.filter(
          (value): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
        )
      : [];
  const observedRuntimeCookies = cookieWriteObservations.length > 0
    ? cookieWriteObservations
        .map((row) => ({
          cookieName: typeof row.cookieName === "string" ? row.cookieName : null,
          thirdParty: row.thirdParty === true
        }))
        .filter((row): row is { cookieName: string; thirdParty: boolean } => typeof row.cookieName === "string")
    : normalizeCookieTokenList(
        Array.isArray(input.runtimeArtifacts?.initial_cookie_names)
          ? (input.runtimeArtifacts.initial_cookie_names as unknown[]).filter((value): value is string => typeof value === "string")
          : []
      ).map((cookieName) => ({ cookieName, thirdParty: false }));
  const runtimeCookies = normalizeCookieTokenList(observedRuntimeCookies.map((row) => row.cookieName));
  const disclosures = Array.isArray(cookiePolicyEnrichment.policy_cookie_disclosures)
    ? ((cookiePolicyEnrichment.policy_cookie_disclosures as unknown[]) ?? []).flatMap((value) => {
        if (typeof value !== "object" || value === null) {
          return [];
        }

        const record = value as Record<string, unknown>;
        const vendor = typeof record.vendor === "string" ? record.vendor : typeof record.provider === "string" ? record.provider : null;
        const cookieType = typeof record.cookie_type === "string" ? record.cookie_type : null;
        const cookieNames = Array.isArray(record.cookies)
          ? record.cookies.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
          : [];

        if (cookieNames.length > 0) {
          return cookieNames.map((cookieName) => ({
            confidence: typeof record.confidence === "number" ? record.confidence : 0.65,
            cookieName,
            duration: typeof record.duration === "string" ? record.duration : null,
            provider: vendor,
            purpose: cookieType,
            snippetHash:
              typeof record.snippet_hash === "string"
                ? record.snippet_hash
                : typeof record.snippetHash === "string"
                  ? record.snippetHash
                  : vendor && cookieName
                    ? `${vendor}:${cookieName}`
                    : cookieName
          } satisfies CookieDisclosureRow));
        }

        return [
          {
            confidence: typeof record.confidence === "number" ? record.confidence : 0,
            cookieName: typeof record.cookie_name === "string" ? record.cookie_name : typeof record.cookieName === "string" ? record.cookieName : null,
            duration: typeof record.duration === "string" ? record.duration : null,
            provider: typeof record.provider === "string" ? record.provider : null,
            purpose: typeof record.purpose === "string" ? record.purpose : null,
            snippetHash: typeof record.snippet_hash === "string" ? record.snippet_hash : typeof record.snippetHash === "string" ? record.snippetHash : null
          } satisfies CookieDisclosureRow
        ];
      })
    : [];
  const flags = Array.isArray(cookiePolicyEnrichment.policy_actionable_flags)
    ? cookiePolicyEnrichment.policy_actionable_flags.filter((value): value is string => typeof value === "string")
    : [];
  const mentionTopics = getPolicyMentionTopics(cookiePolicyEnrichment);
  const semanticConfidence =
    typeof cookiePolicyEnrichment.policy_semantic_confidence === "number" &&
    Number.isFinite(cookiePolicyEnrichment.policy_semantic_confidence)
      ? cookiePolicyEnrichment.policy_semantic_confidence
      : null;
  const summaryShort = cookiePolicyEnrichment.policy_summary_short ?? null;
  const hasRichCookieSemantics =
    disclosures.length > 0 ||
    mentionTopics.length >= 2 ||
    (typeof summaryShort === "string" &&
      /cookie settings|third-party cookies|targeting cookies|analytical cookies|measurement\/performance|marketing\/targeting/i.test(
        summaryShort
      ));
  const sourceUrlObstructed = isObstructedCookiePolicyUrl(pageUrl);

  if (runtimeCookies.length === 0) {
    return [];
  }

  const relevantRuntimeCookies = runtimeCookies.filter((cookieName) => !isInfrastructureRuntimeCookie(cookieName));
  const ignoredRuntimeCookies = runtimeCookies.filter((cookieName) => isInfrastructureRuntimeCookie(cookieName));
  const relevantRuntimeCookieObservations = observedRuntimeCookies.filter((row) => !isInfrastructureRuntimeCookie(row.cookieName));

  if (relevantRuntimeCookies.length === 0) {
    return [];
  }

  const matched = relevantRuntimeCookies.flatMap((cookieName) => {
    const match = matchRuntimeCookie({ cookieName, disclosures });
    return match ? [{ cookieName, ...match }] : [];
  });
  const unmatched = relevantRuntimeCookies.filter((cookieName) => !matched.some((entry) => entry.cookieName === cookieName));
  const unmatchedObservations = relevantRuntimeCookieObservations.filter((row) => unmatched.includes(normalizeCookieName(row.cookieName) ?? ""));
  const findings: Array<ReturnType<typeof buildPolicyRuntimeFinding>> = [];

  const structurallyWeak =
    sourceUrlObstructed ||
    (!hasRichCookieSemantics && disclosures.length === 0) ||
    (semanticConfidence !== null && semanticConfidence < 0.6) ||
    flags.includes("low_confidence") ||
    flags.includes("llm_provider_error");

  if (structurallyWeak && (!hasRichCookieSemantics || sourceUrlObstructed)) {
    findings.push(
      buildPolicyRuntimeFinding({
        description:
          "A cookie policy page was present, but it did not expose enough structured cookie disclosure metadata to reconcile the cookies observed at runtime with confidence.",
        evidence: {
          cookie_policy_url: pageUrl,
          extracted_cookie_row_count: disclosures.length,
          ignored_runtime_cookie_names: ignoredRuntimeCookies,
          policy_actionable_flags: flags,
          policy_semantic_confidence: semanticConfidence,
          runtime_cookie_names: relevantRuntimeCookies
        },
        pageType,
        pageUrl,
        ruleKey: "cookie_runtime.cookie_policy_obstructed",
        severity: "medium",
        title: "Cookie policy structurally obstructed"
      })
    );
  }

  if (
    !sourceUrlObstructed &&
    (!structurallyWeak || hasRichCookieSemantics) &&
    unmatched.length > 0 &&
    !shouldApplyCookieCategoryDisclosureSafeHarbor({ disclosures, flags, mentionTopics, summaryShort })
  ) {
    const unmatchedThirdPartyCount = unmatchedObservations.filter((row) => row.thirdParty).length;
    const severity: "high" | "medium" = unmatchedThirdPartyCount > 0 || unmatched.length > 1 ? "high" : "medium";
    findings.push(
      buildPolicyRuntimeFinding({
        description:
          "Runtime cookies were observed in the browser, but one or more of those cookies could not be matched to a disclosed cookie entry in the site’s cookie policy.",
        evidence: {
          cookie_policy_url: pageUrl,
          disclosed_cookie_rows: disclosures.map((row) => ({
            confidence: row.confidence,
            cookieName: row.cookieName,
            duration: row.duration,
            provider: row.provider,
            purpose: row.purpose,
            snippetHash: row.snippetHash
          })),
          disclosureMismatchExplained: true,
          disclosureSearchScopeRetained: true,
          policy_category_disclosure_present: hasStrongCookieCategoryDisclosure({
            disclosures,
            flags,
            mentionTopics,
            summaryShort
          }),
          policyExtractionStatus: "fetched",
          policySourceUrl: pageUrl,
          mismatchExplanation:
            "Runtime cookies were observed, but one or more non-essential runtime cookies could not be matched to retained cookie-policy disclosure rows or category disclosures.",
          negativeDisclosureSearchPerformed: true,
          observedBehavior: `Runtime observed unmatched cookies: ${unmatched.slice(0, 8).join(", ")}.`,
          matching_methods: matched.map((row) => ({
            cookieName: row.cookieName,
            matchedCookieName: row.disclosure.cookieName,
            method: row.method
          })),
          ignored_runtime_cookie_names: ignoredRuntimeCookies,
          runtime_cookie_names: relevantRuntimeCookies,
          unmatched_third_party_cookie_count: unmatchedThirdPartyCount,
          unmatched_cookie_names: unmatched
        },
        pageType,
        pageUrl,
        ruleKey: "cookie_runtime.disclosure_gap",
        severity,
        title: "Cookie disclosure gap"
      })
    );
  }

  return findings;
}

export function deriveCookieDisclosureGapDiagnostic(
  input: {
    policySemanticRows: Array<Record<string, unknown>>;
    runtimeArtifacts: Record<string, unknown> | null;
  },
  findings: Array<{ ruleKey?: unknown }> = []
) {
  const cookiePolicyEnrichment =
    input.policySemanticRows.find((row) => (row.page_type ?? row.pageType) === "cookie_policy") ?? null;
  const emitted = findings.some((finding) => finding.ruleKey === "cookie_runtime.disclosure_gap");

  if (!cookiePolicyEnrichment) {
    return {
      emitted,
      reason: "no_cookie_policy"
    };
  }

  const pageUrl = typeof cookiePolicyEnrichment.page_url === "string" ? cookiePolicyEnrichment.page_url : null;
  const hybrid =
    input.runtimeArtifacts &&
    typeof input.runtimeArtifacts.hybrid_runtime_evidence === "object" &&
    input.runtimeArtifacts.hybrid_runtime_evidence !== null &&
    !Array.isArray(input.runtimeArtifacts.hybrid_runtime_evidence)
      ? (input.runtimeArtifacts.hybrid_runtime_evidence as Record<string, unknown>)
      : null;
  const cookieWriteObservations =
    hybrid && Array.isArray(hybrid.cookieWriteObservations)
      ? hybrid.cookieWriteObservations.filter(
          (value): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
        )
      : [];
  const observedRuntimeCookies = cookieWriteObservations.length > 0
    ? cookieWriteObservations
        .map((row) => ({
          cookieName: typeof row.cookieName === "string" ? row.cookieName : null,
          thirdParty: row.thirdParty === true
        }))
        .filter((row): row is { cookieName: string; thirdParty: boolean } => typeof row.cookieName === "string")
    : normalizeCookieTokenList(
        Array.isArray(input.runtimeArtifacts?.initial_cookie_names)
          ? (input.runtimeArtifacts.initial_cookie_names as unknown[]).filter((value): value is string => typeof value === "string")
          : []
      ).map((cookieName) => ({ cookieName, thirdParty: false }));
  const runtimeCookies = normalizeCookieTokenList(observedRuntimeCookies.map((row) => row.cookieName));
  const relevantRuntimeCookies = runtimeCookies.filter((cookieName) => !isInfrastructureRuntimeCookie(cookieName));
  const ignoredRuntimeCookies = runtimeCookies.filter((cookieName) => isInfrastructureRuntimeCookie(cookieName));
  const relevantRuntimeCookieObservations = observedRuntimeCookies.filter((row) => !isInfrastructureRuntimeCookie(row.cookieName));

  const disclosures = Array.isArray(cookiePolicyEnrichment.policy_cookie_disclosures)
    ? ((cookiePolicyEnrichment.policy_cookie_disclosures as unknown[]) ?? []).flatMap((value) => {
        if (typeof value !== "object" || value === null) {
          return [];
        }

        const record = value as Record<string, unknown>;
        const vendor = typeof record.vendor === "string" ? record.vendor : typeof record.provider === "string" ? record.provider : null;
        const cookieType = typeof record.cookie_type === "string" ? record.cookie_type : null;
        const cookieNames = Array.isArray(record.cookies)
          ? record.cookies.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
          : [];

        if (cookieNames.length > 0) {
          return cookieNames.map((cookieName) => ({
            confidence: typeof record.confidence === "number" ? record.confidence : 0.65,
            cookieName,
            duration: typeof record.duration === "string" ? record.duration : null,
            provider: vendor,
            purpose: cookieType,
            snippetHash:
              typeof record.snippet_hash === "string"
                ? record.snippet_hash
                : typeof record.snippetHash === "string"
                  ? record.snippetHash
                  : vendor && cookieName
                    ? `${vendor}:${cookieName}`
                    : cookieName
          } satisfies CookieDisclosureRow));
        }

        return [
          {
            confidence: typeof record.confidence === "number" ? record.confidence : 0,
            cookieName: typeof record.cookie_name === "string" ? record.cookie_name : typeof record.cookieName === "string" ? record.cookieName : null,
            duration: typeof record.duration === "string" ? record.duration : null,
            provider: typeof record.provider === "string" ? record.provider : null,
            purpose: typeof record.purpose === "string" ? record.purpose : null,
            snippetHash: typeof record.snippet_hash === "string" ? record.snippet_hash : typeof record.snippetHash === "string" ? record.snippetHash : null
          } satisfies CookieDisclosureRow
        ];
      })
    : [];
  const flags = Array.isArray(cookiePolicyEnrichment.policy_actionable_flags)
    ? cookiePolicyEnrichment.policy_actionable_flags.filter((value): value is string => typeof value === "string")
    : [];
  const mentionTopics = getPolicyMentionTopics(cookiePolicyEnrichment);
  const semanticConfidence =
    typeof cookiePolicyEnrichment.policy_semantic_confidence === "number" &&
    Number.isFinite(cookiePolicyEnrichment.policy_semantic_confidence)
      ? cookiePolicyEnrichment.policy_semantic_confidence
      : null;
  const summaryShort = cookiePolicyEnrichment.policy_summary_short ?? null;
  const hasRichCookieSemantics =
    disclosures.length > 0 ||
    mentionTopics.length >= 2 ||
    (typeof summaryShort === "string" &&
      /cookie settings|third-party cookies|targeting cookies|analytical cookies|measurement\/performance|marketing\/targeting/i.test(
        summaryShort
      ));
  const sourceUrlObstructed = isObstructedCookiePolicyUrl(pageUrl);
  const structurallyWeak =
    sourceUrlObstructed ||
    (!hasRichCookieSemantics && disclosures.length === 0) ||
    (semanticConfidence !== null && semanticConfidence < 0.6) ||
    flags.includes("low_confidence") ||
    flags.includes("llm_provider_error");
  const matched = relevantRuntimeCookies.flatMap((cookieName) => {
    const match = matchRuntimeCookie({ cookieName, disclosures });
    return match ? [{ cookieName, ...match }] : [];
  });
  const unmatched = relevantRuntimeCookies.filter((cookieName) => !matched.some((entry) => entry.cookieName === cookieName));
  const unmatchedThirdPartyCount = relevantRuntimeCookieObservations.filter((row) =>
    unmatched.includes(normalizeCookieName(row.cookieName) ?? "") && row.thirdParty
  ).length;
  const categoryDisclosurePresent = hasStrongCookieCategoryDisclosure({ disclosures, flags, mentionTopics, summaryShort });
  const categoryDisclosureSafeHarbor = shouldApplyCookieCategoryDisclosureSafeHarbor({
    disclosures,
    flags,
    mentionTopics,
    summaryShort
  });
  const reason = emitted
    ? "emitted"
    : runtimeCookies.length === 0
      ? "no_runtime_cookies"
      : relevantRuntimeCookies.length === 0
        ? "only_ignored_runtime_cookies"
        : sourceUrlObstructed
            ? "policy_structure_obstructed"
            : categoryDisclosureSafeHarbor
              ? "strong_category_disclosure"
              : structurallyWeak && !hasRichCookieSemantics
                ? "policy_structure_obstructed"
                : unmatched.length === 0
                  ? "all_runtime_cookies_disclosed"
                  : "eligible_not_emitted";

  return {
    categoryDisclosurePresent,
    disclosedCookieRowCount: disclosures.length,
    emitted,
    ignoredRuntimeCookieCount: ignoredRuntimeCookies.length,
    policyExtractionStatus: "fetched",
    policySemanticConfidence: semanticConfidence,
    policySourceUrl: pageUrl,
    reason,
    relevantRuntimeCookieCount: relevantRuntimeCookies.length,
    runtimeCookieCount: runtimeCookies.length,
    structurallyWeak,
    unmatchedCookieCount: unmatched.length,
    unmatchedCookieNames: unmatched.slice(0, 8),
    unmatchedThirdPartyCookieCount: unmatchedThirdPartyCount
  };
}

function buildRuntimePrivacyFinding(input: {
  description: string;
  evidence: Record<string, unknown>;
  pageUrl: string | null;
  ruleKey: string;
  severity: "high" | "medium" | "low";
  title: string;
}) {
  const taxonomy = deriveValidationFindingTaxonomy({
    category: "scan_report_review",
    ruleKey: input.ruleKey,
    subtype: "runtime_privacy_review"
  });

  return {
    category: "scan_report_review" as const,
    description: input.description,
    evidence: input.evidence,
    findingFamily: taxonomy.familyId,
    findingScope: taxonomy.scope,
    findingSource: taxonomy.source,
    findingSubject: taxonomy.subject,
    pageUrl: input.pageUrl,
    rank: 0,
    ruleKey: input.ruleKey,
    severity: input.severity,
    subtype: "runtime_privacy_review" as const,
    title: input.title
  };
}

function deriveRuntimePrivacyFindings(input: {
  policySemanticRows: Array<Record<string, unknown>>;
  preconsentViolations: Array<Record<string, unknown>>;
  runtimeArtifacts: Record<string, unknown> | null;
  snapshot: Record<string, unknown> | null;
  trackerVendors: Array<Record<string, unknown>>;
}) {
  const snapshot = input.snapshot;
  const runtime = input.runtimeArtifacts;
  const preconsentTrackingDetected =
    getRecordBoolean(snapshot, "preconsent_tracking_detected") ||
    getRecordBoolean(snapshot, "tracking_before_consent_detected");
  const thirdPartyCookieCount = getSnapshotNumber(snapshot, "third_party_cookie_count");
  const totalCookieCount = getSnapshotNumber(snapshot, "cookie_count_total");
  const totalTrackerCount = getSnapshotNumber(snapshot, "tracker_count_total");
  const totalVendorCount = getSnapshotNumber(snapshot, "tracker_vendor_count");
  const totalRequestCount =
    runtime &&
    typeof runtime.hybrid_runtime_evidence === "object" &&
    runtime.hybrid_runtime_evidence !== null &&
    !Array.isArray(runtime.hybrid_runtime_evidence) &&
    typeof (runtime.hybrid_runtime_evidence as Record<string, unknown>).networkSummary === "object" &&
    (runtime.hybrid_runtime_evidence as Record<string, unknown>).networkSummary !== null
      ? Number((((runtime.hybrid_runtime_evidence as Record<string, unknown>).networkSummary as Record<string, unknown>).totalRequestCount) ?? 0)
      : 0;
  const thirdPartyRequestCount =
    runtime && typeof runtime.third_party_request_count === "number" && Number.isFinite(runtime.third_party_request_count)
      ? runtime.third_party_request_count
      : 0;
  const initialCookieNames = Array.isArray(runtime?.initial_cookie_names)
    ? (runtime.initial_cookie_names as unknown[]).filter((value): value is string => typeof value === "string")
    : [];
  const hybrid =
    runtime &&
    typeof runtime.hybrid_runtime_evidence === "object" &&
    runtime.hybrid_runtime_evidence !== null &&
    !Array.isArray(runtime.hybrid_runtime_evidence)
      ? (runtime.hybrid_runtime_evidence as Record<string, unknown>)
      : null;
  const consentSummary =
    hybrid &&
    typeof hybrid.consentSummary === "object" &&
    hybrid.consentSummary !== null &&
    !Array.isArray(hybrid.consentSummary)
      ? (hybrid.consentSummary as Record<string, unknown>)
      : null;
  const vendorSummary =
    hybrid &&
    typeof hybrid.vendorSummary === "object" &&
    hybrid.vendorSummary !== null &&
    !Array.isArray(hybrid.vendorSummary)
      ? (hybrid.vendorSummary as Record<string, unknown>)
      : null;
  const rawThirdPartyDomains = [
    ...new Set(
      [
        ...(Array.isArray(runtime?.third_party_request_domains) ? runtime.third_party_request_domains : []),
        ...(Array.isArray(vendorSummary?.rawThirdPartyDomains) ? vendorSummary.rawThirdPartyDomains : [])
      ].filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    )
  ];
  const thirdPartyVendorsBeforeConsent = [
    ...new Set(
      input.trackerVendors
        .filter((row) => row.before_consent === true && row.first_party_or_third_party === "third_party")
        .map((row) => (typeof row.vendor_name === "string" ? row.vendor_name : null))
        .filter((value): value is string => Boolean(value))
    )
  ];
  const preconsentViolationVendors = [
    ...new Set(
      input.preconsentViolations
        .map((row) => (typeof row.vendor_name === "string" ? row.vendor_name : null))
        .filter((value): value is string => Boolean(value))
    )
  ];
  const attributedPreconsentVendors = [
    ...new Set([...thirdPartyVendorsBeforeConsent, ...preconsentViolationVendors])
  ];
  const domainPolicyCoverage = buildDomainPolicyCoverageSummary(input.policySemanticRows);
  const inferredCmpVendorName = inferCmpVendorName({
    domains: rawThirdPartyDomains,
    hybrid,
    initialCookieNames,
    runtimeArtifacts: input.runtimeArtifacts,
    snapshot
  });
  const cmpVendorName = typeof snapshot?.cmp_vendor_name === "string" ? snapshot.cmp_vendor_name : inferredCmpVendorName;
  const cmpDetected = Boolean(cmpVendorName) || consentSummary?.cmpDetected === true || getRecordBoolean(snapshot, "cookie_banner_present");
  const consentSurfaceObserved =
    runtime?.consent_surface_observed === true ||
    consentSummary?.bannerPresent === true ||
    getRecordBoolean(snapshot, "cookie_banner_present");
  const consentActionableChoiceObserved =
    runtime?.consent_actionable_choice_observed === true ||
    consentSummary?.managePresent === true ||
    consentSummary?.acceptPresent === true ||
    consentSummary?.rejectPresent === true ||
    getRecordBoolean(snapshot, "granular_preferences_present") ||
    getRecordBoolean(snapshot, "accept_all_present") ||
    getRecordBoolean(snapshot, "reject_all_present");
  const rtbDomains = getRtbOrIdentitySyncDomains(rawThirdPartyDomains);
  const rtbVendors = getRtbOrIdentitySyncVendors([
    ...thirdPartyVendorsBeforeConsent,
    ...preconsentViolationVendors,
    ...(Array.isArray(vendorSummary?.normalizedVendors) ? vendorSummary.normalizedVendors : [])
  ]);
  const hybridNavigationSummary = getRecord(hybrid?.navigationSummary);
  const runtimeFindingPageUrlCandidates = [
    getStringValue(hybridNavigationSummary, "finalUrl"),
    getStringValue(hybridNavigationSummary, "initialUrl"),
    getStringValue(snapshot, "final_url"),
    getStringValue(snapshot, "finalUrl"),
    getStringValue(snapshot, "page_url"),
    getStringValue(snapshot, "pageUrl"),
    getStringValue(snapshot, "homepage_url"),
    getStringValue(snapshot, "homepageUrl"),
    getStringValue(snapshot, "canonical_url"),
    getStringValue(snapshot, "canonicalUrl")
  ];
  const runtimeFindingPageUrl = runtimeFindingPageUrlCandidates.find((candidate) => {
    if (!candidate || /\.(?:avif|bmp|css|gif|ico|jpe?g|js|mjs|map|mp3|mp4|ogg|pdf|png|svg|webm|webp|woff2?)(?:$|[?#])/i.test(candidate)) {
      return false;
    }
    try {
      const parsed = new URL(candidate);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }) ?? null;
  const runtimePageContextValid = runtimeFindingPageUrl !== null;
  const rtbCookieSyncObservations = getRtbCookieSyncObservations(hybrid, rtbDomains, {
    scannedPageUrl: runtimeFindingPageUrl
  });
  const rtbRequestUrls = getRuntimeRequestUrlsForDomains(hybrid, rtbDomains);
  const preconsentViolationEvidenceUrls = [
    ...new Set(
      input.preconsentViolations.flatMap((row) => {
        const values = Array.isArray(row.evidence_urls)
          ? row.evidence_urls
          : Array.isArray(row.evidenceUrls)
            ? row.evidenceUrls
            : [];
        return values.filter((value): value is string => typeof value === "string" && /^https?:\/\//i.test(value) && !isCmpEvidenceUrl(value));
      })
    )
  ];
  const preconsentRuntimeRequestUrls = [
    ...new Set([
      ...getRuntimeRequestUrlsForDomains(hybrid, rawThirdPartyDomains, { preconsentOnly: true }),
      ...preconsentViolationEvidenceUrls
    ])
  ].slice(0, 20);
  const runtimeVendors = [
    ...new Set([...attributedPreconsentVendors, ...rtbVendors])
  ].sort();

  if (!preconsentTrackingDetected) {
    return [] as Array<ReturnType<typeof buildRuntimePrivacyFinding>>;
  }

  if (
    thirdPartyCookieCount <= 0 &&
    thirdPartyVendorsBeforeConsent.length === 0 &&
    preconsentViolationVendors.length === 0 &&
    preconsentRuntimeRequestUrls.length === 0
  ) {
    return [] as Array<ReturnType<typeof buildRuntimePrivacyFinding>>;
  }

  const severity: "high" | "medium" =
    thirdPartyCookieCount > 0 ||
    thirdPartyVendorsBeforeConsent.length >= 2 ||
    preconsentViolationVendors.length >= 3 ||
    preconsentRuntimeRequestUrls.length >= 3
      ? "high"
      : "medium";
  const explicitPrivacyControlsDisclosed =
    domainPolicyCoverage.hasPrivacyChoiceDisclosure ||
    domainPolicyCoverage.hasRightsDisclosure ||
    domainPolicyCoverage.hasPrivacyContactDisclosure;
  const description = explicitPrivacyControlsDisclosed
    ? "The scan observed cookies or tracking vendors before any consent interaction, even though the site also discloses privacy choices or related privacy controls."
    : "The scan observed cookies or tracking vendors before any consent interaction, indicating that tracking activity likely starts before the user can express a privacy choice.";
  const title = explicitPrivacyControlsDisclosed ? "Tracking observed before privacy choice" : "Tracking observed before consent";

  const findings = [
    buildRuntimePrivacyFinding({
      description,
      evidence: {
        cmp_detected: cmpDetected,
        cmp_vendor_name: cmpVendorName,
        consent_actionable_choice_observed: consentActionableChoiceObserved,
        consent_surface_observed: consentSurfaceObserved,
        domain_policy_coverage: domainPolicyCoverage,
        document_url: runtimeFindingPageUrl,
        explicit_privacy_controls_disclosed: explicitPrivacyControlsDisclosed,
        initial_cookie_names: initialCookieNames,
        preconsent_tracking_detected: preconsentTrackingDetected,
        preconsent_violation_count: input.preconsentViolations.length,
        preconsent_violation_vendors: attributedPreconsentVendors,
        preconsent_tracker_evidence_urls: preconsentRuntimeRequestUrls,
        runtimeRequestUrls: preconsentRuntimeRequestUrls,
        runtime_page_context_valid: runtimePageContextValid,
        runtimeVendors,
        third_party_cookie_count: thirdPartyCookieCount,
        third_party_request_domains: rawThirdPartyDomains,
        third_party_request_domain_count: rawThirdPartyDomains.length,
        third_party_request_count: thirdPartyRequestCount,
        third_party_vendors_before_consent: thirdPartyVendorsBeforeConsent,
        total_cookie_count: totalCookieCount,
        total_request_count: Number.isFinite(totalRequestCount) ? totalRequestCount : 0,
        total_tracker_count: totalTrackerCount,
        total_vendor_count: totalVendorCount
      },
      pageUrl: runtimeFindingPageUrl,
      ruleKey: "runtime_privacy.preconsent_tracking_observed",
      severity,
      title
    })
  ];

  if (rtbCookieSyncObservations.length >= 1) {
    findings.push(
      buildRuntimePrivacyFinding({
        description:
          "The scan observed request-level advertising exchange, identity-sync, or cookie-sync activity during initial runtime, indicating a programmatic adtech footprint that should be reviewed against consent gating and disclosure expectations.",
        evidence: {
          preconsent_tracking_detected: preconsentTrackingDetected,
          rtb_cookie_sync_detected: true,
          rtb_cookie_sync_evidence: rtbCookieSyncObservations,
          rtb_cookie_sync_domain_count: rtbDomains.length,
          rtb_cookie_sync_domains: rtbDomains,
          rtb_cookie_sync_observation_count: rtbCookieSyncObservations.length,
          rtb_cookie_sync_vendors: rtbVendors,
          runtimeRequestUrls: rtbCookieSyncObservations.map((row) => row.urlSample).filter((value) => /^https?:\/\//i.test(value)),
          runtimeVendors: rtbVendors,
          third_party_request_count: thirdPartyRequestCount,
          third_party_request_domain_count: rawThirdPartyDomains.length,
          third_party_request_domains: rawThirdPartyDomains
        },
        pageUrl: runtimeFindingPageUrl,
        ruleKey: "runtime_privacy.rtb_cookie_sync_observed",
        severity: rtbCookieSyncObservations.length >= 3 || rtbDomains.length >= 3 || rtbVendors.length >= 2 ? "high" : "medium",
        title: "RTB cookie sync observed"
      })
    );
  }

  const hasPolicyOrChoiceCoverage =
    explicitPrivacyControlsDisclosed ||
    getRecordBoolean(snapshot, "privacy_policy_present") ||
    getRecordBoolean(snapshot, "cookie_policy_present");
  const hasThirdPartyAdtechBeforeConsent =
    thirdPartyCookieCount > 0 ||
    thirdPartyVendorsBeforeConsent.length > 0 ||
    preconsentViolationVendors.length > 0 ||
    rtbDomains.length > 0;
  const consentGatedTrackingContradictionEvidence = buildConsentGatedTrackingContradictionEvidence({
    policySemanticRows: input.policySemanticRows,
    runtimeRequestUrls: [...new Set([...preconsentRuntimeRequestUrls, ...rtbRequestUrls])],
    runtimeVendors
  });

  if (cmpDetected && consentSurfaceObserved && consentActionableChoiceObserved && hasPolicyOrChoiceCoverage && hasThirdPartyAdtechBeforeConsent) {
    findings.push(
      buildRuntimePrivacyFinding({
        description:
          "The scan observed a consent management surface and policy or choice coverage, but third-party advertising, analytics, or identity-sync activity still appeared before the visitor completed a choice.",
        evidence: {
          cmp_detected: cmpDetected,
          cmp_vendor_name: cmpVendorName,
          consent_actionable_choice_observed: consentActionableChoiceObserved,
          consent_surface_observed: consentSurfaceObserved,
          ...(consentGatedTrackingContradictionEvidence
            ? { contradictionEvidence: consentGatedTrackingContradictionEvidence }
            : {}),
          domain_policy_coverage: domainPolicyCoverage,
          document_url: runtimeFindingPageUrl,
          preconsent_tracking_detected: preconsentTrackingDetected,
          preconsent_violation_vendors: attributedPreconsentVendors,
          rtb_cookie_sync_domains: rtbDomains,
          runtimeRequestUrls: [...new Set([...preconsentRuntimeRequestUrls, ...rtbRequestUrls])],
          runtime_page_context_valid: runtimePageContextValid,
          runtimeVendors,
          third_party_cookie_count: thirdPartyCookieCount,
          third_party_request_count: thirdPartyRequestCount,
          third_party_request_domain_count: rawThirdPartyDomains.length,
          third_party_vendors_before_consent: thirdPartyVendorsBeforeConsent
        },
        pageUrl: runtimeFindingPageUrl,
        ruleKey: "runtime_privacy.consent_gated_tracking_claim_conflict",
        severity: "high",
        title: "Consent-gated tracking claim conflicts with runtime behavior"
      })
    );
  }

  return findings;
}

const RTB_OR_IDENTITY_SYNC_DOMAIN_PATTERNS = [
  /(^|\.)adnxs\.com$/i,
  /(^|\.)bidswitch\.net$/i,
  /(^|\.)casalemedia\.com$/i,
  /(^|\.)criteo\.(?:com|net)$/i,
  /(^|\.)doubleclick\.net$/i,
  /(^|\.)doubleverify\.com$/i,
  /(^|\.)dv\.tech$/i,
  /(^|\.)exelator\.com$/i,
  /(^|\.)fwmrm\.net$/i,
  /(^|\.)gumgum\.com$/i,
  /(^|\.)id5-sync\.com$/i,
  /(^|\.)liadm\.com$/i,
  /(^|\.)openx(?:cdn)?\.net$/i,
  /(^|\.)pubmatic\.com$/i,
  /(^|\.)quantserve\.com$/i,
  /(^|\.)rlcdn\.com$/i,
  /(^|\.)rubiconproject\.com$/i,
  /(^|\.)adsrvr\.org$/i,
  /(^|\.)3lift\.com$/i,
  /(^|\.)crwdcntrl\.net$/i
];

const RTB_OR_IDENTITY_SYNC_VENDOR_PATTERN =
  /ad manager|adobe audience manager|bidswitch|criteo|doubleclick|doubleverify|gumgum|id5|index exchange|liveintent|lotame|liveramp|openx|pubmatic|quantcast|rubicon|scorecardresearch|the trade desk|triplelift/i;

function getRtbOrIdentitySyncDomains(domains: string[]) {
  return [
    ...new Set(
      domains
        .map((value) => value.trim().replace(/^\.+/, "").toLowerCase())
        .filter((value) => RTB_OR_IDENTITY_SYNC_DOMAIN_PATTERNS.some((pattern) => pattern.test(value)))
    )
  ].sort();
}

function getRtbOrIdentitySyncVendors(vendors: unknown[]) {
  return [
    ...new Set(
      vendors
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .filter((value) => RTB_OR_IDENTITY_SYNC_VENDOR_PATTERN.test(value))
    )
  ].sort();
}

function getRtbCookieSyncObservations(
  hybrid: Record<string, unknown> | null,
  rtbDomains: string[],
  options?: { scannedPageUrl?: string | null }
) {
  if (!hybrid) {
    return [];
  }

  const getString = (row: Record<string, unknown>, keys: string[]) => {
    for (const key of keys) {
      const value = row[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
    return null;
  };
  const roughRegistrableDomain = (hostname: string) => {
    const parts = hostname.toLowerCase().replace(/^\./, "").split(".").filter(Boolean);
    if (parts.length <= 2) {
      return parts.join(".");
    }
    const lastTwo = parts.slice(-2).join(".");
    const multiPartPublicSuffixes = new Set(["co.uk", "com.au", "com.br", "co.jp", "co.nz", "com.mx"]);
    return multiPartPublicSuffixes.has(lastTwo) && parts.length >= 3 ? parts.slice(-3).join(".") : lastTwo;
  };
  const domainSet = new Set(rtbDomains.map((value) => value.trim().replace(/^\.+/, "").toLowerCase()));
  const explicitRows = getRuntimeObjectArray(hybrid.rtbCookieSyncObservations ?? hybrid.rtb_cookie_sync_observations);
  const compactRows = explicitRows.flatMap((row) => {
    const hostname = typeof row.hostname === "string" ? row.hostname.trim().toLowerCase() : "";
    const urlSample = typeof row.urlSample === "string" ? row.urlSample : typeof row.url_sample === "string" ? row.url_sample : "";
    const pathSample = typeof row.pathSample === "string" ? row.pathSample : typeof row.path_sample === "string" ? row.path_sample : "/";
    const reason = typeof row.reason === "string" ? row.reason : "known_sync_host";
    const queryKeysSample = getRuntimeStringArray(row.queryKeysSample ?? row.query_keys_sample);
    const redirectTargetHost =
      typeof row.redirectTargetHost === "string"
        ? row.redirectTargetHost
        : typeof row.redirect_target_host === "string"
          ? row.redirect_target_host
          : null;
    const hasConcreteSyncEvidence =
      reason === "identifier_query" ||
      reason === "redirect_sync" ||
      /(?:^|\/)(?:sync|idsync|usersync|user[-_]?match|cookie[-_]?sync|setuid|getuid\w*)(?:\/|[?_]|$)|(?:^|\/)match(?:\/|[?_]|$)|\/tap\.php$|\/track\/cmf(?:\/|$)|\/ibs:dpid/i.test(
        `${hostname} ${pathSample}`
      ) ||
      queryKeysSample.some((key) =>
        /^(?:uid|uuid|guid|id|userid|user_id|partner|partnerid|gdpr|gdpr_consent|us_privacy|redir|redirect|redirect_url|callback)$/i.test(key)
      ) ||
      Boolean(redirectTargetHost && redirectTargetHost !== hostname);
    if (!hostname || !hostname.includes(".")) {
      return [];
    }
    if (!hasConcreteSyncEvidence) {
      return [];
    }
    const pageUrl = getString(row, ["pageUrl", "page_url", "scannedPageUrl", "scanned_page_url"]) ?? options?.scannedPageUrl ?? null;
    const scannedPageUrl = getString(row, ["scannedPageUrl", "scanned_page_url", "pageUrl", "page_url"]) ?? options?.scannedPageUrl ?? null;
    const vendorName = getString(row, ["vendorName", "vendor_name"]);
    const vendorNormalizationBasis = getString(row, ["vendorNormalizationBasis", "vendor_normalization_basis"]);
    return [{
      category: typeof row.category === "string" ? row.category : "rtb_exchange",
      hostname,
      ...(pageUrl ? { pageUrl } : {}),
      pathSample,
      queryKeysSample,
      reason,
      registrableDomain: getString(row, ["registrableDomain", "registrable_domain", "etldPlusOne", "etld_plus_one"]) ?? roughRegistrableDomain(hostname),
      redirectTargetHost,
      resourceType: typeof row.resourceType === "string" ? row.resourceType : typeof row.resource_type === "string" ? row.resource_type : null,
      runtimePhase: typeof row.runtimePhase === "string" ? row.runtimePhase : typeof row.runtime_phase === "string" ? row.runtime_phase : "unknown",
      ...(scannedPageUrl ? { scannedPageUrl } : {}),
      statusCode:
        typeof row.statusCode === "number" && Number.isFinite(row.statusCode)
          ? row.statusCode
          : typeof row.status_code === "number" && Number.isFinite(row.status_code)
            ? row.status_code
            : null,
      tsMs: typeof row.tsMs === "number" && Number.isFinite(row.tsMs) ? row.tsMs : 0,
      urlSample: urlSample || `https://${hostname}${pathSample}`,
      vendor: getString(row, ["vendor"]),
      ...(vendorName ? { vendorName } : {}),
      ...(vendorNormalizationBasis ? { vendorNormalizationBasis } : {})
    }];
  });

  if (compactRows.length > 0) {
    return compactRows.slice(0, 12);
  }

  const requestObservations = getRuntimeObjectArray(hybrid.requestObservations);
  return requestObservations.flatMap((row) => {
    const hostname = typeof row.domain === "string" ? row.domain.trim().replace(/^\.+/, "").toLowerCase() : "";
    const pathSample = typeof row.pathSample === "string" ? row.pathSample : typeof row.path_sample === "string" ? row.path_sample : "/";
    const queryKeysSample = getRuntimeStringArray(row.queryKeysSample ?? row.query_keys_sample ?? row.parameterKeys ?? row.parameter_keys);
    const syncPattern =
      /sync|idsync|user[-_]?match|cookie[-_]?sync|setuid/i.test(hostname) ||
      /(?:^|\/)(?:sync|idsync|usersync|user[-_]?match|cookie[-_]?sync|setuid|getuid\w*)(?:\/|[?_]|$)|(?:^|\/)match(?:\/|[?_]|$)/i.test(pathSample);
    const idHints = queryKeysSample.some((key) =>
      /^(?:uid|uuid|guid|id|userid|user_id|partner|partnerid|gdpr|gdpr_consent|us_privacy|redir|redirect|callback)$/i.test(key)
    );
    if (!hostname || !domainSet.has(hostname) || !syncPattern || !idHints) {
      return [];
    }
    return [{
      category: "rtb_exchange",
      hostname,
      pathSample,
      queryKeysSample,
      reason: "identifier_query",
      redirectTargetHost: null,
      resourceType: typeof row.resourceType === "string" ? row.resourceType : typeof row.resource_type === "string" ? row.resource_type : null,
      runtimePhase: typeof row.runtimePhase === "string" ? row.runtimePhase : typeof row.runtime_phase === "string" ? row.runtime_phase : "unknown",
      statusCode:
        typeof row.statusCode === "number" && Number.isFinite(row.statusCode)
          ? row.statusCode
          : typeof row.status_code === "number" && Number.isFinite(row.status_code)
            ? row.status_code
            : null,
      tsMs: typeof row.tsMs === "number" && Number.isFinite(row.tsMs) ? row.tsMs : 0,
      urlSample: `https://${hostname}${pathSample}`,
      vendor: null
    }];
  }).slice(0, 12);
}

function getRuntimeRequestUrlsForDomains(
  hybrid: Record<string, unknown> | null,
  domains: string[],
  options?: { preconsentOnly?: boolean }
) {
  if (!hybrid || domains.length === 0) {
    return [];
  }

  const domainSet = new Set(domains.map((value) => value.trim().replace(/^\.+/, "").toLowerCase()));
  const requestObservations = getRuntimeObjectArray(hybrid.requestObservations);
  const vendorRows = getRuntimeObjectArray(hybrid.requestToVendorObservations);
  const preconsentHosts = new Set(
    vendorRows
      .filter((row) => row.preConsent === true || row.pre_consent === true)
      .flatMap((row) => {
        const hostname = typeof row.hostname === "string" ? row.hostname.trim().toLowerCase() : "";
        return hostname ? [hostname] : [];
      })
  );

  return [
    ...new Set(
      requestObservations.flatMap((row) => {
        const domain = typeof row.domain === "string" ? row.domain.trim().replace(/^\.+/, "").toLowerCase() : "";
        const url = typeof row.url === "string" && /^https?:\/\//i.test(row.url) ? row.url : null;
        if (!domain || !url || !domainSet.has(domain)) {
          return [];
        }
        if (options?.preconsentOnly && row.preConsent !== true && row.pre_consent !== true && !preconsentHosts.has(domain)) {
          return [];
        }
        if (options?.preconsentOnly && isCmpEvidenceUrl(url)) {
          return [];
        }
        return [url];
      })
    )
  ].slice(0, 20);
}

function inferCmpVendorName(input: {
  domains: string[];
  hybrid: Record<string, unknown> | null;
  initialCookieNames: string[];
  runtimeArtifacts?: Record<string, unknown> | null;
  snapshot?: Record<string, unknown> | null;
}) {
  const requestUrls = getRuntimeObjectArray(input.hybrid?.requestObservations).flatMap((row) => {
    const value = typeof row.url === "string" ? row.url : null;
    return value ? [value] : [];
  });
  return getKnownCmpVendorName({
    cookieNames: input.initialCookieNames,
    domains: input.domains,
    labels: [typeof input.snapshot?.cmp_vendor_name === "string" ? input.snapshot.cmp_vendor_name : ""],
    storageKeys: [
      ...getRuntimeStringArray(input.runtimeArtifacts?.local_storage_keys),
      ...getRuntimeStringArray(input.runtimeArtifacts?.localStorageKeys),
      ...getRuntimeStringArray(input.runtimeArtifacts?.session_storage_keys),
      ...getRuntimeStringArray(input.runtimeArtifacts?.sessionStorageKeys)
    ],
    urls: [
      ...requestUrls,
      ...getRuntimeStringArray(input.runtimeArtifacts?.consent_baseline_tracker_evidence_urls),
      ...getRuntimeStringArray(input.runtimeArtifacts?.consentBaselineTrackerEvidenceUrls)
    ]
  });
}

function isCmpEvidenceUrl(value: string | null | undefined) {
  return isKnownCmpInfrastructureUrl(value);
}

function getRuntimeStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

function getRuntimeObjectArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
  );
}

function deriveConsentInterfaceFindings(input: {
  runtimeArtifacts: Record<string, unknown> | null;
  snapshot: Record<string, unknown> | null;
}) {
  const hybrid =
    input.runtimeArtifacts &&
    typeof input.runtimeArtifacts.hybrid_runtime_evidence === "object" &&
    input.runtimeArtifacts.hybrid_runtime_evidence !== null &&
    !Array.isArray(input.runtimeArtifacts.hybrid_runtime_evidence)
      ? (input.runtimeArtifacts.hybrid_runtime_evidence as Record<string, unknown>)
      : null;
  const consentSummary =
    hybrid &&
    typeof hybrid.consentSummary === "object" &&
    hybrid.consentSummary !== null &&
    !Array.isArray(hybrid.consentSummary)
      ? (hybrid.consentSummary as Record<string, unknown>)
      : null;
  const consentVisual =
    hybrid &&
    typeof hybrid.consentVisual === "object" &&
    hybrid.consentVisual !== null &&
    !Array.isArray(hybrid.consentVisual)
      ? (hybrid.consentVisual as Record<string, unknown>)
      : null;

  if (!consentSummary) {
    return [] as Array<ReturnType<typeof buildRuntimePrivacyFinding>>;
  }

  const cmpDetected = consentSummary.cmpDetected === true;
  const contentObstructed = consentSummary.contentObstructed === true;
  const cookieWallDetected = consentSummary.cookieWallDetected === true;
  const rejectPresent = consentSummary.rejectPresent === true;
  const rejectRequiresMoreClicks = consentSummary.rejectRequiresMoreClicks === true;
  const rejectDepthClass =
    typeof consentSummary.rejectDepthClass === "string" ? consentSummary.rejectDepthClass : null;
  const managePresent = consentSummary.managePresent === true;
  const surfaceType = typeof consentSummary.surfaceType === "string" ? consentSummary.surfaceType : null;
  const rejectHidden = consentVisual?.rejectHidden === true;

  if (!cmpDetected) {
    return [] as Array<ReturnType<typeof buildRuntimePrivacyFinding>>;
  }

  const obstructive =
    cookieWallDetected ||
    contentObstructed ||
    rejectHidden ||
    (!rejectPresent && managePresent) ||
    rejectRequiresMoreClicks ||
    rejectDepthClass === "deeper_layer";

  if (!obstructive) {
    return [] as Array<ReturnType<typeof buildRuntimePrivacyFinding>>;
  }

  return [
    buildRuntimePrivacyFinding({
      description:
        "The consent interface appears to obstruct or delay a reject path by gating content, hiding the reject option, or requiring extra navigation before a user can refuse tracking.",
      evidence: {
        cmp_detected: cmpDetected,
        content_obstructed: contentObstructed,
        cookie_wall_detected: cookieWallDetected,
        manage_present: managePresent,
        reject_depth_class: rejectDepthClass,
        reject_hidden: rejectHidden,
        reject_present: rejectPresent,
        reject_requires_more_clicks: rejectRequiresMoreClicks,
        surface_type: surfaceType
      },
      pageUrl: null,
      ruleKey: "runtime_privacy.consent_interface_obstructive",
      severity: cookieWallDetected || rejectHidden ? "high" : "medium",
      title: "Consent interface appears obstructive"
    })
  ];
}

function buildSectionIssueFinding(input: {
  description: string;
  evidence: Record<string, unknown>;
  pageType: string | null;
  pageUrl: string | null;
  ruleKey: string;
  severity: "high" | "medium" | "low";
  title: string;
}) {
  const taxonomy = deriveValidationFindingTaxonomy({
    category: "scan_report_review",
    ruleKey: input.ruleKey,
    subtype: "scan_report_section"
  });

  return {
    category: "scan_report_review" as const,
    description: input.description,
    evidence: input.evidence,
    findingFamily: taxonomy.familyId,
    findingScope: taxonomy.scope,
    findingSource: taxonomy.source,
    findingSubject: taxonomy.subject,
    pageUrl: input.pageUrl,
    rank: 0,
    ruleKey: input.ruleKey,
    severity: input.severity,
    subtype: "scan_report_section" as const,
    title: input.title
  };
}

function derivePolicySectionFindings(input: {
  documentSources: Array<Record<string, unknown>>;
  policySemanticRows: Array<Record<string, unknown>>;
  policyReviewQueue: Array<Record<string, unknown>>;
  snapshot: Record<string, unknown> | null;
}) {
  const findings: Array<ReturnType<typeof buildSectionIssueFinding> | ReturnType<typeof buildPolicyRuntimeFinding>> = [];
  const reviewReasonsByEnrichmentId = new Map<string, Set<string>>();

  for (const row of input.policyReviewQueue) {
    const enrichmentId = String(row.policy_enrichment_id ?? "");
    const reason = String(row.reason ?? "");
    if (!enrichmentId || !reason) {
      continue;
    }

    const existing = reviewReasonsByEnrichmentId.get(enrichmentId) ?? new Set<string>();
    existing.add(reason);
    reviewReasonsByEnrichmentId.set(enrichmentId, existing);
  }

  const highExposure =
    getRecordBoolean(input.snapshot, "eu_exposure_likely") ||
    getRecordBoolean(input.snapshot, "california_exposure_likely");
  const rightsFrictionScore = getSnapshotNumber(input.snapshot, "user_rights_friction_score");
  const retargetingPixelDetected = getRecordBoolean(input.snapshot, "retargeting_pixel_detected");
  const sessionReplayWithoutDisclosureDetected =
    getRecordBoolean(input.snapshot, "session_replay_without_disclosure_detected") ||
    getRecordBoolean(input.snapshot, "session_replay_detected_without_disclosure");
  const domainPolicyCoverage = buildDomainPolicyCoverageSummary(input.policySemanticRows);

  for (const enrichment of input.policySemanticRows) {
    const enrichmentId = String(enrichment.id ?? "");
    const pageType = typeof enrichment.page_type === "string" ? enrichment.page_type : null;
    const pageUrl = typeof enrichment.page_url === "string" ? enrichment.page_url : null;
    const reasons = reviewReasonsByEnrichmentId.get(enrichmentId) ?? new Set<string>();
    const flags = Array.isArray(enrichment.policy_actionable_flags)
      ? enrichment.policy_actionable_flags.filter((value): value is string => typeof value === "string")
      : [];
    const mentions = getPolicyMentions(enrichment);
    const retentionPeriods = Array.isArray(enrichment.policy_retention_periods) ? enrichment.policy_retention_periods : [];
    const transferMechanisms = Array.isArray(enrichment.policy_transfer_mechanisms) ? enrichment.policy_transfer_mechanisms : [];
    const confidence =
      typeof enrichment.policy_semantic_confidence === "number" && Number.isFinite(enrichment.policy_semantic_confidence)
        ? enrichment.policy_semantic_confidence
        : null;
    const ambiguity =
      typeof enrichment.policy_ambiguity_score === "number" && Number.isFinite(enrichment.policy_ambiguity_score)
        ? enrichment.policy_ambiguity_score
        : null;
    const dsarMechanism = typeof enrichment.policy_dsar_mechanism === "string" ? enrichment.policy_dsar_mechanism : null;
    const policyCoverageRatio =
      typeof enrichment.policy_coverage_ratio === "number" && Number.isFinite(enrichment.policy_coverage_ratio)
        ? enrichment.policy_coverage_ratio
        : null;
    const policySnippetCount =
      typeof enrichment.policy_snippet_count === "number" && Number.isFinite(enrichment.policy_snippet_count)
        ? enrichment.policy_snippet_count
        : null;
    const policyStructurallyWeak = enrichment.policy_structurally_weak === true;
    const summaryShort = enrichment.policy_summary_short ?? null;
    const policyRightsSignals = getPolicyRightsSignals(enrichment);
    const hasRichSemantics = hasSubstantivePolicySemantics({
      dsarMechanism,
      enrichment,
      pageType,
      policyRightsSignals,
      retentionPeriods,
      summaryShort,
      transferMechanisms
    });
    const policyExtractionStatus = derivePolicyExtractionStatus({
      confidence,
      flags,
      pageType,
      snippetCount: policySnippetCount,
      structurallyWeak: policyStructurallyWeak
    });
    const typeLabel = pageTypeLabel(pageType);
    const isSupplementalSupportPage = isSupplementalSupportPolicyPage({
      pageType,
      pageUrl
    });
    const baseEvidence = {
      policy_extraction_status: policyExtractionStatus,
      page_type: pageType,
      policy_actionable_flags: flags,
      policy_ambiguity_score: ambiguity,
      policy_arbitration_present: enrichment.policy_arbitration_present ?? null,
      policy_cancellation_or_refund_present: enrichment.policy_cancellation_or_refund_present ?? null,
      policy_coverage_ratio: policyCoverageRatio,
      policy_effective_date: enrichment.policy_effective_date ?? null,
      policy_field_coverage: enrichment.policy_field_coverage ?? {},
      policy_governing_law: enrichment.policy_governing_law ?? null,
      policy_notice_contact_present: enrichment.policy_notice_contact_present ?? null,
      policy_rights_signals: policyRightsSignals,
      policy_semantic_confidence: confidence,
      policy_snippet_count: policySnippetCount,
      policy_structurally_weak: policyStructurallyWeak,
      policy_summary_short: summaryShort
    };

    if (
      pageType === "privacy_policy" &&
      dsarMechanism === "absent" &&
      policyExtractionStatus === "fetched" &&
      policyRightsSignals.length === 0 &&
      (confidence ?? 0) >= 0.6
    ) {
      findings.push(
        buildSectionIssueFinding({
          description: `${typeLabel} did not provide a clear DSAR or privacy-request path.`,
          evidence: {
            ...baseEvidence,
            policy_dsar_mechanism: dsarMechanism
          },
          pageType,
          pageUrl,
          ruleKey: "section_review.no_dsar_mechanism",
          severity: "high",
          title: "No DSAR mechanism"
        })
      );
    }

    if (
      pageType === "privacy_policy" &&
      dsarMechanism === "absent" &&
      highExposure &&
      policyExtractionStatus === "fetched" &&
      policyRightsSignals.length === 0 &&
      (confidence ?? 0) >= 0.6
    ) {
      findings.push(
        buildSectionIssueFinding({
          description: "The site appears exposed to GDPR or California privacy obligations, but the policy did not provide a clear access, deletion, or privacy-request path.",
          evidence: {
            ...baseEvidence,
            policy_dsar_mechanism: dsarMechanism,
            california_exposure_likely: getRecordBoolean(input.snapshot, "california_exposure_likely"),
            eu_exposure_likely: getRecordBoolean(input.snapshot, "eu_exposure_likely")
          },
          pageType,
          pageUrl,
          ruleKey: "section_review.missing_dsar_high_exposure",
          severity: "high",
          title: "No DSAR mechanism on an EU/California-exposed site"
        })
      );
    }

    if (reasons.has("session_replay_without_disclosure_detected") && hasConcreteSessionReplayEvidence(flags)) {
      findings.push(
        buildSectionIssueFinding({
          description: "Observed runtime artifacts matched session replay tooling, but the policy did not clearly disclose session recording or replay behavior.",
          evidence: {
            ...baseEvidence,
            runtime_evidence_artifacts: ["session_replay_vendor_artifact_present"]
          },
          pageType,
          pageUrl,
          ruleKey: "section_review.session_replay_detected_without_disclosure",
          severity: "high",
          title: "Possible session replay without clear disclosure"
        })
      );
    }

    if (pageType === "terms_of_service" && flags.includes("session_replay_undisclosed") && hasConcreteSessionReplayEvidence(flags)) {
      findings.push(
        buildSectionIssueFinding({
          description: "Observed runtime artifacts matched session replay tooling, but the policy text did not clearly disclose it.",
          evidence: {
            ...baseEvidence,
            runtime_evidence_artifacts: ["session_replay_vendor_artifact_present"]
          },
          pageType,
          pageUrl,
          ruleKey: "section_review.session_replay_may_be_undisclosed",
          severity: "medium",
          title: "Session replay may be undisclosed"
        })
      );
    }

    if (reasons.has("low_confidence_critical_fields")) {
      if (!hasRichSemantics) {
        findings.push(
          buildSectionIssueFinding({
            description: "Key policy fields could not be extracted with enough confidence, usually because the page content is sparse, ambiguous, or difficult to parse reliably.",
            evidence: baseEvidence,
            pageType,
            pageUrl,
            ruleKey: "section_review.low_confidence_critical_fields",
            severity: "medium",
            title: "Low confidence on critical policy fields"
          })
        );
      }

      const synthesisEvidence = {
        ...baseEvidence,
        policy_mentions: mentions,
        policy_review_reasons: [...reasons],
        source_page_type: pageType,
        source_policy_url: pageUrl,
        supporting_snippets: enrichment.policy_evidence_snippets ?? null,
        synthesis_source_reason: "low_confidence_critical_fields",
        synthesis_trigger_summary: [] as string[]
      };

      if (rightsFrictionScore >= 100) {
        synthesisEvidence.synthesis_trigger_summary.push("user_rights_friction_score=100");
        findings.push(
          buildPolicyRuntimeFinding({
            description:
              "The policy extraction was low confidence while runtime signals show users are effectively blocked from exercising privacy rights, suggesting a likely mismatch between disclosed user choice and the actual rights-fulfillment experience.",
            evidence: {
              ...synthesisEvidence,
              user_rights_friction_score: rightsFrictionScore
            },
            pageType,
            pageUrl,
            ruleKey: "policy_runtime.functional_misalignment",
            severity: "high",
            title: "High-confidence functional misalignment"
          })
        );
      }

      if (retargetingPixelDetected || sessionReplayWithoutDisclosureDetected) {
        const triggerSummary = [
          retargetingPixelDetected ? "retargeting_pixel_detected=true" : null,
          sessionReplayWithoutDisclosureDetected ? "session_replay_without_disclosure_detected=true" : null
        ].filter((value): value is string => value !== null);
        if (
          !isLikelyMisroutedMarketingPageExtraction({
            dsarMechanism,
            flags,
            mentions,
            pageType,
            retentionPeriods,
            summaryShort
          }) &&
          !hasStrongPrivacyGovernanceCuesForPartialExtraction({
            domainPolicyCoverage,
            enrichment,
            flags,
            pageType,
            policyExtractionStatus,
            summaryShort
          })
        ) {
          findings.push(
            buildPolicyRuntimeFinding({
              description:
                "Runtime behavior indicates tracking or replay functionality that was not clearly recoverable from the policy text, suggesting a likely missing technical disclosure rather than a purely low-confidence extraction issue.",
              evidence: {
                ...synthesisEvidence,
                retargeting_pixel_detected: retargetingPixelDetected,
                session_replay_without_disclosure_detected: sessionReplayWithoutDisclosureDetected,
                synthesis_trigger_summary: [...synthesisEvidence.synthesis_trigger_summary, ...triggerSummary]
              },
              pageType,
              pageUrl,
              ruleKey: "policy_runtime.missing_technical_disclosure",
              severity: "high",
              title: "Missing technical disclosure"
            })
          );
        }
      }

      if (
        !hasRichSemantics &&
        hasSparsePolicyExtraction({
          confidence,
          coverageRatio: policyCoverageRatio,
          flags,
          mentions,
          snippetCount: policySnippetCount,
          structurallyWeak: policyStructurallyWeak,
          summaryShort
        })
      ) {
        const triggerSummary = [
          confidence !== null && confidence < 0.6 ? `policy_semantic_confidence=${confidence}` : null,
          policyCoverageRatio !== null && policyCoverageRatio < 0.5 ? `policy_coverage_ratio=${policyCoverageRatio}` : null,
          policySnippetCount === 0 ? "policy_snippet_count=0" : null,
          policyStructurallyWeak ? "policy_structurally_weak=true" : null,
          flags.includes("llm_provider_error") ? "llm_provider_error" : null,
          flags.includes("low_confidence") ? "low_confidence" : null,
          mentions.length === 0 ? "policy_mentions_empty" : null,
          typeof summaryShort !== "string" || summaryShort.trim().length === 0 ? "policy_summary_missing" : null
        ].filter((value): value is string => value !== null);
        findings.push(
          buildPolicyRuntimeFinding({
            description:
              "The policy page appears structurally weak for automated disclosure capture, suggesting that important disclosures may be technically obstructed, incomplete, or embedded in a way that prevents reliable indexing.",
            evidence: {
              ...synthesisEvidence,
              synthesis_trigger_summary: [...synthesisEvidence.synthesis_trigger_summary, ...triggerSummary]
            },
            pageType,
            pageUrl,
            ruleKey: "policy_runtime.disclosure_likely_obstructed",
            severity: "medium",
            title: "Disclosure likely obstructed"
          })
        );
      }
    }

    if (pageType === "terms_of_service" && mentions.length === 0 && !hasRichSemantics && !isSupplementalSupportPage) {
      findings.push(
        buildSectionIssueFinding({
          description: "This policy row was derived from rule-based extraction only and did not include richer semantic topic coverage.",
          evidence: {
            ...baseEvidence,
            policy_mentions: mentions
          },
          pageType,
          pageUrl,
          ruleKey: "section_review.rule_only_row_present",
          severity: "medium",
          title: "Rule-only row present"
        })
      );
    }

    if (pageType === "terms_of_service" && flags.includes("llm_provider_error") && !hasRichSemantics) {
      findings.push(
        buildSectionIssueFinding({
          description: "The semantic extraction provider failed during policy analysis, so weaker fallback extraction was used.",
          evidence: baseEvidence,
          pageType,
          pageUrl,
          ruleKey: "section_review.policy_extraction_provider_error",
          severity: "medium",
          title: "Policy extraction provider error"
        })
      );
    }

    if (pageType === "terms_of_service" && flags.includes("low_confidence") && !hasRichSemantics) {
      findings.push(
        buildSectionIssueFinding({
          description: "The extracted policy signals were too uncertain to treat as fully reliable without follow-up review.",
          evidence: baseEvidence,
          pageType,
          pageUrl,
          ruleKey: "section_review.low_extraction_confidence",
          severity: "medium",
          title: "Low extraction confidence"
        })
      );
    }

    if (
      pageType === "privacy_policy" &&
      transferMechanisms.length === 0 &&
      !stringIncludesTransferCue(summaryShort) &&
      policyExtractionStatus === "fetched" &&
      (confidence ?? 0) >= 0.85 &&
      (policySnippetCount ?? 0) >= 2
    ) {
      findings.push(
        buildSectionIssueFinding({
          description: "The privacy policy did not disclose any transfer mechanism for cross-border or third-country data transfers.",
          evidence: {
            ...baseEvidence,
            policy_transfer_mechanisms: transferMechanisms
          },
          pageType,
          pageUrl,
          ruleKey: "section_review.no_transfer_mechanism_noted",
          severity: "medium",
          title: "No transfer mechanism noted"
        })
      );
    }

    if (
      ambiguity !== null &&
      (ambiguity >= 75 || (!hasRichSemantics && ambiguity >= 60)) &&
      !(pageType === "terms_of_service" && hasRichSemantics) &&
      !(pageType === "privacy_policy" && isSupplementalSupportPage) &&
      !(pageType === "terms_of_service" && isSupplementalSupportPage)
    ) {
      findings.push(
        buildSectionIssueFinding({
          description: `${typeLabel} was flagged as part of the section score review because of policy clarity risk ${ambiguity}.`,
          evidence: baseEvidence,
          pageType,
          pageUrl,
          ruleKey: `section_review.clarity_risk_${ambiguity}`,
          severity: ambiguity >= 60 ? "medium" : "low",
          title: `Clarity risk ${ambiguity}`
        })
      );
    }

    if (pageType !== null && confidence !== null && confidence < 0.6 && !hasRichSemantics) {
      findings.push(
        buildSectionIssueFinding({
          description: `${typeLabel} was flagged as part of the section score review because semantic extraction confidence was ${formatPercent(confidence)}.`,
          evidence: baseEvidence,
          pageType,
          pageUrl,
          ruleKey: `section_review.confidence_${Math.round(confidence * 100)}`,
          severity: confidence < 0.6 ? "medium" : "low",
          title: `Confidence ${formatPercent(confidence)}`
        })
      );
    }
  }

  return findings;
}

function getRepresentativeAccessibilityRuleExamples(input: {
  examples?: Array<Record<string, unknown>>;
  ruleCodes: string[];
  ruleGroups: string[];
}) {
  const ruleCodes = new Set(input.ruleCodes);
  const ruleGroups = new Set(input.ruleGroups);

  return (input.examples ?? [])
    .filter((row) => {
      const ruleCode = getAccessibilityStringValue(row, ["rule_code", "ruleCode", "axe_rule_id", "axeRuleId"]);
      const ruleGroup = getAccessibilityStringValue(row, ["rule_group", "ruleGroup"]);
      return (ruleCode !== null && ruleCodes.has(ruleCode)) || (ruleGroup !== null && ruleGroups.has(ruleGroup));
    })
    .map((row) => {
      const ruleCode = getAccessibilityStringValue(row, ["rule_code", "ruleCode", "axe_rule_id", "axeRuleId"]);
      const ruleGroup = getAccessibilityStringValue(row, ["rule_group", "ruleGroup"]);
      const pageUrl = getAccessibilityStringValue(row, ["page_url", "pageUrl"]);
      const selectors = getAccessibilityStringArrayValue(row, ["representative_selectors", "representativeSelectors"]);
      const nodeCount = getAccessibilityNumberValue(row, ["node_count", "nodeCount", "affected_node_count", "affectedNodeCount"]);
      const impact = getAccessibilityStringValue(row, ["impact", "axe_impact", "axeImpact"]);
      const severity = getAccessibilityStringValue(row, ["severity"]);
      const help = getAccessibilityStringValue(row, ["help", "label"]);
      const helpUrl = getAccessibilityStringValue(row, ["help_url", "helpUrl"]);
      const description = getAccessibilityStringValue(row, ["description", "evidence_summary", "evidenceSummary"]);

      return {
        description,
        help,
        helpUrl,
        impact,
        nodeCount,
        pageUrl,
        representativeSelectors: selectors,
        ruleCode,
        ruleGroup,
        severity
      };
    })
    .filter(
      (row): row is {
        description: string | null;
        help: string;
        helpUrl: string | null;
        impact: string;
        nodeCount: number;
        pageUrl: string;
        representativeSelectors: string[];
        ruleCode: string;
        ruleGroup: string;
        severity: string;
      } =>
        Boolean(row.pageUrl) &&
        Boolean(row.ruleCode) &&
        Boolean(row.ruleGroup) &&
        row.representativeSelectors.length > 0 &&
        typeof row.nodeCount === "number" &&
        row.nodeCount > 0 &&
        Boolean(row.impact) &&
        Boolean(row.severity) &&
        Boolean(row.help)
    )
    .slice(0, 3);
}

function deriveAccessibilitySectionFindings(input: {
  accessibilityRuleExamples?: Array<Record<string, unknown>>;
  snapshot: Record<string, unknown> | null;
}) {
  const snapshot = input.snapshot;
  if (!snapshot) {
    return [];
  }

  const rows = [
    {
      count: getSnapshotNumber(snapshot, "wcag_contrast_failures_count"),
      description: "Contrast failures can make text and controls hard to perceive for low-vision users.",
      examples: getRepresentativeAccessibilityRuleExamples({
        examples: input.accessibilityRuleExamples,
        ruleCodes: ["color-contrast"],
        ruleGroups: ["contrast"]
      }),
      ruleKey: "accessibility_review.contrast_failures",
      title: "Contrast failures"
    },
    {
      count: getSnapshotNumber(snapshot, "wcag_missing_alt_count"),
      description: "Missing alt text reduces screen-reader access to informative images.",
      examples: [] as ReturnType<typeof getRepresentativeAccessibilityRuleExamples>,
      ruleKey: "accessibility_review.missing_alt_text",
      title: "Missing alt text"
    },
    {
      count: getSnapshotNumber(snapshot, "wcag_keyboard_navigation_issue_count") + getSnapshotNumber(snapshot, "wcag_focus_indicator_issue_count"),
      description: "Keyboard and focus issues make navigation harder without a mouse.",
      examples: [] as ReturnType<typeof getRepresentativeAccessibilityRuleExamples>,
      ruleKey: "accessibility_review.navigation_issues",
      title: "Navigation issues"
    },
    {
      count: getSnapshotNumber(snapshot, "wcag_aria_error_count"),
      description: "ARIA issues can break semantics or assistive-technology interpretation.",
      examples: [] as ReturnType<typeof getRepresentativeAccessibilityRuleExamples>,
      ruleKey: "accessibility_review.aria_problems",
      title: "ARIA problems"
    },
    {
      count: getSnapshotNumber(snapshot, "wcag_form_label_error_count"),
      description: "Form label issues make inputs less understandable and harder to complete.",
      examples: [] as ReturnType<typeof getRepresentativeAccessibilityRuleExamples>,
      ruleKey: "accessibility_review.form_label_issues",
      title: "Form label issues"
    }
  ].filter((row) => row.count > 0);

  return rows.map((row) =>
    buildSectionIssueFinding({
      description: row.description,
      evidence: {
        accessibilityRuleExamples: row.examples,
        count: row.count,
        representativeAxeExampleCount: row.examples.length
      },
      pageType: null,
      pageUrl: null,
      ruleKey: row.ruleKey,
      severity: row.count >= 20 ? "high" : row.count >= 5 ? "medium" : "low",
      title: row.title
    })
  );
}

export function deriveValidationFindings(input: ValidationArtifactBundle) {
  const rawPolicyEnrichmentRows = input.rawPolicyEnrichmentRows ?? input.policyEnrichments ?? [];
  const policySemanticRows = input.policySemanticRows ?? input.policySemanticInputs ?? input.policyEnrichments ?? [];
  const policyEnrichmentsById = new Map(
    rawPolicyEnrichmentRows.map((row) => [String(row.id ?? ""), row])
  );
  const findings: ValidationFindingRow[] = [];

  const findSemanticRowForReview = (reviewItem: Record<string, unknown>) => {
    const enrichment = policyEnrichmentsById.get(String(reviewItem.policy_enrichment_id ?? "")) ?? null;
    const enrichmentPageUrl = typeof enrichment?.page_url === "string" ? enrichment.page_url : null;
    const enrichmentPageType = typeof enrichment?.page_type === "string" ? enrichment.page_type : null;

    if (!input.preferDocumentSources || (!enrichmentPageUrl && !enrichmentPageType)) {
      return enrichment;
    }

    return (
      policySemanticRows.find((row) => {
        const rowUrl = typeof row.page_url === "string" ? row.page_url : null;
        const rowType = typeof row.page_type === "string" ? row.page_type : null;
        return rowUrl === enrichmentPageUrl || (rowType !== null && rowType === enrichmentPageType);
      }) ?? enrichment
    );
  };

  for (const reviewItem of input.policyReviewQueue) {
    const reason = String(reviewItem.reason ?? "");
    if (!reason) {
      continue;
    }

    const enrichment = findSemanticRowForReview(reviewItem);
    const definition = reviewIssueDefinition(reason);
    const pageUrl = typeof enrichment?.page_url === "string" ? enrichment.page_url : null;
    const shouldSuppressReviewFinding =
      reason === "low_confidence_critical_fields" &&
      enrichment !== null &&
      hasSubstantivePolicySemantics({
        dsarMechanism:
          typeof enrichment.policy_dsar_mechanism === "string" ? enrichment.policy_dsar_mechanism : null,
        enrichment,
        pageType: typeof enrichment.page_type === "string" ? enrichment.page_type : null,
        policyRightsSignals: Array.isArray(enrichment.policy_rights_signals)
          ? enrichment.policy_rights_signals.filter((value): value is string => typeof value === "string")
          : [],
        retentionPeriods: Array.isArray(enrichment.policy_retention_periods) ? enrichment.policy_retention_periods : [],
        summaryShort: enrichment.policy_summary_short,
        transferMechanisms: Array.isArray(enrichment.policy_transfer_mechanisms)
          ? enrichment.policy_transfer_mechanisms
          : []
      });
    const taxonomy = deriveValidationFindingTaxonomy({
      category: "scan_report_review",
      ruleKey: `scan_report_review.${reason}`,
      subtype: "policy_review_queue"
    });

    if (!shouldSuppressReviewFinding) {
      findings.push({
        category: "scan_report_review",
        description: definition.description,
        evidence: {
          policy_actionable_flags: enrichment?.policy_actionable_flags ?? [],
          policy_ambiguity_score: enrichment?.policy_ambiguity_score ?? null,
          policy_page_type: enrichment?.page_type ?? null,
          policy_review_reason: reason,
          policy_semantic_confidence: enrichment?.policy_semantic_confidence ?? null,
          policy_summary_short: enrichment?.policy_summary_short ?? null,
          review_status: reviewItem.review_status ?? null,
          review_verdict: reviewItem.review_verdict ?? null,
          reviewed_at: reviewItem.reviewed_at ?? null,
          reviewer_notes: reviewItem.reviewer_notes ?? null
        },
        findingFamily: taxonomy.familyId,
        findingScope: taxonomy.scope,
        findingSource: taxonomy.source,
        findingSubject: taxonomy.subject,
        pageUrl,
        rank: 0,
        ruleKey: `scan_report_review.${reason}`,
        severity: definition.severity,
        subtype: "policy_review_queue",
        title: definition.title
      });
    }
  }

  findings.push(
    ...deriveAccessFindings({
      documentSources: input.documentSources,
      pages: input.pages,
      runtimeArtifacts: input.runtimeArtifacts,
      snapshot: input.snapshot
    }),
    ...deriveLegalCoverageFindings({
      documentSources: input.documentSources,
      snapshot: input.snapshot
    }),
    ...deriveConsentInterfaceFindings({
      runtimeArtifacts: input.runtimeArtifacts,
      snapshot: input.snapshot
    }),
    ...deriveFinancialValidationFindings(input),
    ...deriveFinancialCommercialClaimFindings(input),
    ...deriveFinancialContextTextClaimFindings(input),
    ...deriveRuntimePrivacyFindings({
      policySemanticRows,
      preconsentViolations: input.preconsentViolations,
      runtimeArtifacts: input.runtimeArtifacts,
      snapshot: input.snapshot,
      trackerVendors: input.trackerVendors
    }),
    ...deriveCookieRuntimeFindings({
      policySemanticRows,
      runtimeArtifacts: input.runtimeArtifacts
    }),
    ...derivePolicySectionFindings({
      documentSources: input.documentSources ?? [],
      policySemanticRows,
      policyReviewQueue: input.policyReviewQueue,
      snapshot: input.snapshot
    }),
    ...deriveAccessibilitySectionFindings({
      accessibilityRuleExamples: input.accessibilityRuleExamples ?? [],
      snapshot: input.snapshot
    })
  );

  const promotedFinancialSectionFindings = promoteSectionFinancialReviewFindings(findings);
  const deduped = [...new Map(promotedFinancialSectionFindings.map((finding) => [buildFindingComparisonKey({
    category: finding.category,
    page_url: finding.pageUrl,
    rule_key: finding.ruleKey
  }), finding])).values()];
  const collapsed = collapseSingletonRuleFindings(deduped);
  const hasRuntimePrivacySignal = collapsed.some((finding) => isRuntimePrivacyFinding(finding.ruleKey));

  const withoutLowSignalNoise = hasRuntimePrivacySignal
    ? collapsed.filter((finding) => !isLowSignalPolicyNoiseFinding(finding.ruleKey))
    : collapsed;
  const hasSubstantiveFinding = withoutLowSignalNoise.some((finding) => !isMetaSectionFinding(finding.ruleKey));
  const filtered = hasRuntimePrivacySignal && hasSubstantiveFinding
    ? withoutLowSignalNoise.filter((finding) => !isMetaSectionFinding(finding.ruleKey))
    : withoutLowSignalNoise;
  const sortBucket = buildFindingSortBucket(filtered.map((finding) => finding.ruleKey));

  const macroNormalizedOutput =
    input.macroEnrichment?.normalized_output_json && typeof input.macroEnrichment.normalized_output_json === "object"
      ? (input.macroEnrichment.normalized_output_json as Record<string, unknown>)
      : null;
  const monetizationSignals =
    macroNormalizedOutput?.monetization_signals && typeof macroNormalizedOutput.monetization_signals === "object"
      ? (macroNormalizedOutput.monetization_signals as Record<string, unknown>)
      : null;
  const domainIndustryPrimary =
    typeof macroNormalizedOutput?.industry_primary === "string" ? macroNormalizedOutput.industry_primary : null;
  const investorOrSecuritiesPromotion =
    typeof monetizationSignals?.investor_or_securities_promotion === "boolean"
      ? monetizationSignals.investor_or_securities_promotion
      : null;

  const withDomainContext = domainIndustryPrimary
    ? filtered.map((finding) =>
        finding.ruleKey.startsWith("financial_review.")
          ? { ...finding, evidence: { ...finding.evidence, domainIndustryPrimary } }
          : finding
      )
    : filtered;

  const withDomainSuppression = withDomainContext.filter(
    (finding) =>
      !finding.ruleKey.startsWith("financial_review.") ||
      !shouldSuppressFinancialFindingForDomainContext(finding, {
        domainIndustryPrimary,
        investorOrSecuritiesPromotion
      })
  );

  return withDomainSuppression
    .sort(
      (left, right) =>
        sortBucket(left.ruleKey) - sortBucket(right.ruleKey) ||
        severityWeight(right.severity) - severityWeight(left.severity) ||
        left.ruleKey.localeCompare(right.ruleKey)
    )
    .map((finding, index) => ({
      ...finding,
      rank: index + 1
    }));
}

export async function enqueueValidationCollect(runId: string) {
  void runId;
}

export function normalizeDocUrl(url: string | null) {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    parsed.hash = "";

    const paramsToDrop = ["next", "redirect", "return_to", "returnTo"];
    for (const key of paramsToDrop) {
      parsed.searchParams.delete(key);
    }

    const search = parsed.searchParams.toString();
    parsed.search = search.length > 0 ? `?${search}` : "";

    return parsed.toString();
  } catch {
    return url;
  }
}

export function looksLikeIntermediaryOrBlockPage(input: { canonicalUrl: string; title: string | null; text: string | null }) {
  const title = input.title?.toLowerCase() ?? "";
  const text = input.text?.toLowerCase() ?? "";
  const url = input.canonicalUrl.toLowerCase();

  const legalDocSignals = [
    "privacy policy",
    "cookie policy",
    "terms of service",
    "terms and conditions",
    "data processing",
    "privacy notice"
  ];
  const hasLegalDocSignal = legalDocSignals.some((marker) => title.includes(marker) || text.includes(marker));
  const blockedTitleMarkers = ["login", "routing to checkout", "hang tight"];
  const blockedTextMarkers = [
    "routing to checkout",
    "checking your browser",
    "verify you are human",
    "access denied"
  ];

  if (blockedTitleMarkers.some((marker) => title.includes(marker))) {
    return true;
  }

  if (blockedTextMarkers.some((marker) => text.includes(marker))) {
    return true;
  }

  if (!hasLegalDocSignal) {
    const gatedTitleMarkers = ["sign in", "log in to continue", "continue to"];
    const gatedTextMarkers = ["log in to continue", "sign in to continue", "continue to access", "continue to proceed"];

    if (gatedTitleMarkers.some((marker) => title.includes(marker))) {
      return true;
    }

    if (gatedTextMarkers.some((marker) => text.includes(marker))) {
      return true;
    }
  }

  return url.includes("/login");
}

export function looksLikeSoft404PolicyDocument(input: { canonicalUrl: string; title: string | null; text: string | null }) {
  const combined = `${input.canonicalUrl} ${input.title ?? ""} ${input.text ?? ""}`;
  return (
    /\b(?:404|410|page not found|not found|this page is out of tune)\b/i.test(combined) ||
    /(?:oops|sorry)[!.]?\s+this isn(?:'|’)t like us/i.test(combined) ||
    /page you(?:'|’)re looking for can(?:'|’)t be found/i.test(combined) ||
    /we can(?:'|’)t find the page you(?:'|’)re looking for/i.test(combined) ||
    /\/404(?:\/|$|\?)/i.test(input.canonicalUrl)
  );
}

export function shouldRenderNanoDocumentFallback(input: {
  canonicalUrl: string;
  documentType: string;
  html: string | null;
  text: string | null;
  title: string | null;
}) {
  if (!["privacy_policy", "cookie_policy", "terms_of_service"].includes(input.documentType)) {
    return false;
  }

  const html = input.html?.toLowerCase() ?? "";
  const text = input.text?.toLowerCase() ?? "";
  const title = input.title?.toLowerCase() ?? "";
  const url = input.canonicalUrl.toLowerCase();
  const rawTextLength = input.text?.trim().length ?? 0;
  const hasDocumentTypeUrlContext =
    (input.documentType === "privacy_policy" && /privacy|privacy-policy|privacy-notice/.test(url)) ||
    (input.documentType === "cookie_policy" && /cookie|cookies|cookie-notice|cookies-and-tracking/.test(url)) ||
    (input.documentType === "terms_of_service" && /terms|terms-of-service|terms-of-use|legal/.test(url));
  const hasLegalContext =
    hasDocumentTypeUrlContext ||
    /privacy policy|privacy notice|privacy center|cookie policy|cookie notice|terms of service|terms and conditions|legal/.test(
      `${title}\n${text}\n${url}`
    );
  const looksLikeTranscendPrivacyCenter =
    /privacy-center-api\.transcend\.io|transcend-cdn\.com|transcend\.io/.test(html) ||
    (/privacy\.[^/]+\/policies/.test(url) && /privacy center/.test(`${title}\n${text}`));
  const looksLikeJavascriptShell =
    /enable javascript|enable js|noscript|id=["'](?:root|app)["']|<script[^>]+(?:main|bundle|app)[^>]*\.js/i.test(input.html ?? "") ||
    /if you're seeing this message/.test(text);

  return hasLegalContext && rawTextLength < 1_200 && (looksLikeTranscendPrivacyCenter || looksLikeJavascriptShell);
}

async function renderNanoDocumentFallback(input: {
  canonicalUrl: string;
  documentType: string;
  referer?: string | null;
  sourceUrl: string;
}) {
  const artifactOptions = getRuntimeScanArtifactOptions({
    scanId: `${input.documentType}-${input.canonicalUrl}`,
    stage: "nano-document-fallback"
  });
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true, ...artifactOptions.launchOptions });
    try {
      const context = await browser.newContext({
        ...artifactOptions.contextOptions,
        extraHTTPHeaders: input.referer ? { referer: input.referer } : undefined
      });
      try {
        const page = await context.newPage();
        const { setupRequestBlocking } = await import("../browser/request-blocking");
        const requestBlocking = await setupRequestBlocking(page, { mode: "full" });
        try {
          await page.goto(input.canonicalUrl, { timeout: 20_000, waitUntil: "domcontentloaded" });
          await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
          await page.waitForTimeout(1_500);
          const [renderedTitle, renderedUrl, renderedText] = await Promise.all([
            page.title().catch(() => null),
            Promise.resolve(page.url()),
            page.locator("body").innerText({ timeout: 5_000 }).catch(() => "")
          ]);

          const text = renderedText.replace(/\s+/g, " ").trim();
          const hasLegalSignal =
            /privacy policy|privacy notice|cookie policy|cookie notice|terms of service|terms and conditions|personal information|personal data|privacy rights/i.test(
              text
            );
          if (text.length < 200 || !hasLegalSignal) {
            return null;
          }

          const canonicalUrl = normalizeDocUrl(renderedUrl) ?? input.canonicalUrl;
          return {
            canonicalUrl,
            documentText: text.slice(0, 50_000),
            metadata: {
              rendered_final_url: canonicalUrl,
              request_blocking: requestBlocking.getStats(),
              rendered_text_length: text.length,
              renderer: "playwright_chromium",
              retrieval_fallback_reason: "javascript_policy_center_shell"
            } satisfies Record<string, unknown>,
            title: renderedTitle
          };
        } finally {
          await requestBlocking.stop().catch(() => undefined);
        }
      } finally {
        await context.close().catch(() => undefined);
      }
    } finally {
      await browser.close().catch(() => undefined);
      await cleanupRuntimeScanArtifacts(artifactOptions).catch(() => undefined);
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "render_fallback_failed"
    };
  }
}

async function fetchNanoDocumentSource(input: {
  documentType: string;
  priorityTier?: "priority" | "secondary";
  referer?: string | null;
  url: string;
}) {
  const baseMetadata = {
    priority_tier: input.priorityTier ?? "secondary",
    request_profile: "browser_document_navigation",
    retrieval_mode: "nano_doc_retrieval"
  } satisfies Record<string, unknown>;

  try {
    const request = buildValidationWorkerDocumentHeaders({
      referer: input.referer,
      url: input.url
    });
    const response = await fetch(input.url, {
      headers: request.headers,
      redirect: "follow",
      signal: AbortSignal.timeout(10_000)
    });
    const fetchedUrl = response.url || input.url;
    const responseFingerprint = {
      content_length_header: response.headers.get("content-length"),
      etag: response.headers.get("etag"),
      final_url: fetchedUrl,
      last_modified: response.headers.get("last-modified")
    };
    const canonicalUrl = normalizeDocUrl(fetchedUrl) ?? fetchedUrl;
    const html = await response.text().catch(() => "");
    const title = extractTitle(html);
    const text = isolateLikelyLegalDocumentText({ html, title });
    const renderedFallback = shouldRenderNanoDocumentFallback({
      canonicalUrl,
      documentType: input.documentType,
      html,
      text,
      title
    })
      ? await renderNanoDocumentFallback({
          canonicalUrl,
          documentType: input.documentType,
          referer: request.metadata.referer,
          sourceUrl: input.url
        })
      : null;

    if (renderedFallback && "documentText" in renderedFallback && typeof renderedFallback.documentText === "string") {
      const renderedDocumentText = renderedFallback.documentText;
      if (
        looksLikeSoft404PolicyDocument({
          canonicalUrl: renderedFallback.canonicalUrl,
          text: renderedDocumentText,
          title: renderedFallback.title ?? title
        })
      ) {
        return {
          outcome: "intermediary" as const,
          row: {
            canonical_url: renderedFallback.canonicalUrl,
            document_text: null,
            document_type: input.documentType,
            extraction_status: "failed",
            evidence_refs: [renderedFallback.canonicalUrl],
            extracted_fields_json: {
              page_type: input.documentType,
              page_url: renderedFallback.canonicalUrl
            },
            metadata_json: {
              ...baseMetadata,
              ...renderedFallback.metadata,
              fetch_fingerprint: responseFingerprint,
              http_status: response.status,
              request_referer: request.metadata.referer,
              rejection_reason: "soft_404_policy_document"
            },
            source: "nano_doc_retrieval",
            source_status: "rejected",
            source_url: input.url,
            title: renderedFallback.title ?? title
          } satisfies Record<string, unknown>
        };
      }

      return {
        outcome: "ready" as const,
        row: {
          canonical_url: renderedFallback.canonicalUrl,
          document_text: renderedDocumentText,
          document_type: input.documentType,
          extraction_status: "pending",
          evidence_refs: [renderedFallback.canonicalUrl],
          extracted_fields_json: {
            page_type: input.documentType,
            page_url: renderedFallback.canonicalUrl
          },
          metadata_json: {
            ...baseMetadata,
            ...renderedFallback.metadata,
            content_hash: buildNanoDocumentContentHash(renderedDocumentText),
            fetch_fingerprint: responseFingerprint,
            http_status: response.status,
            request_referer: request.metadata.referer
          },
          source: "nano_doc_retrieval",
          source_status: "ready",
          source_url: input.url,
          title: renderedFallback.title ?? title
        } satisfies Record<string, unknown>
      };
    }

    if (!response.ok) {
      return {
        outcome: "non_ok" as const,
        row: {
          canonical_url: canonicalUrl,
          document_text: null,
          document_type: input.documentType,
          extraction_status: "failed",
          evidence_refs: canonicalUrl ? [canonicalUrl] : [],
          extracted_fields_json: {
            page_type: input.documentType,
            page_url: canonicalUrl
          },
          metadata_json: {
            ...baseMetadata,
            ...(renderedFallback && "error" in renderedFallback ? { render_fallback_error: renderedFallback.error } : {}),
            fetch_fingerprint: responseFingerprint,
            http_status: response.status,
            request_referer: request.metadata.referer,
            rejection_reason: "non_ok_http_status"
          },
          source: "nano_doc_retrieval",
          source_status: "rejected",
          source_url: input.url,
          title: null
        } satisfies Record<string, unknown>
      };
    }

    if (looksLikeIntermediaryOrBlockPage({ canonicalUrl, text, title })) {
      return {
        outcome: "intermediary" as const,
        row: {
          canonical_url: canonicalUrl,
          document_text: null,
          document_type: input.documentType,
          extraction_status: "failed",
          evidence_refs: canonicalUrl ? [canonicalUrl] : [],
          extracted_fields_json: {
            page_type: input.documentType,
            page_url: canonicalUrl
          },
          metadata_json: {
            ...baseMetadata,
            ...(renderedFallback && "error" in renderedFallback ? { render_fallback_error: renderedFallback.error } : {}),
            fetch_fingerprint: responseFingerprint,
            http_status: response.status,
            request_referer: request.metadata.referer,
            rejection_reason: "intermediary_or_block_page"
          },
          source: "nano_doc_retrieval",
          source_status: "rejected",
          source_url: input.url,
          title
        } satisfies Record<string, unknown>
      };
    }

    if (looksLikeSoft404PolicyDocument({ canonicalUrl, text, title })) {
      return {
        outcome: "intermediary" as const,
        row: {
          canonical_url: canonicalUrl,
          document_text: null,
          document_type: input.documentType,
          extraction_status: "failed",
          evidence_refs: canonicalUrl ? [canonicalUrl] : [],
          extracted_fields_json: {
            page_type: input.documentType,
            page_url: canonicalUrl
          },
          metadata_json: {
            ...baseMetadata,
            ...(renderedFallback && "error" in renderedFallback ? { render_fallback_error: renderedFallback.error } : {}),
            fetch_fingerprint: responseFingerprint,
            http_status: response.status,
            request_referer: request.metadata.referer,
            rejection_reason: "soft_404_policy_document"
          },
          source: "nano_doc_retrieval",
          source_status: "rejected",
          source_url: input.url,
          title
        } satisfies Record<string, unknown>
      };
    }

    if (text.length <= 20) {
      return {
        outcome: "insufficient" as const,
        row: {
          canonical_url: canonicalUrl,
          document_text: null,
          document_type: input.documentType,
          extraction_status: "insufficient",
          evidence_refs: canonicalUrl ? [canonicalUrl] : [],
          extracted_fields_json: {
            page_type: input.documentType,
            page_url: canonicalUrl
          },
          metadata_json: {
            ...baseMetadata,
            ...(renderedFallback && "error" in renderedFallback ? { render_fallback_error: renderedFallback.error } : {}),
            fetch_fingerprint: responseFingerprint,
            http_status: response.status,
            request_referer: request.metadata.referer,
            rejection_reason: "insufficient_document_text"
          },
          source: "nano_doc_retrieval",
          source_status: "rejected",
          source_url: input.url,
          title
        } satisfies Record<string, unknown>
      };
    }

    return {
      outcome: "ready" as const,
      row: {
        canonical_url: canonicalUrl,
        document_text: text.slice(0, 50_000),
        document_type: input.documentType,
        extraction_status: "pending",
        evidence_refs: [canonicalUrl],
        extracted_fields_json: {
          page_type: input.documentType,
          page_url: canonicalUrl
        },
        metadata_json: {
          ...baseMetadata,
          content_hash: buildNanoDocumentContentHash(text),
          fetch_fingerprint: responseFingerprint,
          http_status: response.status,
          request_referer: request.metadata.referer
        },
        source: "nano_doc_retrieval",
        source_status: "ready",
        source_url: input.url,
        title
      } satisfies Record<string, unknown>
    };
  } catch {
    return {
      outcome: "error" as const,
      row: {
        canonical_url: normalizeDocUrl(input.url) ?? input.url,
        document_text: null,
        document_type: input.documentType,
        extraction_status: "failed",
        evidence_refs: [normalizeDocUrl(input.url) ?? input.url],
        extracted_fields_json: {
          page_type: input.documentType,
          page_url: normalizeDocUrl(input.url) ?? input.url
        },
        metadata_json: {
          ...baseMetadata,
          request_referer: input.referer ?? null,
          rejection_reason: "fetch_runtime_error"
        },
        source: "nano_doc_retrieval",
        source_status: "failed",
        source_url: input.url,
        title: null
      } satisfies Record<string, unknown>
    };
  }
}

function getNanoDocumentFetchReferer(input: {
  domainHostname: string | null;
  runtimeArtifacts: Record<string, unknown> | null | undefined;
  url: string;
}) {
  let targetUrl: URL;
  try {
    targetUrl = new URL(input.url);
  } catch {
    return null;
  }

  const hybridRuntimeEvidence = getRecord(
    input.runtimeArtifacts?.hybrid_runtime_evidence ?? input.runtimeArtifacts?.hybridRuntimeEvidence
  );
  const navigationSummary = getRecord(
    hybridRuntimeEvidence?.navigationSummary ?? hybridRuntimeEvidence?.navigation_summary
  );
  const candidateReferers = [
    getString(navigationSummary?.finalUrl ?? navigationSummary?.final_url),
    getString(navigationSummary?.initialUrl ?? navigationSummary?.initial_url),
    input.domainHostname ? `https://${input.domainHostname}/` : null
  ];

  for (const candidateReferer of candidateReferers) {
    if (!candidateReferer) {
      continue;
    }

    try {
      const refererUrl = new URL(candidateReferer);
      if (refererUrl.origin === targetUrl.origin) {
        return refererUrl.toString();
      }
    } catch {
      continue;
    }
  }

  return null;
}

function getDocumentSourceMetadata(row: Record<string, unknown>) {
  return typeof row.metadata_json === "object" && row.metadata_json !== null && !Array.isArray(row.metadata_json)
    ? (row.metadata_json as Record<string, unknown>)
    : {};
}

function getDocumentSourceContentHash(row: Record<string, unknown>) {
  const metadata = getDocumentSourceMetadata(row);
  return typeof metadata.content_hash === "string" && metadata.content_hash.trim().length > 0 ? metadata.content_hash.trim() : null;
}

export function resolveReusableNanoDocumentExtractions(input: {
  candidates: Array<Record<string, unknown>>;
  priorExtractions: Array<Record<string, unknown>>;
}) {
  const reusableByCandidateId = new Map<string, Record<string, unknown>>();
  const priorByCanonicalAndHash = new Map<string, Record<string, unknown>>();

  for (const row of input.priorExtractions) {
    const canonicalUrl = getString(row.canonical_url) ?? getString(row.canonicalUrl);
    const contentHash = getDocumentSourceContentHash(row);
    if (!canonicalUrl || !contentHash) {
      continue;
    }

    const canonicalKey = `${canonicalUrl}::${contentHash}`;
    if (!priorByCanonicalAndHash.has(canonicalKey)) {
      priorByCanonicalAndHash.set(canonicalKey, row);
    }
  }

  for (const candidate of input.candidates) {
    const candidateId = getString(candidate.id);
    const canonicalUrl = getString(candidate.canonical_url) ?? getString(candidate.canonicalUrl);
    const contentHash = getDocumentSourceContentHash(candidate);
    if (!candidateId || !canonicalUrl || !contentHash) {
      continue;
    }

    const match = priorByCanonicalAndHash.get(`${canonicalUrl}::${contentHash}`);
    if (match) {
      reusableByCandidateId.set(candidateId, match);
    }
  }

  return reusableByCandidateId;
}

function getNanoDocumentSourceDedupKey(row: Record<string, unknown>) {
  const canonicalUrl = getString(row.canonical_url) ?? getString(row.canonicalUrl);
  const documentType = getString(row.document_type) ?? getString(row.documentType) ?? "unknown";
  return `${documentType}::${canonicalUrl ?? getString(row.source_url) ?? ""}`;
}

export function getNanoDocumentSourceDedupKeys(row: Record<string, unknown>) {
  const documentType = getString(row.document_type) ?? getString(row.documentType) ?? "unknown";
  const canonicalUrl = getString(row.canonical_url) ?? getString(row.canonicalUrl);
  const sourceUrl = getString(row.source_url) ?? getString(row.sourceUrl);
  const keys = new Set<string>();

  if (canonicalUrl) {
    keys.add(`${documentType}::${canonicalUrl}`);
  }
  if (sourceUrl) {
    keys.add(`${documentType}::${normalizeDocUrl(sourceUrl) ?? sourceUrl}`);
  }

  if (keys.size === 0) {
    keys.add(`${documentType}::`);
  }

  return [...keys];
}

function getNanoDocumentCandidateDedupKey(candidate: { documentType: string; url: string }) {
  return `${candidate.documentType}::${normalizeDocUrl(candidate.url) ?? candidate.url}`;
}

export function shouldRetryRejectedNanoDocumentSource(row: Record<string, unknown>) {
  const sourceStatus = getString(row.source_status) ?? getString(row.sourceStatus);
  const extractionStatus = getString(row.extraction_status) ?? getString(row.extractionStatus);
  const documentType = getString(row.document_type) ?? getString(row.documentType);
  const metadata = getDocumentSourceMetadata(row);
  const rejectionReason = getString(metadata.rejection_reason);
  const fallbackReason = getString(metadata.retrieval_fallback_reason);

  return Boolean(
    sourceStatus === "rejected" &&
      extractionStatus === "insufficient" &&
      ["privacy_policy", "cookie_policy", "terms_of_service"].includes(documentType ?? "") &&
      rejectionReason === "insufficient_document_text" &&
      !fallbackReason
  );
}

function hasReadyNanoDocumentOfType(rows: Array<Record<string, unknown>>, documentType: string) {
  return rows.some((row) => {
    const sourceStatus = getString(row.source_status) ?? getString(row.sourceStatus) ?? "ready";
    const rowDocumentType = getString(row.document_type) ?? getString(row.documentType);
    return sourceStatus === "ready" && rowDocumentType === documentType;
  });
}

function getNanoDocumentSourceStatusRank(row: Record<string, unknown>) {
  const sourceStatus = getString(row.source_status) ?? getString(row.sourceStatus) ?? "ready";
  const extractionStatus = getString(row.extraction_status) ?? getString(row.extractionStatus) ?? "pending";

  if (sourceStatus === "ready" && extractionStatus === "pending") {
    return 4;
  }
  if (sourceStatus === "ready") {
    return 3;
  }
  if (sourceStatus === "rejected" && extractionStatus === "insufficient") {
    return 2;
  }
  if (sourceStatus === "rejected") {
    return 1;
  }
  return 0;
}

export function dedupeNanoDocumentSources(rows: Array<Record<string, unknown>>) {
  const byKey = new Map<string, Record<string, unknown>>();

  for (const row of rows) {
    const canonicalUrl = getString(row.canonical_url) ?? getString(row.canonicalUrl);
    const key = getNanoDocumentSourceDedupKey(row) || crypto.randomUUID();
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      continue;
    }

    const existingRank = getNanoDocumentSourceStatusRank(existing);
    const nextRank = getNanoDocumentSourceStatusRank(row);
    if (nextRank > existingRank) {
      byKey.set(key, row);
      continue;
    }
    if (nextRank < existingRank) {
      continue;
    }

    const existingSourceUrl = getString(existing.source_url) ?? "";
    const nextSourceUrl = getString(row.source_url) ?? "";
    const existingLooksCanonical = existingSourceUrl === canonicalUrl;
    const nextLooksCanonical = nextSourceUrl === canonicalUrl;

    if (!existingLooksCanonical && nextLooksCanonical) {
      byKey.set(key, row);
      continue;
    }

    if (existingLooksCanonical === nextLooksCanonical && nextSourceUrl.length < existingSourceUrl.length) {
      byKey.set(key, row);
    }
  }

  return [...byKey.values()];
}

function splitNanoDocCandidatesByPriority(
  candidates: Array<{ documentType: string; priorityTier: "priority" | "secondary"; url: string }>
) {
  const priority = candidates.filter((candidate) => candidate.priorityTier === "priority");
  const secondary = candidates.filter((candidate) => candidate.priorityTier === "secondary");

  return {
    priority: priority.length > 0 ? priority : candidates,
    secondary: priority.length > 0 ? secondary : []
  };
}

function getNanoDocumentPriorityScore(row: Record<string, unknown>) {
  const metadata =
    typeof row.metadata_json === "object" && row.metadata_json !== null && !Array.isArray(row.metadata_json)
      ? (row.metadata_json as Record<string, unknown>)
      : null;
  const priorityTier = getString(metadata?.priority_tier) ?? "secondary";
  const documentType = getString(row.document_type) ?? getString(row.documentType) ?? "unknown";

  let score = priorityTier === "priority" ? 100 : 0;
  if (documentType === "privacy_policy") {
    score += 30;
  } else if (documentType === "cookie_policy") {
    score += 20;
  } else if (documentType === "terms_of_service") {
    score += 10;
  }

  return score;
}

export function prioritizePendingNanoDocumentSources(rows: Array<Record<string, unknown>>) {
  return [...rows].sort((left, right) => {
    const scoreDelta = getNanoDocumentPriorityScore(right) - getNanoDocumentPriorityScore(left);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    const leftUrl = getString(left.canonical_url) ?? getString(left.source_url) ?? "";
    const rightUrl = getString(right.canonical_url) ?? getString(right.source_url) ?? "";
    return leftUrl.localeCompare(rightUrl);
  });
}

function hasRuntimeCookieEvidence(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  const hybrid =
    runtimeArtifacts && typeof runtimeArtifacts === "object"
      ? (((runtimeArtifacts.hybrid_runtime_evidence ?? runtimeArtifacts.hybridRuntimeEvidence) as Record<string, unknown> | null) ?? null)
      : null;
  const cookieWriteObservations = Array.isArray(hybrid?.cookieWriteObservations)
    ? hybrid.cookieWriteObservations.filter((value) => Boolean(value) && typeof value === "object")
    : [];

  if (cookieWriteObservations.length > 0) {
    return true;
  }

  const initialCookieNames = Array.isArray(runtimeArtifacts?.initial_cookie_names)
    ? runtimeArtifacts.initial_cookie_names
    : Array.isArray(runtimeArtifacts?.initialCookieNames)
      ? runtimeArtifacts.initialCookieNames
      : [];

  return initialCookieNames.length > 0;
}

function hasTermsSpecificRuntimeNeed(snapshot: Record<string, unknown> | null | undefined) {
  const normalizedSnapshot = snapshot ?? null;
  return (
    getRecordBoolean(normalizedSnapshot, "session_replay_without_disclosure_detected") ||
    getRecordBoolean(normalizedSnapshot, "session_replay_detected_without_disclosure")
  );
}

function hasReadyTermsDocumentNeedingExtraction(rows: Array<Record<string, unknown>> | undefined) {
  return (rows ?? []).some((row) => {
    const documentType = getString(row.document_type) ?? getString(row.documentType);
    const sourceStatus = getString(row.source_status) ?? getString(row.sourceStatus) ?? "ready";
    const extractionStatus = getString(row.extraction_status) ?? getString(row.extractionStatus) ?? "pending";
    const documentText = getString(row.document_text) ?? getString(row.documentText);
    return documentType === "terms_of_service" && sourceStatus === "ready" && Boolean(documentText) && extractionStatus !== "ready";
  });
}

export function shouldQueueNanoDocumentSourceForExtraction(row: Record<string, unknown>) {
  const extractionStatus = getString(row.extraction_status) ?? getString(row.extractionStatus);
  const sourceStatus = getString(row.source_status) ?? getString(row.sourceStatus) ?? "ready";
  const documentType = getString(row.document_type) ?? getString(row.documentType);
  const documentText = getString(row.document_text) ?? getString(row.documentText);

  if (!getString(row.id) || !documentText) {
    return false;
  }

  if (!extractionStatus || extractionStatus === "pending") {
    return true;
  }

  if (sourceStatus === "ready" && extractionStatus === "insufficient" && documentType === "terms_of_service") {
    return true;
  }

  if (sourceStatus !== "ready" || extractionStatus !== "ready" || documentType !== "privacy_policy") {
    return false;
  }

  const metadata =
    getRecord(row.metadata_json) ??
    getRecord(row.metadataJson) ??
    {};
  const extractedFields =
    getRecord(row.extracted_fields_json) ??
    getRecord(row.extractedFieldsJson) ??
    {};
  const retentionPeriods = Array.isArray(extractedFields.policy_retention_periods)
    ? extractedFields.policy_retention_periods
    : [];
  const normalizationVersion =
    typeof metadata.normalization_version === "number"
      ? metadata.normalization_version
      : typeof metadata.normalizationVersion === "number"
        ? metadata.normalizationVersion
        : 0;

  return (
    retentionPeriods.length === 0 &&
    hasRetentionInferenceCue(documentText) &&
    normalizationVersion < 2
  );
}

function getPrivacyDocumentSpecificityScore(row: Record<string, unknown>) {
  const canonicalUrl = (getString(row.canonical_url) ?? getString(row.canonicalUrl) ?? getString(row.source_url) ?? "").toLowerCase();
  const title = (getString(row.title) ?? "").toLowerCase();
  const haystack = `${canonicalUrl}\n${title}`;

  let score = getNanoDocumentPriorityScore(row);

  if (/\bprivacy-policy\b|\/privacy\b|privacy notice\b/.test(haystack)) {
    score += 20;
  }
  if (/\bjob|applicant|employee|candidate|affiliate|supplier|vendor|consumer-health|hipaa|california\b/.test(haystack)) {
    score -= 25;
  }
  if (/\blegal\/privacy-policy\b|\/privacy-policy\b/.test(haystack)) {
    score += 10;
  }
  if (/\/help\/privacy\b|\/privacy-center\b|\/your-privacy-choices\b|\/do-not-share-my-data\b|\/guest\/settings\/privacy\b|\/guest\/settings\/do-not-share-my-data\b/.test(haystack)) {
    score += 8;
  }
  if (/agreementservice|agreementtype=|[?&](country|language|locale)=|\/api\/|\/graphql\b|\/rest\/|\/v\d+\//.test(haystack)) {
    score -= 18;
  }

  return score;
}

function getPrivacySupplementalCoverageScore(row: Record<string, unknown>) {
  const canonicalUrl = (getString(row.canonical_url) ?? getString(row.canonicalUrl) ?? getString(row.source_url) ?? "").toLowerCase();
  const title = (getString(row.title) ?? "").toLowerCase();
  const haystack = `${canonicalUrl}\n${title}`;

  let score = 0;

  if (/\/help\/privacy\b/.test(haystack)) {
    score += 40;
  }
  if (/\/privacy-center\b|privacy center\b/.test(haystack)) {
    score += 35;
  }
  if (/your privacy choices|privacy choices|privacy settings|cookie settings/.test(haystack)) {
    score += 34;
  }
  if (/\/guest\/settings\/privacy\b|\/guest\/settings\/do-not-share-my-data\b|\/do-not-share-my-data\b/.test(haystack)) {
    score += 36;
  }

  return score;
}

function hasStrongReadyPrivacyDocument(rows: Array<Record<string, unknown>>) {
  return rows.some((row) => {
    const sourceStatus = getString(row.source_status) ?? getString(row.sourceStatus) ?? "ready";
    const extractionStatus = getString(row.extraction_status) ?? getString(row.extractionStatus) ?? "pending";
    const documentType = getString(row.document_type) ?? getString(row.documentType);
    if (sourceStatus !== "ready" || extractionStatus !== "ready" || documentType !== "privacy_policy") {
      return false;
    }

    const extracted =
      (row.extracted_fields_json && typeof row.extracted_fields_json === "object" && !Array.isArray(row.extracted_fields_json)
        ? (row.extracted_fields_json as Record<string, unknown>)
        : null) ??
      (row.extractedFieldsJson && typeof row.extractedFieldsJson === "object" && !Array.isArray(row.extractedFieldsJson)
        ? (row.extractedFieldsJson as Record<string, unknown>)
        : null) ??
      {};
    const semanticConfidence =
      typeof row.semantic_confidence === "number"
        ? row.semantic_confidence
        : typeof row.semanticConfidence === "number"
          ? row.semanticConfidence
          : typeof extracted.policy_semantic_confidence === "number"
            ? extracted.policy_semantic_confidence
            : typeof extracted.policySemanticConfidence === "number"
              ? extracted.policySemanticConfidence
              : null;
    const rightsSignalValue = extracted.policy_rights_signals ?? extracted.policyRightsSignals;
    const rightsSignals = Array.isArray(rightsSignalValue)
      ? (rightsSignalValue as unknown[]).filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      : [];
    const policyMentions = Array.isArray(extracted.policy_mentions)
      ? extracted.policy_mentions
      : Array.isArray(extracted.policyMentions)
        ? extracted.policyMentions
        : [];
    const contactChannel =
      getString(extracted.privacy_contact_channel_type) ?? getString(extracted.privacyContactChannelType) ?? "none";
    const structurallyWeak = extracted.policy_structurally_weak === true || extracted.policyStructurallyWeak === true;
    const ambiguity =
      typeof extracted.policy_ambiguity_score === "number"
        ? extracted.policy_ambiguity_score
        : typeof extracted.policyAmbiguityScore === "number"
          ? extracted.policyAmbiguityScore
          : null;
    const summary = getString(extracted.policy_summary_short) ?? getString(extracted.policySummaryShort);

    return Boolean(summary) &&
      !structurallyWeak &&
      (semanticConfidence === null || semanticConfidence >= 0.65) &&
      (ambiguity === null || ambiguity <= 65) &&
      (rightsSignals.length > 0 || contactChannel !== "none" || policyMentions.length > 0);
  });
}

function shouldExtractTermsDocument(input: {
  existingDocumentSources?: Array<Record<string, unknown>>;
  fallbackPageTypes: Set<string>;
  snapshot: Record<string, unknown> | null | undefined;
}) {
  if (hasReadyTermsDocumentNeedingExtraction(input.existingDocumentSources)) {
    return true;
  }

  return hasTermsSpecificRuntimeNeed(input.snapshot) && !input.fallbackPageTypes.has("terms_of_service");
}

function getNanoDocumentExtractionSkipReason(input: {
  existingDocumentSources?: Array<Record<string, unknown>>;
  fallbackPageTypes: Set<string>;
  row: Record<string, unknown>;
  snapshot: Record<string, unknown> | null | undefined;
  runtimeArtifacts: Record<string, unknown> | null | undefined;
}) {
  const documentType = getString(input.row.document_type) ?? getString(input.row.documentType);
  if (documentType === "privacy_policy") {
    return hasStrongReadyPrivacyDocument(input.existingDocumentSources ?? [])
      ? "secondary_privacy_not_required"
      : "privacy_policy_not_selected";
  }
  if (documentType === "cookie_policy") {
    return hasRuntimeCookieEvidence(input.runtimeArtifacts) || !input.fallbackPageTypes.has("cookie_policy")
      ? "cookie_policy_not_selected"
      : "fallback_policy_semantics_available";
  }
  if (documentType === "terms_of_service") {
    return shouldExtractTermsDocument({
      existingDocumentSources: input.existingDocumentSources,
      fallbackPageTypes: input.fallbackPageTypes,
      snapshot: input.snapshot
    })
      ? "terms_not_selected"
      : "terms_extraction_not_required";
  }
  return "fallback_policy_semantics_available";
}

export function selectPendingNanoDocumentSourcesForExtraction(input: {
  policyEnrichments: Array<Record<string, unknown>>;
  existingDocumentSources?: Array<Record<string, unknown>>;
  rows: Array<Record<string, unknown>>;
  snapshot?: Record<string, unknown> | null;
  runtimeArtifacts: Record<string, unknown> | null | undefined;
}) {
  const fallbackPageTypes = new Set(
    input.policyEnrichments
      .map((row) => getString(row.page_type) ?? getString(row.pageType))
      .filter((value): value is string => typeof value === "string")
  );
  const shouldExtractCookiePolicy = hasRuntimeCookieEvidence(input.runtimeArtifacts) || !fallbackPageTypes.has("cookie_policy");
  const strongReadyPrivacyExists = hasStrongReadyPrivacyDocument(input.existingDocumentSources ?? []);
  const shouldExtractTerms = shouldExtractTermsDocument({
    existingDocumentSources: input.existingDocumentSources,
    fallbackPageTypes,
    snapshot: input.snapshot
  });
  const pendingPrivacyRows = input.rows.filter((row) => (getString(row.document_type) ?? getString(row.documentType)) === "privacy_policy");
  const selectedSupplementalPrivacyIds = new Set(
    [...pendingPrivacyRows]
      .filter((row) => getPrivacySupplementalCoverageScore(row) > 0)
      .sort(
        (left, right) =>
          getPrivacySupplementalCoverageScore(right) - getPrivacySupplementalCoverageScore(left) ||
          getPrivacyDocumentSpecificityScore(right) - getPrivacyDocumentSpecificityScore(left)
      )
      .slice(0, 2)
      .map((row) => String(row.id ?? ""))
  );
  const selectedPrimaryPrivacyId = strongReadyPrivacyExists || pendingPrivacyRows.length === 0
    ? null
    : [...pendingPrivacyRows]
        .filter((row) => getPrivacySupplementalCoverageScore(row) === 0)
        .sort((left, right) => getPrivacyDocumentSpecificityScore(right) - getPrivacyDocumentSpecificityScore(left))[0]?.id ??
      [...pendingPrivacyRows].sort((left, right) => getPrivacyDocumentSpecificityScore(right) - getPrivacyDocumentSpecificityScore(left))[0]?.id;

  return input.rows.filter((row) => {
    const documentType = getString(row.document_type) ?? getString(row.documentType);
    if (documentType === "privacy_policy") {
      const rowId = String(row.id ?? "");
      if (selectedSupplementalPrivacyIds.has(rowId)) {
        return true;
      }
      if (strongReadyPrivacyExists) {
        return false;
      }
      return rowId === String(selectedPrimaryPrivacyId ?? "");
    }
    if (documentType === "cookie_policy") {
      return shouldExtractCookiePolicy;
    }
    if (documentType === "terms_of_service") {
      return shouldExtractTerms;
    }
    return true;
  });
}

function chunkRows<T>(rows: T[], size: number) {
  if (size <= 0) {
    return [rows];
  }

  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

function summarizeNanoDocRetrievalResults(input: {
  fetched: Array<{ outcome: "ready" | "insufficient" | "non_ok" | "intermediary" | "error"; row: Record<string, unknown> | null }>;
  rows: Array<Record<string, unknown>>;
}) {
  const dedupeKeys = new Set<string>();
  let duplicateCount = 0;

  for (const row of input.fetched) {
    if (!row.row) {
      continue;
    }

    const canonicalUrl = getString(row.row.canonical_url) ?? getString(row.row.canonicalUrl);
    const documentType = getString(row.row.document_type) ?? getString(row.row.documentType) ?? "unknown";
    const key = `${documentType}::${canonicalUrl ?? getString(row.row.source_url) ?? ""}`;
    if (dedupeKeys.has(key)) {
      duplicateCount += 1;
      continue;
    }
    dedupeKeys.add(key);
  }

  return {
    duplicateCount,
    errorCount: input.fetched.filter((row) => row.outcome === "error").length,
    insufficientCount: input.fetched.filter((row) => row.outcome === "insufficient").length,
    intermediaryCount: input.fetched.filter((row) => row.outcome === "intermediary").length,
    nonOkCount: input.fetched.filter((row) => row.outcome === "non_ok").length,
    rejectedCount: input.rows.filter((row) => {
      const sourceStatus = getString(row.source_status) ?? getString(row.sourceStatus);
      return sourceStatus === "rejected";
    }).length,
    retainedCount: input.rows.filter((row) => {
      const sourceStatus = getString(row.source_status) ?? getString(row.sourceStatus);
      return sourceStatus === "ready";
    }).length
  };
}

export async function processNanoDocRetrievalJob(input: { pollCount?: number; scanId: string }) {
  const { state } = await getValidationPipelineState();
  if (state !== "running") {
    return;
  }

  const scanId = input.scanId;
  const pollCount = input.pollCount ?? 0;
  const artifacts = await loadNanoDocRetrievalInputs(scanId);
  const scanStatus = typeof artifacts.scan?.status === "string" ? artifacts.scan.status : null;

  if (pollCount === 0) {
    await appendScanWorkflowEvent({
      eventType: SCAN_EVENT_TYPES.nanoDocRetrievalStarted,
      message: "Nano document retrieval started.",
      metadataJson: {
        stage: "nano_doc_retrieval"
      },
      scanId
    }).catch(() => undefined);
  }

  if (scanStatus === "failed") {
    await appendScanWorkflowEvent({
      eventType: SCAN_EVENT_TYPES.nanoDocRetrievalFailed,
      message: "Nano document retrieval failed because the scan failed.",
      metadataJson: {
        error: typeof artifacts.scan?.error_message === "string" ? artifacts.scan.error_message : "scan_failed",
        stage: "nano_doc_retrieval"
      },
      scanId
    }).catch(() => undefined);
    return;
  }

  const candidates = await selectNanoDocCandidates({
    discoveryCandidates: artifacts.discoveryCandidates,
    domainHostname: artifacts.domainHostname,
    pages: artifacts.pages,
    recentDomainDocumentCandidates: artifacts.recentDomainDocumentCandidates
  });
  const existingAttemptKeys = new Set(
    artifacts.existingDocumentSources
      .filter((row) => !shouldRetryRejectedNanoDocumentSource(row))
      .flatMap((row) => getNanoDocumentSourceDedupKeys(row))
  );
  const pendingCandidates = candidates.filter((candidate) => !existingAttemptKeys.has(getNanoDocumentCandidateDedupKey(candidate)));
  const hasScannerDiscoveryInputs = artifacts.pages.length > 0 || artifacts.discoveryCandidates.length > 0;
  const shouldReenqueueForDiscovery = !hasScannerDiscoveryInputs && scanStatus !== "completed" && scanStatus !== "failed";

  const hasExistingReadyPrivacyPolicy = hasReadyNanoDocumentOfType(artifacts.existingDocumentSources, "privacy_policy");

  if (pendingCandidates.length === 0) {
    if (shouldReenqueueForDiscovery && !hasExistingReadyPrivacyPolicy && pollCount + 1 < MAX_NANO_DOC_RETRIEVAL_POLLS) {
      await sleep(NANO_DOC_RETRIEVAL_POLL_MS);
      await processNanoDocRetrievalJob({ pollCount: pollCount + 1, scanId });
      return;
    }
  }
  const candidateWaves = splitNanoDocCandidatesByPriority(pendingCandidates);
  const existingReadyKeys = new Set(
    artifacts.existingDocumentSources
      .filter((row) => (getString(row.source_status) ?? "ready") === "ready")
      .flatMap((row) => getNanoDocumentSourceDedupKeys(row))
  );

  const secondaryFetchPromise =
    candidateWaves.secondary.length > 0
      ? Promise.all(
          candidateWaves.secondary.map((candidate) =>
            fetchNanoDocumentSource({
              ...candidate,
              referer: getNanoDocumentFetchReferer({
                domainHostname: artifacts.domainHostname,
                runtimeArtifacts: artifacts.runtimeArtifacts,
                url: candidate.url
              })
            })
          )
        )
      : Promise.resolve([] as Array<{ outcome: "ready" | "insufficient" | "non_ok" | "intermediary" | "error"; row: Record<string, unknown> | null }>);
  const priorityFetchedResults = await Promise.all(
    candidateWaves.priority.map((candidate) =>
      fetchNanoDocumentSource({
        ...candidate,
        referer: getNanoDocumentFetchReferer({
          domainHostname: artifacts.domainHostname,
          runtimeArtifacts: artifacts.runtimeArtifacts,
          url: candidate.url
        })
      })
    )
  );
  const priorityRows = dedupeNanoDocumentSources([
    ...artifacts.existingDocumentSources,
    ...priorityFetchedResults.flatMap((result) => (result.row ? [result.row] : []))
  ]);
  const priorityReadyRows = priorityRows.filter((row) => (getString(row.source_status) ?? "ready") === "ready");
  const newPriorityReadyRows = priorityReadyRows.filter((row) => !existingReadyKeys.has(getNanoDocumentSourceDedupKey(row)));

  if (priorityRows.length > 0) {
    await replaceScanDocumentSources({
      rows: priorityRows,
      scanId
    });
  }

  const secondaryFetchedResults = await secondaryFetchPromise;
  const combinedRows = dedupeNanoDocumentSources([
    ...priorityRows,
    ...secondaryFetchedResults.flatMap((result) => (result.row ? [result.row] : []))
  ]);
  const combinedReadyRows = combinedRows.filter((row) => (getString(row.source_status) ?? "ready") === "ready");
  const newCombinedReadyRows = combinedReadyRows.filter((row) => !existingReadyKeys.has(getNanoDocumentSourceDedupKey(row)));

  if (combinedRows.length !== priorityRows.length) {
    await replaceScanDocumentSources({
      rows: combinedRows,
      scanId
    });
  }

  const retrievalSummary = summarizeNanoDocRetrievalResults({
    fetched: [...priorityFetchedResults, ...secondaryFetchedResults],
    rows: combinedRows
  });

  await appendScanWorkflowEvent({
    eventType: SCAN_EVENT_TYPES.nanoDocRetrievalCompleted,
    message: "Nano document retrieval completed.",
    metadataJson: {
      candidateCount: candidates.length,
      duplicateCount: retrievalSummary.duplicateCount,
      documentSourceCount: retrievalSummary.retainedCount,
      errorCount: retrievalSummary.errorCount,
      insufficientCount: retrievalSummary.insufficientCount,
      intermediaryCount: retrievalSummary.intermediaryCount,
      nonOkCount: retrievalSummary.nonOkCount,
      pendingCandidateCount: pendingCandidates.length,
      rejectedCount: retrievalSummary.rejectedCount,
      priorityCandidateCount: candidateWaves.priority.length,
      priorityDocumentSourceCount: priorityReadyRows.length,
      stage: "nano_doc_retrieval"
    },
    scanId
  }).catch(() => undefined);

  if (shouldReenqueueForDiscovery && !hasReadyNanoDocumentOfType(combinedRows, "privacy_policy") && pollCount + 1 < MAX_NANO_DOC_RETRIEVAL_POLLS) {
    await sleep(NANO_DOC_RETRIEVAL_POLL_MS);
    await processNanoDocRetrievalJob({ pollCount: pollCount + 1, scanId });
  }
}

export async function processNanoSignalEnrichmentJob(input: {
  pollCount?: number;
  recoveryMode?: "browser_extension_signal_reprojection" | "completed_scan_backfill" | "missing_unified_projection" | null;
  scanId: string;
}) {
  const { state } = await getValidationPipelineState();
  if (state !== "running") {
    return;
  }

  const scanId = input.scanId;
  const pollCount = input.pollCount ?? 0;
  let artifacts = await loadNanoSignalEnrichmentInputs(scanId);
  const scanStatus = typeof artifacts.scan?.status === "string" ? artifacts.scan.status : null;
  const startedAt =
    typeof artifacts.scan?.started_at === "string"
      ? artifacts.scan.started_at
      : typeof artifacts.scan?.created_at === "string"
        ? artifacts.scan.created_at
        : null;

  if (pollCount === 0) {
    await appendScanWorkflowEvent({
      eventType: SCAN_EVENT_TYPES.nanoSignalEnrichmentStarted,
      message: "Nano document signal enrichment started.",
      metadataJson: {
        ...(input.recoveryMode ? { recoveryMode: input.recoveryMode } : {}),
        stage: "nano_doc_signals"
      },
      scanId
    }).catch(() => undefined);
  }

  const getPendingDocumentSources = (rows: Array<Record<string, unknown>>) =>
    prioritizePendingNanoDocumentSources(
      rows.filter((row) => shouldQueueNanoDocumentSourceForExtraction(row))
    );
  const getFallbackPageTypes = (rows: Array<Record<string, unknown>>) =>
    new Set(rows.map((row) => getString(row.page_type) ?? getString(row.pageType)).filter((value): value is string => typeof value === "string"));

  let pendingDocumentSources = getPendingDocumentSources(artifacts.documentSources);
  let selectedPendingDocumentSources = selectPendingNanoDocumentSourcesForExtraction({
    existingDocumentSources: artifacts.documentSources,
    policyEnrichments: artifacts.policyEnrichments,
    rows: pendingDocumentSources,
    snapshot: artifacts.snapshot,
    runtimeArtifacts: artifacts.runtimeArtifacts
  });
  const reusableExtractions = resolveReusableNanoDocumentExtractions({
    candidates: selectedPendingDocumentSources,
    priorExtractions: await loadReusableNanoDocumentExtractions({
      rows: selectedPendingDocumentSources,
      scanId
    })
  });
  const reusableExtractionCandidateCount = selectedPendingDocumentSources.length;
  const reusableExtractionAvoidedCharacterCount = selectedPendingDocumentSources.reduce((sum, row) => {
    const id = getString(row.id);
    if (!id || !reusableExtractions.has(id)) {
      return sum;
    }
    return sum + (getString(row.document_text) ?? getString(row.documentText) ?? "").length;
  }, 0);
  const reusableExtractionUpdates = selectedPendingDocumentSources.flatMap((row) => {
    const id = getString(row.id);
    if (!id) {
      return [];
    }

    const reused = reusableExtractions.get(id);
    if (!reused) {
      return [];
    }

    const extractedFields =
      typeof reused.extracted_fields_json === "object" && reused.extracted_fields_json !== null && !Array.isArray(reused.extracted_fields_json)
        ? (reused.extracted_fields_json as Record<string, unknown>)
        : {};

    return [{
      extractedFields,
      extractionStatus: "ready" as const,
      id,
      metadata: {
        ...getDocumentSourceMetadata(row),
        extraction_reuse_reason: "canonical_url_content_hash_match",
        extraction_reuse_requires_current_canonical_url_match: true,
        reused_extraction_from_document_source_id: getString(reused.id),
        reused_extraction_from_scan_id: getString(reused.scan_id),
        reused_extraction_updated_at: getString(reused.updated_at)
      },
      semanticConfidence:
        typeof reused.semantic_confidence === "number"
          ? reused.semantic_confidence
          : typeof reused.semanticConfidence === "number"
            ? reused.semanticConfidence
            : null
    }];
  });
  if (reusableExtractionUpdates.length > 0) {
    await updateScanDocumentSourceExtractions({
      rows: reusableExtractionUpdates
    });
    artifacts = await loadNanoSignalEnrichmentInputs(scanId);
    pendingDocumentSources = getPendingDocumentSources(artifacts.documentSources);
    selectedPendingDocumentSources = selectPendingNanoDocumentSourcesForExtraction({
      existingDocumentSources: artifacts.documentSources,
      policyEnrichments: artifacts.policyEnrichments,
      rows: pendingDocumentSources,
      snapshot: artifacts.snapshot,
      runtimeArtifacts: artifacts.runtimeArtifacts
    });
  }

  const selectedPendingIds = new Set(selectedPendingDocumentSources.map((row) => String(row.id ?? "")));
  const skippedPendingDocumentSources = pendingDocumentSources.filter((row) => !selectedPendingIds.has(String(row.id ?? "")));
  let freshExtractionAttemptCount = 0;
  let freshExtractionCompletedCount = 0;
  let freshExtractionFailedCount = 0;
  let freshExtractionCharacterCount = 0;
  let freshExtractionDurationMs = 0;
  let freshExtractionPromptTokenCount = 0;
  let freshExtractionCompletionTokenCount = 0;
  let freshExtractionTotalTokenCount = 0;

  if (skippedPendingDocumentSources.length > 0) {
    await updateScanDocumentSourceExtractions({
      rows: skippedPendingDocumentSources.map((row) => ({
        extractedFields:
          (typeof row.extracted_fields_json === "object" && row.extracted_fields_json !== null && !Array.isArray(row.extracted_fields_json)
            ? (row.extracted_fields_json as Record<string, unknown>)
            : {}),
        extractionStatus: "insufficient",
        id: String(row.id),
        metadata: {
          ...(typeof row.metadata_json === "object" && row.metadata_json !== null && !Array.isArray(row.metadata_json)
            ? (row.metadata_json as Record<string, unknown>)
            : {}),
          extraction_skip_reason: getNanoDocumentExtractionSkipReason({
            existingDocumentSources: artifacts.documentSources,
            fallbackPageTypes: getFallbackPageTypes(artifacts.policyEnrichments),
            row,
            snapshot: artifacts.snapshot,
            runtimeArtifacts: artifacts.runtimeArtifacts
          })
        },
        semanticConfidence:
          typeof row.semantic_confidence === "number"
            ? row.semantic_confidence
            : typeof row.semanticConfidence === "number"
              ? row.semanticConfidence
              : null
      }))
    });
    artifacts = await loadNanoSignalEnrichmentInputs(scanId);
    pendingDocumentSources = getPendingDocumentSources(artifacts.documentSources);
    selectedPendingDocumentSources = selectPendingNanoDocumentSourcesForExtraction({
      existingDocumentSources: artifacts.documentSources,
      policyEnrichments: artifacts.policyEnrichments,
      rows: pendingDocumentSources,
      snapshot: artifacts.snapshot,
      runtimeArtifacts: artifacts.runtimeArtifacts
    });
  }

  if (artifacts.policySemanticRows.length > 0) {
    await persistDerivedNanoPolicySignals({
      policySemanticRows: artifacts.policySemanticRows,
      policyReviewQueue: artifacts.policyReviewQueue,
      runtimeArtifacts: artifacts.runtimeArtifacts,
      scanId,
      snapshot: artifacts.snapshot
    });
  }

  if (selectedPendingDocumentSources.length > 0) {
    const immediatePendingDocumentSources = selectedPendingDocumentSources.filter(
      (row) => (getString(row.document_type) ?? getString(row.documentType)) !== "terms_of_service"
    );
    const deferredTermsDocumentSources = selectedPendingDocumentSources.filter(
      (row) => (getString(row.document_type) ?? getString(row.documentType)) === "terms_of_service"
    );
    let partialSignalsPersisted = false;

    const extractPendingBatches = async (rows: Array<Record<string, unknown>>) => {
      for (const batch of chunkRows(rows, NANO_DOCUMENT_EXTRACTION_BATCH_SIZE)) {
        freshExtractionAttemptCount += batch.length;
        freshExtractionCharacterCount += batch.reduce(
          (sum, row) => sum + (getString(row.document_text) ?? getString(row.documentText) ?? "").length,
          0
        );
        const batchStartedAt = Date.now();
        const extractionRows = await Promise.all(
          batch.map(async (row) => {
            const result = await extractNanoDocumentSourceWithLlm(row);
            if (result.extractionStatus === "failed") {
              freshExtractionFailedCount += 1;
            } else {
              freshExtractionCompletedCount += 1;
            }
            const usage =
              typeof result.metadata.model_usage === "object" && result.metadata.model_usage !== null && !Array.isArray(result.metadata.model_usage)
                ? (result.metadata.model_usage as Record<string, unknown>)
                : null;
            freshExtractionPromptTokenCount += typeof usage?.promptTokens === "number" ? usage.promptTokens : 0;
            freshExtractionCompletionTokenCount += typeof usage?.completionTokens === "number" ? usage.completionTokens : 0;
            freshExtractionTotalTokenCount += typeof usage?.totalTokens === "number" ? usage.totalTokens : 0;
            return {
              extractedFields: result.extractedFields,
              extractionStatus: result.extractionStatus,
              id: String(row.id),
              metadata: {
                ...(typeof row.metadata_json === "object" && row.metadata_json !== null && !Array.isArray(row.metadata_json)
                  ? (row.metadata_json as Record<string, unknown>)
                  : {}),
                ...result.metadata
              },
              semanticConfidence: result.semanticConfidence
            };
          })
        );
        freshExtractionDurationMs += Date.now() - batchStartedAt;

        await updateScanDocumentSourceExtractions({
          rows: extractionRows
        });

        artifacts = await loadNanoSignalEnrichmentInputs(scanId);

        if (!partialSignalsPersisted && artifacts.policySemanticRows.length > 0) {
          await persistDerivedNanoPolicySignals({
            policySemanticRows: artifacts.policySemanticRows,
            policyReviewQueue: artifacts.policyReviewQueue,
            runtimeArtifacts: artifacts.runtimeArtifacts,
            scanId,
            snapshot: artifacts.snapshot
          });
          partialSignalsPersisted = true;
        }
      }
    };

    if (immediatePendingDocumentSources.length > 0) {
      await extractPendingBatches(immediatePendingDocumentSources);
    }

    if (deferredTermsDocumentSources.length > 0) {
      artifacts = await loadNanoSignalEnrichmentInputs(scanId);
      const shouldExtractDeferredTerms = shouldExtractTermsDocument({
        existingDocumentSources: artifacts.documentSources,
        fallbackPageTypes: getFallbackPageTypes(artifacts.policyEnrichments),
        snapshot: artifacts.snapshot
      });

      if (shouldExtractDeferredTerms) {
        await extractPendingBatches(deferredTermsDocumentSources);
      } else {
        await updateScanDocumentSourceExtractions({
          rows: deferredTermsDocumentSources.map((row) => ({
            extractedFields:
              (typeof row.extracted_fields_json === "object" && row.extracted_fields_json !== null && !Array.isArray(row.extracted_fields_json)
                ? (row.extracted_fields_json as Record<string, unknown>)
                : {}),
            extractionStatus: "insufficient",
            id: String(row.id),
            metadata: {
              ...(typeof row.metadata_json === "object" && row.metadata_json !== null && !Array.isArray(row.metadata_json)
                ? (row.metadata_json as Record<string, unknown>)
                : {}),
              extraction_skip_reason: "terms_extraction_not_required"
            },
            semanticConfidence:
              typeof row.semantic_confidence === "number"
                ? row.semantic_confidence
                : typeof row.semanticConfidence === "number"
                  ? row.semanticConfidence
                  : null
          }))
        });
        artifacts = await loadNanoSignalEnrichmentInputs(scanId);
      }
    }
  }

  if (artifacts.policySemanticRows.length === 0 && scanStatus !== "completed" && scanStatus !== "failed") {
    const nextPollCount = pollCount + 1;
    const willContinuePolicyRowPolling = nextPollCount < MAX_NANO_SIGNAL_ENRICHMENT_POLLS;
    await requeueNanoSignalEnrichmentPoll({
      delayMs: willContinuePolicyRowPolling
        ? NANO_SIGNAL_POLICY_ROW_RECHECK_MS
        : VALIDATION_SCAN_HANDOFF_POLL_MS,
      pollCount: nextPollCount,
      reason:
        willContinuePolicyRowPolling
          ? "waiting_for_scanner_policy_rows"
          : "waiting_for_scanner_terminal_status",
      scanId
    });
    return;
  }

  if (scanStatus === "failed") {
    await appendScanWorkflowEvent({
      eventType: SCAN_EVENT_TYPES.nanoSignalEnrichmentFailed,
      message: "Nano document signal enrichment failed because the scan failed.",
      metadataJson: {
        error: typeof artifacts.scan?.error_message === "string" ? artifacts.scan.error_message : "scan_failed",
        stage: "nano_doc_signals"
      },
      scanId
    }).catch(() => undefined);
    return;
  }

  const nanoSignalRows = await persistDerivedNanoPolicySignals({
    policySemanticRows: artifacts.policySemanticRows,
    policyReviewQueue: artifacts.policyReviewQueue,
    runtimeArtifacts: artifacts.runtimeArtifacts,
    scanId,
    snapshot: artifacts.snapshot
  });

  await appendScanWorkflowEvent({
    eventType: SCAN_EVENT_TYPES.nanoSignalEnrichmentCompleted,
    message: "Nano document signal enrichment completed.",
    metadataJson: {
      documentSourceCount: artifacts.documentSources.length,
      nanoSignalCount: nanoSignalRows.length,
      policyDocumentCount: artifacts.policySemanticRows.length,
      policyEnrichmentCount: artifacts.rawPolicyEnrichmentRows.length,
      preferDocumentSources: artifacts.preferDocumentSources === true,
      reusableExtractionAcceptedCount: reusableExtractionUpdates.length,
      reusableExtractionAvoidedCharacterCount,
      reusableExtractionCandidateCount,
      reusableExtractionModelCallAvoidedCount: reusableExtractionUpdates.length,
      reusableExtractionRejectedCount: Math.max(0, reusableExtractionCandidateCount - reusableExtractionUpdates.length),
      freshExtractionAttemptCount,
      freshExtractionCharacterCount,
      freshExtractionCompletedCount,
      freshExtractionCompletionTokenCount,
      freshExtractionDurationMs,
      freshExtractionFailedCount,
      freshExtractionPromptTokenCount,
      freshExtractionTotalTokenCount,
      ...(input.recoveryMode ? { recoveryMode: input.recoveryMode } : {}),
      scanStartedAt: startedAt,
      stage: "nano_doc_signals",
      sourceMode: artifacts.preferDocumentSources === true ? "document_sources" : "policy_enrichment"
    },
    scanId
  }).catch(() => undefined);

  const validationDerivationState = await getValidationDerivationStateForScan(scanId).catch((error) => {
    console.error("[validation-worker] failed to check validation derivation state for scan", {
      error: error instanceof Error ? error.message : String(error),
      scanId
    });
    return { activeRunCount: 1, findingCount: 0, runCount: 0, unifiedDerivationCompletedCount: 0 };
  });
  const hasCompletedUnifiedDerivation = validationDerivationState.unifiedDerivationCompletedCount > 0;
  const scanIsTerminal = scanStatus === "completed" || scanStatus === "failed";

  if (!hasCompletedUnifiedDerivation && !scanIsTerminal) {
    await requeueNanoSignalEnrichmentPoll({
      delayMs: NANO_SIGNAL_TERMINAL_STATUS_RECHECK_MS,
      pollCount,
      reason: "waiting_for_scanner_terminal_status",
      scanId
    });
    return;
  }

  const shouldReprojectAfterBrowserExtensionSignals = input.recoveryMode === "browser_extension_signal_reprojection";

  if (!hasCompletedUnifiedDerivation || shouldReprojectAfterBrowserExtensionSignals) {
    await deriveAndPersistUnifiedFindingsForScan({
      recoveryMode: input.recoveryMode ?? null,
      scanId
    });

    const scanType = typeof artifacts.scan?.scan_type === "string" ? artifacts.scan.scan_type : null;
    if (scanType === "preview" && scanStatus !== "completed" && scanStatus !== "failed") {
      await updateScanStatus({
        scanId,
        status: "completed",
        completedAt: new Date().toISOString()
      });
    }
  }
}

export async function processValidationCollectJob(validationRunId: string) {
  const { state } = await getValidationPipelineState();
  if (state !== "running") {
    return;
  }

  try {
    const scanId = await createScanForValidationRun(validationRunId);
    const run = await getValidationRun(validationRunId);
    if (!run?.scan_id) {
      throw new Error("Validation run scan was not created.");
    }
    if (!run.started_at) {
      await updateValidationRun(validationRunId, {
        started_at: new Date().toISOString()
      });
    }

    const artifacts = await loadCompletedScanArtifacts(run.scan_id);
    const scanStatus = String(artifacts.scan?.status ?? "");

    const collectAction = determineValidationCollectAction(scanStatus || null);

    if (collectAction === "wait_for_scan") {
      if (run.status !== "waiting_for_scan") {
        await updateValidationRun(validationRunId, {
          status: "waiting_for_scan"
        });
      }
      return;
    }

    if (collectAction === "wait_for_completion") {
      if (run.status !== "collecting") {
        await updateValidationRun(validationRunId, {
          status: "collecting"
        });
      }
      return;
    }

    if (collectAction === "fail") {
      throw new Error(String(artifacts.scan?.error_message ?? "Validation scan failed."));
    }

    if (collectAction !== "rank") {
      throw new Error(`Validation scan entered unexpected status: ${scanStatus || "unknown"}.`);
    }

    await updateValidationRun(validationRunId, {
      status: "ranking"
    });
  } catch (error) {
    await failValidationRun(validationRunId, error instanceof Error ? error.message : "Validation collect failed.");
    throw error;
  }
}

export async function processValidationRankJob(validationRunId: string) {
  const workerEnv = getWorkerEnv();
  const { state } = await getValidationPipelineState();
  if (state !== "running") {
    return;
  }

  try {
    const run = await getValidationRun(validationRunId);
    if (!run?.scan_id) {
      throw new Error("Validation run is missing a scan.");
    }
    if (!run.started_at) {
      await updateValidationRun(validationRunId, {
        started_at: new Date().toISOString()
      });
    }
    const scanId = run.scan_id;
    const initialDerivationState = await getValidationDerivationStateForScan(scanId).catch((error) => {
      console.error("[validation-worker] failed to check validation derivation state for rank job", {
        error: error instanceof Error ? error.message : String(error),
        scanId
      });
      return { activeRunCount: 1, findingCount: 0, runCount: 0, unifiedDerivationCompletedCount: 0 };
    });
    const scanProjectionAlreadyCompleted = initialDerivationState.unifiedDerivationCompletedCount > 0;

    if (!scanProjectionAlreadyCompleted) {
      await processNanoDocRetrievalJob({
        pollCount: 0,
        scanId
      });

      await processNanoSignalEnrichmentJob({
        pollCount: 0,
        scanId
      });
    }

    await enrichUnknownScanVendors({
      hostname: run.hostname,
      scanId
    }).catch((error) => {
      console.error("[validation-worker] vendor enrichment failed", {
        error: error instanceof Error ? error.message : String(error),
        scanId
      });
    });

    const artifacts = await loadCompletedScanArtifacts(scanId);
    await persistDerivedNanoPolicySignals({
      policySemanticRows: artifacts.policySemanticRows ?? artifacts.policySemanticInputs ?? artifacts.policyEnrichments ?? [],
      policyReviewQueue: artifacts.policyReviewQueue,
      runtimeArtifacts: artifacts.runtimeArtifacts,
      scanId,
      snapshot: artifacts.snapshot
    }).catch((error) => {
      console.error("[validation-worker] nano policy signal persistence failed", {
        error: error instanceof Error ? error.message : String(error),
        scanId
      });

      return [];
    });

    const findings = await deriveAndPersistUnifiedFindingsForScan({
      scanId,
      suppressWorkflowEvents: scanProjectionAlreadyCompleted,
      validationRunId
    });

    if (findings.length === 0) {
      await finalizeValidationRun(validationRunId);
      return;
    }

    if (!workerEnv.LLM_ENRICHMENT_ENABLED) {
      await finalizeValidationRun(validationRunId);
      return;
    }

    await updateValidationRun(validationRunId, {
      status: "validating"
    });
  } catch (error) {
    await failValidationRun(validationRunId, error instanceof Error ? error.message : "Validation ranking failed.");
    throw error;
  }
}

export async function processValidationVerdictJob(validationRunId: string) {
  const { state } = await getValidationPipelineState();
  if (state !== "running") {
    return;
  }

  try {
    const run = await getValidationRun(validationRunId);
    if (!run?.scan_id) {
      throw new Error("Validation run is missing a scan.");
    }
    if (!run.started_at) {
      await updateValidationRun(validationRunId, {
        started_at: new Date().toISOString()
      });
    }

    const findings = await loadValidationRunFindings(validationRunId);
    const scanArtifacts = await loadCompletedScanArtifacts(run.scan_id);

    for (const batch of chunkRows(findings, VALIDATION_VERDICT_BATCH_SIZE)) {
      await Promise.all(
        batch.map(async (finding) => {
          const rawEvidence = (finding.evidence_json ?? {}) as Record<string, unknown>;
          const ruleKey = typeof finding.rule_key === "string" ? finding.rule_key : "";
          const verdict =
            ruleKey.startsWith("financial_review.") &&
            typeof rawEvidence.unifiedFindingId === "string" &&
            FINANCIAL_JUDGE_CANDIDATE_IDS.has(rawEvidence.unifiedFindingId)
              ? await validateFinancialFindingWithLlm({
                  candidateFindingId: rawEvidence.unifiedFindingId as
                    | "fee_disclosure_present"
                    | "apr_or_interest_rate_disclosure_present"
                    | "past_performance_disclaimer_present",
                  evidence: {
                    exactMatchTerm: typeof rawEvidence.matchedPhrase === "string" ? rawEvidence.matchedPhrase : null,
                    matchedPhrases:
                      Array.isArray(rawEvidence.matchedPhrases)
                        ? (rawEvidence.matchedPhrases as unknown[]).filter((value): value is string => typeof value === "string")
                        : typeof rawEvidence.matchedPhrase === "string"
                          ? [rawEvidence.matchedPhrase]
                          : [],
                    pageClassification:
                      rawEvidence.pageClassification === "financial_offer" ||
                      rawEvidence.pageClassification === "quasi_financial_offer" ||
                      rawEvidence.pageClassification === "pricing_or_fees" ||
                      rawEvidence.pageClassification === "disclosure_or_legal" ||
                      rawEvidence.pageClassification === "identity_or_contact"
                        ? rawEvidence.pageClassification
                        : "unknown",
                    pageUrl: typeof rawEvidence.pageUrl === "string" ? rawEvidence.pageUrl : null,
                    signalKeys: Array.isArray(rawEvidence.supportingSignals)
                      ? (rawEvidence.supportingSignals as unknown[]).filter((value): value is string => typeof value === "string")
                      : typeof rawEvidence.signalKey === "string"
                        ? [rawEvidence.signalKey]
                        : [],
                    snippets: Array.isArray(rawEvidence.policySnippets)
                      ? (rawEvidence.policySnippets as unknown[]).filter((value): value is string => typeof value === "string")
                      : typeof rawEvidence.matchedSnippet === "string"
                        ? [rawEvidence.matchedSnippet]
                        : [],
                    sourceUrls: Array.isArray(rawEvidence.sourceUrls)
                      ? (rawEvidence.sourceUrls as unknown[]).filter((value): value is string => typeof value === "string")
                      : typeof rawEvidence.pageUrl === "string"
                        ? [rawEvidence.pageUrl]
                        : [],
                    supportingHeadings: Array.isArray(rawEvidence.supportingHeadings)
                      ? (rawEvidence.supportingHeadings as unknown[]).filter((value): value is string => typeof value === "string")
                      : []
                  },
                  negativeEvidenceFlags: Array.isArray(rawEvidence.negativeEvidenceFlags)
                    ? (rawEvidence.negativeEvidenceFlags as unknown[]).filter((value): value is string => typeof value === "string")
                    : [],
                  scanContext: {
                    domain: run.hostname,
                    pageType: typeof rawEvidence.pageType === "string" ? rawEvidence.pageType : null
                  }
                })
              : await validateFindingWithLlm({
                  domain: run.hostname,
                  finding: {
                    category: finding.category,
                    description: finding.description,
                    evidence: rawEvidence,
                    pageUrl: finding.page_url ?? null,
                    ruleKey,
                    severity: finding.severity,
                    title: finding.title
                  },
                  scanEvidence: {
                    pages: scanArtifacts.pages,
                    policyEnrichments: scanArtifacts.policyEnrichments,
                    preconsentViolations: scanArtifacts.preconsentViolations,
                    runtimeArtifacts: scanArtifacts.runtimeArtifacts,
                    snapshot: scanArtifacts.snapshot,
                    trackerVendors: scanArtifacts.trackerVendors
                  }
                });

          await upsertValidationVerdict({
            agreementScore: verdict.agreementScore,
            confidence: verdict.confidence,
            evidence: verdict.evidence,
            model: verdict.model,
            promptVersion: verdict.promptVersion,
            rationale: verdict.rationale,
            validationRunFindingId: String(finding.id),
            verdict: verdict.verdict
          });
        })
      );
    }

    await finalizeValidationRun(validationRunId);
  } catch (error) {
    await failValidationRun(validationRunId, error instanceof Error ? error.message : "Validation verdicting failed.");
    throw error;
  }
}

export async function runValidationSchedulerTick(now = new Date()) {
  const { settings, state } = await getValidationPipelineState();
  if (state !== "running") {
    return {
      createdRunId: null,
      reason: state
    };
  }

  if (settings.run_mode !== "automatic") {
    return {
      createdRunId: null,
      reason: "manual_mode"
    };
  }

  const dueAt = settings.next_due_at ? new Date(settings.next_due_at) : null;
  if (dueAt && dueAt > now) {
    return {
      createdRunId: null,
      reason: "not_due"
    };
  }

  await syncTrancoTargets(false);
  const target = await claimNextAutomaticTarget(now);

  const nextDueAt = new Date(now.getTime() + settings.automatic_interval_minutes * 60_000);
  await markValidationSchedule({
    nextDueAt,
    now
  });

  if (!target) {
    return {
      createdRunId: null,
      reason: "no_eligible_target"
    };
  }

  const run = await createValidationRun({
    hostname: target.hostname,
    normalizedUrl: target.normalized_url,
    rankBand: target.rank_band,
    targetId: target.id,
    trancoRank: target.tranco_rank,
    triggerMode: "automatic"
  });

  await enqueueValidationCollect(run.id);
  return {
    createdRunId: run.id,
    reason: "scheduled"
  };
}

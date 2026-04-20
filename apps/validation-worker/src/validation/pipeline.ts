import { createHash } from "node:crypto";
import {
  SCAN_EVENT_TYPES,
  buildFindingComparisonKey,
  deriveValidationFindingTaxonomy
} from "@website-signal-risk-scanner/shared";
import {
  appendScanWorkflowEvent,
  claimNextAutomaticTarget,
  createScanForValidationRun,
  createValidationRun,
  ensureValidationSettings,
  failValidationRun,
  finalizeValidationRun,
  getValidationPipelineState,
  getValidationRun,
  hasValidationRunForScan,
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

export { buildNanoDocCandidateUrls, selectNanoDocCandidates } from "./nano-document-discovery";

const VALIDATION_SCAN_HANDOFF_POLL_MS = 15_000;
const NANO_DOC_RETRIEVAL_POLL_MS = 5_000;
const MAX_NANO_DOC_RETRIEVAL_POLLS = 20;
const NANO_SIGNAL_ENRICHMENT_POLL_MS = 5_000;
const MAX_NANO_SIGNAL_ENRICHMENT_POLLS = 20;
const NANO_DOCUMENT_EXTRACTION_BATCH_SIZE = 4;
const VALIDATION_VERDICT_BATCH_SIZE = 3;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

export async function deriveUnifiedFindingsWithWorkflowEvents<TFinding>(input: {
  appendEvent?: UnifiedFindingsWorkflowEventAppender;
  deriveFindings: () => TFinding[];
  scanId: string;
}) {
  const appendEvent = input.appendEvent ?? appendScanWorkflowEvent;

  try {
    const findings = input.deriveFindings();

    await appendEvent({
      eventType: SCAN_EVENT_TYPES.unifiedFindingsDerivedCompleted,
      message: "Unified finding derivation completed.",
      metadataJson: {
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

function collapseSingletonRuleFindings<T extends { pageUrl: string | null; ruleKey: string; severity: string }>(findings: T[]) {
  const singletonRuleKeys = new Set<string>([
    "section_review.no_retention_periods_noted",
    "section_review.no_transfer_mechanism_noted",
    "scan_report_review.low_confidence_critical_fields",
    "section_review.low_confidence_critical_fields",
    "section_review.low_extraction_confidence"
  ]);
  const collapsed = new Map<string, T>();

  for (const finding of findings) {
    if (!singletonRuleKeys.has(finding.ruleKey)) {
      const uniqueKey = `${finding.ruleKey}::${finding.pageUrl ?? ""}::${collapsed.size}`;
      collapsed.set(uniqueKey, finding);
      continue;
    }

    const existing = collapsed.get(finding.ruleKey);
    if (!existing) {
      collapsed.set(finding.ruleKey, finding);
      continue;
    }

    const existingWeight = severityWeight(existing.severity);
    const candidateWeight = severityWeight(finding.severity);
    if (candidateWeight > existingWeight) {
      collapsed.set(finding.ruleKey, finding);
      continue;
    }

    if (
      candidateWeight === existingWeight &&
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
    evidence: input.evidence,
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

function classifyFinancialValidationPage(pageType: string | null) {
  const raw = (pageType ?? "").toLowerCase();

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

  return "unknown" as const;
}

type ValidationArtifactBundle = {
  documentSources?: Array<Record<string, unknown>>;
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

  return normalized === "awsalb" || normalized === "awsalbcors";
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
    (!hasRichCookieSemantics && disclosures.length === 0) ||
    (semanticConfidence !== null && semanticConfidence < 0.6) ||
    flags.includes("low_confidence") ||
    flags.includes("llm_provider_error");

  if (structurallyWeak && !hasRichCookieSemantics) {
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
    (!structurallyWeak || hasRichCookieSemantics) &&
    unmatched.length > 0 &&
    !hasStrongCookieCategoryDisclosure({ disclosures, flags, mentionTopics, summaryShort })
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
          policy_category_disclosure_present: hasStrongCookieCategoryDisclosure({
            disclosures,
            flags,
            mentionTopics,
            summaryShort
          }),
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

  if (!preconsentTrackingDetected) {
    return [] as Array<ReturnType<typeof buildRuntimePrivacyFinding>>;
  }

  if (
    thirdPartyCookieCount <= 0 &&
    thirdPartyVendorsBeforeConsent.length === 0 &&
    preconsentViolationVendors.length === 0
  ) {
    return [] as Array<ReturnType<typeof buildRuntimePrivacyFinding>>;
  }

  const severity: "high" | "medium" =
    thirdPartyCookieCount > 0 || thirdPartyVendorsBeforeConsent.length >= 2 || preconsentViolationVendors.length >= 3
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

  return [
    buildRuntimePrivacyFinding({
      description,
      evidence: {
        domain_policy_coverage: domainPolicyCoverage,
        explicit_privacy_controls_disclosed: explicitPrivacyControlsDisclosed,
        initial_cookie_names: initialCookieNames,
        preconsent_tracking_detected: preconsentTrackingDetected,
        preconsent_violation_count: input.preconsentViolations.length,
        preconsent_violation_vendors: attributedPreconsentVendors,
        third_party_cookie_count: thirdPartyCookieCount,
        third_party_request_count: thirdPartyRequestCount,
        third_party_vendors_before_consent: thirdPartyVendorsBeforeConsent,
        total_cookie_count: totalCookieCount,
        total_request_count: Number.isFinite(totalRequestCount) ? totalRequestCount : 0,
        total_tracker_count: totalTrackerCount,
        total_vendor_count: totalVendorCount
      },
      pageUrl: null,
      ruleKey: "runtime_privacy.preconsent_tracking_observed",
      severity,
      title
    })
  ];
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
    const matchedDocumentSourceHasRetentionCue = hasMatchingDocumentSourceRetentionCue({
      documentSources: input.documentSources,
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
      !hasRetentionDisclosureEvidence({ enrichment, retentionPeriods, summaryShort }) &&
      !matchedDocumentSourceHasRetentionCue &&
      !domainPolicyCoverage.hasRetentionDisclosure &&
      !isSupplementalSupportPage
    ) {
      findings.push(
        buildSectionIssueFinding({
          description: "The primary privacy policy did not disclose any concrete retention periods for collected data.",
          evidence: {
            ...baseEvidence,
            domain_policy_coverage: domainPolicyCoverage,
            matched_document_source_retention_cue: matchedDocumentSourceHasRetentionCue,
            policy_retention_periods: retentionPeriods
          },
          pageType,
          pageUrl,
          ruleKey: "section_review.no_retention_periods_noted",
          severity: "medium",
          title: "No retention periods noted in primary privacy policy"
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

function deriveAccessibilitySectionFindings(input: { snapshot: Record<string, unknown> | null }) {
  const snapshot = input.snapshot;
  if (!snapshot) {
    return [];
  }

  const rows = [
    {
      count: getSnapshotNumber(snapshot, "wcag_contrast_failures_count"),
      description: "Contrast failures can make text and controls hard to perceive for low-vision users.",
      ruleKey: "accessibility_review.contrast_failures",
      title: "Contrast failures"
    },
    {
      count: getSnapshotNumber(snapshot, "wcag_missing_alt_count"),
      description: "Missing alt text reduces screen-reader access to informative images.",
      ruleKey: "accessibility_review.missing_alt_text",
      title: "Missing alt text"
    },
    {
      count: getSnapshotNumber(snapshot, "wcag_keyboard_navigation_issue_count") + getSnapshotNumber(snapshot, "wcag_focus_indicator_issue_count"),
      description: "Keyboard and focus issues make navigation harder without a mouse.",
      ruleKey: "accessibility_review.navigation_issues",
      title: "Navigation issues"
    },
    {
      count: getSnapshotNumber(snapshot, "wcag_aria_error_count"),
      description: "ARIA issues can break semantics or assistive-technology interpretation.",
      ruleKey: "accessibility_review.aria_problems",
      title: "ARIA problems"
    },
    {
      count: getSnapshotNumber(snapshot, "wcag_form_label_error_count"),
      description: "Form label issues make inputs less understandable and harder to complete.",
      ruleKey: "accessibility_review.form_label_issues",
      title: "Form label issues"
    }
  ].filter((row) => row.count > 0);

  return rows.map((row) =>
    buildSectionIssueFinding({
      description: row.description,
      evidence: {
        count: row.count
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
      snapshot: input.snapshot
    })
  );

  const deduped = [...new Map(findings.map((finding) => [buildFindingComparisonKey({
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

  return filtered
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
    const canonicalUrl = normalizeDocUrl(fetchedUrl) ?? fetchedUrl;

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

    const html = await response.text();
    const title = extractTitle(html);
    const text = isolateLikelyLegalDocumentText({ html, title });

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
  const priorByTypeAndHash = new Map<string, Record<string, unknown>>();

  for (const row of input.priorExtractions) {
    const canonicalUrl = getString(row.canonical_url) ?? getString(row.canonicalUrl);
    const documentType = getString(row.document_type) ?? getString(row.documentType);
    const contentHash = getDocumentSourceContentHash(row);
    if (!contentHash) {
      continue;
    }

    if (canonicalUrl) {
      const canonicalKey = `${canonicalUrl}::${contentHash}`;
      if (!priorByCanonicalAndHash.has(canonicalKey)) {
        priorByCanonicalAndHash.set(canonicalKey, row);
      }
    }

    if (documentType) {
      const typeKey = `${documentType}::${contentHash}`;
      if (!priorByTypeAndHash.has(typeKey)) {
        priorByTypeAndHash.set(typeKey, row);
      }
    }
  }

  for (const candidate of input.candidates) {
    const candidateId = getString(candidate.id);
    const canonicalUrl = getString(candidate.canonical_url) ?? getString(candidate.canonicalUrl);
    const documentType = getString(candidate.document_type) ?? getString(candidate.documentType);
    const contentHash = getDocumentSourceContentHash(candidate);
    if (!candidateId || !contentHash) {
      continue;
    }

    const match =
      (canonicalUrl ? priorByCanonicalAndHash.get(`${canonicalUrl}::${contentHash}`) : undefined) ??
      (documentType ? priorByTypeAndHash.get(`${documentType}::${contentHash}`) : undefined);
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
  const existingAttemptKeys = new Set(artifacts.existingDocumentSources.flatMap((row) => getNanoDocumentSourceDedupKeys(row)));
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

export async function processNanoSignalEnrichmentJob(input: { pollCount?: number; scanId: string }) {
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
        const extractionRows = await Promise.all(
          batch.map(async (row) => {
            const result = await extractNanoDocumentSourceWithLlm(row);
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
    if (pollCount + 1 < MAX_NANO_SIGNAL_ENRICHMENT_POLLS) {
      await sleep(NANO_SIGNAL_ENRICHMENT_POLL_MS);
      await processNanoSignalEnrichmentJob({ pollCount: pollCount + 1, scanId });
      return;
    }
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
      scanStartedAt: startedAt,
      stage: "nano_doc_signals",
      sourceMode: artifacts.preferDocumentSources === true ? "document_sources" : "policy_enrichment"
    },
    scanId
  }).catch(() => undefined);

  const hasValidationRun = await hasValidationRunForScan(scanId).catch((error) => {
    console.error("[validation-worker] failed to check validation run for scan", {
      error: error instanceof Error ? error.message : String(error),
      scanId
    });
    return true;
  });

  if (!hasValidationRun) {
    await appendScanWorkflowEvent({
      eventType: SCAN_EVENT_TYPES.signalMergeStarted,
      message: "Merged signal derivation started.",
      metadataJson: {
        stage: "signal_merge"
      },
      scanId
    }).catch(() => undefined);

    const refreshedArtifacts = await loadCompletedScanArtifacts(scanId);

    await appendScanWorkflowEvent({
      eventType: SCAN_EVENT_TYPES.signalMergeCompleted,
      message: "Merged signal derivation completed.",
      metadataJson: {
        mergedSignalCount: refreshedArtifacts.mergedSignals.length,
        stage: "signal_merge"
      },
      scanId
    }).catch(() => undefined);

    await appendScanWorkflowEvent({
      eventType: SCAN_EVENT_TYPES.unifiedFindingsDerivedStarted,
      message: "Unified finding derivation started.",
      metadataJson: {
        stage: "unified_findings"
      },
      scanId
    }).catch(() => undefined);
    await deriveUnifiedFindingsWithWorkflowEvents({
      deriveFindings: () => deriveValidationFindings(refreshedArtifacts),
      scanId
    });
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

    await processNanoDocRetrievalJob({
      pollCount: 0,
      scanId
    });

    await processNanoSignalEnrichmentJob({
      pollCount: 0,
      scanId
    });

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

    await appendScanWorkflowEvent({
      eventType: SCAN_EVENT_TYPES.signalMergeStarted,
      message: "Merged signal derivation started.",
      metadataJson: {
        stage: "signal_merge"
      },
      scanId
    }).catch(() => undefined);
    const refreshedArtifacts = await loadCompletedScanArtifacts(scanId);
    await appendScanWorkflowEvent({
      eventType: SCAN_EVENT_TYPES.signalMergeCompleted,
      message: "Merged signal derivation completed.",
      metadataJson: {
        mergedSignalCount: refreshedArtifacts.mergedSignals.length,
        stage: "signal_merge"
      },
      scanId
    }).catch(() => undefined);

    await appendScanWorkflowEvent({
      eventType: SCAN_EVENT_TYPES.unifiedFindingsDerivedStarted,
      message: "Unified finding derivation started.",
      metadataJson: {
        stage: "unified_findings"
      },
      scanId
    }).catch(() => undefined);
    const findings = await deriveUnifiedFindingsWithWorkflowEvents({
      deriveFindings: () => deriveValidationFindings(refreshedArtifacts),
      scanId
    });
    await replaceValidationRunFindings(validationRunId, findings);

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
            ruleKey.startsWith("financial_review.") && typeof rawEvidence.unifiedFindingId === "string"
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

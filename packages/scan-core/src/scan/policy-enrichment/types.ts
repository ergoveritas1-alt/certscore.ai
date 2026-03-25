import type {
  PolicyChildrenReference,
  PolicyDoNotSell,
  PolicyDsarMechanism,
  PolicyEnrichment,
  PolicyEvidence,
  PolicyRetentionDisclosure,
  PrivacyContactChannelType,
  PolicyReviewQueueItem
} from "@website-signal-risk-scanner/shared";
import type { StaticPageResult } from "../snapshot/types";

export type PolicyTopicKey =
  | "gdpr"
  | "ccpa_or_cpra"
  | "session_replay_disclosure"
  | "cross_border_transfer"
  | "data_retention"
  | "sensitive_data"
  | "children";

export type PolicyDataCategory = "email" | "ip" | "payment" | "health" | "biometric" | "location" | "other";

export type PolicyRetentionStatement = {
  category: "account data" | "transaction data" | "logs" | "other";
  confidence: number;
  periodText: string;
  snippet: string | null;
};

export type PolicyTransferMechanismValue = "SCC" | "adequacy" | "contract" | "none";

export type PolicyTransferMechanismItem = {
  confidence: number;
  mechanism: PolicyTransferMechanismValue;
  snippet: string | null;
};

export type PolicyCookieDisclosureItem = {
  confidence: number;
  cookieName: string | null;
  duration: string | null;
  provider: string | null;
  purpose: string | null;
  snippet: string | null;
};

export type PolicyFieldValue<T> = {
  confidence: number;
  snippet: string | null;
  value: T;
};

export type PolicySummaryValue = {
  confidence: number;
  text: string | null;
};

export type PolicyChunkExtraction = {
  arbitrationPresent: PolicyFieldValue<boolean | null>;
  childrenReference: PolicyFieldValue<PolicyChildrenReference | null>;
  dataCategories: Array<PolicyFieldValue<PolicyDataCategory>>;
  dataAccessRequestPresent: PolicyFieldValue<boolean | null>;
  dataDeletionRequestPresent: PolicyFieldValue<boolean | null>;
  doNotSell: PolicyFieldValue<PolicyDoNotSell>;
  dsarMechanism: PolicyFieldValue<PolicyDsarMechanism>;
  effectiveDate: PolicyFieldValue<string | null>;
  governingLaw: PolicyFieldValue<string | null>;
  mentionsGdpr: PolicyFieldValue<boolean | null>;
  policyClaimNoSale: PolicyFieldValue<boolean | null>;
  policyClaimNoTracking: PolicyFieldValue<boolean | null>;
  policyClaimPrivacyProtective: PolicyFieldValue<boolean | null>;
  privacyContactChannelType: PolicyFieldValue<PrivacyContactChannelType | null>;
  retentionStatements: PolicyRetentionStatement[];
  retentionDisclosure: PolicyFieldValue<PolicyRetentionDisclosure | null>;
  summary: PolicySummaryValue;
  transferMechanisms: PolicyTransferMechanismItem[];
};

export type PolicyChunk = {
  chunkId: string;
  offsetEnd: number;
  offsetStart: number;
  text: string;
};

export type PolicyChunkSelection = {
  reason: string;
  score: number;
} & PolicyChunk;

export type PolicyLlmChunkDiagnostic = {
  attemptCount: number;
  chunkId: string;
  failureCode: "empty_response" | "invalid_json" | "provider_error" | "timeout" | null;
  failureDetail: string | null;
  rawPreview: string | null;
  rawLength: number | null;
  score: number;
  selectedReason: string;
  success: boolean;
};

export type PolicyRulePreprocessResult = {
  actionableFlags: string[];
  arbitrationPresent: boolean | null;
  cancellationOrRefundPresent: boolean | null;
  childrenReference: PolicyChildrenReference;
  cookieDisclosures?: PolicyCookieDisclosureItem[];
  dataCategories: string[];
  dataAccessRequestPresent: boolean;
  dataDeletionRequestPresent: boolean;
  doNotSell: PolicyDoNotSell;
  dsarMechanism: PolicyDsarMechanism;
  evidenceSnippets: Record<string, string>;
  governingLaw: string | null;
  mentions: Array<{ confidence: number; topic: PolicyTopicKey }>;
  needLlm: boolean;
  normalizedPolicyHash: string;
  normalizedText: string;
  noticeContactPresent: boolean | null;
  policyClaimNoSale: boolean | null;
  policyClaimNoTracking: boolean | null;
  policyClaimPrivacyProtective: boolean | null;
  privacyContactChannelType: PrivacyContactChannelType | null;
  retentionStatements: PolicyRetentionStatement[];
  retentionDisclosure: PolicyRetentionDisclosure | null;
  semanticConfidence: number;
  summary: string | null;
  terminationOrSuspensionPresent: boolean | null;
  transferMechanisms: PolicyTransferMechanismItem[];
  updateDate: string | null;
};

export type PolicyLlmClient = {
  extractPolicyChunk(input: {
    chunk: PolicyChunk;
    promptName: string;
    promptText: string;
  }): Promise<{
    model: string;
    modelVersion: string;
    promptVersion: string;
    rawJson: string;
  }>;
};

export type EnrichPolicyPagesInput = {
  advertisingTrackerCount: number;
  allowLlm?: boolean;
  archiveSource?: string | null;
  californiaExposureLikely: boolean;
  domainId: string;
  euExposureLikely: boolean;
  forceLlm?: boolean;
  llmTriggerReasons?: string[];
  organizationId: string | null;
  pages: StaticPageResult[];
  scanId: string;
  sessionReplayTrackerCount: number;
};

export type PolicyEnrichmentBundle = {
  diagnostics: Array<{
    chunkDiagnostics: PolicyLlmChunkDiagnostic[];
    pageType: StaticPageResult["pageType"];
    pageUrl: string;
    selectedChunkCount: number;
    totalChunkCount: number;
  }>;
  evidences: PolicyEvidence[];
  enrichments: PolicyEnrichment[];
  primaryPolicyEnrichmentId: string | null;
  reviewQueueItems: PolicyReviewQueueItem[];
  snapshotOverrides: {
    dsarRequestMechanismPresent?: boolean;
    dataAccessRequestPresent?: boolean;
    dataDeletionRequestPresent?: boolean;
    mentionsCrossBorderTransfer?: boolean;
    mentionsGdpr?: boolean;
    mentionsDataRetention?: boolean;
    dataRetentionSpecificPeriodDetected?: boolean;
    mentionsSensitiveData?: boolean;
    mentionsHealthData?: boolean;
    mentionsBiometricData?: boolean;
    mentionsFinancialData?: boolean;
    mentionsUnder13?: boolean;
    mentionsUnder16?: boolean;
    privacyContactChannelType?: PrivacyContactChannelType;
    policyBehaviorConflictDetected?: boolean | null;
    policyEnrichmentId?: string | null;
    privacyPolicyHash?: string | null;
    privacyPolicyLastUpdatedDate?: string | null;
    privacyPolicyLastUpdatedFound?: string | null;
    sessionReplayWithoutDisclosureDetected?: boolean | null;
  };
};

export type MergedPolicyExtraction = {
  policyActionableFlags: string[];
  policyAmbiguityScore: number | null;
  policyArbitrationPresent: boolean | null;
  policyCancellationOrRefundPresent: boolean | null;
  policyChildrenReference: PolicyChildrenReference;
  policyCookieDisclosures?: Array<{
    confidence: number;
    cookieName: string | null;
    duration: string | null;
    provider: string | null;
    purpose: string | null;
    snippetHash: string | null;
  }>;
  policyEffectiveDate: string | null;
  policyFieldCoverage: Record<string, { confidence: number | null; found: boolean; snippetKey: string | null }>;
  policyCoverageRatio: number | null;
  policyGoverningLaw: string | null;
  policyNoticeContactPresent: boolean | null;
  policySnippetCount: number | null;
  policyStructurallyWeak: boolean | null;
  privacyContactChannelType: PrivacyContactChannelType | null;
  policyRetentionDisclosure: PolicyRetentionDisclosure | null;
  policyClaimNoSale: boolean | null;
  policyClaimNoTracking: boolean | null;
  policyClaimPrivacyProtective: boolean | null;
  policyDataCategories: string[];
  dataAccessRequestPresent: boolean;
  dataDeletionRequestPresent: boolean;
  policyDoNotSell: PolicyDoNotSell;
  policyDoNotSellConfidence: number | null;
  policyDsarConfidence: number | null;
  policyDsarMechanism: PolicyDsarMechanism;
  policyMentions: Array<{ confidence: number; topic: string }>;
  policyRetentionPeriods: Array<{ category: string; confidence: number; periodText: string; snippetHash: string | null }>;
  policySemanticConfidence: number | null;
  policySubprocessorsListed: boolean | null;
  policySummaryShort: string | null;
  policyTerminationOrSuspensionPresent: boolean | null;
  policyTransferMechanisms: Array<{ confidence: number; mechanism: string; snippetHash: string | null }>;
};

export type PolicyPageType = StaticPageResult["pageType"];

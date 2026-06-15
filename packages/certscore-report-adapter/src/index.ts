import type {
  ArtifactRef,
  CanonicalEvidenceBundle,
  CoverageLimitation,
  DirectVsInferred,
  DisplaySafeEvidenceExcerpt,
  EvidenceRef,
  FindingCandidate,
  FindingEligibilityResult,
  NormalizedVendorObservation,
  ReviewResult,
  ScanModuleRun,
} from "@certscore/contracts";
import { sanitizeEvidenceRefs } from "./source-ref-sanitization";

export const V2_REPORT_PROJECTION_DRAFT_VERSION =
  "certscore.v2.report_projection_draft.1";

export const DEFAULT_MAX_DISPLAY_SAFE_EXCERPTS_PER_ROW = 72;
export const DEFAULT_MAX_DISPLAY_SAFE_EXCERPT_GROUPS_PER_ROW = 72;
export const DEFAULT_MAX_DISPLAY_SAFE_EXCERPTS_PER_GROUP = 2;

export type V2ProjectionStatus =
  | "observed"
  | "review_signal"
  | "checked"
  | "not_observed"
  | "not_testable"
  | "coverage_limitation"
  | "assisted_candidate";

export type V2ProjectionTone = "neutral" | "review" | "warning" | "muted";

export type V2ConfidenceBand = "high" | "medium" | "low";

export type V2FindingCategory =
  | "runtime"
  | "policy_surface"
  | "consent_flow";

export type V2SafeVendorRef = Pick<
  NormalizedVendorObservation,
  "observationId" | "entity" | "vendor" | "product" | "purpose" | "confidence" | "basis" | "regulatoryRelevance"
>;

export type V2ModuleRunContext = Pick<
  ScanModuleRun,
  "moduleName" | "status" | "durationMs"
> & {
  errorCount: number;
};

export type V2EvidencePacket = {
  evidenceExcerptIds: string[];
  sourceEvidenceRefs: EvidenceRef[];
  displaySafeExcerpts: DisplaySafeEvidenceExcerpt[];
  displaySafeExcerptStats: {
    originalCount: number;
    projectedCount: number;
    omittedCount: number;
    maxPerRow: number;
    capped: boolean;
    deduped: boolean;
    representativeGroupKeys: string[];
  };
  artifactRefs: ArtifactRef[];
  relatedVendors: V2SafeVendorRef[];
  moduleRunContext: V2ModuleRunContext[];
  limitations: CoverageLimitation[];
  redactionPolicy: "display_safe_excerpts_only";
};

export type V2ReportProjectionRow = {
  findingKey: string;
  title: string;
  category: V2FindingCategory;
  status: V2ProjectionStatus;
  statusLabel: string;
  tone: V2ProjectionTone;
  eligibility: FindingEligibilityResult;
  confidence: number;
  confidenceBand: V2ConfidenceBand;
  directVsInferred: DirectVsInferred;
  sourceModulesRequired: string[];
  sourceModulesPresent: string[];
  coverageLimitations: CoverageLimitation[];
  matchedCriteria: string[];
  missingCorroborators: string[];
  demotionReasons: string[];
  relatedVendors: V2SafeVendorRef[];
  evidenceExcerptIds: string[];
  sourceEvidenceRefs: EvidenceRef[];
  evidencePacket: V2EvidencePacket;
};

export type V2Wc01CompatibleAssessmentStatus =
  | "checked"
  | "review_signal"
  | "coverage_limitation"
  | "not_applicable";

export type V2Wc01CompatibleRowDraft = {
  rowId: string;
  sourceFindingKey: string;
  assessmentStatus: V2Wc01CompatibleAssessmentStatus;
  status: Exclude<V2ProjectionStatus, "coverage_limitation" | "assisted_candidate"> | "not_testable";
  statusLabel: string;
  tone: V2ProjectionTone;
  evidenceRefs: string[];
  regulatoryFamilies: string[];
  retainedEvidence: {
    projectionStatus: V2ProjectionStatus;
    findingKey: string;
    evidenceExcerptIds: string[];
    sourceEvidenceRefIds: string[];
    coverageLimitationKeys: string[];
    matchedCriteria: string[];
    missingCorroborators: string[];
    demotionReasons: string[];
    relatedVendors: V2SafeVendorRef[];
  };
};

export type V2ReportProjectionDraft = {
  projectionVersion: typeof V2_REPORT_PROJECTION_DRAFT_VERSION;
  generatedAt: string;
  sourceReviewId: string;
  scanId: string;
  url: string;
  reviewedAt: string;
  sourceBundleSchemaVersion: string;
  rows: V2ReportProjectionRow[];
  wc01CompatibleRows: V2Wc01CompatibleRowDraft[];
  coverageLimitations: CoverageLimitation[];
  moduleRunContext: V2ModuleRunContext[];
  notes: string[];
};

export {
  areaToBetaChecklistArea,
  regulatoryReviewToProductionChecklistModel,
  regulatoryReviewToBetaChecklistAreas,
  type V2CaliforniaPrivacyChecklistItem,
  type V2GdprEprivacyChecklistItem,
  type V2RegulatoryChecklistDebugConfidence,
  type V2RegulatoryReviewChecklistModel,
} from "./regulatory-review-beta-adapter";

export {
  buildWc01V2ProductSurfaceProposalDraft,
  buildWc01V2ProductSurfaceProposalDraftJson,
  failClosedReasonsForInput,
  parseWc01V2ProductSurfaceProposalInputJson,
  WC01_V2_PRODUCT_SURFACE_PROPOSAL_DRAFT_VERSION,
  WC01_V2_PRODUCT_SURFACE_PROPOSAL_INPUT_VERSION,
  type Wc01V2ProductSurfaceClass,
  type Wc01V2ProductSurfaceCopyPosture,
  type Wc01V2ProductSurfaceProposalDraft,
  type Wc01V2ProductSurfaceProposalInput,
} from "./wc01-v2-product-surface-proposal-draft";
export {
  buildWc01V2ProductSurfaceProposalDraftSummary,
  generateWc01V2ProductSurfaceProposalDraftSingleFromFile,
  renderWc01V2ProductSurfaceProposalDraftMarkdown,
  type Wc01V2ProductSurfaceProposalDraftSummary,
} from "./wc01-v2-product-surface-proposal-draft-output";
export {
  buildWc01V2ProductionReadinessGateDraft,
  buildWc01V2ProductionReadinessGateDraftJson,
  failClosedReasonsForProductionReadinessGateInput,
  parseWc01V2ProductionReadinessGateInputJson,
  WC01_V2_PRODUCTION_READINESS_GATE_DRAFT_VERSION,
  WC01_V2_PRODUCTION_READINESS_GATE_INPUT_VERSION,
  type Wc01V2ProductionReadinessAllowedNextStep,
  type Wc01V2ProductionReadinessGateDecision,
  type Wc01V2ProductionReadinessGateDraft,
  type Wc01V2ProductionReadinessGateInput,
  type Wc01V2ProductionReadinessGateName,
  type Wc01V2ProductionReadinessGateOutcome,
  type Wc01V2ProductionReadinessGateResult,
} from "./wc01-v2-production-readiness-gate-draft";
export {
  buildWc01V2ProductionReadinessGateDraftSummary,
  generateWc01V2ProductionReadinessGateDraftSingleFromFile,
  renderWc01V2ProductionReadinessGateDraftMarkdown,
  type Wc01V2ProductionReadinessGateDraftSummary,
} from "./wc01-v2-production-readiness-gate-draft-output";
export {
  buildWc01V2PolicyCopyReviewArtifact,
  buildWc01V2PolicyCopyReviewArtifactJson,
  failClosedReasonsForPolicyCopyReviewInput,
  parseWc01V2PolicyCopyReviewInputJson,
  WC01_V2_POLICY_COPY_REVIEW_ARTIFACT_VERSION,
  WC01_V2_POLICY_COPY_REVIEW_INPUT_VERSION,
  type Wc01V2PolicyCopyAllowedNextStep,
  type Wc01V2PolicyCopyDecision,
  type Wc01V2PolicyCopyOutcome,
  type Wc01V2PolicyCopyOwner,
  type Wc01V2PolicyCopyReviewArtifact,
  type Wc01V2PolicyCopyReviewInput,
  type Wc01V2SensitiveContextCategory,
} from "./wc01-v2-policy-copy-review-artifact";
export {
  buildWc01V2PolicyCopyReviewArtifactSummary,
  generateWc01V2PolicyCopyReviewArtifactSingleFromFile,
  renderWc01V2PolicyCopyReviewArtifactMarkdown,
  type Wc01V2PolicyCopyReviewArtifactSummary,
} from "./wc01-v2-policy-copy-review-artifact-output";
export {
  generateWc01V2PostRejectCalibrationReport,
  generateWc01V2PostRejectCalibrationReportFromFile,
  parseWc01V2PostRejectCalibrationManifestJson,
  renderWc01V2PostRejectCalibrationMarkdown,
  WC01_V2_POST_REJECT_CALIBRATION_VERSION,
  type Wc01V2PostRejectActual,
  type Wc01V2PostRejectCalibrationManifest,
  type Wc01V2PostRejectCalibrationReport,
  type Wc01V2PostRejectCalibrationSiteExpectation,
  type Wc01V2PostRejectCalibrationSiteResult,
  type Wc01V2PostRejectCalibrationSummary,
  type Wc01V2PostRejectExpectedOutcome,
  type Wc01V2PostRejectExpectedRejectAction,
} from "./wc01-v2-post-reject-calibration";
export {
  buildWc01V2NormalizedConcernDraftMapping,
  buildWc01V2NormalizedConcernDraftMappingJson,
  failClosedReasonsForCandidate,
  parseWc01V2NormalizedConcernDraftMappingInputJson,
  WC01_V2_NORMALIZED_CONCERN_DRAFT_MAPPING_INPUT_VERSION,
  WC01_V2_NORMALIZED_CONCERN_DRAFT_MAPPING_VERSION,
  type Wc01V2NormalizedConcernClosedDefaultFlags,
  type Wc01V2NormalizedConcernDraft,
  type Wc01V2NormalizedConcernDraftBlockedMapping,
  type Wc01V2NormalizedConcernDraftMapping,
  type Wc01V2NormalizedConcernDraftMappingCandidateInput,
  type Wc01V2NormalizedConcernDraftMappingFamily,
  type Wc01V2NormalizedConcernDraftMappingInput,
  type Wc01V2NormalizedConcernDraftSourceArtifactKind,
} from "./wc01-v2-normalized-concern-draft-mapping";
export {
  buildWc01V2NormalizedConcernDraftMappingSummary,
  generateWc01V2NormalizedConcernDraftMappingSingleFromFile,
  renderWc01V2NormalizedConcernDraftMappingMarkdown,
  type Wc01V2NormalizedConcernDraftMappingSummary,
} from "./wc01-v2-normalized-concern-draft-mapping-output";
export {
  buildWc01V2ProductionIntegrationCandidateArtifact,
  buildWc01V2ProductionIntegrationCandidateArtifactJson,
  failClosedReasonsForDraft,
  parseWc01V2NormalizedConcernDraftMappingArtifactJson,
  WC01_V2_PRODUCTION_INTEGRATION_CANDIDATE_VERSION,
  type Wc01V2ProductionIntegrationBlockedCandidate,
  type Wc01V2ProductionIntegrationCandidate,
  type Wc01V2ProductionIntegrationCandidateArtifact,
  type Wc01V2ProductionIntegrationClosedDefaultFlags,
} from "./wc01-v2-production-integration-candidate";
export {
  buildWc01V2ProductionIntegrationCandidateSummary,
  generateWc01V2ProductionIntegrationCandidateSingleFromFile,
  renderWc01V2ProductionIntegrationCandidateMarkdown,
  type Wc01V2ProductionIntegrationCandidateSummary,
} from "./wc01-v2-production-integration-candidate-output";
export {
  buildWc01V2NormalizedConcernSchemaComparison,
  buildWc01V2NormalizedConcernSchemaComparisonJson,
  failClosedReasonsForCandidate as failClosedReasonsForSchemaComparisonCandidate,
  parseWc01V2ProductionIntegrationCandidateForSchemaComparisonJson,
  WC01_NORMALIZED_CONCERN_SCHEMA_REFERENCE_FIELDS,
  WC01_V2_NORMALIZED_CONCERN_SCHEMA_COMPARISON_VERSION,
  type Wc01V2NormalizedConcernSchemaClosedDefaultFlags,
  type Wc01V2NormalizedConcernSchemaComparison,
  type Wc01V2NormalizedConcernSchemaFieldMapping,
  type Wc01V2NormalizedConcernSchemaRequirementCoverage,
  type Wc01V2SchemaReadiness,
} from "./wc01-v2-normalized-concern-schema-comparison";
export {
  buildWc01V2NormalizedConcernSchemaComparisonSummary,
  generateWc01V2NormalizedConcernSchemaComparisonSingleFromFile,
  renderWc01V2NormalizedConcernSchemaComparisonMarkdown,
  type Wc01V2NormalizedConcernSchemaComparisonSummary,
} from "./wc01-v2-normalized-concern-schema-comparison-output";
export {
  buildWc01V2ConcernPolicyShapeComparison,
  buildWc01V2ConcernPolicyShapeComparisonJson,
  failClosedReasonsForFamilyPolicyShape,
  parseWc01V2NormalizedConcernSchemaComparisonForPolicyShapeJson,
  WC01_V2_CONCERN_POLICY_SHAPE_COMPARISON_VERSION,
  type Wc01V2ConcernPolicyEvidenceGateCoverage,
  type Wc01V2ConcernPolicyGateComparison,
  type Wc01V2ConcernPolicyInputRequirement,
  type Wc01V2ConcernPolicyShapeClosedDefaultFlags,
  type Wc01V2ConcernPolicyShapeComparison,
  type Wc01V2ConcernPolicyShapeReadiness,
} from "./wc01-v2-concern-policy-shape-comparison";
export {
  buildWc01V2ConcernPolicyShapeComparisonSummary,
  generateWc01V2ConcernPolicyShapeComparisonSingleFromFile,
  renderWc01V2ConcernPolicyShapeComparisonMarkdown,
  type Wc01V2ConcernPolicyShapeComparisonSummary,
} from "./wc01-v2-concern-policy-shape-comparison-output";
export {
  buildWc01V2ProjectionShapeComparison,
  buildWc01V2ProjectionShapeComparisonJson,
  failClosedReasonsForProjectionFamily,
  parseWc01V2ConcernPolicyShapeComparisonForProjectionShapeJson,
  WC01_V2_PROJECTION_SHAPE_COMPARISON_VERSION,
  type Wc01V2ProjectionEvidencePacketCoverage,
  type Wc01V2ProjectionGateComparison,
  type Wc01V2ProjectionInputRequirement,
  type Wc01V2ProjectionShapeClosedDefaultFlags,
  type Wc01V2ProjectionShapeComparison,
  type Wc01V2ProjectionShapeReadiness,
} from "./wc01-v2-projection-shape-comparison";
export {
  buildWc01V2ProjectionShapeComparisonSummary,
  generateWc01V2ProjectionShapeComparisonSingleFromFile,
  renderWc01V2ProjectionShapeComparisonMarkdown,
  type Wc01V2ProjectionShapeComparisonSummary,
} from "./wc01-v2-projection-shape-comparison-output";
export {
  buildWc01V2LimitedAdminPreviewApprovalMetadata,
  buildWc01V2LimitedAdminPreviewApprovalMetadataJson,
  failClosedReasonsForProjectionShape,
  parseWc01V2ProjectionShapeComparisonForApprovalMetadataJson,
  WC01_V2_LIMITED_ADMIN_PREVIEW_APPROVAL_METADATA_VERSION,
  type Wc01V2LimitedAdminPreviewApprovalMetadata,
  type Wc01V2LimitedAdminPreviewOwnerApproval,
} from "./wc01-v2-limited-admin-preview-approval-metadata";
export {
  buildWc01V2LimitedAdminPreviewApprovalMetadataSummary,
  generateWc01V2LimitedAdminPreviewApprovalMetadataSingleFromFile,
  renderWc01V2LimitedAdminPreviewApprovalMetadataMarkdown,
  type Wc01V2LimitedAdminPreviewApprovalMetadataSummary,
} from "./wc01-v2-limited-admin-preview-approval-metadata-output";
export {
  buildWc01V2LimitedAdminPreviewImplementationProposalDraft,
  buildWc01V2LimitedAdminPreviewImplementationProposalDraftJson,
  failClosedReasonsForLimitedAdminPreviewImplementationProposal,
  parseWc01V2LimitedAdminPreviewApprovalMetadataForImplementationProposalJson,
  parseWc01V2ProductSurfaceProposalDraftForLimitedAdminPreviewJson,
  WC01_V2_LIMITED_ADMIN_PREVIEW_IMPLEMENTATION_PROPOSAL_VERSION,
  type Wc01V2LimitedAdminPreviewImplementationProposalDraft,
} from "./wc01-v2-limited-admin-preview-implementation-proposal";
export {
  buildWc01V2LimitedAdminPreviewImplementationProposalSummary,
  generateWc01V2LimitedAdminPreviewImplementationProposalSingleFromFile,
  renderWc01V2LimitedAdminPreviewImplementationProposalMarkdown,
  type Wc01V2LimitedAdminPreviewImplementationProposalSummary,
} from "./wc01-v2-limited-admin-preview-implementation-proposal-output";

type ProjectionInput = {
  review: ReviewResult;
  bundle?: CanonicalEvidenceBundle;
  generatedAt?: string;
  maxDisplaySafeExcerptGroupsPerRow?: number;
  maxDisplaySafeExcerptsPerRow?: number;
  maxDisplaySafeExcerptsPerGroup?: number;
};

type FindingMapping = {
  category: V2FindingCategory;
  wc01RowId: string;
  regulatoryFamilies: string[];
  reviewSignalOnly?: boolean;
  notEligibleStatus: "checked" | "not_observed" | "not_testable";
};

const REVIEW_SIGNAL_ONLY_FINDING_KEYS = new Set([
  "unresolved_collection_endpoint_review_signal",
  "policy_runtime_vendor_alignment_review_signal",
  "targeted_advertising_runtime_signal",
  "accept_reject_runtime_delta_observed",
  "tracking_after_refusal_review_signal",
  "reject_did_not_reduce_tracking_review_signal",
  "post_opt_out_targeted_advertising_behavior_signal",
  "vendors_persist_after_reject_review_signal",
  "vendors_appear_only_after_accept_review_signal",
  "cookies_persist_after_reject_review_signal",
]);

const FINDING_MAPPINGS: Record<string, FindingMapping> = {
  third_party_vendors_observed: {
    category: "runtime",
    wc01RowId: "runtime_vendor_observations",
    regulatoryFamilies: ["ccpa_cpra", "gdpr_eprivacy"],
    notEligibleStatus: "checked",
  },
  pre_consent_tracking_detected: {
    category: "runtime",
    wc01RowId: "pre_consent_tracking",
    regulatoryFamilies: ["ccpa_cpra", "gdpr_eprivacy"],
    notEligibleStatus: "checked",
  },
  targeted_advertising_runtime_signal: {
    category: "runtime",
    wc01RowId: "targeted_advertising_signals",
    regulatoryFamilies: ["ccpa_cpra"],
    reviewSignalOnly: true,
    notEligibleStatus: "not_observed",
  },
  third_party_cookie_pre_consent: {
    category: "runtime",
    wc01RowId: "pre_consent_cookies_storage",
    regulatoryFamilies: ["gdpr_eprivacy"],
    notEligibleStatus: "checked",
  },
  non_essential_storage_pre_consent: {
    category: "runtime",
    wc01RowId: "pre_consent_cookies_storage",
    regulatoryFamilies: ["gdpr_eprivacy"],
    notEligibleStatus: "checked",
  },
  vendor_associated_cookie_pre_consent: {
    category: "runtime",
    wc01RowId: "vendor_associated_cookie_pre_consent",
    regulatoryFamilies: ["ccpa_cpra", "gdpr_eprivacy"],
    notEligibleStatus: "checked",
  },
  session_replay_or_behavioral_analytics_observed: {
    category: "runtime",
    wc01RowId: "session_replay_or_behavioral_analytics",
    regulatoryFamilies: ["ccpa_cpra", "gdpr_eprivacy", "cipa"],
    notEligibleStatus: "checked",
  },
  unresolved_collection_endpoint_review_signal: {
    category: "runtime",
    wc01RowId: "unresolved_collection_endpoint_review",
    regulatoryFamilies: ["ccpa_cpra", "gdpr_eprivacy"],
    reviewSignalOnly: true,
    notEligibleStatus: "checked",
  },
  privacy_notice_observed_or_not_observed: {
    category: "policy_surface",
    wc01RowId: "privacy_notice_availability",
    regulatoryFamilies: ["ccpa_cpra", "gdpr_eprivacy"],
    notEligibleStatus: "not_observed",
  },
  cookie_policy_observed_or_not_observed: {
    category: "policy_surface",
    wc01RowId: "cookie_notice_availability",
    regulatoryFamilies: ["gdpr_eprivacy"],
    notEligibleStatus: "not_observed",
  },
  privacy_choices_link_observed: {
    category: "policy_surface",
    wc01RowId: "privacy_choices_availability",
    regulatoryFamilies: ["ccpa_cpra", "gdpr_eprivacy"],
    notEligibleStatus: "not_observed",
  },
  do_not_sell_or_share_link_observed: {
    category: "policy_surface",
    wc01RowId: "do_not_sell_share_availability",
    regulatoryFamilies: ["ccpa_cpra"],
    notEligibleStatus: "not_observed",
  },
  gpc_disclosure_observed: {
    category: "policy_surface",
    wc01RowId: "gpc_disclosure",
    regulatoryFamilies: ["ccpa_cpra"],
    notEligibleStatus: "not_observed",
  },
  notice_at_collection_observed: {
    category: "policy_surface",
    wc01RowId: "notice_at_collection",
    regulatoryFamilies: ["ccpa_cpra"],
    notEligibleStatus: "not_observed",
  },
  policy_vendor_mentions_observed: {
    category: "policy_surface",
    wc01RowId: "policy_vendor_mentions",
    regulatoryFamilies: ["ccpa_cpra", "gdpr_eprivacy"],
    notEligibleStatus: "not_observed",
  },
  policy_runtime_vendor_alignment_review_signal: {
    category: "policy_surface",
    wc01RowId: "policy_runtime_vendor_alignment_review",
    regulatoryFamilies: ["ccpa_cpra", "gdpr_eprivacy"],
    reviewSignalOnly: true,
    notEligibleStatus: "checked",
  },
  ai_disclosure_observed_or_not_observed: {
    category: "policy_surface",
    wc01RowId: "ai_disclosure",
    regulatoryFamilies: ["ai_transparency"],
    notEligibleStatus: "not_observed",
  },
  accept_control_observed_or_not_observed: {
    category: "consent_flow",
    wc01RowId: "accept_control_availability",
    regulatoryFamilies: ["gdpr_eprivacy"],
    notEligibleStatus: "not_observed",
  },
  reject_control_observed_or_not_observed: {
    category: "consent_flow",
    wc01RowId: "reject_control_availability",
    regulatoryFamilies: ["gdpr_eprivacy", "ccpa_cpra"],
    notEligibleStatus: "not_observed",
  },
  accept_action_succeeded_or_not_testable: {
    category: "consent_flow",
    wc01RowId: "accept_action_testability",
    regulatoryFamilies: ["gdpr_eprivacy"],
    notEligibleStatus: "not_testable",
  },
  reject_action_succeeded_or_not_testable: {
    category: "consent_flow",
    wc01RowId: "reject_action_testability",
    regulatoryFamilies: ["gdpr_eprivacy", "ccpa_cpra"],
    notEligibleStatus: "not_testable",
  },
  accept_reject_runtime_delta_observed: {
    category: "consent_flow",
    wc01RowId: "accept_reject_runtime_delta_review",
    regulatoryFamilies: ["gdpr_eprivacy", "ccpa_cpra"],
    reviewSignalOnly: true,
    notEligibleStatus: "checked",
  },
  tracking_after_refusal_review_signal: {
    category: "consent_flow",
    wc01RowId: "tracking_after_refusal_review",
    regulatoryFamilies: ["gdpr_eprivacy", "ccpa_cpra"],
    reviewSignalOnly: true,
    notEligibleStatus: "checked",
  },
  reject_did_not_reduce_tracking_review_signal: {
    category: "consent_flow",
    wc01RowId: "reject_did_not_reduce_tracking_review",
    regulatoryFamilies: ["gdpr_eprivacy", "ccpa_cpra"],
    reviewSignalOnly: true,
    notEligibleStatus: "checked",
  },
  post_opt_out_targeted_advertising_behavior_signal: {
    category: "consent_flow",
    wc01RowId: "post_opt_out_tracking_behavior",
    regulatoryFamilies: ["ccpa_cpra"],
    reviewSignalOnly: true,
    notEligibleStatus: "not_testable",
  },
  vendors_persist_after_reject_review_signal: {
    category: "consent_flow",
    wc01RowId: "vendors_persist_after_reject_review",
    regulatoryFamilies: ["gdpr_eprivacy", "ccpa_cpra"],
    reviewSignalOnly: true,
    notEligibleStatus: "checked",
  },
  vendors_appear_only_after_accept_review_signal: {
    category: "consent_flow",
    wc01RowId: "vendors_appear_only_after_accept_review",
    regulatoryFamilies: ["gdpr_eprivacy", "ccpa_cpra"],
    reviewSignalOnly: true,
    notEligibleStatus: "checked",
  },
  cookies_persist_after_reject_review_signal: {
    category: "consent_flow",
    wc01RowId: "cookies_persist_after_reject_review",
    regulatoryFamilies: ["gdpr_eprivacy", "ccpa_cpra"],
    reviewSignalOnly: true,
    notEligibleStatus: "checked",
  },
};

const STATUS_LABELS: Record<V2ProjectionStatus, string> = {
  observed: "Observed",
  review_signal: "Review signal",
  checked: "Checked",
  not_observed: "Not observed",
  not_testable: "Not testable",
  coverage_limitation: "Coverage limitation",
  assisted_candidate: "Assisted candidate",
};

export function projectReviewResultToV2ReportDraft(
  input: ProjectionInput,
): V2ReportProjectionDraft {
  const moduleRunContext = buildModuleRunContext(input.bundle);
  const excerptsById = new Map(
    input.review.evidenceExcerpts.map((excerpt) => [excerpt.excerptId, excerpt]),
  );
  const rows = input.review.findingCandidates.map((candidate) =>
    projectFindingCandidate({
      candidate,
      review: input.review,
      moduleRunContext,
      excerptsById,
      maxDisplaySafeExcerptsPerRow:
        input.maxDisplaySafeExcerptsPerRow ?? DEFAULT_MAX_DISPLAY_SAFE_EXCERPTS_PER_ROW,
      maxDisplaySafeExcerptGroupsPerRow:
        input.maxDisplaySafeExcerptGroupsPerRow ?? DEFAULT_MAX_DISPLAY_SAFE_EXCERPT_GROUPS_PER_ROW,
      maxDisplaySafeExcerptsPerGroup:
        input.maxDisplaySafeExcerptsPerGroup ?? DEFAULT_MAX_DISPLAY_SAFE_EXCERPTS_PER_GROUP,
    }),
  );

  return {
    projectionVersion: V2_REPORT_PROJECTION_DRAFT_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    sourceReviewId: input.review.reviewId,
    scanId: input.review.scanId,
    url: input.review.url,
    reviewedAt: input.review.reviewedAt,
    sourceBundleSchemaVersion: input.review.sourceBundleSchemaVersion,
    rows,
    wc01CompatibleRows: rows.map(toWc01CompatibleRowDraft),
    coverageLimitations: input.review.coverageLimitations,
    moduleRunContext,
    notes: [
      "Internal v2 adapter draft only. Not integrated with production report UI.",
      "Projection preserves review signals and coverage limitations; it does not emit legal conclusions.",
      "Evidence packets include display-safe excerpts only and intentionally exclude raw runtime events.",
    ],
  };
}

function projectFindingCandidate(input: {
  candidate: FindingCandidate;
  review: ReviewResult;
  moduleRunContext: V2ModuleRunContext[];
  excerptsById: Map<string, DisplaySafeEvidenceExcerpt>;
  maxDisplaySafeExcerptGroupsPerRow: number;
  maxDisplaySafeExcerptsPerRow: number;
  maxDisplaySafeExcerptsPerGroup: number;
}): V2ReportProjectionRow {
  const mapping = mappingForCandidate(input.candidate);
  const coverageLimitations = coverageLimitationsForCandidate(
    input.candidate,
    input.review.coverageLimitations,
    input.moduleRunContext,
  );
  const status = determineProjectionStatus(input.candidate, mapping, coverageLimitations);
  const allDisplaySafeExcerpts = input.candidate.evidenceExcerptIds
    .map((excerptId) => input.excerptsById.get(excerptId))
    .filter((excerpt): excerpt is DisplaySafeEvidenceExcerpt => Boolean(excerpt));
  const excerptSelection = selectRepresentativeDisplaySafeExcerpts(
    allDisplaySafeExcerpts,
    {
      maxGroupsPerRow: input.maxDisplaySafeExcerptGroupsPerRow,
      maxPerGroup: input.maxDisplaySafeExcerptsPerGroup,
      maxPerRow: input.maxDisplaySafeExcerptsPerRow,
    },
  );
  const displaySafeExcerpts = excerptSelection.excerpts;
  const artifactRefs = uniqueArtifacts(
    displaySafeExcerpts.flatMap((excerpt) => excerpt.artifactRefs),
  );
  const relatedVendors = safeVendorRefs(input.candidate.relatedVendors);
  const sourceEvidenceRefs = sanitizeEvidenceRefs(input.candidate.sourceEvidenceRefs);
  const retainedSourceEvidenceRefs = retainSourceEvidenceRefsForExcerpts(
    sourceEvidenceRefs,
    displaySafeExcerpts,
  );

  return {
    findingKey: input.candidate.findingKey,
    title: input.candidate.title,
    category: mapping.category,
    status,
    statusLabel: STATUS_LABELS[status],
    tone: toneForStatus(status),
    eligibility: input.candidate.eligibility,
    confidence: input.candidate.confidence,
    confidenceBand: confidenceBand(input.candidate.confidence),
    directVsInferred: input.candidate.directVsInferred,
    sourceModulesRequired: input.candidate.sourceModulesRequired,
    sourceModulesPresent: input.candidate.sourceModulesPresent,
    coverageLimitations,
    matchedCriteria: input.candidate.matchedCriteria,
    missingCorroborators: input.candidate.missingCorroborators,
    demotionReasons: input.candidate.demotionReasons,
    relatedVendors,
    evidenceExcerptIds: input.candidate.evidenceExcerptIds,
    sourceEvidenceRefs,
    evidencePacket: {
      evidenceExcerptIds: input.candidate.evidenceExcerptIds,
      sourceEvidenceRefs: retainedSourceEvidenceRefs,
      displaySafeExcerpts,
      displaySafeExcerptStats: excerptSelection.stats,
      artifactRefs,
      relatedVendors,
      moduleRunContext: moduleContextForCandidate(
        input.candidate,
        input.moduleRunContext,
      ),
      limitations: coverageLimitations,
      redactionPolicy: "display_safe_excerpts_only",
    },
  };
}

function selectRepresentativeDisplaySafeExcerpts(
  excerpts: DisplaySafeEvidenceExcerpt[],
  caps: {
    maxGroupsPerRow: number;
    maxPerGroup: number;
    maxPerRow: number;
  },
) {
  const byGroup = new Map<string, DisplaySafeEvidenceExcerpt[]>();
  for (const excerpt of excerpts) {
    const key = displaySafeExcerptGroupKey(excerpt);
    const group = byGroup.get(key) ?? [];
    group.push(excerpt);
    byGroup.set(key, group);
  }

  const groupedExcerpts = Array.from(byGroup.entries()).map(([key, group]) => ({
    key,
    excerpts: group,
    duplicateCount: group.length,
  }));
  const selectedGroups: typeof groupedExcerpts = [];
  const seenDiversity = new Set<string>();

  for (const item of groupedExcerpts) {
    if (selectedGroups.length >= caps.maxGroupsPerRow) {
      break;
    }
    const diversityKey = excerptDiversityKey(item.excerpts[0]!);
    if (!seenDiversity.has(diversityKey)) {
      selectedGroups.push(item);
      seenDiversity.add(diversityKey);
    }
  }
  for (const item of groupedExcerpts) {
    if (selectedGroups.length >= caps.maxGroupsPerRow) {
      break;
    }
    if (!selectedGroups.includes(item)) {
      selectedGroups.push(item);
    }
  }
  const selectedExcerpts: DisplaySafeEvidenceExcerpt[] = [];
  for (const group of selectedGroups) {
    for (const excerpt of group.excerpts.slice(0, caps.maxPerGroup)) {
      if (selectedExcerpts.length >= caps.maxPerRow) {
        break;
      }
      selectedExcerpts.push(excerpt);
    }
    if (selectedExcerpts.length >= caps.maxPerRow) {
      break;
    }
  }

  return {
    excerpts: selectedExcerpts,
    stats: {
      originalCount: excerpts.length,
      projectedCount: selectedExcerpts.length,
      omittedCount: Math.max(0, excerpts.length - selectedExcerpts.length),
      maxPerRow: caps.maxPerRow,
      capped: excerpts.length > selectedExcerpts.length,
      deduped: groupedExcerpts.some((item) => item.duplicateCount > 1),
      representativeGroupKeys: selectedGroups.map((item) => item.key),
    },
  };
}

function retainSourceEvidenceRefsForExcerpts(
  sourceEvidenceRefs: EvidenceRef[],
  displaySafeExcerpts: DisplaySafeEvidenceExcerpt[],
) {
  const retainedEventIds = new Set(
    displaySafeExcerpts
      .map((excerpt) => excerpt.sourceEventId)
      .filter((value): value is string => typeof value === "string" && value.length > 0),
  );
  if (retainedEventIds.size === 0) {
    return [];
  }
  return sourceEvidenceRefs.filter((ref) =>
    typeof ref.eventId === "string" && retainedEventIds.has(ref.eventId)
  );
}

function displaySafeExcerptGroupKey(excerpt: DisplaySafeEvidenceExcerpt) {
  return [
    excerpt.evidenceKind,
    excerpt.sourceScanner ?? "unknown_scanner",
    excerpt.scenario ?? "unknown_scenario",
    excerpt.consentStateAtTime ?? "unknown_consent",
    excerpt.hostname ?? "unknown_host",
    normalizePathForGrouping(excerpt.path),
    excerpt.vendorRef ?? "unknown_vendor",
    excerpt.cookieNames.slice().sort().join(",") || "no_cookie",
  ].join("|");
}

function excerptDiversityKey(excerpt: DisplaySafeEvidenceExcerpt) {
  return [
    excerpt.evidenceKind,
    excerpt.sourceScanner ?? "unknown_scanner",
    excerpt.scenario ?? "unknown_scenario",
    excerpt.vendorRef ?? excerpt.hostname ?? "unknown_vendor_or_host",
  ].join("|");
}

function normalizePathForGrouping(path?: string) {
  if (!path) {
    return "unknown_path";
  }
  return path
    .replace(/[0-9a-f]{12,}/gi, ":id")
    .replace(/\d{4,}/g, ":number")
    .slice(0, 120);
}

function determineProjectionStatus(
  candidate: FindingCandidate,
  mapping: FindingMapping,
  coverageLimitations: CoverageLimitation[],
): V2ProjectionStatus {
  if (coverageLimitations.length > 0 || candidate.eligibility.status === "deferred") {
    return "coverage_limitation";
  }
  if (candidate.eligibility.status === "not_eligible") {
    return mapping.notEligibleStatus;
  }
  if (candidate.eligibility.status !== "eligible") {
    return "not_testable";
  }
  if (isNanoAssistedUnverified(candidate)) {
    return mapping.notEligibleStatus === "not_observed"
      ? "not_observed"
      : "assisted_candidate";
  }
  if (mapping.reviewSignalOnly || REVIEW_SIGNAL_ONLY_FINDING_KEYS.has(candidate.findingKey)) {
    return "review_signal";
  }
  if (!hasObservedEvidence(candidate)) {
    return "assisted_candidate";
  }
  if (candidate.confidence >= 0.7 && candidate.directVsInferred !== "inferred") {
    return "observed";
  }
  return "review_signal";
}

function isNanoAssistedUnverified(candidate: FindingCandidate) {
  const hasNanoSignal = [
    ...candidate.matchedCriteria,
    ...candidate.demotionReasons,
    ...candidate.missingCorroborators,
  ].some((value) => value.toLowerCase().includes("nano"));

  return (
    hasNanoSignal &&
    candidate.sourceEvidenceRefs.length === 0 &&
    candidate.evidenceExcerptIds.length === 0
  );
}

function hasObservedEvidence(candidate: FindingCandidate) {
  return candidate.sourceEvidenceRefs.length > 0 || candidate.evidenceExcerptIds.length > 0;
}

function coverageLimitationsForCandidate(
  candidate: FindingCandidate,
  reviewLimitations: CoverageLimitation[],
  moduleRunContext: V2ModuleRunContext[],
) {
  const fromCandidate = candidate.coverageLimitations;
  const fromReview = reviewLimitations.filter((limitation) =>
    limitation.affectedFindingKeys.includes(candidate.findingKey),
  );
  const missingRequiredModules = candidate.sourceModulesRequired.filter(
    (moduleName) => !candidate.sourceModulesPresent.includes(moduleName),
  );
  const failedOrPartialRequiredModules = moduleRunContext.filter((moduleRun) =>
    candidate.sourceModulesRequired.includes(moduleRun.moduleName) &&
    (moduleRun.status === "failed" ||
      moduleRun.status === "partial" ||
      moduleRun.status === "skipped_budget" ||
      moduleRun.status === "not_testable"),
  );
  const moduleLimitations: CoverageLimitation[] = [
    ...missingRequiredModules.map((moduleName) => ({
      limitationKey: `missing_module:${moduleName}`,
      description: "Required source module did not provide evidence for this internal candidate.",
      affectedFindingKeys: [candidate.findingKey],
      sourceModulesRequired: [moduleName],
      sourceModulesPresent: candidate.sourceModulesPresent,
    })),
    ...failedOrPartialRequiredModules.map((moduleRun) => ({
      limitationKey: `module_${moduleRun.status}:${moduleRun.moduleName}`,
      description: `Required source module ${moduleRun.moduleName} finished with status ${moduleRun.status}.`,
      affectedFindingKeys: [candidate.findingKey],
      sourceModulesRequired: [moduleRun.moduleName],
      sourceModulesPresent: candidate.sourceModulesPresent,
    })),
  ];

  return uniqueLimitations([...fromCandidate, ...fromReview, ...moduleLimitations]);
}

function buildModuleRunContext(bundle?: CanonicalEvidenceBundle): V2ModuleRunContext[] {
  return (bundle?.modulesRun ?? []).map((moduleRun) => ({
    moduleName: moduleRun.moduleName,
    status: moduleRun.status,
    durationMs: moduleRun.durationMs,
    errorCount: moduleRun.errors.length,
  }));
}

function moduleContextForCandidate(
  candidate: FindingCandidate,
  moduleRunContext: V2ModuleRunContext[],
) {
  return moduleRunContext.filter((moduleRun) =>
    candidate.sourceModulesRequired.includes(moduleRun.moduleName) ||
    candidate.sourceModulesPresent.includes(moduleRun.moduleName),
  );
}

function mappingForCandidate(candidate: FindingCandidate): FindingMapping {
  return FINDING_MAPPINGS[candidate.findingKey] ?? {
    category: inferCategory(candidate),
    wc01RowId: candidate.findingKey,
    regulatoryFamilies: [],
    notEligibleStatus: "checked",
  };
}

function inferCategory(candidate: FindingCandidate): V2FindingCategory {
  if (candidate.findingKey.includes("policy") || candidate.findingKey.includes("notice")) {
    return "policy_surface";
  }
  if (candidate.findingKey.includes("consent") || candidate.findingKey.includes("reject") || candidate.findingKey.includes("accept")) {
    return "consent_flow";
  }
  return "runtime";
}

function safeVendorRefs(vendors: NormalizedVendorObservation[]): V2SafeVendorRef[] {
  return vendors.map((vendor) => ({
    observationId: vendor.observationId,
    entity: vendor.entity,
    vendor: vendor.vendor,
    product: vendor.product,
    purpose: vendor.purpose,
    confidence: vendor.confidence,
    basis: vendor.basis,
    regulatoryRelevance: vendor.regulatoryRelevance,
  }));
}

function uniqueArtifacts(artifactRefs: ArtifactRef[]) {
  const seen = new Set<string>();
  return artifactRefs.filter((artifact) => {
    const key = `${artifact.artifactId}:${artifact.artifactType}:${artifact.path}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function uniqueLimitations(limitations: CoverageLimitation[]) {
  const seen = new Set<string>();
  return limitations.filter((limitation) => {
    const key = [
      limitation.limitationKey,
      limitation.affectedFindingKeys.join(","),
      limitation.sourceModulesRequired.join(","),
    ].join(":");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function confidenceBand(confidence: number): V2ConfidenceBand {
  if (confidence >= 0.8) {
    return "high";
  }
  if (confidence >= 0.55) {
    return "medium";
  }
  return "low";
}

function toneForStatus(status: V2ProjectionStatus): V2ProjectionTone {
  switch (status) {
    case "review_signal":
    case "assisted_candidate":
      return "review";
    case "coverage_limitation":
    case "not_testable":
    case "not_observed":
      return "muted";
    case "observed":
    case "checked":
    default:
      return "neutral";
  }
}

function toWc01CompatibleRowDraft(
  row: V2ReportProjectionRow,
): V2Wc01CompatibleRowDraft {
  const mapping = mappingForCandidate({
    findingKey: row.findingKey,
  } as FindingCandidate);
  const assessmentStatus = wc01AssessmentStatus(row.status);

  return {
    rowId: mapping.wc01RowId,
    sourceFindingKey: row.findingKey,
    assessmentStatus,
    status: wc01CompatibleStatus(row.status),
    statusLabel: row.statusLabel,
    tone: row.tone,
    evidenceRefs: row.sourceEvidenceRefs.map((ref) => ref.refId),
    regulatoryFamilies: mapping.regulatoryFamilies,
    retainedEvidence: {
      projectionStatus: row.status,
      findingKey: row.findingKey,
      evidenceExcerptIds: row.evidenceExcerptIds,
      sourceEvidenceRefIds: row.sourceEvidenceRefs.map((ref) => ref.refId),
      coverageLimitationKeys: row.coverageLimitations.map(
        (limitation) => limitation.limitationKey,
      ),
      matchedCriteria: row.matchedCriteria,
      missingCorroborators: row.missingCorroborators,
      demotionReasons: row.demotionReasons,
      relatedVendors: row.relatedVendors,
    },
  };
}

function wc01AssessmentStatus(
  status: V2ProjectionStatus,
): V2Wc01CompatibleAssessmentStatus {
  switch (status) {
    case "review_signal":
    case "assisted_candidate":
      return "review_signal";
    case "coverage_limitation":
    case "not_testable":
      return "coverage_limitation";
    case "observed":
    case "checked":
    case "not_observed":
    default:
      return "checked";
  }
}

function wc01CompatibleStatus(
  status: V2ProjectionStatus,
): V2Wc01CompatibleRowDraft["status"] {
  switch (status) {
    case "coverage_limitation":
    case "assisted_candidate":
      return "not_testable";
    default:
      return status;
  }
}

export * from "./wc01-shadow-contract";
export * from "./wc01-shadow-output";
export * from "./wc01-v2-allowlist-bridge";
export * from "./wc01-v2-allowlist-output";
export * from "./wc01-v2-concern-policy-input-draft";
export * from "./wc01-v2-concern-policy-input-output";
export * from "./wc01-v2-concern-policy-simulation";
export * from "./wc01-v2-concern-policy-simulation-output";
export * from "./wc01-v2-normalized-concern-adapter";
export * from "./wc01-v2-normalized-concern-adapter-output";
export * from "./wc01-v2-concern-policy-comparison";
export * from "./wc01-v2-concern-policy-comparison-output";
export * from "./wc01-v2-manual-reviewer-packet";
export * from "./wc01-v2-manual-reviewer-packet-output";
export * from "./wc01-v2-evidence-preview";
export * from "./wc01-v2-evidence-preview-output";

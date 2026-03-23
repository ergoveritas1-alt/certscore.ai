export type Confidence = "high" | "medium" | "low";
export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type ClaimType =
  | "surface_presence"
  | "surface_absence"
  | "observable_behavior"
  | "behavior_inconsistency"
  | "claim_vs_behavior_gap"
  | "readiness_not_evident"
  | "manual_review_recommended";

export type LaunchFindingId =
  | "privacy.ca.privacy_policy_surface_missing"
  | "privacy.ca.opt_out_surface_missing"
  | "privacy.ca.browser_signal_not_evident"
  | "privacy.ca.pre_choice_tracking_observed"
  | "privacy.ca.claim_behavior_gap"
  | "privacy.state.consumer_rights_mechanism_missing"
  | "privacy.state.targeted_ads_opt_out_missing"
  | "privacy.state.universal_opt_out_not_evident"
  | "privacy.state.disclosure_behavior_gap"
  | "accessibility.eu.statement_missing"
  | "accessibility.eu.automated_barriers_detected"
  | "accessibility.eu.key_flow_barriers"
  | "accessibility.eu.claim_gap"
  | "privacy.ca.browser_readiness_not_evident"
  | "privacy.ca.preference_persistence_not_evident"
  | "privacy.ca.user_confirmation_not_evident";

export interface RegulatoryMapping {
  jurisdiction: string;
  framework: string;
  mappingType: "relevance_mapping";
  citationKey: string;
  notes?: string;
}

export interface EvidencePacket {
  screenshots: Array<{
    id: string;
    url: string;
    pageUrl: string;
    timestamp: string;
    caption?: string;
  }>;
  domSnapshots: Array<{
    id: string;
    pageUrl: string;
    timestamp: string;
    selector?: string;
    excerpt?: string;
  }>;
  networkEvents: Array<{
    id: string;
    pageUrl: string;
    timestamp: string;
    requestUrl?: string;
    method?: string;
    vendor?: string;
    category?: string;
    phase?: "before_choice" | "after_choice" | "signal_enabled" | "signal_disabled";
    notes?: string;
  }>;
  cookies: Array<{
    id: string;
    pageUrl: string;
    timestamp: string;
    name: string;
    domain?: string;
    path?: string;
    phase?: "before_choice" | "after_choice" | "signal_enabled" | "signal_disabled";
    notes?: string;
  }>;
  storageWrites: Array<{
    id: string;
    pageUrl: string;
    timestamp: string;
    storageType: "localStorage" | "sessionStorage" | "indexedDB";
    key?: string;
    phase?: "before_choice" | "after_choice" | "signal_enabled" | "signal_disabled";
    notes?: string;
  }>;
  sessionLogs: Array<{
    id: string;
    timestamp: string;
    pageUrl?: string;
    eventType: string;
    message: string;
  }>;
  pageUrls: string[];
}

export interface ReproductionInfo {
  sessionCount: number;
  repeatability: "consistent" | "partially_consistent" | "not_retested" | "inconsistent";
  testConditions: string[];
  comparedAgainstControl?: boolean;
}

export interface ScanFinding {
  findingId: LaunchFindingId;
  pillar: string;
  module: string;
  title: string;
  summary: string;
  claimType: ClaimType;
  severity: Severity;
  confidence: Confidence;
  reviewerOnly?: boolean;
  regulatoryMappings: RegulatoryMapping[];
  whatWasTested: string[];
  observations: string[];
  evidence: EvidencePacket;
  reproduction: ReproductionInfo;
  limitations: string[];
  recommendedReview?: string;
  confidenceReason?: string;
  generatedAt: string;
  scanRunId: string;
}

export interface ScanMethodology {
  scanRunId: string;
  generatedAt: string;
  browserProfileType: "fresh" | "reused";
  consentStateReset: boolean;
  browserSignalTesting: {
    enabled: boolean;
    signalTypesTested: string[];
    comparedAgainstControl: boolean;
  };
  pageSelection: {
    seedPages: string[];
    discoveredPages: string[];
    keyFlowsTested: string[];
    legalPagesTested: string[];
  };
  evidenceCollection: {
    screenshotsCaptured: boolean;
    domSnapshotsCaptured: boolean;
    networkLoggingEnabled: boolean;
    cookieDiffingEnabled: boolean;
    storageWriteTrackingEnabled: boolean;
  };
  notes?: string[];
}

export type ValidationResult = {
  ok: boolean;
  errors: string[];
};

export type SanitizationResult = {
  changed: boolean;
  originalText: string;
  sanitizedText: string;
  rejected: boolean;
  reasons: string[];
};

export type SanitizedFinding = {
  finding: ScanFinding;
  changed: boolean;
  rejected: boolean;
  reasons: string[];
};

export type ConfidenceResult = {
  confidence: Confidence;
  confidenceReason: string;
  evidenceQuality: "strong" | "moderate" | "weak";
};

export type SeverityResult = {
  severity: Severity;
  rationale: string;
};

export type PublicClaimSurface =
  | "privacy_policy"
  | "cookie_policy"
  | "footer_disclosure"
  | "consent_ui"
  | "accessibility_statement"
  | "help_support"
  | "other";

export type PublicClaim = {
  id: string;
  text: string;
  sourceUrl: string;
  pageUrl: string;
  timestamp: string;
  kind: "privacy" | "accessibility";
  surface: PublicClaimSurface;
};

export type ObservableBehavior = {
  id: string;
  kind: "privacy" | "accessibility";
  summary: string;
  pageUrl: string;
  timestamp: string;
  evidenceRefs: string[];
  signal: string;
  keyFlow?: boolean;
  contradictsClaim?: boolean;
};

export type GapFinding = {
  claimText: string;
  claimSourceUrl: string;
  observedBehaviorSummary: string;
  observedBehaviorEvidenceRefs: string[];
  limitationNote: string;
  kind: "privacy" | "accessibility";
};

export type EvidenceArtifactCollection = Partial<EvidencePacket>;

export type SurfaceObservation = {
  surfaceKey:
    | "privacy_policy"
    | "ca_opt_out"
    | "consumer_rights_request"
    | "targeted_ads_opt_out"
    | "accessibility_statement"
    | "browser_opt_out_signal"
    | "universal_opt_out"
    | "browser_signal_readiness"
    | "privacy_preference_persistence"
    | "privacy_preference_confirmation";
  detected: boolean;
  pageUrl?: string;
  timestamp: string;
  evidence?: EvidenceArtifactCollection;
  notes?: string[];
};

export type AccessibilityIssue = {
  id: string;
  pageUrl: string;
  timestamp: string;
  summary: string;
  impact: "critical" | "serious" | "moderate" | "minor";
  selectors?: string[];
  keyFlow?: boolean;
};

export type RegulatoryReviewArtifacts = {
  pageUrls: string[];
  evidence: EvidenceArtifactCollection;
  surfaces: SurfaceObservation[];
  claims: PublicClaim[];
  behaviors: ObservableBehavior[];
  accessibilityIssues: AccessibilityIssue[];
  methodology: ScanMethodology;
  sessionCount?: number;
  repeatability?: ReproductionInfo["repeatability"];
  testConditions?: string[];
  comparedAgainstControl?: boolean;
};

export type FindingDefinition = {
  findingId: LaunchFindingId;
  pillar: string;
  module: string;
  title: string;
  claimType: ClaimType;
  defaultSeverity: Severity;
  regulatoryMappings: RegulatoryMapping[];
};

export type CustomerFacingFinding = {
  findingId: LaunchFindingId;
  title: string;
  summary: string;
  whatWasObserved: string[];
  whereObserved: string[];
  whyItMayMatter: string;
  limitations: string[];
  suggestedFollowUp?: string;
};

export type InternalRegulatoryReviewOutput = {
  scanRunId: string;
  generatedAt: string;
  methodology: ScanMethodology;
  findings: ScanFinding[];
};

export type CustomerFacingRegulatoryReviewOutput = {
  scanRunId: string;
  generatedAt: string;
  methodologySummary: string;
  findings: CustomerFacingFinding[];
};

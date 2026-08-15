export type PulseDetail = "tiny" | "quick" | "standard" | "full" | "summary" | "evidence";
export type NormalizedPulseDetail = "tiny" | "standard" | "full" | "summary" | "evidence";
export type PulseFormat = "json" | "markdown";
export type FreshnessMode = "latest" | "refresh";
export type ScanFrom = "eu_de" | "eu_ie" | "california";
export type ScanResultDisposition = "no_go";
export type ScanNoGoReasonCode =
  | "blank_or_unusable_page" | "loading_or_stalled" | "not_found_404" | "parked_or_placeholder"
  | "site_not_ready" | "captcha_or_challenge" | "access_denied_or_forbidden_page" | "rate_limited_429"
  | "server_error_5xx" | "configuration_error" | "maintenance_or_unavailable" | "tls_or_certificate_error"
  | "unsupported_region" | "target_unreachable_or_unsuitable" | "navigation_transport_failure" | "visual_capture_failed_or_placeholder"
  | "retained_visual_error_shell" | "unknown";
export type ScanNoGoLimitationKind = "target_site_state" | "scanner_access_limitation" | "scanner_capture_limitation";
export interface ScanNoGoResult {
  reasonCode: ScanNoGoReasonCode;
  title: string;
  explanation: string;
  summary: string;
  limitationKind: ScanNoGoLimitationKind;
  recommendedNextAction: string;
  retryLikelyToHelp: boolean;
  evidenceExcerpt?: string;
}

export type PulseJobStatus =
  | "queued"
  | "running"
  | "finalizing"
  | "completed"
  | "completed_limited"
  | "failed"
  | "expired"
  | "rate_limited";

export interface CertScoreClientOptions {
  apiKey?: string;
  baseUrl?: string;
  clientName?: "mcp" | "sdk";
  /** Internal gateway context used to preserve anonymous requester quotas. */
  forwardedClientIp?: string | null;
  /** Internal gateway secret used to authenticate the forwarded anonymous requester identity. */
  anonymousRequesterSecret?: string | null;
  /** Authenticated internal gateway surface, bound into anonymous requester proofs. */
  anonymousSurface?: "mcp_light" | "mcp_anonymous" | null;
  timeout?: number;
}

export interface ScanOptions {
  detail?: PulseDetail;
  format?: PulseFormat;
  freshness?: FreshnessMode;
  scanFrom?: ScanFrom;
  callbackUrl?: string;
  maxWaitMs?: number;
  pollIntervalMs?: number;
  signal?: AbortSignal;
  onStatusUpdate?: (status: JobStatus) => void;
  internalMcpOperation?: InternalMcpReadContext;
}

export interface SubmitScanOptions {
  detail?: PulseDetail;
  format?: PulseFormat;
  freshness?: FreshnessMode;
  scanFrom?: ScanFrom;
  signal?: AbortSignal;
}

export interface GetScanOptions {
  detail?: PulseDetail;
  format?: PulseFormat;
  signal?: AbortSignal;
  internalMcpOperation?: InternalMcpReadContext;
}

export interface ApiV2RequestOptions {
  signal?: AbortSignal;
  internalMcpOperation?: InternalMcpReadContext;
}

export interface InternalMcpReadContext {
  operation: "scan_site_wait" | "scan_status" | "scan_bundle";
  scanId: string;
}

export interface DomainLatestScanOptions extends ApiV2RequestOptions {
  scanFrom?: ScanFrom;
}

export interface CreateScanResourceOptions extends ApiV2RequestOptions {
  callbackUrl?: string;
  freshness?: FreshnessMode;
  metadata?: Record<string, string>;
  scanFrom?: ScanFrom;
}

export interface ApiV2Links {
  self?: string;
  status?: string;
  findings?: string;
  pulse?: string;
  report?: string;
  latestDomainScan?: string;
  docs?: string;
  [key: string]: string | undefined;
}

export interface ScanCreationMetadata {
  executionMode?: "new_scan" | "reused_scan";
  reused?: boolean;
  reusedScanAgeSeconds?: number | null;
  freshnessDecision?: string;
  quotaConsumed?: boolean;
  anonymousQuotaLimit?: number | null;
  anonymousQuotaRemaining?: number | null;
  anonymousQuotaResetAt?: string | null;
  upgradeSupportEmail?: string | null;
  upgradeMessage?: string | null;
  recommendedNextTool?: "certscore_get_scan_status" | "certscore_get_scan_bundle";
}

export interface ScanResource extends ScanCreationMetadata {
  type: "certscore_scan";
  scanId: string;
  domain: string;
  url?: string | null;
  status: PulseJobStatus;
  resultDisposition?: ScanResultDisposition;
  noGo?: ScanNoGoResult;
  scanFrom?: ScanFrom;
  createdAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  scanTimeSeconds?: number | null;
  score?: number | null;
  scoreStatus?: "provisional" | "final";
  scoreVersion?: string | null;
  scoreUpdatedAt?: string | null;
  riskLevel?: string | null;
  coverage?: {
    status?: string;
    summary?: string;
    limitations?: string[];
    [key: string]: unknown;
  };
  links?: ApiV2Links;
  disclaimer?: string;
  [key: string]: unknown;
}

export interface ScanJob extends ScanCreationMetadata {
  type: "certscore_scan_job";
  jobId: string;
  scanId?: string | null;
  scan_id?: string | null;
  domain?: string | null;
  url?: string | null;
  status: PulseJobStatus;
  resultDisposition?: ScanResultDisposition;
  noGo?: ScanNoGoResult;
  phase?: string;
  createdAt?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  scanTimeSeconds?: number | null;
  score?: number | null;
  scoreStatus?: "provisional" | "final";
  scoreVersion?: string | null;
  scoreUpdatedAt?: string | null;
  riskLevel?: string | null;
  coverage?: ScanResource["coverage"] | null;
  lastUpdatedAt?: string;
  phaseStartedAt?: string | null;
  lastHeartbeatAt?: string | null;
  progressPercent?: number;
  progressIsEstimate?: boolean;
  estimatedRemainingSeconds?: number | null;
  stalled?: boolean;
  retryAfterSeconds?: number | null;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
    retryAfterSeconds: number | null;
    recommendedNextAction: string;
  };
  reportUrl?: string | null;
  recommendedNextAction?: string;
  links?: ApiV2Links;
  disclaimer?: string;
  message?: string;
  statusUrl?: string;
  nextCheckUrl?: string;
  resultUrl?: string;
  [key: string]: unknown;
}

export interface ScanDiagnosticPhase {
  name: string;
  lane: "scanner" | "browser" | "policy" | "persistence";
  startedAtMs: number | null;
  completedAtMs: number | null;
  durationMs: number;
  outcome: "success" | "degraded" | "failed" | "unknown";
}

export interface ScanLaneRun {
  laneId: "consent_proof" | "runtime_evidence" | "policy_evidence";
  physicalInvocationId: string;
  region: string;
  phaseName: "preConsentRuntimeScanner" | "policySurfaceScanner";
  startedAt: string;
  firstResponse: {
    at: string;
    offsetMs: number;
    httpStatus: number;
    effectiveUrl: string | null;
  } | null;
  navigationCount: number;
  challengeDetection: {
    detected: boolean;
    type: string | null;
  };
  executionOutcome: "success" | "degraded" | "failed";
  accessOutcome:
    | "representative_page"
    | "bot_challenge"
    | "access_denied"
    | "blank_or_unusable"
    | "navigation_failed"
    | "unknown";
  completedAt: string | null;
  durationMs: number;
}

export interface ScanDiagnostics {
  type: "certscore_scan_diagnostics";
  schemaVersion: "scan-diagnostics.v1";
  scanId: string;
  generatedAt: string | null;
  totalWallMs: number | null;
  phases: ScanDiagnosticPhase[];
  /** Present on newly instrumented scans; omitted by older API deployments. */
  lanes?: ScanLaneRun[];
  policyDiscovery: {
    candidatesDiscovered: number | null;
    candidatesAfterDeduplication: number | null;
    requestsStarted: number | null;
    successfulDocuments: number | null;
    timeouts: number | null;
    phaseWallMs: number | null;
    maxConcurrency: number | null;
    shortCircuitReason: string | null;
  };
  links?: ApiV2Links;
  disclaimer?: string;
}

export interface EvidenceEventSummary {
  type: "request" | "page" | "accessibility_check" | "policy_surface";
  vendor?: string | null;
  urlHost?: string | null;
  registrableDomain?: string | null;
  observedAtMs?: number | null;
  phase?: string | null;
  documentUrl?: string | null;
  pageContextId?: string | null;
  requestUrl?: string | null;
  rawObservedVendor?: string | null;
  rawObservedVendorCategory?: string | null;
  resolvedEndpointVendor?: string | null;
  resolvedEndpointVendorCategory?: string | null;
  vendorAttributionBasis?: string | null;
  relatedOrInitiatingVendor?: string | null;
  resourceType?: string | null;
  scannedPageUrl?: string | null;
  frameUrl?: string | null;
  finalUrl?: string | null;
  initiatorHost?: string | null;
  initiatorType?: string | null;
  initiatorUrl?: string | null;
  redirectChain?: string[];
  projectionWarnings?: string[];
}

export interface EvidenceSummary {
  basis: "runtime_observation" | "policy_surface_detection" | "accessibility_check" | "public_report_projection";
  summary: string;
  phase?: string | null;
  exampleCount: number;
  examplesShown: number;
  examplesAvailable?: number;
  authRequiredForExamples?: boolean;
  examples?: EvidenceEventSummary[];
  projectionWarnings?: string[];
  hasTimingAnchor?: boolean;
  hasVendorAnchor?: boolean;
  hasConsentContext?: boolean;
  hasPolicyAnchor?: boolean;
}

export interface FindingSummary {
  type?: "certscore_finding";
  id: string;
  scanId?: string;
  label?: string;
  criticality?: "critical" | "high" | "medium" | "low" | "info" | "unknown";
  confidence?: "strong" | "good" | "moderate" | "weak" | "unknown";
  plainEnglish?: string;
  resultDisposition?: ScanResultDisposition;
  noGo?: ScanNoGoResult;
  evidence?: EvidenceSummary;
  reviewLenses?: string[];
  disclaimer?: string;
  [key: string]: unknown;
}

export interface FindingDetail extends FindingSummary {
  type: "certscore_finding";
}

export interface FindingList {
  type: "certscore_finding_list";
  scanId: string;
  findings: FindingSummary[];
  links?: ApiV2Links;
  disclaimer?: string;
  [key: string]: unknown;
}

export interface DomainLatestScan {
  type: "certscore_domain_latest_scan";
  domain: string;
  scan: ScanResource | null;
  links?: ApiV2Links;
  disclaimer?: string;
  [key: string]: unknown;
}

export interface ScanPulse {
  type: "certscore_scan_pulse";
  scanId: string;
  pulse: PulseResult;
  resultDisposition?: ScanResultDisposition;
  noGo?: ScanNoGoResult;
  links?: ApiV2Links;
  disclaimer?: string;
  [key: string]: unknown;
}

export interface PreConsentCookiesTrackersRow {
  id?: string;
  kind: "cookie" | "tracker" | "request" | "storage" | "unknown";
  name?: string | null;
  vendor?: string | null;
  host?: string | null;
  registrableDomain?: string | null;
  party?: string | null;
  purpose?: string | null;
  priority?: "high" | "medium" | "review_needed" | "contextual" | "unknown";
  confidence?: "high" | "medium" | "low" | "unknown";
  canonicalEntity?: string | null;
  purposes?: string[];
  domains?: string[];
  products?: string[];
  setByThirdPartyScript?: boolean;
  set_by_third_party_script?: boolean;
  cookieDetails?: Array<{
    name: string;
    domain?: string | null;
    expiresAt?: string | null;
    lifespanSeconds?: number | null;
    lifespanSource?: string | null;
    longLived?: boolean;
    description?: string | null;
    dataTypes?: string[];
    setByThirdPartyScript?: boolean;
    set_by_third_party_script?: boolean;
    setterScriptUrl?: string | null;
    initiatorChain?: string[];
  }>;
  dataFlows?: Array<{
    endpoint: string;
    idSync: boolean;
    networkDestination: {
      ip: string | null;
      country: string | null;
      countryCode: string | null;
      asn: number | null;
      provider: string | null;
      label: "server location (may be CDN edge)";
    };
    controllingEntity: {
      legalEntity: string | null;
      headquartersCountry: string | null;
    };
    transferMechanism: {
      mechanism: "adequacy_decision" | "dpf_certified" | "sccs_assumed_unverified" | "unknown";
      basis: string;
      verifiedAsOf: string;
    };
  }>;
  phase?: "pre_consent";
  evidenceBasis?: "runtime_observation" | "policy_surface_detection" | "accessibility_check" | "public_report_projection";
  observedBeforeConsent?: boolean;
  requestCount?: number;
  firstObservedAtMs?: number | null;
  pageUrlHost?: string | null;
  [key: string]: unknown;
}

export interface PreConsentCookiesTrackers {
  type: "certscore_pre_consent_cookies_trackers";
  scanId: string;
  domain?: string | null;
  summary: {
    rowCount: number;
    trackerCount: number;
    cookieCount: number;
    requestCount: number;
    vendorCount?: number;
    domainCount?: number;
    totalRowCount?: number;
    truncated?: boolean;
    [key: string]: unknown;
  };
  rows: PreConsentCookiesTrackersRow[];
  links?: ApiV2Links;
  disclaimer?: string;
  [key: string]: unknown;
}

export interface ScanResourceClient {
  create(url: string, options?: CreateScanResourceOptions): Promise<ScanResource | ScanJob>;
  diagnostics(scanId: string, options?: ApiV2RequestOptions): Promise<ScanDiagnostics>;
  get(scanId: string, options?: ApiV2RequestOptions): Promise<ScanResource>;
  preConsentCookiesTrackers(scanId: string, options?: ApiV2RequestOptions): Promise<PreConsentCookiesTrackers>;
  status(scanId: string, options?: ApiV2RequestOptions): Promise<ScanJob>;
  wait(scan: string | ScanResource | ScanJob | PendingJob | JobStatus, options?: ScanOptions): Promise<ScanResource>;
}

export interface FindingResourceClient {
  list(scanId: string, options?: ApiV2RequestOptions): Promise<FindingList>;
  get(scanId: string, findingId: string, options?: ApiV2RequestOptions): Promise<FindingDetail>;
  explain(scanId: string, findingId: string, options?: ApiV2RequestOptions): Promise<FindingDetail>;
}

export interface PulseResourceClient {
  get(scanId: string, options?: ApiV2RequestOptions): Promise<ScanPulse>;
  evidence(scanId: string, options?: ApiV2RequestOptions): Promise<PulseResult>;
}

export interface DomainResourceClient {
  latest(domain: string, options?: DomainLatestScanOptions): Promise<DomainLatestScan>;
  latestPreConsentCookiesTrackers(domain: string, options?: DomainLatestScanOptions): Promise<PreConsentCookiesTrackers>;
}

export interface PulseMeta {
  apiVersion?: string;
  schemaVersion?: string;
  pulseVersion?: string;
  projectionVersion?: string;
  reportProjectionVersion?: string | null;
  reportProjectionSourceHash?: string | null;
  generatedAt?: string;
  source?: string;
  format?: PulseFormat;
  detail?: NormalizedPulseDetail;
  [key: string]: unknown;
}

export interface PulseRequest {
  pulseRequestId?: string;
  url?: string | null;
  normalizedUrl?: string | null;
  domain?: string | null;
  detail?: NormalizedPulseDetail;
  format?: PulseFormat;
  freshness?: FreshnessMode;
  waitSeconds?: number;
  resolutionMode?: string;
  [key: string]: unknown;
}

export interface PulseSummary {
  headline?: string;
  score?: number | null;
  riskLevel?: string;
  benchmark?: string | null;
  humanSummary?: string;
  machineSummary?: Record<string, unknown>;
  coverageNote?: string;
  [key: string]: unknown;
}

export interface PulseScan {
  scanId?: string;
  scanStatus?: string;
  createdAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  lastUpdatedAt?: string | null;
  phaseStartedAt?: string | null;
  lastHeartbeatAt?: string | null;
  progressPercent?: number;
  stalled?: boolean;
  [key: string]: unknown;
}

export interface Evidence {
  summary?: string;
  observedPhase?: string | null;
  exampleEvents?: Array<Record<string, unknown>>;
  consentContext?: Record<string, unknown>;
  fullEvidenceUrl?: string;
  [key: string]: unknown;
}

export interface EvidenceDigest {
  basis?: string;
  phase?: string | null;
  exampleCount?: number;
  examplesShown?: number;
  hasTimingAnchor?: boolean;
  hasVendorAnchor?: boolean;
  hasConsentContext?: boolean;
  hasPolicyAnchor?: boolean;
  [key: string]: unknown;
}

export interface TopFinding {
  id: string;
  label?: string;
  criticality?: string;
  confidence?: string;
  plainEnglish?: string;
  evidence?: Evidence;
  evidenceDigest?: EvidenceDigest;
  reviewLenses?: string[];
  anchorUrl?: string;
  nextStep?: string;
  [key: string]: unknown;
}

export interface ReviewLens {
  name: string;
  status?: string;
  score?: number | null;
  summary?: string;
  contributingFindingIds?: string[];
  [key: string]: unknown;
}

export interface ReviewContext {
  disclaimer?: string;
  lenses?: ReviewLens[];
  [key: string]: unknown;
}

export interface CoverageInterruption {
  label: string;
  reason: string;
  reviewTitle?: string;
  reviewReason?: string;
  [key: string]: unknown;
}

export interface CoverageInfo {
  status?: string;
  homepageObserved?: boolean;
  interruptionCount?: number;
  summary?: string;
  limitations?: string[];
  interruptions?: CoverageInterruption[];
  [key: string]: unknown;
}

export interface Links {
  canonicalPulseUrl?: string;
  jsonUrl?: string;
  markdownUrl?: string;
  summaryJsonUrl?: string;
  evidenceJsonUrl?: string;
  fullJsonUrl?: string;
  scanJsonUrl?: string;
  immutableJsonUrl?: string;
  immutableMarkdownUrl?: string;
  immutableFullJsonUrl?: string;
  fullReportUrl?: string;
  docsUrl?: string;
  findingsReferenceUrl?: string;
  [key: string]: unknown;
}

export interface FreshnessInfo {
  status?: "fresh" | "recent" | "stale" | "unknown" | string;
  ageSeconds?: number | null;
  ageHours?: number | null;
  maxRecommendedAgeHours?: number;
  [key: string]: unknown;
}

export interface FeedbackInfo {
  prompt?: string;
  email?: string;
  feedbackUrl?: string;
  positiveUrl?: string;
  negativeUrl?: string;
  [key: string]: unknown;
}

export interface Capabilities {
  method?: "automated_runtime_analysis" | string;
  observes?: string[];
  doesNotProvide?: string[];
  [key: string]: unknown;
}

export interface AgentInterpretation {
  responseClass?: "completed_pulse" | "pending_pulse" | "api_error" | "rate_limited" | string;
  safeSummaryUse?: boolean;
  requiresHumanReview?: boolean;
  doNotCallThis?: string[];
  [key: string]: unknown;
}

export interface TransportSecurityProjection {
  status: "available" | "limited" | "unavailable";
  evidenceRetained: boolean;
  observationCounts: {
    total: number;
    observedPositive: number;
    concernOrReview: number;
    notObserved: number;
    unavailable: number;
  };
  observations: Array<{
    id: string;
    label: string;
    status: "Gap observed" | "Observed" | "Not confirmed" | "Not observed" | "Not testable" | "Review signal" | "Insufficient evidence" | "Out of scope";
    assessmentStatus: "gap_observed" | "review_signal" | "checked" | "coverage_limitation" | "not_applicable";
    evidenceState: "observed" | "not_observed" | "not_testable" | "not_applicable";
    summary: string;
    evidenceRefs: string[];
  }>;
  limitations: string[];
  retainedSummary?: Record<string, unknown>;
}

export interface PulseResultBase {
  type: "certscore_pulse" | "certscore_pulse_summary" | "certscore_pulse_evidence";
  meta?: PulseMeta;
  request?: PulseRequest;
  domain?: string;
  scanId?: string;
  scan_id?: string;
  scanStatus?: string;
  resultDisposition?: ScanResultDisposition;
  noGo?: ScanNoGoResult;
  summary?: PulseSummary;
  topFindings?: TopFinding[];
  transportSecurity?: TransportSecurityProjection;
  coverage?: CoverageInfo;
  links?: Links;
  feedback?: FeedbackInfo;
  capabilities?: Capabilities;
  agentInterpretation?: AgentInterpretation;
  disclaimer?: string;
  [key: string]: unknown;
}

export interface PulseResultTiny extends PulseResultBase {
  meta?: PulseMeta;
}

export interface PulseResultStandard extends PulseResultBase {
  meta?: PulseMeta;
  scan?: PulseScan;
  timestamps?: Record<string, string | null | undefined>;
  freshness?: FreshnessInfo;
  confidence?: Record<string, unknown>;
  reviewContext?: ReviewContext;
  evidenceHighlights?: Record<string, unknown>;
  recommendedActions?: Array<Record<string, unknown>>;
  resultQuality?: Record<string, unknown>;
  usageGuidance?: Record<string, unknown>;
}

export interface PulseResultFull extends PulseResultStandard {
  meta?: PulseMeta;
  findings?: TopFinding[];
  publicReportProjection?: Record<string, unknown>;
  trackerFootprint?: Record<string, unknown>;
  policySurfaces?: Record<string, unknown>;
  coverageDiagnostics?: Record<string, unknown>;
}

export type PulseResult = PulseResultTiny | PulseResultStandard | PulseResultFull;

export interface JobStatus {
  type: "certscore_pulse_status";
  meta?: PulseMeta;
  jobId: string;
  scanId?: string | null;
  scan_id?: string | null;
  domain?: string | null;
  status: PulseJobStatus;
  resultDisposition?: ScanResultDisposition;
  noGo?: ScanNoGoResult;
  phase?: string;
  message?: string;
  createdAt?: string;
  startedAt?: string | null;
  lastUpdatedAt?: string | null;
  phaseStartedAt?: string | null;
  lastHeartbeatAt?: string | null;
  progressPercent?: number;
  stalled?: boolean;
  completedAt?: string | null;
  elapsedSeconds?: number;
  estimatedWaitSeconds?: number | null;
  progress?: Record<string, unknown>;
  resultUrl?: string | null;
  reportUrl?: string | null;
  retryAfterSeconds?: number | null;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
    retryAfterSeconds: number | null;
    recommendedNextAction: string;
  };
  statusUrl?: string;
  nextCheckUrl?: string;
  capabilities?: Capabilities;
  agentInterpretation?: AgentInterpretation;
  disclaimer?: string;
  [key: string]: unknown;
}

export interface PendingJob {
  type: "certscore_pulse_status" | "certscore_pulse_pending" | "certscore_pulse_completed";
  status: PulseJobStatus;
  resultDisposition?: ScanResultDisposition;
  noGo?: ScanNoGoResult;
  jobId?: string;
  scanId?: string | null;
  scan_id?: string | null;
  resultUrl?: string | null;
  reportUrl?: string | null;
  statusUrl?: string;
  nextCheckUrl?: string;
  completed?: boolean;
  pulse?: PulseResult;
  [key: string]: unknown;
}

export interface PulseErrorResponse {
  type: "certscore_pulse_error";
  meta?: PulseMeta;
  request?: Record<string, unknown>;
  error?: {
    code?: string;
    message?: string;
    retryAfterSeconds?: number | null;
    [key: string]: unknown;
  };
  resolution?: { label?: string; url?: string } | null;
  feedback?: FeedbackInfo;
  agentInterpretation?: AgentInterpretation;
  disclaimer?: string;
  [key: string]: unknown;
}

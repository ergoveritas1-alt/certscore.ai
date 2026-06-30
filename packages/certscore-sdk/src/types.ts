import type {
  ApiV2DomainLatestScan,
  ApiV2FindingDetail,
  ApiV2FindingList,
  ApiV2PreConsentCookiesTrackers,
  ApiV2ScanJob,
  ApiV2ScanPulse,
  ApiV2ScanResource
} from "@certscore/api-contracts";

export type PulseDetail = "tiny" | "quick" | "standard" | "full";
export type NormalizedPulseDetail = "tiny" | "standard" | "full";
export type PulseFormat = "json" | "markdown";
export type FreshnessMode = "latest" | "refresh";
export type ScanFrom = "eu_ie" | "california";

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
}

export interface ApiV2RequestOptions {
  signal?: AbortSignal;
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

export type ScanResource = ApiV2ScanResource;
export type ScanJob = ApiV2ScanJob;
export type FindingList = ApiV2FindingList;
export type FindingDetail = ApiV2FindingDetail;
export type DomainLatestScan = ApiV2DomainLatestScan;
export type ScanPulse = ApiV2ScanPulse;
export type PreConsentCookiesTrackers = ApiV2PreConsentCookiesTrackers;

export interface ScanResourceClient {
  create(url: string, options?: CreateScanResourceOptions): Promise<ScanResource | ScanJob>;
  get(scanId: string, options?: ApiV2RequestOptions): Promise<ScanResource>;
  preConsentCookiesTrackers(scanId: string, options?: ApiV2RequestOptions): Promise<PreConsentCookiesTrackers>;
  status(scanId: string, options?: ApiV2RequestOptions): Promise<ScanJob>;
  wait(scan: string | PendingJob | JobStatus, options?: ScanOptions): Promise<PulseResult | string>;
}

export interface FindingResourceClient {
  list(scanId: string, options?: ApiV2RequestOptions): Promise<FindingList>;
  get(scanId: string, findingId: string, options?: ApiV2RequestOptions): Promise<FindingDetail>;
  explain(scanId: string, findingId: string, options?: ApiV2RequestOptions): Promise<FindingDetail>;
}

export interface PulseResourceClient {
  get(scanId: string, options?: ApiV2RequestOptions): Promise<ScanPulse>;
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

export interface PulseResultBase {
  type: "certscore_pulse";
  meta?: PulseMeta;
  request?: PulseRequest;
  domain?: string;
  scanId?: string;
  scan_id?: string;
  scanStatus?: string;
  summary?: PulseSummary;
  topFindings?: TopFinding[];
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
  phase?: string;
  message?: string;
  createdAt?: string;
  startedAt?: string | null;
  lastUpdatedAt?: string | null;
  completedAt?: string | null;
  elapsedSeconds?: number;
  estimatedWaitSeconds?: number | null;
  progress?: Record<string, unknown>;
  resultUrl?: string | null;
  reportUrl?: string | null;
  retryAfterSeconds?: number | null;
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

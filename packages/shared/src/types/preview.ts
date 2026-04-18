import type { AgencyMapping } from "../scoring/agency-mapping";
import type { RegulatoryRiskAssessment } from "../scoring/regulatory-risk";
import type { FindingCategory, FindingSeverity, ScanStatus, ScanType } from "./entities";
import type { ScannerExecutionSummary } from "./scanner-execution";

export type PreviewScanEvent = {
  createdAt: string;
  eventType: string;
  message: string;
  metadataJson: unknown;
};

export type PreviewBuildPhaseSummary = {
  attempts: number | null;
  completedAt: string | null;
  durationMs: number | null;
  error: string | null;
  outcome: string;
  phase: string;
  startedAt: string | null;
};

export type PreviewEarlyResultItem = {
  label: string;
  value: string;
};

export type PreviewSampleFinding = {
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  description: string;
  affectedPage: string;
};

export type PreviewIssueCounts = {
  high: number;
  medium: number;
  low: number;
};

export type PreviewScoreSummary = {
  overall: number;
  privacy: number;
  accessibility: number;
};

export type PreviewFallbackEvidenceSection = {
  title: string;
  summary: string;
  details: string[];
};

export type PreviewFallbackEvidence = {
  source: "urlscan";
  sourceLabel: string;
  reportUrl?: string | null;
  resultApiUrl?: string | null;
  requestFootprint?: PreviewFallbackEvidenceSection;
  vendorFootprint?: PreviewFallbackEvidenceSection;
  disclosureFootprint?: PreviewFallbackEvidenceSection;
};

export type PreviewScanPayload = {
  version: "preview-v1";
  hostname: string;
  normalizedUrl: string;
  issueCounts: PreviewIssueCounts;
  resultState?: {
    code: string;
    coverageLevel: string;
    title: string;
    message: string;
  };
  evidence?: {
    coverageLevel: string;
    homepageStatus: number | string | null;
    passiveVerificationAttempted: boolean;
    robotsStatus: number | string | null;
    verifiedPublicSurfacesCount: number;
    protectionVendor?: string | null;
  };
  scores?: PreviewScoreSummary;
  fallbackEvidence?: PreviewFallbackEvidence;
  summaryBullets: string[];
  sampleFindings: PreviewSampleFinding[];
  disclaimer: string;
};

export type PreviewScanStatusResponse = {
  scanId: string;
  domainId: string | null;
  hostname: string;
  normalizedUrl: string;
  status: ScanStatus;
  scanType: ScanType;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  pagesRequested: number;
  pagesScanned: number;
  errorMessage: string | null;
  statusMessage: string;
  activityLine: string | null;
  activityDetails: string[];
  activityFeed: string[];
  activityRef: string | null;
  events: PreviewScanEvent[];
  executionSummary: ScannerExecutionSummary | null;
  buildPhaseSummaries: PreviewBuildPhaseSummary[];
  liveEarlyResults?: PreviewEarlyResultItem[];
  agencyMappings: AgencyMapping[];
  regulatoryRisk: RegulatoryRiskAssessment | null;
  previewPayload: PreviewScanPayload | null;
};

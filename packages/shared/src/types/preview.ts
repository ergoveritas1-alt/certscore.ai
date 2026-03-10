import type { AgencyMapping } from "../scoring/agency-mapping";
import type { RegulatoryRiskAssessment } from "../scoring/regulatory-risk";
import type { FindingCategory, FindingSeverity, ScanStatus, ScanType } from "./entities";

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

export type PreviewScanPayload = {
  version: "preview-v1";
  hostname: string;
  normalizedUrl: string;
  issueCounts: PreviewIssueCounts;
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
  agencyMappings: AgencyMapping[];
  regulatoryRisk: RegulatoryRiskAssessment | null;
  previewPayload: PreviewScanPayload | null;
};

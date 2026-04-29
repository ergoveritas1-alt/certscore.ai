export type AccessibilityBenchmarkLabel =
  | "better_than_typical"
  | "typical_or_better"
  | "typical"
  | "worse_than_typical"
  | "severe_outlier";

export type AccessibilityRiskBand = "low_risk" | "moderate_risk" | "high_risk" | "severe_risk";

export type NormalizedAccessibilityFinding = {
  id: string;
  label: string;
  pillar: "accessibility";
  section: "ada_accessibility_risk";
  evidenceCategory: "automated_wcag_violation";
  source: "axe_core";
  confidence: "strong" | "good" | "review";
  directVsInferred: "direct";
  severity: "low" | "medium" | "high" | "critical";
  axeRuleId: string;
  axeImpact: string;
  wcag: string[];
  affectedNodeCount: number;
  pageUrl: string;
  representativeSelectors: string[];
  helpUrl: string;
  evidenceSummary: string;
  remediation: string;
  benchmark?: {
    observed: number;
    expectedRange?: string;
    percentileLabel?: AccessibilityBenchmarkLabel;
  };
};

export type AccessibilityAggregateMetrics = {
  accessibilityScore: number;
  totalViolationCount: number;
  totalAffectedNodeCount: number;
  criticalCount: number;
  seriousCount: number;
  moderateCount: number;
  minorCount: number;
  wcagCriteriaImpacted: string[];
  topRuleFamilies: Array<{ id: string; count: number; affectedNodeCount: number }>;
  automatedCoverageNote: string;
};

export type AccessibilityScoreResult = {
  score: number;
  band: AccessibilityRiskBand;
  explanation: string[];
};

export type AccessibilityScanResult = {
  scanId: string;
  pageUrl: string;
  findings: NormalizedAccessibilityFinding[];
  metrics: AccessibilityAggregateMetrics;
  score: AccessibilityScoreResult;
  benchmarkLabel: AccessibilityBenchmarkLabel;
  scanError?: {
    message: string;
    stage: "axe_run" | "normalization" | "scoring";
  };
};

export type AxeViolationLike = {
  id: string;
  impact?: string | null;
  tags?: string[];
  nodes?: Array<Record<string, unknown>>;
  help?: string;
  description?: string;
  helpUrl?: string;
};

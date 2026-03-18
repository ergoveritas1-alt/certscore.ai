export type ValidationRunStatus = "queued" | "collecting" | "ranking" | "validating" | "completed" | "failed";
export type ValidationVerdict = "supported" | "inconclusive" | "not_supported";
export type ValidationPipelineState = "running" | "paused_by_env" | "paused_by_admin";
export type ValidationRunMode = "manual" | "automatic";
export type ValidationAgreementScore = 0 | 50 | 100;

export type ValidationTargetRecord = {
  active: boolean;
  backoffUntil: string | null;
  cooldownUntil: string | null;
  denylisted: boolean;
  denyReason: string | null;
  hostname: string;
  id: string;
  lastCompletedAt: string | null;
  lastError: string | null;
  lastRunAt: string | null;
  lastStatus: string | null;
  normalizedUrl: string;
  rankBand: string | null;
  source: string;
  trancoRank: number | null;
};

export type ValidationSettingsRecord = {
  automaticIntervalMinutes: number;
  lastTrancoSyncAt: string | null;
  operatorNote: string | null;
  pipelineEnabled: boolean;
  runMode: ValidationRunMode;
  updatedAt: string;
  updatedByUserId: string | null;
};

export type ValidationRunRecord = {
  averageAgreementScore: number | null;
  completedAt: string | null;
  createdAt: string;
  errorMessage: string | null;
  findingCount: number;
  hostname: string;
  id: string;
  normalizedUrl: string;
  rankBand: string | null;
  reviewedFindingCount: number;
  scanId: string | null;
  startedAt: string | null;
  status: ValidationRunStatus;
  targetId: string | null;
  trancoRank: number | null;
  triggerMode: ValidationRunMode;
};

export type ValidationRunFindingRecord = {
  category: "accessibility" | "privacy" | "legal";
  description: string;
  evidence: Record<string, unknown>;
  findingId: string | null;
  id: string;
  pageUrl: string | null;
  rank: number;
  ruleKey: string;
  severity: "high" | "medium" | "low" | "info";
  subtype: string | null;
  title: string;
};

export type ValidationVerdictRecord = {
  agreementScore: ValidationAgreementScore;
  confidence: number;
  createdAt: string;
  evidence: Record<string, unknown>;
  id: string;
  model: string;
  promptVersion: string;
  rationale: string;
  validationRunFindingId: string;
  verdict: ValidationVerdict;
};

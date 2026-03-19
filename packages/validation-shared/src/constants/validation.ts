import type {
  ValidationAgreementScore,
  ValidationPipelineState,
  ValidationRunMode,
  ValidationRunStatus,
  ValidationVerdict
} from "../types/validation";

export const VALIDATION_INTERVAL_OPTIONS = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240] as const;

export const VALIDATION_RANK_BANDS = [
  { key: "1k-5k", label: "1k-5k", min: 1_000, max: 5_000, weight: 20 },
  { key: "5k-20k", label: "5k-20k", min: 5_001, max: 20_000, weight: 30 },
  { key: "20k-50k", label: "20k-50k", min: 20_001, max: 50_000, weight: 30 },
  { key: "50k-100k", label: "50k-100k", min: 50_001, max: 100_000, weight: 20 }
] as const;

export const VALIDATION_RUN_STATUSES = [
  "queued",
  "collecting",
  "ranking",
  "validating",
  "completed",
  "failed"
] as const satisfies readonly ValidationRunStatus[];

export const VALIDATION_VERDICTS = [
  "supported",
  "inconclusive",
  "not_supported"
] as const satisfies readonly ValidationVerdict[];

export const VALIDATION_PIPELINE_STATES = [
  "running",
  "paused_by_env",
  "paused_by_admin"
] as const satisfies readonly ValidationPipelineState[];

export const VALIDATION_RUN_MODES = ["manual", "automatic"] as const satisfies readonly ValidationRunMode[];
export const VALIDATION_AGREEMENT_SCORES = [0, 50, 100] as const satisfies readonly ValidationAgreementScore[];

export const VALIDATION_INTERNAL_ORG_SLUG = "validation-ops-internal";
export const VALIDATION_PROMPT_VERSION = "validation_verdict_v1";

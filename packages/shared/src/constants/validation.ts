export const VALIDATION_INTERVAL_OPTIONS = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240] as const;

export const VALIDATION_DEFAULT_INTERVAL_MINUTES = 20;

export const VALIDATION_DEFAULT_RUN_MODE = "manual" as const;

export const VALIDATION_RANK_BAND_LABELS = {
  top_1k_5k: "1k-5k",
  top_5k_20k: "5k-20k",
  top_20k_50k: "20k-50k",
  top_50k_100k: "50k-100k"
} as const;

export const VALIDATION_RANK_BAND_WEIGHTS = {
  [VALIDATION_RANK_BAND_LABELS.top_1k_5k]: 20,
  [VALIDATION_RANK_BAND_LABELS.top_5k_20k]: 30,
  [VALIDATION_RANK_BAND_LABELS.top_20k_50k]: 30,
  [VALIDATION_RANK_BAND_LABELS.top_50k_100k]: 20
} as const;

export const VALIDATION_ALLOWED_FINDING_CATEGORIES = ["privacy", "legal"] as const;

export type ValidationAgreementScore = 0 | 50 | 100;

export type ValidationPipelineState = "running" | "paused_by_admin" | "paused_by_env";

export type ValidationRunMode = "manual" | "automatic";

export type ValidationRunStatus =
  | "waiting_for_scan"
  | "queued"
  | "collecting"
  | "ranking"
  | "validating"
  | "completed"
  | "failed";

export type ValidationVerdict = "supported" | "inconclusive" | "not_supported";

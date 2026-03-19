import {
  VALIDATION_DEFAULT_INTERVAL_MINUTES,
  VALIDATION_DEFAULT_RUN_MODE,
  VALIDATION_INTERVAL_OPTIONS,
  VALIDATION_RANK_BAND_LABELS,
  VALIDATION_RANK_BAND_WEIGHTS,
  type ValidationAgreementScore,
  type ValidationRunMode,
  type ValidationVerdict
} from "@website-signal-risk-scanner/shared";

export { VALIDATION_DEFAULT_INTERVAL_MINUTES, VALIDATION_DEFAULT_RUN_MODE, VALIDATION_INTERVAL_OPTIONS, VALIDATION_RANK_BAND_LABELS, VALIDATION_RANK_BAND_WEIGHTS };

export const VALIDATION_SETTINGS_KEY = "default";
export const VALIDATION_FINDING_LIMIT = 25;
export const VALIDATION_TRANCO_FALLBACK_URL = "https://tranco-list.eu/top-1m.csv";

export function isValidValidationInterval(value: number) {
  return (VALIDATION_INTERVAL_OPTIONS as readonly number[]).includes(value);
}

export function getRankBand(rank: number | null | undefined) {
  if (!rank || !Number.isFinite(rank) || rank < 1_000 || rank > 100_000) {
    return null;
  }

  if (rank <= 5_000) {
    return VALIDATION_RANK_BAND_LABELS.top_1k_5k;
  }

  if (rank <= 20_000) {
    return VALIDATION_RANK_BAND_LABELS.top_5k_20k;
  }

  if (rank <= 50_000) {
    return VALIDATION_RANK_BAND_LABELS.top_20k_50k;
  }

  return VALIDATION_RANK_BAND_LABELS.top_50k_100k;
}

export function getCooldownDaysForRank(rank: number | null | undefined) {
  return rank && rank <= 20_000 ? 14 : 30;
}

export function getAgreementScoreForVerdict(verdict: ValidationVerdict): ValidationAgreementScore {
  if (verdict === "supported") {
    return 100;
  }

  if (verdict === "inconclusive") {
    return 50;
  }

  return 0;
}

export function getNextDueAt(input: {
  from?: Date;
  intervalMinutes?: number;
}) {
  const from = input.from ?? new Date();
  const intervalMinutes = isValidValidationInterval(input.intervalMinutes ?? VALIDATION_DEFAULT_INTERVAL_MINUTES)
    ? input.intervalMinutes ?? VALIDATION_DEFAULT_INTERVAL_MINUTES
    : VALIDATION_DEFAULT_INTERVAL_MINUTES;

  return new Date(from.getTime() + intervalMinutes * 60_000);
}

export function normalizeValidationRunMode(value: string | null | undefined): ValidationRunMode {
  return value === "automatic" ? "automatic" : VALIDATION_DEFAULT_RUN_MODE;
}

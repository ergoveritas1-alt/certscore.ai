export const VERSIONED_SCORE_LIFECYCLE_STARTED_AT = "2026-07-22T06:30:00.000Z";

const VERSIONED_SCORE_LIFECYCLE_STARTED_AT_MS = Date.parse(VERSIONED_SCORE_LIFECYCLE_STARTED_AT);

export type VersionedScoreLifecycleTimeDisposition =
  | "eligible"
  | "historical"
  | "missing_or_invalid";

export function classifyVersionedScoreLifecycleTime(
  scoredAt: string | null | undefined
): VersionedScoreLifecycleTimeDisposition {
  if (!scoredAt) return "missing_or_invalid";
  const scoredAtMs = Date.parse(scoredAt);
  if (!Number.isFinite(scoredAtMs)) return "missing_or_invalid";
  return scoredAtMs >= VERSIONED_SCORE_LIFECYCLE_STARTED_AT_MS
    ? "eligible"
    : "historical";
}

import { getConfiguredValidationRedisUrl } from "../../lib/env";

export function getPreviewScanAvailability(env: NodeJS.ProcessEnv = process.env) {
  const redisUrl = getConfiguredValidationRedisUrl(env);
  if (!redisUrl) {
    return {
      enabled: false,
      reason: "Validation queueing is unavailable until VALIDATION_REDIS_URL or REDIS_URL is configured."
    } as const;
  }

  try {
    new URL(redisUrl);
  } catch {
    return {
      enabled: false,
      reason: "Validation queueing is unavailable because the configured validation Redis URL is invalid."
    } as const;
  }

  return {
    enabled: true,
    reason: null
  } as const;
}

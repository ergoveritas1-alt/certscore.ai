import "server-only";

const DEFAULT_SERVER_TIMING_THRESHOLD_MS = 250;

function getServerTimingThresholdMs() {
  const rawValue = process.env.SERVER_TIMING_LOG_THRESHOLD_MS?.trim();
  if (!rawValue) {
    return DEFAULT_SERVER_TIMING_THRESHOLD_MS;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_SERVER_TIMING_THRESHOLD_MS;
}

function shouldLogServerTiming() {
  return process.env.SERVER_TIMING_LOG_ENABLED?.trim().toLowerCase() !== "false";
}

export async function withServerTiming<T>(label: string, callback: () => Promise<T>): Promise<T> {
  const startedAt = performance.now();

  try {
    return await callback();
  } finally {
    const durationMs = Math.round(performance.now() - startedAt);
    if (shouldLogServerTiming() && durationMs >= getServerTimingThresholdMs()) {
      console.warn(
        JSON.stringify({
          durationMs,
          event: "server.timing",
          label
        })
      );
    }
  }
}

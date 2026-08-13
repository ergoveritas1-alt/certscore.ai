export function latestActivityAt(...values: unknown[]) {
  let latest: { milliseconds: number; timestamp: string } | null = null;

  for (const value of values) {
    const milliseconds = value instanceof Date
      ? value.getTime()
      : typeof value === "string" && value.trim()
        ? Date.parse(value)
        : Number.NaN;
    if (!Number.isFinite(milliseconds)) continue;

    if (!latest || milliseconds > latest.milliseconds) {
      latest = { milliseconds, timestamp: new Date(milliseconds).toISOString() };
    }
  }

  return latest?.timestamp ?? null;
}

export function formatScanUsageResetDate(monthlyPeriodEnd: string, month: "short" | "long" = "long") {
  // The usage period ends at the close of this UTC date; the next allowance starts the following day.
  const resetAt = new Date(Date.parse(`${monthlyPeriodEnd}T00:00:00Z`) + 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-US", {
    month,
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(resetAt);
}

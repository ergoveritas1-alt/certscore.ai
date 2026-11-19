const seconds = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 3,
  useGrouping: false,
});

function secondsNumber(milliseconds: number) {
  return seconds.format(Math.abs(milliseconds) < 0.5 ? 0 : milliseconds / 1_000);
}

export function formatReportSeconds(milliseconds: number) {
  return `${secondsNumber(milliseconds)} s`;
}

export function formatReportSecondsRange(firstMs: number, lastMs: number) {
  const first = secondsNumber(firstMs);
  const last = secondsNumber(lastMs);
  return `${first === last ? first : `${first}–${last}`} s`;
}

/** Format timing in already-retained report narration at the display boundary. */
export function formatRetainedReportTiming(text: string) {
  return text.replace(
    /\b(?:https?|wss?):\/\/[^\s<>"']+|(?<![\w./=-])(\d+(?:\.\d+)?)(?:[ \t]*[–-][ \t]*(\d+(?:\.\d+)?))?[ \t]*(milliseconds?|ms|seconds?|secs?|s)\b(?![./-]\w)/gi,
    (match, first: string | undefined, last: string | undefined, unit: string | undefined) => {
      if (first === undefined || unit === undefined) return match;
      const multiplier = /^m/i.test(unit) ? 1 : 1_000;
      const firstMs = Number(first) * multiplier;
      const lastMs = last === undefined ? firstMs : Number(last) * multiplier;
      return Number.isFinite(firstMs) && Number.isFinite(lastMs) ? formatReportSecondsRange(firstMs, lastMs) : match;
    },
  );
}

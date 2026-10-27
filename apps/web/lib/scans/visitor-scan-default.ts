export type VisitorScanFrom = "california" | "eu_ie";

/** A coarse functional default, never an authentication or residency decision.
 * Session-cookie presence conservatively preserves the existing selection even
 * if a cookie has expired. No IP, country or preference is persisted. */
export function anonymousVisitorScanFrom(headers: Pick<Headers, "get">, hasSessionCookie: boolean): VisitorScanFrom | null {
  if (hasSessionCookie) return null;
  const country = headers.get("cf-ipcountry") ?? headers.get("cloudfront-viewer-country");
  return country === "US" ? "california" : "eu_ie";
}

/** A late response must not replace a manual choice or change an active scan. */
export function applyVisitorScanFromDefault<T extends string>(input: {
  current: T;
  initialDefault: string;
  suggested: unknown;
  manuallySelected: boolean;
  submitting: boolean;
}): T | VisitorScanFrom {
  if (input.manuallySelected || input.submitting || input.current !== input.initialDefault) return input.current;
  return input.suggested === "california" || input.suggested === "eu_ie" ? input.suggested : input.current;
}

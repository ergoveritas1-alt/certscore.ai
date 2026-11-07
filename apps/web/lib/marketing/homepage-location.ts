export type HomepageLocation = "US" | "EU";
export type SampleScanFrom = "california" | "eu_ie" | "eu_de";

export function parseHomepageLocation(value: unknown): HomepageLocation | null {
  if (typeof value !== "string") return null;
  const location = value.trim().toUpperCase();
  return location === "US" || location === "EU" ? location : null;
}

export function isSampleScanFrom(value: unknown): value is SampleScanFrom {
  return value === "california" || value === "eu_ie" || value === "eu_de";
}

export function resolveSampleScanFrom(input: {
  manualScanFrom?: unknown;
  locationOverride?: unknown;
  countryDefault: "california" | "eu_ie";
}): SampleScanFrom {
  if (isSampleScanFrom(input.manualScanFrom)) return input.manualScanFrom;
  const location = parseHomepageLocation(input.locationOverride);
  return location ? location === "US" ? "california" : "eu_ie" : input.countryDefault;
}

export function homepageAudienceText(location: HomepageLocation) {
  return location === "US"
    ? "Built for developers and agencies reviewing websites for CCPA and GDPR/ePrivacy concerns."
    : "Built for developers and agencies reviewing websites for GDPR/ePrivacy and CCPA concerns.";
}

export function homepageHeroText(location: HomepageLocation) {
  return location === "US"
    ? "Scan public websites for cookies, trackers, session-replay signals, privacy disclosures, and consent behavior. Test California privacy signals, including Global Privacy Control (GPC) and opt-out mechanisms. Compare activity before consent and after eligible Accept or Reject clicks, with retained evidence and clear coverage limits."
    : "Scan public pages for cookies, trackers, session-replay signals, privacy policy signals, and consent behavior. Review what appears before consent and after eligible Accept or Reject clicks, with retained evidence and clear coverage limits.";
}

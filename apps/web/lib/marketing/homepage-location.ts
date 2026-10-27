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

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
  countryDefault: "california" | "eu_ie" | null;
  detectedLocation?: HomepageLocation;
}): SampleScanFrom {
  if (isSampleScanFrom(input.manualScanFrom)) return input.manualScanFrom;
  const location = parseHomepageLocation(input.locationOverride);
  if (location) return location === "US" ? "california" : "eu_ie";
  return input.countryDefault ?? (input.detectedLocation === "US" ? "california" : "eu_ie");
}

export function homepageAudienceText(location: HomepageLocation) {
  return location === "US"
    ? "CCPA and GDPR/ePrivacy review"
    : "GDPR/ePrivacy and CCPA review";
}

export function homepageHeroText(_location: HomepageLocation) {
  return "Review website privacy risks - what happens before and after consent.";
}

export const SCAN_FROM_VALUES = ["default", "california", "eu", "uk"] as const;

export type ScanFrom = (typeof SCAN_FROM_VALUES)[number];

export type RequestedGeoTarget = {
  countryCode: string | null;
  provider: "aws-default" | "decodo-residential";
  regionCode: string | null;
};

export type ScanFromDefinition = {
  description: string;
  label: string;
  requestedGeo: RequestedGeoTarget;
  value: ScanFrom;
};

export const DEFAULT_SCAN_FROM = "default" satisfies ScanFrom;

export const SCAN_FROM_DEFINITIONS = {
  default: {
    description: "Standard CertScore scan",
    label: "Default",
    requestedGeo: {
      countryCode: null,
      provider: "aws-default",
      regionCode: null
    },
    value: "default"
  },
  california: {
    description: "Residential exit",
    label: "California",
    requestedGeo: {
      countryCode: "US",
      provider: "decodo-residential",
      regionCode: "CA"
    },
    value: "california"
  },
  eu: {
    description: "EU non-UK residential exit",
    label: "EU",
    requestedGeo: {
      countryCode: "DE",
      provider: "decodo-residential",
      regionCode: null
    },
    value: "eu"
  },
  uk: {
    description: "United Kingdom residential exit",
    label: "UK",
    requestedGeo: {
      countryCode: "GB",
      provider: "decodo-residential",
      regionCode: null
    },
    value: "uk"
  }
} as const satisfies Record<ScanFrom, ScanFromDefinition>;

export function normalizeScanFrom(value: unknown): ScanFrom {
  return typeof value === "string" && SCAN_FROM_VALUES.includes(value as ScanFrom)
    ? (value as ScanFrom)
    : DEFAULT_SCAN_FROM;
}

export function getScanFromDefinition(value: unknown): ScanFromDefinition {
  return SCAN_FROM_DEFINITIONS[normalizeScanFrom(value)];
}

export function formatScanFromLabel(value: unknown) {
  return getScanFromDefinition(value).label;
}

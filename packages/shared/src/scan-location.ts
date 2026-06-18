export const SCAN_FROM_VALUES = ["default", "eu_de", "eu_ie", "california"] as const;

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

export const DEFAULT_SCAN_FROM = "eu_ie" satisfies ScanFrom;

export const SCAN_FROM_DEFINITIONS = {
  default: {
    description: "Legacy default CertScore scan",
    label: "Default",
    requestedGeo: {
      countryCode: null,
      provider: "aws-default",
      regionCode: null
    },
    value: "default"
  },
  eu_de: {
    description: "Frankfurt Lambda scanner",
    label: "EU-DE",
    requestedGeo: {
      countryCode: "DE",
      provider: "aws-default",
      regionCode: "eu-central-1"
    },
    value: "eu_de"
  },
  eu_ie: {
    description: "Dublin Lambda scanner",
    label: "EU-IR",
    requestedGeo: {
      countryCode: "IE",
      provider: "aws-default",
      regionCode: "eu-west-1"
    },
    value: "eu_ie"
  },
  california: {
    description: "US-West Lambda scanner",
    label: "California",
    requestedGeo: {
      countryCode: "US",
      provider: "aws-default",
      regionCode: "us-west-2"
    },
    value: "california"
  }
} as const satisfies Record<ScanFrom, ScanFromDefinition>;

export function normalizeScanFrom(value: unknown): ScanFrom {
  if (value === "eu") {
    return "eu_de";
  }
  if (value === "uk") {
    return "eu_ie";
  }
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

export const SCAN_FROM_VALUES = ["default", "eu_de", "eu_ie", "california"] as const;

export type ScanFrom = (typeof SCAN_FROM_VALUES)[number];

export type RequestedGeoTarget = {
  countryCode: string | null;
  provider: "aws-default" | "aws-ec2-proxy-eip";
  regionCode: string | null;
};

export type RealIpEgressRequirement = {
  id: string;
  provider: "aws-ec2-proxy-eip";
  required: boolean;
};

export type ScanFromDefinition = {
  description: string;
  label: string;
  realIpEgress: RealIpEgressRequirement | null;
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
    realIpEgress: null,
    value: "default"
  },
  california: {
    description: "California real-IP Lambda scanner",
    label: "California",
    requestedGeo: {
      countryCode: "US",
      provider: "aws-ec2-proxy-eip",
      regionCode: "us-west-2"
    },
    realIpEgress: {
      id: "us-ca-ec2-proxy-t4g-micro",
      provider: "aws-ec2-proxy-eip",
      required: true
    },
    value: "california"
  },
  eu_de: {
    description: "Germany real-IP Lambda scanner",
    label: "EU-DE",
    requestedGeo: {
      countryCode: "DE",
      provider: "aws-ec2-proxy-eip",
      regionCode: "eu-central-1"
    },
    realIpEgress: {
      id: "eu-de-ec2-proxy-t4g-micro",
      provider: "aws-ec2-proxy-eip",
      required: true
    },
    value: "eu_de"
  },
  eu_ie: {
    description: "Ireland real-IP Lambda scanner",
    label: "EU-IR",
    requestedGeo: {
      countryCode: "IE",
      provider: "aws-ec2-proxy-eip",
      regionCode: "eu-west-1"
    },
    realIpEgress: {
      id: "eu-ie-ec2-proxy-t4g-micro",
      provider: "aws-ec2-proxy-eip",
      required: true
    },
    value: "eu_ie"
  },
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

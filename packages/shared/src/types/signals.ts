export type SignalCategory = "accessibility" | "privacy" | "disclosure";
export type SignalValueType = "boolean" | "number" | "text" | "string_array";
export type SignalValue = boolean | number | string | string[];
export type ScanChangeEventType =
  | "signal_added"
  | "signal_removed"
  | "signal_changed"
  | "tracker_detected"
  | "tracker_removed";

export type ScanSnapshotRecord = {
  scanId: string;
  organizationId: string;
  domainId: string;
  pagesRequested: number;
  pagesScanned: number;
  totalSignals: number;
  accessibilitySignalCount: number;
  privacySignalCount: number;
  disclosureSignalCount: number;
  highSeverityCount: number;
  mediumSeverityCount: number;
  lowSeverityCount: number;
  trackerVendorCount: number;
  cookieBannerPresent: boolean;
  privacyPolicyPresent: boolean;
  termsPresent: boolean;
  cookiePolicyPresent: boolean;
  refundPolicyPresent: boolean;
  createdAt: string;
};

export type ScanSignalRecord = {
  scanId: string;
  organizationId: string;
  domainId: string;
  category: SignalCategory;
  key: string;
  label: string;
  valueType: SignalValueType;
  value: SignalValue;
  createdAt: string;
};

export type SignalChangeSummary = {
  comparedToScanId: string | null;
  isBaseline: boolean;
  addedCount: number;
  removedCount: number;
  changedCount: number;
  trackerDetectedCount: number;
  trackerRemovedCount: number;
};

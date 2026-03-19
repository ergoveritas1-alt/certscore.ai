import type { FindingSeverity, VendorCategory } from "@website-signal-risk-scanner/shared";
import { TRACKER_VENDOR_SIGNATURES } from "../snapshot/signature-registry";

export type TrackerSignature = {
  category: VendorCategory;
  defaultSeverity: FindingSeverity;
  defaultWeight: number;
  displayName: string;
  hostnamePatterns: string[];
  key: string;
  pathFragments?: string[];
};

function getDefaultSeverity(category: VendorCategory): FindingSeverity {
  if (category === "session_replay" || category === "advertising" || category === "fingerprinting") {
    return "medium";
  }

  return "low";
}

function getDefaultWeight(category: VendorCategory) {
  if (category === "session_replay") {
    return 5;
  }

  if (category === "advertising" || category === "fingerprinting") {
    return 4;
  }

  if (category === "tag_manager" || category === "marketing" || category === "social") {
    return 3;
  }

  return 2;
}

export const TRACKER_SIGNATURES: TrackerSignature[] = TRACKER_VENDOR_SIGNATURES.filter(
  (signature) => Array.isArray(signature.hostnamePatterns) && signature.hostnamePatterns.length > 0
).map((signature) => ({
  key: signature.id,
  displayName: signature.name,
  category: signature.category,
  hostnamePatterns: signature.hostnamePatterns ?? [],
  pathFragments: signature.pathFragments,
  defaultSeverity: getDefaultSeverity(signature.category),
  defaultWeight: getDefaultWeight(signature.category)
}));

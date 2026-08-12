import type { ReportSignalDefinition } from "@website-signal-risk-scanner/shared";
import { getHybridDerivedSignalValue } from "./hybrid-runtime-evidence";

export type MergedSignalValueRow = {
  key: string;
  value: boolean | number | string | string[] | null;
  selectedPopulation?: { value?: boolean | number | string | string[] | null } | null;
};

export type PersistedSignalValueRow = {
  key: string;
  value: boolean | number | string | string[];
};

export function getSignalNamespaceKey(key: string) {
  const separatorIndex = key.indexOf(".");
  return separatorIndex >= 0 ? key.slice(separatorIndex + 1) : key;
}

export function findPersistedSignalValue(signals: PersistedSignalValueRow[], key: string) {
  return signals.find((signal) => signal.key === key)?.value ?? null;
}

export function findMergedSignalValue(mergedSignals: MergedSignalValueRow[] | null | undefined, key: string) {
  const row = mergedSignals?.find((signal) => signal.key === key) ?? null;
  return row?.selectedPopulation?.value ?? row?.value ?? null;
}

export function getSnapshotSignalValue(snapshot: Record<string, unknown> | null, signalKey: string) {
  if (!snapshot) {
    return null;
  }

  const snapshotKey = getSignalNamespaceKey(signalKey);
  const directValue = snapshot[snapshotKey];
  if (directValue !== null && directValue !== undefined) {
    return directValue;
  }

  switch (signalKey) {
    case "privacy.children_privacy_context_without_supporting_disclosure":
      return (
        (snapshot.children_audience_likely === true || snapshot.kid_directed_content_detected === true) &&
        snapshot.privacy_policy_present !== true &&
        snapshot.privacy_contact_channel_type === "none"
      );
    case "privacy.consent_mechanism_absent":
      return snapshot.consent_mechanism_type === "none";
    case "privacy.consent_surface_missing":
      return (
        snapshot.consent_mechanism_type === "none" &&
        snapshot.cookie_banner_present !== true &&
        !snapshot.cmp_vendor_name &&
        (!snapshot.consent_interaction_model || snapshot.consent_interaction_model === "none")
      );
    case "privacy.privacy_contact_channel_missing":
      return snapshot.privacy_contact_channel_type === "none";
    case "privacy.sale_sharing_controls_missing":
      return snapshot.retargeting_pixel_detected === true && snapshot.do_not_sell_link_present === false;
    case "accessibility.accessibility_support_path_missing":
      return snapshot.accessibility_contact_method_present === false;
    case "privacy.cmp_vendor_detected":
      return snapshot.cmp_vendor_name ?? null;
    default:
      return null;
  }
}

export function getReportSignalValue(input: {
  getHybridDerivedSignalValue?: (signalKey: string) => unknown;
  mergedSignals?: MergedSignalValueRow[];
  policyEnrichment: Array<Record<string, unknown>>;
  runtimeArtifacts: Record<string, unknown> | null;
  signals: PersistedSignalValueRow[];
  snapshot: Record<string, unknown> | null;
  signal: ReportSignalDefinition;
}) {
  const hybridDerivedValue = input.getHybridDerivedSignalValue
    ? input.getHybridDerivedSignalValue(input.signal.key)
    : getHybridDerivedSignalValue(input.runtimeArtifacts, input.signal.key);
  if (hybridDerivedValue !== undefined) {
    return hybridDerivedValue;
  }
  const mergedSignalValue = findMergedSignalValue(input.mergedSignals, input.signal.key);

  if (input.signal.source === "snapshot_signal") {
    return getSnapshotSignalValue(input.snapshot, input.signal.key) ?? mergedSignalValue ?? findPersistedSignalValue(input.signals, input.signal.key);
  }

  if (input.signal.source === "runtime_artifact_signal") {
    return input.runtimeArtifacts?.[input.signal.key] ?? mergedSignalValue ?? findPersistedSignalValue(input.signals, input.signal.key);
  }

  return mergedSignalValue ?? findPersistedSignalValue(input.signals, input.signal.key);
}

export function isSignalValuePopulated(key: string, value: unknown) {
  if (value === null || value === undefined || value === "") {
    return false;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return false;
    }

    if (/score|window_days|word_count|semantic_confidence/i.test(key)) {
      return true;
    }

    return value > 0;
  }

  if (typeof value === "string") {
    return value.trim().length > 0 && value !== "unknown" && value !== "absent" && value !== "none";
  }

  return true;
}

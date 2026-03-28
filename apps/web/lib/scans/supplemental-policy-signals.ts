import { POLICY_POSITIVE_SIGNAL_SPECS } from "./policy-positive-signal-contract";
import { derivePositivePolicySignalMap } from "../../server/scans/policy-enrichment-normalization";

export type SupplementalPolicySignal = {
  category: string;
  key: string;
  label: string;
  value: boolean | number | string | string[];
};

function getSnapshotBoolean(snapshot: Record<string, unknown> | null | undefined, key: string) {
  return snapshot?.[key] === true;
}

function deriveSnapshotPositivePolicyFallbacks(snapshot: Record<string, unknown> | null | undefined) {
  return new Map<string, boolean>([
    [
      "privacy.privacy_rights_path_present",
      [
        "dsar_request_mechanism_present",
        "privacy_request_form_present",
        "data_access_request_present",
        "data_deletion_request_present"
      ].some((key) => getSnapshotBoolean(snapshot, key))
    ],
    [
      "privacy.privacy_contact_path_present",
      [
        "privacy_contact_method_present",
        "privacy_email_specific_present",
        "email_contact_public_present",
        "phone_number_public_present"
      ].some((key) => getSnapshotBoolean(snapshot, key))
    ]
  ]);
}

export function deriveSupplementalPolicySignals(input: {
  existingSignalKeys: Iterable<string>;
  policyEnrichment: Array<Record<string, unknown>>;
  primaryPolicyEnrichment: Record<string, unknown> | null;
  snapshot?: Record<string, unknown> | null;
}): SupplementalPolicySignal[] {
  const primaryPolicy = input.primaryPolicyEnrichment;
  const existingKeys = new Set(input.existingSignalKeys);
  const supplementalSignals: SupplementalPolicySignal[] = [];

  const positivePolicySignalMap = primaryPolicy
    ? derivePositivePolicySignalMap({
        policyEnrichment: input.policyEnrichment,
        primaryPolicyEnrichment: primaryPolicy
      })
    : new Map<string, boolean>();
  const snapshotFallbackMap = deriveSnapshotPositivePolicyFallbacks(input.snapshot);

  for (const spec of POLICY_POSITIVE_SIGNAL_SPECS) {
    if (existingKeys.has(spec.canonicalSignalKey)) {
      continue;
    }

    const value =
      positivePolicySignalMap.get(spec.canonicalSignalKey) === true ||
      snapshotFallbackMap.get(spec.canonicalSignalKey) === true;

    if (!value) {
      continue;
    }

    supplementalSignals.push({
      category: spec.canonicalSignalKey.startsWith("commerce.") ? "commerce" : "privacy",
      key: spec.canonicalSignalKey,
      label: spec.label,
      value: true
    });
  }

  return supplementalSignals;
}

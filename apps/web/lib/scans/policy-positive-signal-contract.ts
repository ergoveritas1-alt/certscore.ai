export type PolicyPositiveSignalSpec = {
  aliases: string[];
  canonicalSignalKey: string;
  evidenceSnippetKey: string | null;
  label: string;
  pageType: "privacy_policy" | "terms_of_service";
  unifiedFindingId:
    | "privacy_rights_path_present"
    | "gpc_disclosure_present"
    | "tracking_technologies_disclosure_present"
    | "targeted_advertising_disclosure_present"
    | "behavioral_analytics_disclosure_present"
    | "arbitration_clause_present";
};

export const POLICY_POSITIVE_SIGNAL_SPECS: PolicyPositiveSignalSpec[] = [
  {
    aliases: ["policyRightsSignals"],
    canonicalSignalKey: "privacy.privacy_rights_path_present",
    evidenceSnippetKey: null,
    label: "Privacy-rights path present",
    pageType: "privacy_policy",
    unifiedFindingId: "privacy_rights_path_present"
  },
  {
    aliases: [],
    canonicalSignalKey: "privacy.gpc_disclosure_present",
    evidenceSnippetKey: "topic:gpc_disclosure",
    label: "GPC handling disclosed",
    pageType: "privacy_policy",
    unifiedFindingId: "gpc_disclosure_present"
  },
  {
    aliases: [],
    canonicalSignalKey: "privacy.tracking_technologies_disclosure_present",
    evidenceSnippetKey: "topic:tracking_technologies_disclosure",
    label: "Tracking technologies disclosure present",
    pageType: "privacy_policy",
    unifiedFindingId: "tracking_technologies_disclosure_present"
  },
  {
    aliases: [],
    canonicalSignalKey: "privacy.targeted_advertising_disclosure_present",
    evidenceSnippetKey: "topic:targeted_advertising_disclosure",
    label: "Targeted advertising disclosure present",
    pageType: "privacy_policy",
    unifiedFindingId: "targeted_advertising_disclosure_present"
  },
  {
    aliases: [],
    canonicalSignalKey: "privacy.behavioral_analytics_disclosure_present",
    evidenceSnippetKey: "topic:session_replay_disclosure",
    label: "Behavioral analytics disclosure present",
    pageType: "privacy_policy",
    unifiedFindingId: "behavioral_analytics_disclosure_present"
  },
  {
    aliases: [],
    canonicalSignalKey: "commerce.arbitration_clause_present",
    evidenceSnippetKey: "arbitration",
    label: "Arbitration clause present",
    pageType: "terms_of_service",
    unifiedFindingId: "arbitration_clause_present"
  }
];

export function normalizePolicyPositiveSignalKey(key: string) {
  const lowered = key.trim().toLowerCase();
  const match = POLICY_POSITIVE_SIGNAL_SPECS.find(
    (spec) =>
      spec.canonicalSignalKey.toLowerCase() === lowered ||
      spec.aliases.some((alias) => alias.toLowerCase() === lowered)
  );

  return match?.canonicalSignalKey ?? key;
}

export function getPolicyPositiveSignalSpec(key: string) {
  const canonical = normalizePolicyPositiveSignalKey(key);
  return POLICY_POSITIVE_SIGNAL_SPECS.find((spec) => spec.canonicalSignalKey === canonical) ?? null;
}

export function isPolicyPositiveSignalKey(key: string) {
  return getPolicyPositiveSignalSpec(key) !== null;
}

export function isPrivacyRightsSignalKey(key: string) {
  return getPolicyPositiveSignalSpec(key)?.unifiedFindingId === "privacy_rights_path_present";
}

export function getPolicyPositiveSignalKeysForFinding(unifiedFindingId: string) {
  return POLICY_POSITIVE_SIGNAL_SPECS.filter((spec) => spec.unifiedFindingId === unifiedFindingId).flatMap((spec) => [
    spec.canonicalSignalKey,
    ...spec.aliases
  ]);
}

import { POLICY_POSITIVE_SIGNAL_SPECS } from "../../lib/scans/policy-positive-signal-contract";
import {
  isMeaningfulPolicyText,
  normalizePolicyEvidenceSnippetsRecord,
  normalizePolicySnippet
} from "../../lib/scans/policy-snippet-normalization";
import {
  getPolicyChildrenReference,
  getPolicyEvidenceSnippets,
  getPolicyMentions,
  getPolicyPageType,
  getPolicyRightsSignals,
  getPolicySummaryText,
  getPrivacyContactChannelType
} from "../../lib/scans/policy-enrichment-row";

function looksLikeEvidenceHash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

export function collectPolicyEvidenceHashes(rows: Array<Record<string, unknown>>) {
  const hashes = new Set<string>();

  for (const row of rows) {
    const snippets = getPolicyEvidenceSnippets(row);
    if (!snippets) {
      continue;
    }

    for (const value of Object.values(snippets)) {
      if (looksLikeEvidenceHash(value)) {
        hashes.add(value);
        continue;
      }

      if (!Array.isArray(value)) {
        continue;
      }

      for (const entry of value) {
        if (looksLikeEvidenceHash(entry)) {
          hashes.add(entry);
        }
      }
    }
  }

  return [...hashes];
}

export function dereferencePolicyEvidenceSnippets(input: {
  evidenceByHash: Map<string, string>;
  rows: Array<Record<string, unknown>>;
}) {
  return input.rows.map((row) => {
    const rawSnippets = getPolicyEvidenceSnippets(row);
    if (!rawSnippets) {
      return row;
    }

    const resolved = normalizePolicyEvidenceSnippetsRecord(
      Object.fromEntries(
        Object.entries(rawSnippets).map(([key, value]) => {
          if (looksLikeEvidenceHash(value)) {
            return [key, input.evidenceByHash.get(value) ?? value];
          }

          if (Array.isArray(value)) {
            return [
              key,
              value.map((entry) => (looksLikeEvidenceHash(entry) ? input.evidenceByHash.get(entry) ?? entry : entry))
            ];
          }

          return [key, value];
        })
      )
    );

    const resolvedPolicyRightsSignals = getPolicyRightsSignals(row, resolved);

    return {
      ...row,
      ...(resolvedPolicyRightsSignals.length > 0
        ? {
            policyRightsSignals: resolvedPolicyRightsSignals,
            policy_rights_signals: resolvedPolicyRightsSignals
          }
        : {}),
      ...(typeof row.policySummaryShort === "string"
        ? { policySummaryShort: normalizePolicySnippet(row.policySummaryShort) ?? null }
        : {}),
      ...(typeof row.policy_summary_short === "string"
        ? { policy_summary_short: normalizePolicySnippet(row.policy_summary_short) ?? null }
        : {}),
      policyEvidenceSnippets: resolved,
      policy_evidence_snippets: resolved
    };
  });
}

export function derivePositivePolicySignalMap(input: {
  policyEnrichment: Array<Record<string, unknown>>;
  primaryPolicyEnrichment: Record<string, unknown> | null;
}) {
  const primaryPolicy = input.primaryPolicyEnrichment;
  if (!primaryPolicy) {
    return new Map<string, boolean>();
  }

  const primaryEvidenceSnippets = getPolicyEvidenceSnippets(primaryPolicy);
  const policyRightsSignals = getPolicyRightsSignals(primaryPolicy, primaryEvidenceSnippets);
  const policySummaryText = getPolicySummaryText(primaryPolicy)?.toLowerCase() ?? "";
  const privacyContactChannelType = getPrivacyContactChannelType(primaryPolicy);
  const policyChildrenReference = getPolicyChildrenReference(primaryPolicy);
  const privacyPolicyRows = [
    primaryPolicy,
    ...input.policyEnrichment.filter(
      (row) => row !== primaryPolicy && getPolicyPageType(row) === "privacy_policy"
    )
  ];
  const rowHasPolicyMention = (row: Record<string, unknown>, topic: string) =>
    getPolicyMentions(row).some(
      (entry) =>
        Boolean(entry) &&
        typeof entry === "object" &&
        ((((entry as { topic?: unknown }).topic as string | undefined) ?? "").toLowerCase() === topic)
    );
  const rowHasEvidenceSnippet = (row: Record<string, unknown>, ...keys: string[]) => {
    const snippets = getPolicyEvidenceSnippets(row);
    return keys.some((key) => isMeaningfulPolicyText(snippets?.[key]));
  };
  const summaryMatches = (pattern: RegExp) => pattern.test(policySummaryText);
  const anyPrivacyPolicyRowMatches = (matcher: (row: Record<string, unknown>) => boolean) => privacyPolicyRows.some(matcher);

  return new Map(
    POLICY_POSITIVE_SIGNAL_SPECS.map((spec) => {
      const value =
        spec.unifiedFindingId === "privacy_rights_path_present"
          ? policyRightsSignals.length > 0
          : spec.unifiedFindingId === "privacy_contact_path_present"
            ? (privacyContactChannelType !== null && privacyContactChannelType !== "none") ||
              anyPrivacyPolicyRowMatches((row) => rowHasEvidenceSnippet(row, "privacy_contact", "dsar")) ||
              summaryMatches(/\bprivacy\b.{0,80}\b(contact|email|request|questions?)\b|\bcontact us\b.{0,80}\bprivacy\b/)
          : spec.unifiedFindingId === "arbitration_clause_present"
            ? input.policyEnrichment.some(
                (row) => row.policyArbitrationPresent === true || row.policy_arbitration_present === true
              )
            : spec.evidenceSnippetKey === "topic:gpc_disclosure"
              ? anyPrivacyPolicyRowMatches((row) => rowHasPolicyMention(row, "gpc_disclosure"))
              : spec.evidenceSnippetKey === "topic:tracking_technologies_disclosure"
                ? anyPrivacyPolicyRowMatches((row) => rowHasPolicyMention(row, "tracking_technologies_disclosure"))
                : spec.evidenceSnippetKey === "topic:targeted_advertising_disclosure"
                  ? anyPrivacyPolicyRowMatches((row) => rowHasPolicyMention(row, "targeted_advertising_disclosure"))
                  : spec.evidenceSnippetKey === "topic:third_party_advertising_disclosure"
                    ? anyPrivacyPolicyRowMatches(
                        (row) =>
                          rowHasPolicyMention(row, "third_party_advertising_disclosure") ||
                          rowHasEvidenceSnippet(row, "topic:third_party_advertising_disclosure")
                      ) ||
                      summaryMatches(/\badvertising partners?\b|\bthird-?party ad(?:vertising)?\b|\bad networks?\b|\bad servers?\b/)
                  : spec.evidenceSnippetKey === "topic:session_replay_disclosure"
                    ? anyPrivacyPolicyRowMatches((row) => rowHasPolicyMention(row, "session_replay_disclosure"))
                    : spec.evidenceSnippetKey === "topic:children"
                      ? anyPrivacyPolicyRowMatches(
                          (row) => rowHasPolicyMention(row, "children") || rowHasEvidenceSnippet(row, "topic:children", "children")
                        ) ||
                        (policyChildrenReference !== null && !["none", "unknown"].includes(policyChildrenReference)) ||
                        summaryMatches(/\bchildren\b|\bunder 13\b|\bunder 16\b/)
                      : false;

      return [spec.canonicalSignalKey, value];
    })
  );
}

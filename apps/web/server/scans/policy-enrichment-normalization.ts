import { POLICY_POSITIVE_SIGNAL_SPECS } from "../../lib/scans/policy-positive-signal-contract";
import { normalizePolicyEvidenceSnippetsRecord, normalizePolicySnippet } from "../../lib/scans/policy-snippet-normalization";

function looksLikeEvidenceHash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function getPolicyEvidenceSnippets(row: Record<string, unknown>) {
  return row.policyEvidenceSnippets && typeof row.policyEvidenceSnippets === "object"
    ? (row.policyEvidenceSnippets as Record<string, unknown>)
    : row.policy_evidence_snippets && typeof row.policy_evidence_snippets === "object"
      ? (row.policy_evidence_snippets as Record<string, unknown>)
      : null;
}

function getPolicyRightsSignals(row: Record<string, unknown>, snippets?: Record<string, unknown> | null) {
  return Array.isArray(row.policyRightsSignals)
    ? row.policyRightsSignals
    : Array.isArray(row.policy_rights_signals)
      ? row.policy_rights_signals
      : Array.isArray(snippets?.policy_rights_signals)
        ? snippets.policy_rights_signals
        : [];
}

function getPolicyMentions(row: Record<string, unknown>) {
  return Array.isArray(row.policyMentions)
    ? row.policyMentions
    : Array.isArray(row.policy_mentions)
      ? row.policy_mentions
      : [];
}

function getPolicySummaryText(row: Record<string, unknown>) {
  return typeof row.policySummaryShort === "string"
    ? row.policySummaryShort
    : typeof row.policy_summary_short === "string"
      ? row.policy_summary_short
      : null;
}

function getPrivacyContactChannelType(row: Record<string, unknown>) {
  return typeof row.privacyContactChannelType === "string"
    ? row.privacyContactChannelType
    : typeof row.privacy_contact_channel_type === "string"
      ? row.privacy_contact_channel_type
      : null;
}

function getPolicyChildrenReference(row: Record<string, unknown>) {
  return typeof row.policyChildrenReference === "string"
    ? row.policyChildrenReference
    : typeof row.policy_children_reference === "string"
      ? row.policy_children_reference
      : null;
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
        ? { policySummaryShort: normalizePolicySnippet(row.policySummaryShort) ?? row.policySummaryShort }
        : {}),
      ...(typeof row.policy_summary_short === "string"
        ? { policy_summary_short: normalizePolicySnippet(row.policy_summary_short) ?? row.policy_summary_short }
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
  const policyMentions = getPolicyMentions(primaryPolicy);
  const policySummaryText = getPolicySummaryText(primaryPolicy)?.toLowerCase() ?? "";
  const privacyContactChannelType = getPrivacyContactChannelType(primaryPolicy);
  const policyChildrenReference = getPolicyChildrenReference(primaryPolicy);
  const hasPolicyMention = (topic: string) =>
    policyMentions.some(
      (entry) =>
        Boolean(entry) &&
        typeof entry === "object" &&
        ((((entry as { topic?: unknown }).topic as string | undefined) ?? "").toLowerCase() === topic)
    );
  const hasEvidenceSnippet = (...keys: string[]) =>
    keys.some((key) => typeof primaryEvidenceSnippets?.[key] === "string" && String(primaryEvidenceSnippets[key]).trim().length > 0);
  const summaryMatches = (pattern: RegExp) => pattern.test(policySummaryText);

  return new Map(
    POLICY_POSITIVE_SIGNAL_SPECS.map((spec) => {
      const value =
        spec.unifiedFindingId === "privacy_rights_path_present"
          ? policyRightsSignals.length > 0
          : spec.unifiedFindingId === "privacy_contact_path_present"
            ? (privacyContactChannelType !== null && privacyContactChannelType !== "none") ||
              hasEvidenceSnippet("privacy_contact", "dsar") ||
              summaryMatches(/\bprivacy\b.{0,80}\b(contact|email|request|questions?)\b|\bcontact us\b.{0,80}\bprivacy\b/)
          : spec.unifiedFindingId === "arbitration_clause_present"
            ? input.policyEnrichment.some(
                (row) => row.policyArbitrationPresent === true || row.policy_arbitration_present === true
              )
            : spec.evidenceSnippetKey === "topic:gpc_disclosure"
              ? hasPolicyMention("gpc_disclosure")
              : spec.evidenceSnippetKey === "topic:tracking_technologies_disclosure"
                ? hasPolicyMention("tracking_technologies_disclosure")
                : spec.evidenceSnippetKey === "topic:targeted_advertising_disclosure"
                  ? hasPolicyMention("targeted_advertising_disclosure")
                  : spec.evidenceSnippetKey === "topic:third_party_advertising_disclosure"
                    ? hasPolicyMention("third_party_advertising_disclosure") ||
                      hasEvidenceSnippet("topic:third_party_advertising_disclosure") ||
                      summaryMatches(/\badvertising partners?\b|\bthird-?party ad(?:vertising)?\b|\bad networks?\b|\bad servers?\b/)
                  : spec.evidenceSnippetKey === "topic:session_replay_disclosure"
                    ? hasPolicyMention("session_replay_disclosure")
                    : spec.evidenceSnippetKey === "topic:children"
                      ? hasPolicyMention("children") ||
                        hasEvidenceSnippet("topic:children", "children") ||
                        (policyChildrenReference !== null && !["none", "unknown"].includes(policyChildrenReference)) ||
                        summaryMatches(/\bchildren\b|\bunder 13\b|\bunder 16\b/)
                      : false;

      return [spec.canonicalSignalKey, value];
    })
  );
}

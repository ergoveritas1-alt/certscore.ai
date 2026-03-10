import { hashEvidenceSnippet } from "./normalize";
import type { PolicyEvidence } from "@website-signal-risk-scanner/shared";

export function buildPolicyEvidenceRecords(input: {
  pageUrl: string;
  snippets: Record<string, string | null>;
}) {
  const evidenceMap = new Map<string, PolicyEvidence>();
  const references: Record<string, string | null> = {};

  for (const [key, snippet] of Object.entries(input.snippets)) {
    if (!snippet) {
      references[key] = null;
      continue;
    }

    const evidenceHash = hashEvidenceSnippet(snippet);
    references[key] = evidenceHash;
    evidenceMap.set(evidenceHash, {
      evidenceHash,
      snippet,
      sourcePageUrl: input.pageUrl,
      snippetLocation: input.pageUrl
    });
  }

  return {
    evidences: [...evidenceMap.values()],
    references
  };
}

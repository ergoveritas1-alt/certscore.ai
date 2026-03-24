import { shouldSurfacePrimarySignalFinding } from "./finding-evidence-gates";

export function shouldSurfaceSupplementalPolicyReviewFinding(input: {
  evidence: Record<string, unknown> | null | undefined;
  reason: string;
  ruleKey: string;
}) {
  // Replay/disclosure review queue items stay analyst-only unless a concrete
  // validation finding already exists elsewhere in the report.
  if (input.reason === "session_replay_without_disclosure_detected") {
    return false;
  }

  return shouldSurfacePrimarySignalFinding({
    fallbackEvidence: input.evidence,
    key: input.ruleKey,
    linkedValidationEvidence: null
  });
}

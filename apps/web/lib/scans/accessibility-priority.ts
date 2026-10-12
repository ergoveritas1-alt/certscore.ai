import { projectExecutiveFindingsFromUnifiedPackets } from "./executive-findings-projection";
import { evaluateTopFindingEligibility } from "./top-finding-eligibility";
import type { UnifiedFindingDisplayPacket } from "./unified-findings";

/** Select already policy-projected findings only. Raw audit counts cannot create a priority. */
export function projectAccessibilityPriorities(packets: UnifiedFindingDisplayPacket[]) {
  return projectExecutiveFindingsFromUnifiedPackets(packets.filter(packet => packet.details?.family === "accessibility")).findings.filter(finding => {
    if (finding.section !== "Accessibility" || !["critical", "high"].includes(finding.severity)
      || !["strong", "good"].includes(finding.confidence) || finding.directVsInferred === "inferred") return false;
    const decision = evaluateTopFindingEligibility(finding);
    if (decision.eligibility !== "top_candidate" || decision.missingCorroborators.length) return false;
    if (finding.id === "focus_management_issue") return true; // Existing policy requires reproduced traversal proof.
    const evidence = finding.evidenceDetails?.accessibilityEvidence;
    const rows = Array.isArray(evidence?.axeEvidence) ? evidence.axeEvidence : [];
    return rows.some(row => {
      if (!row || typeof row !== "object") return false;
      const nodes = (row as Record<string, unknown>).representativeNodes;
      return Array.isArray(nodes) && nodes.some(node => node && typeof node === "object"
        && Array.isArray(node.selectors) && node.selectors.length > 0
        && typeof node.htmlSnippet === "string" && node.htmlSnippet.trim()
        && typeof node.failureSummary === "string" && node.failureSummary.trim());
    });
  });
}

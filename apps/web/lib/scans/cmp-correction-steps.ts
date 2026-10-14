import type { CmpAuditRow } from "./cmp-audit-projection";

/** Review guidance for existing projected results, not additional findings. */
export function cmpCorrectionSteps(row: CmpAuditRow): string[] {
  if (row.status !== "Review recommended" && row.status !== "Not observed") return [];
  switch (row.id) {
    case "prominence": return [
      "Compare Accept and Reject on the same page.",
      "Make Reject as easy to find and use, then check both controls in a fresh session.",
    ];
    case "implementation": return [
      "Check the listed requests, their purposes and their consent categories.",
      "For requests that require consent, update the tag or integration to respect Reject.",
      "Retest before a choice, after Reject and after Accept. Confirm each choice and check the resulting activity.",
    ];
    case "found_not_declared": return [
      "Check the unmatched names against the CMP list and confirm their purposes and consent state.",
      "Add any confirmed omissions to the CMP list.",
      "Repeat the comparison after updating the list.",
    ];
    default: return ["Check the evidence for this item before making changes."];
  }
}

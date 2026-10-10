import { CERT_SCORE_FINDING_REGISTRY } from "./finding-registry";

/** Rank already-projected findings; never change their severity, status or eligibility. */
export function comparePriorityReviewFindings(
  left: { id: string; priority?: "high" },
  right: { id: string; priority?: "high" },
) {
  // Privacy, consent and security concerns lead this regulatory review. An axe
  // impact rating alone does not establish a task-blocking accessibility barrier.
  const leftAccessibility = CERT_SCORE_FINDING_REGISTRY[left.id]?.section === "Accessibility";
  const rightAccessibility = CERT_SCORE_FINDING_REGISTRY[right.id]?.section === "Accessibility";
  return Number(leftAccessibility) - Number(rightAccessibility)
    || Number(right.priority === "high") - Number(left.priority === "high");
}

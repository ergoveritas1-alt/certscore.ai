import {
  californiaPrivacyReviewSchema, californiaPrivacyReviewFindingIds,
  CALIFORNIA_CHOICE_ABSENCE_ID, CALIFORNIA_PRIVACY_REVIEW_SIGNAL,
  PRIVACY_CHOICE_PRESENCE_SIGNAL, PRIVACY_CHOICE_PRESENCE_TITLE,
} from "@certscore/contracts";
import type { UnifiedFindingDisplayPacket } from "./unified-findings";

/** Place already-projected canonical observations in the snapshot. Missing
 * evidence never becomes absence, and raw labels never become findings. */
export function projectCaliforniaChoicePresence(findings: UnifiedFindingDisplayPacket[], scanId: string, documentUrl?: string) {
  let absence: CaliforniaChoicePresence | null = null;
  for (const finding of findings) {
    if (finding.details?.family !== "california_privacy_review" || !finding.surfacingDecision?.reportable ||
        !finding.concernContext?.promotionEligibilities.includes("eligible") ||
        !finding.concernContext.externalSurfacingEligibilities.includes("eligible")) continue;
    const parsed = californiaPrivacyReviewSchema.safeParse(finding.details.projection);
    if (!parsed.success || parsed.data.scanId !== scanId || (documentUrl !== undefined && parsed.data.documentUrl !== documentUrl)) continue;
    const review = parsed.data;
    const hasSignal = (key: string) => finding.sourceRefs.some(ref => ref.kind === "signal" && ref.source === "runtime_artifact_signal" && ref.key === key);
    if (finding.unifiedFindingId === "targeted_advertising_choices_present" &&
        finding.surfacingDecision.reportLane === "confidence_and_coverage" &&
        finding.surfacingDecision.appliedRules.includes("evidence.privacy_choice_presence.observed") &&
        !finding.scoreEffects?.length && hasSignal(PRIVACY_CHOICE_PRESENCE_SIGNAL)) {
      const links = review.choicePresence?.links.filter(link => link.kind === "do_not_sell_or_share") ?? [];
      if (links.length) return { state: "observed", title: PRIVACY_CHOICE_PRESENCE_TITLE, scanId,
        sourceHash: review.sourceHash, labels: [...new Set(links.map(link => link.label))] } satisfies CaliforniaChoicePresence;
    }
    if (finding.unifiedFindingId === CALIFORNIA_CHOICE_ABSENCE_ID &&
        finding.presentationDecision.status === "surface" &&
        hasSignal(`${CALIFORNIA_PRIVACY_REVIEW_SIGNAL}.${CALIFORNIA_CHOICE_ABSENCE_ID}`) &&
        californiaPrivacyReviewFindingIds(review).includes(CALIFORNIA_CHOICE_ABSENCE_ID) &&
        review.choiceSurface === "not_observed_in_inspected_scope") {
      absence = { state: "not_observed", title: "Sale/sharing opt-out link not observed", scanId,
        sourceHash: review.sourceHash, labels: [] };
    }
  }
  return absence;
}
export type CaliforniaChoicePresence = {
  state: "observed" | "not_observed";
  title: string;
  scanId: string;
  sourceHash: string;
  labels: string[];
};

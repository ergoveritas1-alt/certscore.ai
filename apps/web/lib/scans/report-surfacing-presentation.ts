import type {
  SurfacingDecisionState,
  SurfacingReportLane,
  UnifiedFindingSurfacingDecision
} from "./report-surfacing-policy";

export type SurfacingDecisionLike = Pick<UnifiedFindingSurfacingDecision, "decisionState" | "reportLane">;

export function getSurfacingDecisionStateBadgeClasses(state: SurfacingDecisionState) {
  switch (state) {
    case "confirmed":
      return "bg-emerald-100 text-emerald-900";
    case "review":
      return "bg-amber-100 text-amber-900";
    case "support_only":
      return "bg-sky-100 text-sky-900";
    default:
      return "bg-slate-200 text-slate-700";
  }
}

export function getSurfacingLaneBadgeClasses(lane: SurfacingReportLane) {
  switch (lane) {
    case "main":
      return "bg-slate-900 text-white";
    case "confidence_and_coverage":
      return "bg-slate-100 text-slate-800";
    default:
      return "bg-slate-200 text-slate-700";
  }
}

export function getSurfacingDecisionStateLabel(state: SurfacingDecisionState) {
  switch (state) {
    case "confirmed":
      return "Confirmed";
    case "review":
      return "Review";
    case "support_only":
      return "Support";
    default:
      return "Suppressed";
  }
}

export function getSurfacingLaneLabel(lane: SurfacingReportLane) {
  switch (lane) {
    case "main":
      return "Main";
    case "confidence_and_coverage":
      return "Confidence";
    default:
      return "Suppressed";
  }
}

export function isMainNarrativeSurfacing(decision: SurfacingDecisionLike) {
  return decision.reportLane === "main" && decision.decisionState !== "support_only";
}

export function isConfidenceCoverageSurfacing(decision: SurfacingDecisionLike) {
  return decision.reportLane === "confidence_and_coverage";
}

export function isSupportingContextSurfacing(decision: SurfacingDecisionLike) {
  return decision.decisionState === "support_only";
}

import assert from "node:assert/strict";
import test from "node:test";
import {
  getSurfacingDecisionStateBadgeClasses,
  getSurfacingDecisionStateLabel,
  getSurfacingLaneBadgeClasses,
  getSurfacingLaneLabel,
  isConfidenceCoverageSurfacing,
  isMainNarrativeSurfacing,
  isSupportingContextSurfacing
} from "./report-surfacing-presentation";

test("surfacing labels stay stable for calibration UI", () => {
  assert.equal(getSurfacingDecisionStateLabel("confirmed"), "Confirmed");
  assert.equal(getSurfacingDecisionStateLabel("review"), "Review");
  assert.equal(getSurfacingDecisionStateLabel("support_only"), "Support");
  assert.equal(getSurfacingDecisionStateLabel("suppressed"), "Suppressed");

  assert.equal(getSurfacingLaneLabel("main"), "Main");
  assert.equal(getSurfacingLaneLabel("confidence_and_coverage"), "Confidence");
  assert.equal(getSurfacingLaneLabel("suppressed"), "Suppressed");
});

test("surfacing badge classes stay stable for calibration UI", () => {
  assert.equal(getSurfacingDecisionStateBadgeClasses("confirmed"), "bg-emerald-100 text-emerald-900");
  assert.equal(getSurfacingDecisionStateBadgeClasses("review"), "bg-amber-100 text-amber-900");
  assert.equal(getSurfacingDecisionStateBadgeClasses("support_only"), "bg-sky-100 text-sky-900");
  assert.equal(getSurfacingDecisionStateBadgeClasses("suppressed"), "bg-slate-200 text-slate-700");

  assert.equal(getSurfacingLaneBadgeClasses("main"), "bg-slate-900 text-white");
  assert.equal(getSurfacingLaneBadgeClasses("confidence_and_coverage"), "bg-slate-100 text-slate-800");
  assert.equal(getSurfacingLaneBadgeClasses("suppressed"), "bg-slate-200 text-slate-700");
});

test("main surfacing excludes support-only findings", () => {
  assert.equal(
    isMainNarrativeSurfacing({
      decisionState: "confirmed",
      reportLane: "main"
    }),
    true
  );
  assert.equal(
    isMainNarrativeSurfacing({
      decisionState: "review",
      reportLane: "main"
    }),
    true
  );
  assert.equal(
    isMainNarrativeSurfacing({
      decisionState: "support_only",
      reportLane: "main"
    }),
    false
  );
});

test("confidence and support helpers remain deterministic", () => {
  assert.equal(
    isConfidenceCoverageSurfacing({
      decisionState: "review",
      reportLane: "confidence_and_coverage"
    }),
    true
  );
  assert.equal(
    isConfidenceCoverageSurfacing({
      decisionState: "confirmed",
      reportLane: "main"
    }),
    false
  );
  assert.equal(
    isSupportingContextSurfacing({
      decisionState: "support_only",
      reportLane: "main"
    }),
    true
  );
  assert.equal(
    isSupportingContextSurfacing({
      decisionState: "review",
      reportLane: "confidence_and_coverage"
    }),
    false
  );
});

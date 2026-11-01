import { consentControlAssessmentSchema, hasVerifiedConsentControlAbsence } from "@certscore/contracts";

/** Public evidence preserves canonical unknowns and control-specific inspection;
 * the binary customer summary and checklist verdicts are different projections. */
export function projectPublicFirstLayerConsentEvidence(value: unknown, expectedScanId: string) {
  const parsed = consentControlAssessmentSchema.safeParse(value);
  if (!parsed.success) return null;
  const a = parsed.data;
  if (!expectedScanId || a.scan.scanId !== expectedScanId || a.scan.noGo ||
      a.document.identityStatus !== "matched") return null;
  const keys = ["accept", "reject", "options"] as const;
  const state = (key: typeof keys[number] | "privacyOptOut") => a.controls[key].layer !== "first_layer" ? null :
    a.controls[key].state === "observed" ? true :
    hasVerifiedConsentControlAbsence(a, key) ? false : null;
  const controls = a.evidence.filter(e => e.layer === "first_layer" && e.visible && e.actionable && e.label &&
    ["accept", "reject", "options", "privacy_opt_out"].includes(e.intent) && !e.controlVariant)
    .slice(0, 12).map(e => ({
      label: e.label,
      actionType: e.intent === "accept" ? "accept_all" : e.intent === "reject" ? "reject_all" :
        e.intent === "options" ? "manage_preferences" : "do_not_sell_share",
      visible: true,
    }));
  return {
    evidenceSource: "canonical_consent_control_assessment",
    assessmentVersion: a.artifactVersion,
    assessmentSourceHash: a.provenance.sourceHash,
    acceptControlObserved: state("accept"),
    rejectControlObserved: state("reject"),
    managePreferencesControlObserved: state("options"),
    privacyOptOutControlObserved: state("privacyOptOut"),
    privacyOptOutControlInventoryComplete: state("privacyOptOut") !== null && (
      a.artifactVersion === "2.2" ? a.controls.privacyOptOut.inspection?.status === "complete" &&
        Boolean(a.controls.privacyOptOut.inspection?.evidenceRefs.length) :
        a.assessmentStatus === "complete" && a.coverage.status === "complete"
    ),
    capturedBeforeInteraction: true,
    layerInspected: "first_layer",
    actionableControlInventoryRetained: controls.length > 0,
    controlInventoryComplete: keys.every(key => state(key) !== null && (
      a.artifactVersion === "2.2" ? a.controls[key].inspection?.status === "complete" &&
        Boolean(a.controls[key].inspection?.evidenceRefs.length) :
        a.assessmentStatus === "complete" && a.coverage.status === "complete"
    )),
    controlInspection: Object.fromEntries([...keys, "privacyOptOut" as const].map(key => [key, {
      state: state(key) === null ? "unknown" : state(key) ? "observed" : "not_observed",
      status: a.controls[key].inspection?.status ?? "unavailable",
      reasonCodes: a.controls[key].reasonCodes.slice(0, 16),
      evidenceRefs: a.controls[key].inspection?.evidenceRefs.slice(0, 12) ?? [],
    }])),
    controls,
    acceptLabels: controls.filter(c => c.actionType === "accept_all").map(c => c.label),
    rejectLabels: controls.filter(c => c.actionType === "reject_all").map(c => c.label),
    preferenceLabels: controls.filter(c => c.actionType === "manage_preferences").map(c => c.label),
    visibleChoiceLabels: controls.map(c => c.label),
  };
}

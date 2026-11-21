import { consentControlAssessmentSchema, hasVerifiedConsentControlAbsence, namesOptOutSettingsEntrance, type ConsentControlAssessment } from "@certscore/contracts";

function publicOptOutSurfaces(a: ConsentControlAssessment) {
  const firstLayer = a.evidence.filter(e => e.layer === "first_layer" && e.visible && e.actionable && e.label);
  const openers = firstLayer.filter(e => e.opensPreferenceCenter && e.intent === "privacy_opt_out");
  // Summarize distinct displayed labels per surface. Keep every source observation in canonical evidence.
  const bannerControls = new Map<string, {label: string; opensPreferenceCenter: true | null;
    settingsEntranceSource?: "accessible_name" | "same_banner_notice"; initialSwitchScope?: "sale" | "sharing"; evidenceRef: string}>();
  const vendorRefusals = new Map<string, {label: string; evidenceRef: string}>();
  for (const row of firstLayer) {
    if (row.intent !== "privacy_opt_out" && row.intent !== "vendor_refusal") continue;
    const opener = row.intent === "privacy_opt_out" && openers.find(e => e.documentToken === row.documentToken &&
      (e.label === row.label || namesOptOutSettingsEntrance(e.label, row.label)));
    const label = (opener && opener.label) || row.label!;
    const key = label.trim().toLowerCase().replace(/\s+/g, " ");
    if (row.intent === "vendor_refusal") {
      if (!vendorRefusals.has(key)) vendorRefusals.set(key, {label, evidenceRef: row.evidenceId});
    } else if (!bannerControls.has(key) || opener) {
      bannerControls.set(key, {label, opensPreferenceCenter: opener ? true : null,
        ...(opener && opener.settingsEntranceSource ? {settingsEntranceSource: opener.settingsEntranceSource} : {}),
        ...(row.initialSwitchScope ? {initialSwitchScope:row.initialSwitchScope} : {}),
        evidenceRef: opener ? opener.evidenceId : row.evidenceId});
    }
  }
  const packet = a.sameVisitFooter;
  const sameVisitFooter = packet ? {
    coverage: packet.coverage,
    otherControls: packet.candidates.filter(row => row.visibility !== "rendered_exposed" && row.visibility !== "covered")
      .map(row => ({label: row.label, visibility: row.visibility, evidenceRef: packet.artifactId + ":" + row.evidenceId})),
  } : ["2.2.7", "2.2.8", "2.2.9", "2.2.10", "2.2.11", "2.2.12", "2.2.13", "2.2.14", "2.2.15", "2.2.16", "2.2.17", "2.2.18", "2.2.19", "2.2.20", "2.2.21", "2.2.22", "2.2.23", "2.2.24", "2.2.25", "2.2.26", "2.2.27", "2.2.28", "2.2.29", "2.2.30", "2.2.31", "2.2.32", "2.2.33", "2.2.34", "2.2.35", "2.2.36", "2.2.37", "2.2.38"].includes(a.provenance.projectorVersion) ? {coverage: "unavailable" as const, otherControls: []} : undefined;
  const capture=a.sameVisitFooterCapture;
  const captureReason=capture?.resolution === "capture_incomplete" ? capture.diagnostic?.outcome ?? "source_unavailable" :
    capture?.resolution;
  const siteNavigationControls = (a.optOutPlacementCorrections ?? [])
    .filter(row => row.placement === "persistent_site_navigation")
    .map(row => ({label:row.label,evidenceRef:"ConsentControlGeometryEvidence.json:" + row.geometryCandidateId}));
  return {
    version: "opt_out_surfaces.v1" as const,
    bannerControls: [...bannerControls.values()],
    footerLinks: a.optOutFooterLinks ?? [],
    ...(siteNavigationControls.length ? {siteNavigationControls} : {}),
    ...(sameVisitFooter ? {sameVisitFooter} : {}),
    ...(captureReason ? {sameVisitFooterCapture: {reason:captureReason,
      ...(capture?.diagnostic?.recovery && capture.diagnostic.recovery !== "none" ? {recovery:capture.diagnostic.recovery} : {}),
      ...(packet?.limitations.includes("unsupported_control_name") ? {unsupportedControlName:true} : {}),
      ...(packet?.candidates.some(c=>c.visibility==="unverified" || c.visibility==="offscreen_unverified") ? {unverifiedGeometry:true} : {})}} : {}),
    ...(a.optOutFooterInspection ? {footerInspection: a.optOutFooterInspection} : {}),
    ...(a.optOutTimingLimitation ? {bannerTimingLimitation: a.optOutTimingLimitation} : {}),
    vendorRefusals: [...vendorRefusals.values()],
  };
}

export type PublicOptOutSurfaces = ReturnType<typeof publicOptOutSurfaces>;

/** Coverage-only entry point for a report with conflicting starting or recovery documents. */
export function projectDocumentMismatchFooterStatus(value: unknown, expectedScanId: string): PublicOptOutSurfaces | undefined {
  const parsed=consentControlAssessmentSchema.safeParse(value);
  if (!parsed.success || !expectedScanId || parsed.data.scan.scanId!==expectedScanId || parsed.data.scan.noGo ||
      parsed.data.document.identityStatus!=="mismatched" || parsed.data.sameVisitFooterCapture?.resolution!=="document_mismatch") return;
  return {version:"opt_out_surfaces.v1", bannerControls:[], footerLinks:[], vendorRefusals:[],
    sameVisitFooter:{coverage:"unavailable",otherControls:[]},sameVisitFooterCapture:{reason:"document_mismatch"}};
}

// The public inventory groups necessary-only choices with refusal of optional cookies.
// Keep this interpretation at the report boundary, outside action and scoring policy.
const necessaryOnlyLabels = new Set(["notwendige cookies erlauben", "accetta i cookie necessari e chiudi"]);

/** Shared by report presentations after scan, document and visit validation. */
export function firstLayerReportingControls(a: ConsentControlAssessment) {
  const firstLayer = a.evidence.filter(e => e.layer === "first_layer" && e.visible && e.actionable && e.label &&
    ["accept", "reject", "options", "privacy_opt_out"].includes(e.intent) && !e.controlVariant);
  const necessaryOnly = firstLayer.filter(e => e.intent === "accept" && e.label &&
    e.documentId && e.documentId === a.document.canonicalDocumentId &&
    (!e.documentToken || !a.document.canonicalDocumentToken || e.documentToken === a.document.canonicalDocumentToken) &&
    necessaryOnlyLabels.has(e.label.trim().toLowerCase().replace(/\s+/g, " ")));
  const reported = firstLayer.map(e => necessaryOnly.includes(e) ? { ...e, intent: "reject" as const } : e);
  const acceptStillObserved = reported.some(e => e.intent === "accept");
  return { necessaryOnly, reported, acceptStillObserved };
}

/** Public evidence preserves canonical unknowns and control-specific inspection;
 * the binary customer summary and checklist verdicts are different projections. */
export function projectPublicFirstLayerConsentEvidence(value: unknown, expectedScanId: string) {
  const parsed = consentControlAssessmentSchema.safeParse(value);
  if (!parsed.success) return null;
  const a = parsed.data;
  if (!expectedScanId || a.scan.scanId !== expectedScanId || a.scan.noGo ||
      a.document.identityStatus !== "matched") return null;
  const keys = ["accept", "reject", "options"] as const;
  const retainedState = (key: typeof keys[number] | "privacyOptOut") => a.controls[key].layer !== "first_layer" ? null :
    a.controls[key].state === "observed" ? true :
    hasVerifiedConsentControlAbsence(a, key) ? false : null;
  const { necessaryOnly, reported, acceptStillObserved } = firstLayerReportingControls(a);
  const state = (key: typeof keys[number] | "privacyOptOut") => {
    if (necessaryOnly.length && key === "reject") return true;
    if (necessaryOnly.length && key === "accept" && !acceptStillObserved && retainedState(key) === true) return null;
    return retainedState(key);
  };
  const controls = reported.slice(0, 12).map(e => ({
      label: e.label,
      actionType: e.intent === "accept" ? "accept_all" : e.intent === "reject" ? "reject_all" :
        e.intent === "options" ? "manage_preferences" : "do_not_sell_share",
      visible: true,
      ...(e.opensPreferenceCenter ? {opensPreferenceCenter: true} : {}),
      ...(e.initialSwitchScope ? {initialSwitchScope:e.initialSwitchScope}: {}),
      ...(e.opensPreferenceCenter && e.settingsEntranceSource ? {settingsEntranceSource: e.settingsEntranceSource} : {}),
    }));
  return {
    evidenceSource: "canonical_consent_control_assessment",
    ...(a.optOutFooterLinks !== undefined ? {optOutSurfaces: publicOptOutSurfaces(a)} : {}),
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
    controlInspection: Object.fromEntries([...keys, "privacyOptOut" as const].map(key => {
      const observed = state(key);
      const result = a.controls[key];
      let reasonCodes = result.reasonCodes;
      let evidenceRefs = result.inspection?.evidenceRefs ?? [];
      if (observed !== retainedState(key)) {
        reasonCodes = ["variant_necessary_only", ...reasonCodes.filter(code =>
          code !== "complete_first_layer_inventory_without_control" && code !== "same_document_first_layer_control_observed")];
        if (observed) reasonCodes.unshift("same_document_first_layer_control_observed");
        evidenceRefs = [...new Set([...necessaryOnly.map(e => e.evidenceId), ...evidenceRefs])];
      }
      return [key, {
        state: observed === null ? "unknown" : observed ? "observed" : "not_observed",
        status: result.inspection?.status ?? "unavailable",
        reasonCodes: reasonCodes.slice(0, 16),
        evidenceRefs: evidenceRefs.slice(0, 12),
      }] as const;
    })),
    controls,
    acceptLabels: controls.filter(c => c.actionType === "accept_all").map(c => c.label),
    rejectLabels: controls.filter(c => c.actionType === "reject_all").map(c => c.label),
    preferenceLabels: controls.filter(c => c.actionType === "manage_preferences").map(c => c.label),
    visibleChoiceLabels: controls.map(c => c.label),
  };
}

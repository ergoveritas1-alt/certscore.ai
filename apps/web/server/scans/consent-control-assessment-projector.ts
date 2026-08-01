import {
  deriveConsentControlAssessment,
  type CanonicalEvidenceBundle,
  type ConsentControlAssessment,
  type ConsentControlAssessmentCandidate,
  type ConsentControlAssessmentChannel,
  type ConsentControlAssessmentGeometry,
  type ConsentControlAssessmentInput,
} from "@certscore/contracts";

type ConsentSurfaceInspectionLike = {
  actionableControlObserved?: boolean;
  consentSurfaceObserved?: boolean;
  coverageStatus?: string;
  evidenceChannels?: Array<{ channel?: string; status?: string }>;
  inspectionCompleted?: boolean;
  limitationKeys?: string[];
  observedAtMs?: number | null;
  outcome?: string;
};

const REQUIRED_CHANNELS: ConsentControlAssessmentChannel[] = ["dom_inventory", "geometry"];

function normalizedDocumentId(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.hash = "";
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return null;
  }
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function retainedActionType(
  actionType: ConsentControlAssessmentCandidate["actionType"],
  classifierReasonCodes: string[] | undefined,
): ConsentControlAssessmentCandidate["actionType"] {
  if (
    actionType === "reject_all" &&
    (
      classifierReasonCodes?.includes("variant_reject_with_subscription") ||
      classifierReasonCodes?.includes("variant_reject_with_payment")
    )
  ) {
    return "other";
  }
  return actionType;
}

function retainedControlVariant(
  classifierReasonCodes: string[] | undefined,
): ConsentControlAssessmentCandidate["controlVariant"] {
  if (classifierReasonCodes?.includes("variant_reject_with_subscription")) {
    return "reject_with_subscription";
  }
  if (classifierReasonCodes?.includes("variant_reject_with_payment")) {
    return "reject_with_payment";
  }
  return null;
}
function inspectionChannel(value: string | undefined): ConsentControlAssessmentChannel | null {
  if (value === "page_script_inventory") return "dom_inventory";
  if (value === "viewport_screenshot") return "screenshot";
  if (value === "cmp_runtime") return "cmp_runtime";
  if (value === "navigation_network") return "network_cmp";
  if (value === "accessibility_tree" || value === "dom_inventory" || value === "dom_snapshot" || value === "geometry" || value === "network_cmp" || value === "screenshot") {
    return value;
  }
  return null;
}

function geometryInput(
  raw: Record<string, unknown> | null | undefined,
  canonicalDocumentId: string | null,
): ConsentControlAssessmentGeometry | null {
  if (!raw) return null;
  const summary = raw.summary && typeof raw.summary === "object" && !Array.isArray(raw.summary)
    ? raw.summary as Record<string, unknown>
    : null;
  const pageUrl = normalizedDocumentId(typeof raw.pageUrl === "string" ? raw.pageUrl : null);
  const candidates = Array.isArray(raw.candidates)
    ? raw.candidates.flatMap((candidate): ConsentControlAssessmentCandidate[] => {
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
        const row = candidate as Record<string, unknown>;
        const actionType = typeof row.actionType === "string" ? row.actionType : "other";
        const classifierReasonCodes = Array.isArray(row.classifierReasonCodes)
          ? row.classifierReasonCodes.filter((value): value is string => typeof value === "string")
          : [];
        const supportedActionType = retainedActionType(
          ["accept_all", "reject_all", "manage_preferences", "save_preferences", "do_not_sell_share", "other"].includes(actionType)
          ? actionType as ConsentControlAssessmentCandidate["actionType"]
          : "other",
          classifierReasonCodes,
        );
        const controlVariant = retainedControlVariant(classifierReasonCodes);
        const presentationType =
          row.presentationType === "dedicated_button" ||
          row.presentationType === "inline_link" ||
          row.presentationType === "persistent_link"
            ? row.presentationType
            : "unknown";
        const visible =
          row.decisionStatus === "confirmed_visible" ||
          (presentationType === "persistent_link" && row.decisionStatus === "footer_or_policy_link");
        return [{
          evidenceId: typeof row.candidateId === "string" ? row.candidateId : undefined,
          actionType: supportedActionType,
          controlVariant,
          label: typeof row.label === "string" ? row.label : null,
          matchedTerm: typeof row.matchedTerm === "string" ? row.matchedTerm : null,
          locale: typeof row.matchedLocale === "string" ? row.matchedLocale as ConsentControlAssessmentCandidate["locale"] : null,
          matchStrength: typeof row.matchStrength === "string" ? row.matchStrength as ConsentControlAssessmentCandidate["matchStrength"] : null,
          classifierReasonCodes,
          layer: row.layer === "first_layer"
            ? "first_layer"
            : row.layer === "footer" || row.layer === "preference_center" || row.layer === "page_body" || row.layer === "deeper_layer"
              ? "deeper_layer"
              : "unknown",
          presentationType,
          visible,
          actionable: visible && row.enabled !== false,
          observedAtMs: typeof raw.observedAtMs === "number" ? raw.observedAtMs : 0,
          documentId: pageUrl,
          channels: ["geometry"],
          artifactRefs: typeof row.screenshotArtifactRef === "string" ? [row.screenshotArtifactRef] : [],
        }];
      })
    : [];
  const complete =
    Boolean(summary) &&
    typeof summary?.firstLayerAccept === "boolean" &&
    typeof summary?.firstLayerReject === "boolean" &&
    typeof summary?.firstLayerOptions === "boolean" &&
    typeof summary?.confidence === "number" &&
    summary.confidence > 0 &&
    Boolean(pageUrl) &&
    Boolean(canonicalDocumentId);
  const assessmentStatus = !complete
    ? "incomplete"
    : pageUrl !== canonicalDocumentId
      ? "document_mismatch"
      : "complete";
  return {
    artifactVersion: typeof raw.artifactVersion === "string" ? raw.artifactVersion : null,
    assessmentStatus,
    documentId: pageUrl,
    observedAtMs: typeof raw.observedAtMs === "number" ? raw.observedAtMs : null,
    completedChannels: assessmentStatus === "complete" ? ["geometry"] : [],
    incompleteChannels: assessmentStatus === "incomplete" ? ["geometry"] : [],
    evidenceRefs: candidates.flatMap((candidate) => candidate.artifactRefs ?? []),
    candidates,
  };
}

export function deriveMaterializedConsentControlAssessment(input: {
  bundle: CanonicalEvidenceBundle;
  consentControlGeometryEvidence?: Record<string, unknown> | null;
  consentSurfaceInspection?: ConsentSurfaceInspectionLike | null;
  finalUrl?: string | null;
  noGo: boolean;
  noGoReasonCodes?: string[];
  requestedUrl?: string | null;
  scanId?: string | null;
}): ConsentControlAssessment {
  const canonicalDocumentId = normalizedDocumentId(
    input.finalUrl ??
    input.bundle.domSnapshots.at(-1)?.url ??
    input.bundle.normalizedUrl ??
    input.bundle.url,
  );
  const requestedUrl = normalizedDocumentId(input.requestedUrl ?? input.bundle.url);
  const observationTimestamp = (observation: { observedAtMs?: unknown }) =>
    typeof observation.observedAtMs === "number" ? observation.observedAtMs : 0;
  const retainedDocumentSnapshots = (input.bundle.domSnapshots ?? [])
    .map((snapshot) => ({
      capturedAtMs: snapshot.capturedAtMs,
      documentId: normalizedDocumentId(snapshot.url),
    }))
    .filter((snapshot): snapshot is { capturedAtMs: number; documentId: string } =>
      snapshot.documentId !== null
    )
    .sort((left, right) => left.capturedAtMs - right.capturedAtMs);
  const typedFirstLayerInventoryObservation = (input.bundle.consentUiObservations ?? []).find((observation) => {
    const completedChannels = observation.captureDiagnostics?.completedChannels ?? [];
    const timedOutChannels = observation.captureDiagnostics?.timedOutChannels ?? [];
    const failedChannels = observation.captureDiagnostics?.failedChannels ?? [];
    const completedTypedChannel = (["dom_inventory", "accessibility_tree"] as const).some((channel) =>
      completedChannels.includes(channel) &&
      !timedOutChannels.includes(channel) &&
      !failedChannels.includes(channel)
    );
    const legacyTypedChannelComplete =
      completedChannels.length === 0 &&
      timedOutChannels.length === 0 &&
      failedChannels.length === 0 &&
      observation.basis.some((basis) =>
        /(?:^|:)(?:rapid|first_layer|accessibility_tree|dom_inventory|viewport)/i.test(basis)
      );
    return observation.captureStatus === "observed" &&
      observation.likelyPresent === true &&
      observation.layerInspected === "first_layer" &&
      (completedTypedChannel || legacyTypedChannelComplete) &&
      observation.controls.length > 0 &&
      observation.controls.every((control) =>
        control.visible === true &&
        (control.actionType !== "other" || retainedControlVariant(control.classifierReasonCodes) !== null) &&
        (control.layer ?? observation.layerInspected) === "first_layer"
      );
  });
  const hasTypedFirstLayerInventory = Boolean(typedFirstLayerInventoryObservation);
  // A consent UI observation can be retained without a DOM snapshot. When
  // every retained pre-consent visual artifact points at the same document,
  // use that URL only to bind the already-typed control inventory to the
  // redirected document. Do not classify controls from the screenshot.
  const retainedVisualDocumentIds = hasTypedFirstLayerInventory ? unique((input.bundle.screenshots ?? [])
    .map((screenshot) => normalizedDocumentId(screenshot.url))
    .filter((value): value is string => Boolean(value))) : [];
  const singleRetainedVisualDocumentId = retainedVisualDocumentIds.length === 1
    ? retainedVisualDocumentIds[0] ?? null
    : null;
  const geometry = geometryInput(input.consentControlGeometryEvidence, canonicalDocumentId);
  const observations: ConsentControlAssessmentInput["observations"] = (input.bundle.consentUiObservations ?? []).map((observation) => {
    const observationDocumentId =
      retainedDocumentSnapshots
        .filter((snapshot) => snapshot.capturedAtMs <= observationTimestamp(observation))
        .at(-1)?.documentId ??
      (retainedDocumentSnapshots.length === 1 ? retainedDocumentSnapshots[0]?.documentId : null) ??
      singleRetainedVisualDocumentId ??
      null;
    return {
      observationId: observation.observationId,
      observedAtMs: observationTimestamp(observation),
      likelyPresent: observation.likelyPresent,
      layerInspected: observation.layerInspected,
      documentId: observationDocumentId,
      captureStatus: observation.captureStatus,
      completedChannels: observation.captureDiagnostics?.completedChannels,
      incompleteChannels: [
        ...(observation.captureDiagnostics?.timedOutChannels ?? []),
        ...(observation.captureDiagnostics?.failedChannels ?? []),
      ],
      evidenceRefs: (observation.evidenceRefs ?? []).map((reference) => reference.refId),
      controls: (observation.controls ?? []).flatMap((control) => {
        const evidenceId = control.artifactRef ?? `${observation.observationId}:${control.label}`;
        const layer = control.layer ?? observation.layerInspected;
        const actionType = retainedActionType(control.actionType, control.classifierReasonCodes);
        const controlVariant = retainedControlVariant(control.classifierReasonCodes);
        const candidate: ConsentControlAssessmentCandidate = {
          evidenceId,
          actionType,
          controlVariant,
          semanticRole: control.semanticRole,
          label: control.label,
          locale: control.matchedLocale,
          matchedTerm: control.matchedTerm,
          matchStrength: control.matchStrength,
          classifierReasonCodes: control.classifierReasonCodes,
          presentationType: control.presentationType,
          layer,
          visible: control.visible,
          actionable:
            control.visible === true &&
            (actionType !== "other" || controlVariant !== null),
          observedAtMs: observationTimestamp(observation),
          documentId: observationDocumentId,
          channels: observation.captureDiagnostics?.completedChannels,
          artifactRefs: control.artifactRef ? [control.artifactRef] : [],
        };
        const savesAllOptionalDefaultsOff =
          layer === "first_layer" &&
          control.visible === true &&
          actionType === "save_preferences" &&
          observation.defaultToggleStatesObserved === true &&
          observation.nonEssentialDefaultsOff === true &&
          (observation.precheckedOptionalPurposeCount ?? 0) === 0;
        if (!savesAllOptionalDefaultsOff) {
          return [candidate];
        }
        return [
          candidate,
          {
            ...candidate,
            evidenceId: `${evidenceId}:necessary-only-defaults`,
            semanticRole: "necessary_only",
            classifierReasonCodes: unique([
              ...(candidate.classifierReasonCodes ?? []),
              "save_preferences_with_all_optional_defaults_off",
            ]),
          },
        ];
      }),
    };
  });
  const inspection = input.consentSurfaceInspection ?? input.bundle.consentSurfaceInspection ?? null;
  const inspectionChannels = inspection?.evidenceChannels ?? [];
  const completedChannels = unique([
    ...observations.flatMap((observation) => observation.completedChannels ?? []),
    ...inspectionChannels
      .filter((channel) => channel.status === "observed")
      .map((channel) => inspectionChannel(channel.channel))
      .filter((channel): channel is ConsentControlAssessmentChannel => channel !== null),
    ...(geometry?.assessmentStatus === "complete" ? ["geometry" as const] : []),
  ]);
  const incompleteChannels = unique([
    ...observations.flatMap((observation) => observation.incompleteChannels ?? []),
    ...inspectionChannels
      .filter((channel) => channel.status === "inspection_incomplete")
      .map((channel) => inspectionChannel(channel.channel))
      .filter((channel): channel is ConsentControlAssessmentChannel => channel !== null),
    ...(geometry?.assessmentStatus === "incomplete" ? ["geometry" as const] : []),
  ]);
  const observedDocumentIds = unique([
    ...retainedDocumentSnapshots.map((snapshot) => snapshot.documentId),
    ...retainedVisualDocumentIds,
    ...observations.map((observation) => observation.documentId).filter((value): value is string => Boolean(value)),
    // An incomplete geometry diagnostic can retain the requested page URL
    // without retaining any control evidence. It must not make a separately
    // typed first-layer inventory look cross-document.
    ...(geometry && (geometry.assessmentStatus === "complete" || (geometry.candidates?.length ?? 0) > 0) && geometry.documentId
      ? [geometry.documentId]
      : []),
  ]);
  const documentIdentityStatus =
    geometry?.assessmentStatus === "document_mismatch" ||
    Boolean(canonicalDocumentId && observedDocumentIds.some((documentId) => documentId !== canonicalDocumentId))
      ? "mismatched"
      : canonicalDocumentId && observedDocumentIds.length > 0
        ? "matched"
        : "unknown";
  const typedFirstLayerInventoryComplete = hasTypedFirstLayerInventory;
  const explicitlyCompletedTypedInventoryChannels = (typedFirstLayerInventoryObservation?.captureDiagnostics?.completedChannels ?? [])
    .filter((channel): channel is "dom_inventory" | "accessibility_tree" =>
      channel === "dom_inventory" || channel === "accessibility_tree"
    );
  const retainedTypedInventoryChannels =
    explicitlyCompletedTypedInventoryChannels.length > 0
      ? explicitlyCompletedTypedInventoryChannels
      : typedFirstLayerInventoryObservation?.basis.some((basis) => /accessibility_tree/i.test(basis))
        ? ["accessibility_tree" as const]
        : ["dom_inventory" as const];
  const requiredChannels = typedFirstLayerInventoryComplete
    ? retainedTypedInventoryChannels
    : REQUIRED_CHANNELS;
  const coverageComplete =
    !input.noGo &&
    documentIdentityStatus === "matched" &&
    (
      typedFirstLayerInventoryComplete ||
      (
        inspection?.inspectionCompleted === true &&
        inspection.coverageStatus === "complete" &&
        REQUIRED_CHANNELS.every((channel) => completedChannels.includes(channel)) &&
        incompleteChannels.length === 0
      )
    );
  const surfaceStatus =
    inspection?.outcome === "actionable_surface_observed"
      ? "observed_actionable"
      : inspection?.outcome === "non_actionable_surface_observed"
        ? "observed_non_actionable"
        : inspection?.outcome === "no_surface_observed_complete_coverage"
          ? "not_observed"
          : "unknown";

  return deriveConsentControlAssessment({
    scan: {
      scanId: input.scanId ?? input.bundle.scanId,
      requestedUrl,
      finalUrl: canonicalDocumentId,
      scanStatus: "completed",
      noGo: input.noGo,
      noGoReasonCodes: input.noGoReasonCodes,
    },
    document: {
      canonicalDocumentId,
      observedDocumentIds,
      identityStatus: documentIdentityStatus,
    },
    observations,
    geometry,
    surface: {
      status: surfaceStatus,
      firstObservedAtMs: inspection?.observedAtMs ?? null,
      lastObservedAtMs: inspection?.observedAtMs ?? null,
      evidenceRefs: [],
    },
    coverage: {
      status: input.noGo ? "none" : coverageComplete ? "complete" : "limited",
      requiredChannels,
      completedChannels,
      incompleteChannels,
      reasonCodes: unique([
        ...(inspection?.limitationKeys ?? []),
        ...(!coverageComplete && !input.noGo ? ["canonical_consent_coverage_incomplete"] : []),
      ]),
    },
    source: {
      bundleVersion: input.bundle.schemaVersion,
      geometryVersion: geometry?.artifactVersion ?? null,
      computedAt: input.bundle.completedAt,
    },
  });
}

export function projectAssessmentCompatibility(assessment: ConsentControlAssessment) {
  const compatibilityState = (key: "accept" | "reject" | "options") =>
    assessment.controls[key].state === "observed"
      ? true
      : assessment.controls[key].state === "not_observed"
        ? false
        : null;
  return {
    accept: compatibilityState("accept"),
    reject: compatibilityState("reject"),
    options: compatibilityState("options"),
  };
}

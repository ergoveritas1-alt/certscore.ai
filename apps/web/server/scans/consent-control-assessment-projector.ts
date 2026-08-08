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
        const placementType =
          row.placementType === "action_cluster" ||
          row.placementType === "first_layer_body" ||
          row.placementType === "persistent_surface"
            ? row.placementType
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
          placementType,
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
  const retainedVisualDocumentArtifacts = (input.bundle.screenshots ?? [])
    .map((screenshot) => ({
      capturedAtMs: screenshot.capturedAtMs,
      documentId: normalizedDocumentId(screenshot.url),
    }))
    .filter((artifact): artifact is { capturedAtMs: number; documentId: string } =>
      artifact.documentId !== null
    )
    .sort((left, right) => left.capturedAtMs - right.capturedAtMs);
  const isCompletedTypedFirstLayerInventory = (
    observation: CanonicalEvidenceBundle["consentUiObservations"][number],
  ) => {
    const controls = observation.controls ?? [];
    const finalInventoryIncomplete = (observation.basis ?? []).some((basis) =>
      basis === "recapture:paired_settled_frame_inventory_incomplete" ||
      basis === "recapture:post_settle_inventory_incomplete" ||
      basis === "recapture:post_settled_screenshot_inventory_incomplete" ||
      basis === "recapture:post_settle_inventory_budget_unavailable" ||
      basis === "recapture:immediate_timeout_recovery_budget_unavailable"
    );
    if (finalInventoryIncomplete) return false;
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
      (observation.basis ?? []).some((basis) =>
        /(?:^|:)(?:rapid|first_layer|accessibility_tree|dom_inventory|viewport)/i.test(basis)
      );
    const completedEmptyFirstLayerInventory =
      controls.length === 0 &&
      (
        observation.inventoryOutcome === "complete_empty" ||
        (observation.basis ?? []).includes("settled_control_inventory_completed")
      ) &&
      completedTypedChannel;
    const completedPositiveFirstLayerInventory =
      observation.captureStatus === "observed" &&
      observation.likelyPresent === true &&
      observation.layerInspected === "first_layer" &&
      controls.length > 0 &&
      (completedTypedChannel || legacyTypedChannelComplete);
    return (
      completedPositiveFirstLayerInventory ||
      (
        completedEmptyFirstLayerInventory &&
        (observation.captureStatus === "observed" || observation.captureStatus === "no_evidence")
      )
    ) && controls.every((control) =>
      control.visible === true &&
      (
        control.actionType !== "other" ||
        control.semanticRole === "dismiss" ||
        retainedControlVariant(control.classifierReasonCodes) !== null
      ) &&
      (control.layer ?? observation.layerInspected) === "first_layer"
    );
  };
  const typedFirstLayerInventoryIndexes = (input.bundle.consentUiObservations ?? [])
    .map((observation, index) => ({ index, observation }))
    .filter(({ observation }) => isCompletedTypedFirstLayerInventory(observation))
    .sort((left, right) => observationTimestamp(right.observation) - observationTimestamp(left.observation))
    .map(({ index }) => index);
  const hasTypedFirstLayerInventory = typedFirstLayerInventoryIndexes.length > 0;
  // A consent UI observation can be retained without a DOM snapshot. When
  // every retained pre-consent visual artifact points at the same document,
  // use that URL only to bind the already-typed control inventory to the
  // redirected document. Do not classify controls from the screenshot.
  const retainedVisualDocumentIds = hasTypedFirstLayerInventory
    ? unique(retainedVisualDocumentArtifacts.map((artifact) => artifact.documentId))
    : [];
  const singleRetainedVisualDocumentId = retainedVisualDocumentIds.length === 1
    ? retainedVisualDocumentIds[0] ?? null
    : null;
  const geometry = geometryInput(input.consentControlGeometryEvidence, canonicalDocumentId);
  const observations: ConsentControlAssessmentInput["observations"] = (input.bundle.consentUiObservations ?? []).map((observation) => {
    const explicitObservationDocumentUrlRetained = typeof observation.documentUrl === "string";
    const explicitObservationDocumentId = normalizedDocumentId(observation.documentUrl);
    const closestPriorDocumentArtifact = [
      ...retainedDocumentSnapshots,
      ...retainedVisualDocumentArtifacts,
    ]
      .filter((artifact) => artifact.capturedAtMs <= observationTimestamp(observation))
      .sort((left, right) => left.capturedAtMs - right.capturedAtMs)
      .at(-1)?.documentId ?? null;
    const observationDocumentId =
      explicitObservationDocumentUrlRetained
        ? explicitObservationDocumentId
        : singleRetainedVisualDocumentId ??
          closestPriorDocumentArtifact ??
          (retainedDocumentSnapshots.length === 1 ? retainedDocumentSnapshots[0]?.documentId : null) ??
          null;
    const completedEmptyFirstLayerInventory =
      (observation.controls?.length ?? 0) === 0 &&
      (observation.basis ?? []).includes("settled_control_inventory_completed") &&
      (observation.captureDiagnostics?.completedChannels ?? []).some((channel) =>
        channel === "dom_inventory" || channel === "accessibility_tree"
      );
    const retainedLayer = observation.layerInspected === "first_layer" || completedEmptyFirstLayerInventory
      ? "first_layer" as const
      : observation.layerInspected;
    return {
      observationId: observation.observationId,
      observedAtMs: observationTimestamp(observation),
      likelyPresent: observation.likelyPresent,
      layerInspected: retainedLayer,
      documentId: observationDocumentId,
      captureStatus: observation.captureStatus,
      inventoryOutcome: observation.inventoryOutcome,
      completedChannels: observation.captureDiagnostics?.completedChannels,
      incompleteChannels: [
        ...(observation.captureDiagnostics?.timedOutChannels ?? []),
        ...(observation.captureDiagnostics?.failedChannels ?? []),
      ],
      evidenceRefs: (observation.evidenceRefs ?? []).map((reference) => reference.refId),
      controls: (observation.controls ?? []).flatMap((control) => {
        const evidenceId = control.artifactRef ?? `${observation.observationId}:${control.label}`;
        const layer = control.presentationType === "persistent_link" || control.placementType === "persistent_surface"
          ? "deeper_layer" as const
          : control.layer ?? retainedLayer;
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
          placementType: control.placementType,
          layer,
          visible: control.visible,
          actionable:
            control.visible === true &&
            (actionType !== "other" || control.semanticRole === "dismiss" || controlVariant !== null),
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
  const typedFirstLayerInventoryIndex =
    typedFirstLayerInventoryIndexes.find((index) =>
      Boolean(canonicalDocumentId && observations[index]?.documentId === canonicalDocumentId)
    ) ??
    typedFirstLayerInventoryIndexes[0] ??
    null;
  const typedFirstLayerInventoryObservation = typedFirstLayerInventoryIndex === null
    ? null
    : input.bundle.consentUiObservations[typedFirstLayerInventoryIndex] ?? null;
  const typedFirstLayerProjectedObservation = typedFirstLayerInventoryIndex === null
    ? null
    : observations[typedFirstLayerInventoryIndex] ?? null;
  // Once a completed inventory is explicitly attributable to the canonical
  // final document, earlier redirect-document observations are historical
  // context, not contradictory evidence about the final page.
  const assessmentObservations =
    canonicalDocumentId && typedFirstLayerProjectedObservation?.documentId === canonicalDocumentId
      ? observations.filter((observation) => observation.documentId === canonicalDocumentId)
      : observations;
  const inspection = input.consentSurfaceInspection ?? input.bundle.consentSurfaceInspection ?? null;
  const inspectionChannels = inspection?.evidenceChannels ?? [];
  const completedChannels = unique([
    ...assessmentObservations.flatMap((observation) => observation.completedChannels ?? []),
    ...inspectionChannels
      .filter((channel) => channel.status === "observed")
      .map((channel) => inspectionChannel(channel.channel))
      .filter((channel): channel is ConsentControlAssessmentChannel => channel !== null),
    ...(geometry?.assessmentStatus === "complete" ? ["geometry" as const] : []),
  ]);
  const incompleteChannels = unique([
    ...assessmentObservations.flatMap((observation) => observation.incompleteChannels ?? []),
    ...inspectionChannels
      .filter((channel) => channel.status === "inspection_incomplete")
      .map((channel) => inspectionChannel(channel.channel))
      .filter((channel): channel is ConsentControlAssessmentChannel => channel !== null),
    ...(geometry?.assessmentStatus === "incomplete" ? ["geometry" as const] : []),
  ]);
  const observedDocumentIds = unique([
    ...assessmentObservations
      .filter((observation) =>
        (observation.controls?.length ?? 0) > 0 ||
        (
          observation.observationId === typedFirstLayerProjectedObservation?.observationId &&
          observation.observedAtMs === typedFirstLayerProjectedObservation.observedAtMs
        )
      )
      .map((observation) => observation.documentId)
      .filter((value): value is string => Boolean(value)),
    ...retainedDocumentSnapshots
      .map((snapshot) => snapshot.documentId)
      .filter((documentId) => documentId === canonicalDocumentId),
    ...retainedVisualDocumentArtifacts
      .map((artifact) => artifact.documentId)
      .filter((documentId) => documentId === canonicalDocumentId),
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
  // The coordinator's inspection result is authoritative for negative
  // first-layer conclusions. A typed observation may retain directly
  // observed controls even when another required channel is limited, but it
  // must not turn an explicitly limited inspection into a complete inventory
  // or convert missing controls to `not_observed`.
  const coordinatorInspectionComplete = !inspection || (
    inspection.inspectionCompleted === true &&
    inspection.coverageStatus === "complete"
  );
  const typedFirstLayerInventoryComplete =
    hasTypedFirstLayerInventory && coordinatorInspectionComplete;
  const explicitlyCompletedTypedInventoryChannels = (typedFirstLayerInventoryObservation?.captureDiagnostics?.completedChannels ?? [])
    .filter((channel): channel is "dom_inventory" | "accessibility_tree" =>
      channel === "dom_inventory" || channel === "accessibility_tree"
    );
  const retainedTypedInventoryChannels =
    explicitlyCompletedTypedInventoryChannels.length > 0
      ? explicitlyCompletedTypedInventoryChannels
      : typedFirstLayerInventoryObservation?.basis?.some((basis) => /accessibility_tree/i.test(basis))
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
  const verifiedInspectionComplete =
    inspection?.inspectionCompleted === true &&
    inspection.coverageStatus === "complete";
  const surfaceStatus =
    verifiedInspectionComplete && inspection?.outcome === "actionable_surface_observed"
      ? "observed_actionable"
      : verifiedInspectionComplete && inspection?.outcome === "non_actionable_surface_observed"
        ? "observed_non_actionable"
        : verifiedInspectionComplete && inspection?.outcome === "no_surface_observed_complete_coverage"
          ? "not_observed"
          : typedFirstLayerInventoryComplete && (typedFirstLayerInventoryObservation?.controls.length ?? 0) > 0
            ? "observed_actionable"
            : typedFirstLayerInventoryComplete && typedFirstLayerInventoryObservation?.likelyPresent === true
              ? "observed_non_actionable"
              : typedFirstLayerInventoryComplete &&
                  typedFirstLayerInventoryObservation?.captureStatus === "no_evidence" &&
                  typedFirstLayerInventoryObservation.likelyPresent === false
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
    observations: assessmentObservations,
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

export function deriveWs01ConsentControlAssessment(input: {
  completedAt?: string | null;
  firstLayerConsentChoices: Record<string, unknown> | null | undefined;
  requestedUrl?: string | null;
  scanId: string;
  scanStatus: string;
}): ConsentControlAssessment | null {
  const choices = input.firstLayerConsentChoices;
  if (!choices) return null;
  const documentId = normalizedDocumentId(
    typeof choices.documentUrl === "string"
      ? choices.documentUrl
      : typeof choices.document_url === "string"
        ? choices.document_url
        : null,
  );
  const capturedBeforeInteraction = choices.capturedBeforeInteraction === true ||
    choices.captured_before_interaction === true;
  const inventoryComplete = choices.controlInventoryComplete === true ||
    choices.control_inventory_complete === true;
  const layerInspected = choices.layerInspected === "first_layer" ||
    choices.layer_inspected === "first_layer";
  const sameSurface = choices.sameSurfaceCandidates === true ||
    choices.same_surface_candidates === true;
  if (!documentId || !capturedBeforeInteraction || !inventoryComplete || !layerInspected || !sameSurface) {
    return null;
  }

  const rawChoices = Array.isArray(choices.normalizedChoices)
    ? choices.normalizedChoices
    : Array.isArray(choices.normalized_choices)
      ? choices.normalized_choices
      : [];
  const controls = rawChoices.flatMap((value, index): ConsentControlAssessmentCandidate[] => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const row = value as Record<string, unknown>;
    if (row.sameSurface !== true && row.same_surface !== true) return [];
    const label = typeof row.label === "string" ? row.label.trim().slice(0, 120) : "";
    if (!label) return [];
    const action = typeof row.action === "string" ? row.action : "unknown";
    const intent: ConsentControlAssessmentCandidate["intent"] =
      action === "accept" ? "accept" :
      action === "reject" ? "reject" :
      action === "settings" ? "options" :
      action === "dismiss" ? "dismiss" : "other";
    const actionType: ConsentControlAssessmentCandidate["actionType"] =
      action === "accept" ? "accept_all" :
      action === "reject" ? "reject_all" :
      action === "settings" ? "manage_preferences" : "other";
    return [{
      evidenceId: `ws01:first-layer:${index}:${label.toLowerCase()}`,
      intent,
      semanticRole: action === "dismiss" ? "dismiss" : undefined,
      actionType,
      label,
      layer: "first_layer",
      visible: true,
      actionable: true,
      observedAtMs: typeof choices.capturedAtMs === "number"
        ? Math.max(0, Math.round(choices.capturedAtMs))
        : typeof choices.captured_at_ms === "number"
          ? Math.max(0, Math.round(choices.captured_at_ms))
          : 0,
      documentId,
      channels: ["dom_inventory"],
      artifactRefs: ["scan_runtime_artifacts.hybrid_runtime_evidence.firstLayerConsentChoices"],
    }];
  });
  // A complete empty array is meaningful negative evidence. A non-empty array
  // whose rows cannot be validated is malformed evidence and must fail closed.
  if (rawChoices.length > 0 && controls.length === 0) return null;
  const requestedUrl = normalizedDocumentId(input.requestedUrl) ?? documentId;
  const observedAtMs = controls[0]?.observedAtMs ??
    (typeof choices.capturedAtMs === "number"
      ? Math.max(0, Math.round(choices.capturedAtMs))
      : typeof choices.captured_at_ms === "number"
        ? Math.max(0, Math.round(choices.captured_at_ms))
        : 0);
  const completedEmptyInventory = controls.length === 0;
  return deriveConsentControlAssessment({
    scan: {
      scanId: input.scanId,
      requestedUrl,
      finalUrl: documentId,
      scanStatus: input.scanStatus,
      noGo: false,
    },
    document: {
      canonicalDocumentId: documentId,
      observedDocumentIds: [documentId],
      identityStatus: "matched",
    },
    observations: [{
      observationId: "ws01-first-layer-consent-choices",
      observedAtMs,
      likelyPresent: !completedEmptyInventory,
      layerInspected: "first_layer",
      documentId,
      captureStatus: completedEmptyInventory ? "no_evidence" : "observed",
      inventoryOutcome: completedEmptyInventory ? "complete_empty" : "complete_with_controls",
      completedChannels: ["dom_inventory"],
      incompleteChannels: [],
      evidenceRefs: ["scan_runtime_artifacts.hybrid_runtime_evidence.firstLayerConsentChoices"],
      controls,
    }],
    surface: {
      status: completedEmptyInventory ? "not_observed" : "observed_actionable",
      firstObservedAtMs: observedAtMs,
      lastObservedAtMs: observedAtMs,
      evidenceRefs: ["scan_runtime_artifacts.hybrid_runtime_evidence.firstLayerConsentChoices"],
    },
    coverage: {
      status: "complete",
      requiredChannels: ["dom_inventory"],
      completedChannels: ["dom_inventory"],
      incompleteChannels: [],
      reasonCodes: ["ws01_complete_first_layer_control_inventory"],
    },
    source: {
      bundleVersion: "ws01.hybrid_runtime_evidence.v1",
      projectorVersion: "2.0.0-ws01",
      computedAt: input.completedAt ?? new Date(0).toISOString(),
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

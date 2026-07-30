import { consentControlAssessmentSchema, type ConsentControlAssessment } from "@certscore/contracts";
import { assessmentSurfaceCompatibilityState } from "../../lib/scans/consent-assessment-compatibility";

export type ScanReportConsentProjection = {
  accept: boolean | null;
  options: boolean | null;
  reject: boolean | null;
  retained: boolean;
};

export type PersistedFirstLayerConsentControl = {
  actionType: string | null;
  classifierReasonCodes: string[];
  classifierVariant: string | null;
  label: string;
  matchedLocale: string | null;
  matchedTerm: string | null;
  matchStrength: string | null;
  semanticRole: string | null;
  visible: boolean;
};

export type PersistedFirstLayerConsentEvidence = {
  acceptControlObserved: boolean;
  actionableControlInventoryRetained: boolean;
  controls: PersistedFirstLayerConsentControl[];
  geometryAssessment: string | null;
  layerInspected: "first_layer";
  managePreferencesControlObserved: boolean;
  rejectControlObserved: boolean;
  visibleChoiceLabels: string[];
};

function booleanValue(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function stringValue(value: unknown, maxLength = 240) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim().slice(0, maxLength)
    : null;
}

function stringArray(value: unknown, limit: number, maxLength = 120) {
  return Array.isArray(value)
    ? [...new Set(value
        .map((item) => stringValue(item, maxLength))
        .filter((item): item is string => Boolean(item)))]
        .slice(0, limit)
    : [];
}

export function projectFirstLayerConsentChoices(
  choices: Record<string, unknown> | null
): ScanReportConsentProjection | null {
  if (!choices) {
    return null;
  }

  const retained =
    choices.layerInspected === "first_layer" &&
    choices.actionableControlInventoryRetained === true &&
    choices.geometryAssessment !== "document_mismatch" &&
    choices.geometryAssessment !== "incomplete";

  return {
    accept: booleanValue(choices.acceptControlObserved),
    options: booleanValue(choices.managePreferencesControlObserved),
    reject: booleanValue(choices.rejectControlObserved),
    retained
  };
}

/**
 * Persist only the bounded, typed evidence needed by the canonical consent
 * concern policy. This deliberately excludes selectors, DOM fragments, and
 * other raw browser material.
 */
export function buildPersistedFirstLayerConsentEvidence(
  choices: Record<string, unknown> | null
): PersistedFirstLayerConsentEvidence | null {
  const projection = projectFirstLayerConsentChoices(choices);
  if (!choices || !projection?.retained) {
    return null;
  }

  const controls = Array.isArray(choices.controls)
    ? choices.controls
        .filter((control): control is Record<string, unknown> =>
          Boolean(control) && typeof control === "object" && !Array.isArray(control)
        )
        .map((control) => {
          const label = stringValue(
            control.label ?? control.labelText ?? control.label_text ?? control.text,
            160
          );
          if (!label) {
            return null;
          }
          return {
            actionType: stringValue(control.actionType ?? control.action_type, 64),
            classifierReasonCodes: stringArray(
              control.classifierReasonCodes ?? control.classifier_reason_codes,
              8,
              80
            ),
            classifierVariant: stringValue(
              control.classifierVariant ?? control.classifier_variant ?? control.variant,
              80
            ),
            label,
            matchedLocale: stringValue(control.matchedLocale ?? control.matched_locale, 24),
            matchedTerm: stringValue(control.matchedTerm ?? control.matched_term, 120),
            matchStrength: stringValue(control.matchStrength ?? control.match_strength, 32),
            semanticRole: stringValue(control.semanticRole ?? control.semantic_role, 64),
            visible: control.visible === true
          } satisfies PersistedFirstLayerConsentControl;
        })
        .filter((control): control is PersistedFirstLayerConsentControl => Boolean(control))
        .slice(0, 12)
    : [];

  if (controls.length === 0) {
    return null;
  }

  const visibleChoiceLabels = [
    ...stringArray(choices.visibleChoiceLabels ?? choices.visible_choice_labels, 12, 160),
    ...controls.filter((control) => control.visible).map((control) => control.label)
  ];

  return {
    acceptControlObserved: projection.accept === true,
    actionableControlInventoryRetained: true,
    controls,
    geometryAssessment: stringValue(
      choices.geometryAssessment ?? choices.geometry_assessment,
      64
    ),
    layerInspected: "first_layer",
    managePreferencesControlObserved: projection.options === true,
    rejectControlObserved: projection.reject === true,
    visibleChoiceLabels: [...new Set(visibleChoiceLabels)].slice(0, 12)
  };
}

export function withPersistedFirstLayerConsentEvidence(
  runtimeArtifacts: Record<string, unknown> | null,
  snapshot: Record<string, unknown> | null
) {
  const runtimeHybrid = runtimeArtifacts?.hybridRuntimeEvidence &&
    typeof runtimeArtifacts.hybridRuntimeEvidence === "object" &&
    !Array.isArray(runtimeArtifacts.hybridRuntimeEvidence)
      ? runtimeArtifacts.hybridRuntimeEvidence as Record<string, unknown>
      : runtimeArtifacts?.hybrid_runtime_evidence &&
          typeof runtimeArtifacts.hybrid_runtime_evidence === "object" &&
          !Array.isArray(runtimeArtifacts.hybrid_runtime_evidence)
        ? runtimeArtifacts.hybrid_runtime_evidence as Record<string, unknown>
        : null;
  const assessmentCandidates = [
    snapshot?.consent_control_assessment,
    runtimeArtifacts?.consentControlAssessment,
    runtimeArtifacts?.consent_control_assessment,
    runtimeHybrid?.consentControlAssessment,
    runtimeHybrid?.consent_control_assessment,
  ];
  let assessment: ConsentControlAssessment | null = null;
  for (const candidate of assessmentCandidates) {
    const parsed = consentControlAssessmentSchema.safeParse(candidate);
    if (parsed.success) {
      assessment = parsed.data;
      break;
    }
  }
  const legacyEvidence = snapshot?.consent_control_evidence;
  const evidence = assessment
    ? assessmentCompatibilityEvidence(assessment)
    : legacyEvidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return runtimeArtifacts;
  }

  const existingHybrid = runtimeHybrid ?? {};
  const hybridRuntimeEvidence = {
    ...existingHybrid,
    firstLayerConsentChoices: evidence,
    first_layer_consent_choices: evidence
  };
  const canonicalSurfaceState = assessment
    ? assessmentSurfaceCompatibilityState(assessment)
    : null;

  return {
    ...(runtimeArtifacts ?? {}),
    ...(assessment ? {
      consentControlAssessment: assessment,
      consent_control_assessment: assessment,
      consentSurfaceObserved: canonicalSurfaceState,
      consent_surface_observed: canonicalSurfaceState,
    } : {}),
    firstLayerConsentChoices: evidence,
    first_layer_consent_choices: evidence,
    hybridRuntimeEvidence,
    hybrid_runtime_evidence: hybridRuntimeEvidence
  };
}

function assessmentCompatibilityState(
  assessment: ConsentControlAssessment,
  key: "accept" | "reject" | "options"
) {
  const state = assessment.controls[key].state;
  return state === "observed" ? true : state === "not_observed" ? false : null;
}

function assessmentCompatibilityEvidence(
  assessment: ConsentControlAssessment
): PersistedFirstLayerConsentEvidence {
  const controls = assessment.evidence
    .filter((item) =>
      item.layer === "first_layer" &&
      item.visible === true &&
      item.actionable === true &&
      item.label !== null
    )
    .map((item) => ({
      actionType:
        item.intent === "accept" ? "accept_all" :
        item.intent === "reject" ? "reject_all" :
        item.intent === "options" ? "manage_preferences" :
        item.intent === "privacy_opt_out" ? "do_not_sell_share" :
        "other",
      classifierReasonCodes: item.classifier?.reasonCodes ?? [],
      classifierVariant: null,
      label: item.label!,
      matchedLocale: item.locale,
      matchedTerm: item.classifier?.matchedTerm ?? null,
      matchStrength: item.classifier?.matchStrength ?? null,
      semanticRole: null,
      visible: true,
    }))
    .slice(0, 12);
  return {
    acceptControlObserved: assessmentCompatibilityState(assessment, "accept") === true,
    actionableControlInventoryRetained:
      assessment.coverage.status === "complete" ||
      assessment.surface.status === "observed_actionable",
    controls,
    geometryAssessment:
      assessment.document.identityStatus === "mismatched"
        ? "document_mismatch"
        : assessment.coverage.status === "complete"
          ? "complete"
          : "incomplete",
    layerInspected: "first_layer",
    managePreferencesControlObserved: assessmentCompatibilityState(assessment, "options") === true,
    rejectControlObserved: assessmentCompatibilityState(assessment, "reject") === true,
    visibleChoiceLabels: controls.map((control) => control.label),
  };
}

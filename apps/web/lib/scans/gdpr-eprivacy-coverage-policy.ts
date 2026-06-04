import { getRuntimeVendorDisclosureEvidence } from "./runtime-vendor-disclosure";

export type GdprEprivacyCoverageOutcomeStatus =
  | "Gap observed"
  | "Observed"
  | "Not confirmed"
  | "Not observed"
  | "Not testable"
  | "Review signal"
  | "Insufficient evidence";

export type GdprEprivacyCoverageSourceSignalGap = {
  actual: unknown;
  expected: unknown;
  field: string;
  source: "scanner" | "CertScore";
  whyNeeded: string;
};

export type GdprEprivacyCoverageCriticalEvidence = {
  missingOrIncompleteSourceSignals: GdprEprivacyCoverageSourceSignalGap[];
  pipeline: {
    concernPolicyKey: string;
    projectionStage: "coverage_policy" | "unified_finding" | "executive_projection" | "coverage_fallback";
    wc01NormalizedConcernKey: string;
    ws01EvidenceRole: string;
  };
  projectedFindings: Array<{
    id: string;
    label: string;
    severity?: string;
  }>;
  retainedEvidence: Record<string, unknown>;
  statusBasis: string;
};

export type GdprEprivacyCoverageOutcome = {
  criticalEvidence: GdprEprivacyCoverageCriticalEvidence;
  evidenceRefs: string[];
  limitation: string;
  rowId: string;
  status: GdprEprivacyCoverageOutcomeStatus;
};

export type GdprEprivacyCoveragePolicyEvent = {
  eventType: string;
  metadataJson: unknown;
};

export type GdprEprivacyCoveragePolicyInput = {
  coverageLimited: boolean;
  events?: GdprEprivacyCoveragePolicyEvent[];
  runtimeArtifacts?: Record<string, unknown> | null;
  scanCompleted: boolean;
  snapshot?: Record<string, unknown> | null;
};

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function getBoolean(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (value === true || value === false) {
      return value;
    }
  }

  return null;
}

function getBooleanAnyTrue(record: Record<string, unknown> | null | undefined, keys: string[]) {
  let observedFalse = false;

  for (const key of keys) {
    const value = record?.[key];
    if (value === true) {
      return true;
    }
    if (value === false) {
      observedFalse = true;
    }
  }

  return observedFalse ? false : null;
}

function getNumber(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function getString(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function getStringArray(record: Record<string, unknown> | null | undefined, keys: string[]) {
  const values: string[] = [];

  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim().length > 0) {
      values.push(value.trim());
      continue;
    }
    if (!Array.isArray(value)) {
      continue;
    }
    for (const entry of value) {
      if (typeof entry === "string" && entry.trim().length > 0) {
        values.push(entry.trim());
      }
    }
  }

  return [...new Set(values)];
}

function getRawValue(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    if (record && Object.prototype.hasOwnProperty.call(record, key)) {
      return record[key];
    }
  }

  return null;
}

function getObject(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = getRecord(record?.[key]);
    if (value) {
      return value;
    }
  }

  return null;
}

function getObjectArray(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (Array.isArray(value)) {
      return value.filter((entry): entry is Record<string, unknown> => Boolean(getRecord(entry)));
    }
  }

  return [];
}

function compactArray<T>(values: T[], limit = 5) {
  return values.filter((value) => value !== null && value !== undefined).slice(0, limit);
}

function formatInlineList(values: string[]) {
  if (values.length <= 1) {
    return values[0] ?? "";
  }
  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function compactRecord(record: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => {
      if (value === null || value === undefined) {
        return false;
      }
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      return true;
    })
  );
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function sourceGap(
  field: string,
  expected: unknown,
  actual: unknown,
  whyNeeded: string,
  source: "scanner" | "CertScore" = "scanner"
): GdprEprivacyCoverageSourceSignalGap {
  return { actual, expected, field, source, whyNeeded };
}

function getEventMetadata(events: GdprEprivacyCoveragePolicyEvent[] | undefined, phase: string) {
  const matches = (events ?? [])
    .map((event) => getRecord(event.metadataJson))
    .filter((metadata): metadata is Record<string, unknown> => Boolean(metadata))
    .filter((metadata) => getString(metadata, ["phase"]) === phase);

  return matches.at(-1) ?? null;
}

function getHybridRuntimeEvidence(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  return getObject(runtimeArtifacts, ["hybridRuntimeEvidence", "hybrid_runtime_evidence"]);
}

function getHybridStorageSummary(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  return getObject(getHybridRuntimeEvidence(runtimeArtifacts), ["storageSummary", "storage_summary"]);
}

function getHybridNetworkSummary(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  return getObject(getHybridRuntimeEvidence(runtimeArtifacts), ["networkSummary", "network_summary"]);
}

function getHybridConsentOutcomeSummary(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  return getObject(getHybridRuntimeEvidence(runtimeArtifacts), ["consentOutcomeSummary", "consent_outcome_summary"]);
}

function getPostRejectTrackingReductionEvidence(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  return getObject(runtimeArtifacts, [
    "postRejectTrackingReductionEvidence",
    "post_reject_tracking_reduction_evidence"
  ]);
}

function getRejectPathDepthAndAvailability(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  return getObject(runtimeArtifacts, [
    "rejectPathDepthAndAvailability",
    "reject_path_depth_and_availability"
  ]);
}

function getConsentControlLifecycleEvidence(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  const hybridRuntimeEvidence = getHybridRuntimeEvidence(runtimeArtifacts);
  return (
    getObject(hybridRuntimeEvidence, ["consentControlLifecycleEvidence", "consent_control_lifecycle_evidence"]) ??
    getObject(runtimeArtifacts, ["consentControlLifecycleEvidence", "consent_control_lifecycle_evidence"])
  );
}

function isPrivacyChoiceSurfaceOnly(lifecycle: Record<string, unknown> | null) {
  const surfacePurpose = getString(lifecycle, ["surfacePurpose", "surface_purpose"]);
  const placement = getString(lifecycle, ["privacyControlPlacement", "privacy_control_placement"]);
  const layerInspected = getString(lifecycle, ["layerInspected", "layer_inspected"]);
  const initialConsentLayerObserved = getBoolean(lifecycle, ["initialConsentLayerObserved", "initial_consent_layer_observed"]);
  const contaminationDetected = getBoolean(lifecycle, [
    "consentSurfaceContaminationDetected",
    "consent_surface_contamination_detected"
  ]);

  return (
    initialConsentLayerObserved !== true &&
    surfacePurpose !== "cookie_consent" &&
    (
      layerInspected === "footer_link" ||
      placement === "footer" ||
      surfacePurpose === "sale_share_opt_out" ||
      surfacePurpose === "targeted_ads_opt_out" ||
      surfacePurpose === "ad_choices" ||
      surfacePurpose === "privacy_policy" ||
      contaminationDetected === true
    )
  );
}

const SIMPLE_COOKIE_NOTICE_TEXT_PATTERN =
  /\b(?:uses?|use|using)\s+cookies?\b|\bcookie\s+notice\b|\bcookie\s+consent\b|\bcookie\s+(?:settings|preferences|choices|center)\b|\bmanage\s+cookies\b/i;
const SIMPLE_ACCEPT_LABEL_PATTERN = /\b(?:accept|accept all|allow|agree|i accept)\b/i;
const SIMPLE_REJECT_LABEL_PATTERN = /\b(?:decline|decline all|reject|reject all|deny|refuse|necessary only|essential only)\b/i;

function getEvidenceText(record: Record<string, unknown> | null | undefined) {
  return [
    getString(record, ["bannerTextSnippet", "banner_text_snippet", "textSnippet", "text_snippet", "text", "bodyText", "body_text"]),
    ...getStringArray(record, [
      "evidenceRefs",
      "evidence_refs",
      "footerLinksInspected",
      "footer_links_inspected",
      "textSnippets",
      "text_snippets",
      "snippets"
    ])
  ].filter((value): value is string => Boolean(value));
}

function getFirstLayerConsentChoiceEvidence(input: GdprEprivacyCoveragePolicyInput) {
  const hybridRuntimeEvidence = getHybridRuntimeEvidence(input.runtimeArtifacts);
  const lifecycle = getConsentControlLifecycleEvidence(input.runtimeArtifacts);
  const consentSummary = getObject(hybridRuntimeEvidence, ["consentSummary", "consent_summary"]);
  const consentUiPath = getObject(hybridRuntimeEvidence, ["consentUiPathEvidence", "consent_ui_path_evidence"]);
  const rejectPath = getRejectPathDepthAndAvailability(input.runtimeArtifacts);
  const firstLayerChoices =
    getObject(rejectPath, ["firstLayerConsentChoices", "first_layer_consent_choices"]) ??
    getObject(hybridRuntimeEvidence, ["firstLayerConsentChoices", "first_layer_consent_choices"]);
  const visibleChoiceLabels = getStringArray(firstLayerChoices, ["visibleChoiceLabels", "visible_choice_labels"]);
  const layerInspected =
    getString(firstLayerChoices, ["layerInspected", "layer_inspected"]) ??
    getString(rejectPath, ["layerInspected", "layer_inspected"]) ??
    getString(consentUiPath, ["layerInspected", "layer_inspected"]) ??
    getString(lifecycle, ["layerInspected", "layer_inspected"]);
  const surfaceText = [
    ...getEvidenceText(firstLayerChoices),
    ...getEvidenceText(consentSummary),
    ...getEvidenceText(consentUiPath),
    ...getEvidenceText(rejectPath),
    ...getEvidenceText(lifecycle)
  ];
  const bannerLikeSurfaceObserved =
    layerInspected === "first_layer" ||
    getBoolean(lifecycle, ["initialConsentLayerObserved", "initial_consent_layer_observed"]) === true ||
    getBoolean(firstLayerChoices, ["capturedBeforeInteraction", "captured_before_interaction"]) === true ||
    getBoolean(consentSummary, ["bannerPresent", "banner_present"]) === true ||
    getBoolean(input.runtimeArtifacts, ["consentSurfaceObserved", "consent_surface_observed"]) === true ||
    getBoolean(hybridRuntimeEvidence, ["consentSurfaceObserved", "consent_surface_observed"]) === true ||
    getBoolean(input.snapshot, ["cookie_banner_present", "cookieBannerPresent", "consent_surface_observed", "consentSurfaceObserved"]) === true;
  const acceptControlObserved =
    getBoolean(firstLayerChoices, ["acceptControlObserved", "accept_control_observed", "acceptVisibleOnFirstLayer", "accept_visible_on_first_layer"]) === true ||
    visibleChoiceLabels.some((label) => SIMPLE_ACCEPT_LABEL_PATTERN.test(label));
  const rejectControlObserved =
    getBoolean(firstLayerChoices, ["rejectControlObserved", "reject_control_observed", "rejectVisibleOnFirstLayer", "reject_visible_on_first_layer"]) === true ||
    getBoolean(rejectPath, ["rejectAvailableOnFirstLayer", "reject_available_on_first_layer"]) === true ||
    visibleChoiceLabels.some((label) => SIMPLE_REJECT_LABEL_PATTERN.test(label));
  const cookieNoticeTextObserved = surfaceText.some((text) => SIMPLE_COOKIE_NOTICE_TEXT_PATTERN.test(text));

  return {
    acceptControlObserved,
    bannerLikeSurfaceObserved,
    cookieNoticeTextObserved,
    firstLayerChoices,
    layerInspected,
    rejectControlObserved,
    surfaceText: compactArray(surfaceText, 4),
    visibleChoiceLabels: compactArray(visibleChoiceLabels, 8)
  };
}

function hasSimpleFirstLayerCookieNoticeWithAcceptReject(input: GdprEprivacyCoveragePolicyInput) {
  const evidence = getFirstLayerConsentChoiceEvidence(input);
  return (
    evidence.bannerLikeSurfaceObserved &&
    evidence.cookieNoticeTextObserved &&
    evidence.acceptControlObserved &&
    evidence.rejectControlObserved
  );
}

function getExplicitFirstLayerGdprConsentBannerConfirmed(input: GdprEprivacyCoveragePolicyInput) {
  const hybridRuntimeEvidence = getHybridRuntimeEvidence(input.runtimeArtifacts);
  const lifecycle = getConsentControlLifecycleEvidence(input.runtimeArtifacts);
  const consentUiPath = getObject(hybridRuntimeEvidence, ["consentUiPathEvidence", "consent_ui_path_evidence"]);
  const rejectPath = getRejectPathDepthAndAvailability(input.runtimeArtifacts);
  const sources = [lifecycle, consentUiPath, rejectPath, input.runtimeArtifacts, input.snapshot];
  const firstLayerObserved = sources
    .map((source) => getBoolean(source, ["firstLayerCookieConsentBannerObserved", "first_layer_cookie_consent_banner_observed"]))
    .find((value): value is boolean => typeof value === "boolean");
  const gdprSurfaceObserved = sources
    .map((source) => getRawValue(source, ["gdprEprivacyConsentSurfaceObserved", "gdpr_eprivacy_consent_surface_observed"]))
    .find((value) => typeof value === "boolean" || typeof value === "string");
  const simpleCookieNoticeWithChoice = hasSimpleFirstLayerCookieNoticeWithAcceptReject(input);

  if (
    simpleCookieNoticeWithChoice ||
    (firstLayerObserved === true && (gdprSurfaceObserved === true || gdprSurfaceObserved === "true"))
  ) {
    return true;
  }

  if (
    firstLayerObserved === false ||
    gdprSurfaceObserved === false ||
    gdprSurfaceObserved === "false" ||
    gdprSurfaceObserved === "unconfirmed" ||
    gdprSurfaceObserved === "unknown" ||
    isPrivacyChoiceSurfaceOnly(lifecycle)
  ) {
    return false;
  }

  return null;
}

function getConsentLifecycleAuditLimitation(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  const hybridRuntimeEvidence = getHybridRuntimeEvidence(runtimeArtifacts);
  const structuredLimitation = getObject(hybridRuntimeEvidence, ["consentLifecycleAudit", "consent_lifecycle_audit"]);
  const consentAuditCompleted = getBoolean(runtimeArtifacts, ["consentAuditCompleted", "consent_audit_completed"]);
  const blockerTextSnippet = getString(runtimeArtifacts, ["consentBlockerTextSnippet", "consent_blocker_text_snippet"]);
  const structuredReason = getString(structuredLimitation, ["reason"]);
  const inferredPreviewShortCircuit =
    consentAuditCompleted === false &&
    blockerTextSnippet !== null &&
    /preflight.*verified|lean scan path|stopped before homepage setup/i.test(blockerTextSnippet);

  if (!structuredLimitation && !inferredPreviewShortCircuit) {
    return null;
  }

  const reason = structuredReason ?? (inferredPreviewShortCircuit ? "preview_preflight_short_circuit" : "scan_coverage_limited");

  return {
    actionableChoiceObserved:
      getBoolean(structuredLimitation, ["actionableChoiceObserved", "actionable_choice_observed"]) ??
      getBoolean(runtimeArtifacts, ["consentActionableChoiceObserved", "consent_actionable_choice_observed"]),
    attempted: getBoolean(structuredLimitation, ["attempted"]) ?? consentAuditCompleted ?? false,
    blockerTextSnippet: getString(structuredLimitation, ["blockerTextSnippet", "blocker_text_snippet"]) ?? blockerTextSnippet,
    consentAuditCompleted,
    consentSurfaceObserved:
      getBoolean(structuredLimitation, ["consentSurfaceObserved", "consent_surface_observed"]) ??
      getBoolean(runtimeArtifacts, ["consentSurfaceObserved", "consent_surface_observed"]),
    reason,
    requiredFullRuntimeAudit:
      getBoolean(structuredLimitation, ["requiredFullRuntimeAudit", "required_full_runtime_audit"]) ?? true
  };
}

function makeConsentLifecycleLimitedOutcome(rowId: string, retainedLimitation: ReturnType<typeof getConsentLifecycleAuditLimitation>) {
  if (!retainedLimitation) {
    return null;
  }

  const rowLabel =
    rowId === "reject_all_path_availability"
      ? "reject-path availability"
      : rowId === "post_reject_tracking_reduction"
        ? "post-reject tracking reduction"
        : "post-choice preference or withdrawal controls";

  return makeOutcome(
    rowId,
    "Not testable",
    `The retained scanner runtime evidence shows this scan did not run consent lifecycle interaction testing, so ${rowLabel} cannot be evaluated from this scan.`,
    [
      "Evidence: consent lifecycle audit limitation",
      retainedLimitation.reason ? `Limitation reason: ${retainedLimitation.reason}` : null
    ].filter((value): value is string => Boolean(value)),
    {
      missingOrIncompleteSourceSignals: [
        sourceGap(
          "scanner.consentLifecycleAudit.attempted",
          true,
          retainedLimitation.attempted,
          "Required to evaluate consent lifecycle rows from retained interaction evidence."
        )
      ],
      retainedEvidence: retainedLimitation
    }
  );
}

const CONSENT_PREFERENCE_CONTROL_PATTERN =
    /\b(?:ad\s+choices|cookie\s+(?:settings|preferences|choices|center)|customi[sz]e\s+cookies?|privacy\s+(?:settings|choices|preferences|rights)|manage\s+(?:consent|choices|cookies|preferences|settings)|consent\s+preferences?|preference\s+center|do\s+not\s+sell(?:\s+or\s+share)?|do\s+not\s+share|your\s+privacy\s+choices|your\s+privacy\s+rights|opt[-\s]?out(?:\s+of\s+targeted\s+advertising)?|withdraw\s+consent|change\s+your\s+consent|revoke\s+consent)\b/i;
const COOKIE_CONSENT_WITHDRAWAL_CONTROL_PATTERN =
  /\b(?:cookie\s+(?:settings|preferences|choices|center)|customi[sz]e\s+cookies?|manage\s+(?:consent|cookies|preferences)|consent\s+preferences?|preference\s+center|withdraw\s+consent|change\s+your\s+consent|revoke\s+consent)\b/i;
const NON_WITHDRAWAL_CONTROL_ACTION_PATTERN =
  /\b(?:close|dismiss|cancel|back|continue|learn\s+more|privacy\s+policy|terms|notice)\b/i;
const PRIVACY_AD_CHOICE_ONLY_CONTROL_PATTERN =
  /\b(?:ad\s+choices|your\s+privacy\s+choices|privacy\s+(?:choices|rights)|do\s+not\s+sell(?:\s+or\s+share)?|do\s+not\s+share|targeted\s+ads?|targeted\s+advertising|google\s+analytics\s+opt[-\s]?out|vendor\s+opt[-\s]?out|opt[-\s]?out)\b/i;

function isCookieConsentWithdrawalControlLabel(label: string) {
  const normalized = label.trim();
  return (
    COOKIE_CONSENT_WITHDRAWAL_CONTROL_PATTERN.test(normalized) &&
    !NON_WITHDRAWAL_CONTROL_ACTION_PATTERN.test(normalized)
  );
}

function getObservedPreferenceControlLabels(lifecycle: Record<string, unknown>) {
  return getObjectArray(lifecycle, ["observedControls", "observed_controls"])
    .map((control) => {
      const text = getString(control, ["text", "label"]);
      const href = getString(control, ["href", "url"]);
      const haystack = `${text ?? ""} ${href ?? ""}`;
      return text && CONSENT_PREFERENCE_CONTROL_PATTERN.test(haystack) ? text : null;
    })
    .filter((value): value is string => Boolean(value));
}

function hasAmbiguousPreferenceControlEvidence(
  lifecycle: Record<string, unknown>,
  observedControlLabels: string[]
) {
  const observedControls = getObjectArray(lifecycle, ["observedControls", "observed_controls"]);
  return (
    observedControlLabels.length === 0 &&
    (
      getBoolean(lifecycle, ["cmpReopenControlObserved", "cmp_reopen_control_observed"]) === true ||
      getBoolean(lifecycle, [
        "preferenceCenterReachableAfterInitialLayer",
        "preference_center_reachable_after_initial_layer"
      ]) === true ||
      observedControls.length > 0
    )
  );
}

function makeOutcome(
  rowId: string,
  status: GdprEprivacyCoverageOutcomeStatus,
  limitation: string,
  evidenceRefs: string[] = [],
  criticalEvidence?: {
    missingOrIncompleteSourceSignals?: GdprEprivacyCoverageSourceSignalGap[];
    retainedEvidence?: Record<string, unknown>;
  }
): GdprEprivacyCoverageOutcome {
  return {
    criticalEvidence: {
      missingOrIncompleteSourceSignals: criticalEvidence?.missingOrIncompleteSourceSignals ?? [],
      pipeline: {
        concernPolicyKey: `gdpr_eprivacy_coverage.${rowId}.${status.toLowerCase().replaceAll(" ", "_")}`,
        projectionStage: "coverage_policy",
        wc01NormalizedConcernKey: `gdpr_eprivacy.coverage.${rowId}`,
        ws01EvidenceRole: "observed runtime signal identification, evidence capture, and logging"
      },
      projectedFindings: [],
      retainedEvidence: compactRecord({
        evidenceRefs: [...new Set(evidenceRefs)].slice(0, 6),
        ...(criticalEvidence?.retainedEvidence ?? {})
      }),
      statusBasis: limitation
    },
    evidenceRefs: [...new Set(evidenceRefs)].slice(0, 6),
    limitation,
    rowId,
    status
  };
}

function hasRuntimeCapture(input: GdprEprivacyCoveragePolicyInput) {
  const localEvidence = getEventMetadata(input.events, "hybrid_auto_local_evidence");
  const runtimeCapture = getEventMetadata(input.events, "browser_runtime_capture");

  return (
    getString(localEvidence, ["status"]) === "ok" ||
    getString(runtimeCapture, ["status"]) === "ok" ||
    getNumber(input.snapshot, ["pages_scanned"]) !== null
  );
}

function deriveConsentSurfaceOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const hybridRuntimeEvidence = getHybridRuntimeEvidence(input.runtimeArtifacts);
  const consentControlLifecycle = getConsentControlLifecycleEvidence(input.runtimeArtifacts);
  const consentUiPathEvidence = getObject(hybridRuntimeEvidence, ["consentUiPathEvidence", "consent_ui_path_evidence"]);
  const rejectPathEvidence = getObject(input.runtimeArtifacts, ["rejectPathDepthAndAvailability", "reject_path_depth_and_availability"]);
  const firstLayerConsentChoices = getObject(hybridRuntimeEvidence, ["firstLayerConsentChoices", "first_layer_consent_choices"]);
  const visibleChoiceLabels = getStringArray(firstLayerConsentChoices, ["visibleChoiceLabels", "visible_choice_labels"]);
  const layerInspected = getString(consentUiPathEvidence, ["layerInspected", "layer_inspected"]);
  const simpleCookieNoticeEvidence = getFirstLayerConsentChoiceEvidence(input);
  const simpleCookieNoticeWithChoice = hasSimpleFirstLayerCookieNoticeWithAcceptReject(input);
  const structuredDemotionReasons = [
    ...getStringArray(consentControlLifecycle, ["consentSurfaceDemotionReasons", "consent_surface_demotion_reasons"]),
    ...getStringArray(consentUiPathEvidence, ["consentSurfaceDemotionReasons", "consent_surface_demotion_reasons"]),
    ...getStringArray(rejectPathEvidence, ["consentSurfaceDemotionReasons", "consent_surface_demotion_reasons"])
  ];
  const structuredContaminationDetected =
    getBoolean(consentControlLifecycle, ["consentSurfaceContaminationDetected", "consent_surface_contamination_detected"]) === true ||
    getBoolean(consentUiPathEvidence, ["consentSurfaceContaminationDetected", "consent_surface_contamination_detected"]) === true ||
    getBoolean(rejectPathEvidence, ["consentSurfaceContaminationDetected", "consent_surface_contamination_detected"]) === true;
  const privacyChoiceSurfaceOnly = isPrivacyChoiceSurfaceOnly(consentControlLifecycle) || structuredContaminationDetected;
  const consentSurfaceObserved =
    (!privacyChoiceSurfaceOnly || simpleCookieNoticeWithChoice) &&
    (
      simpleCookieNoticeWithChoice ||
      getBoolean(input.runtimeArtifacts, ["consentSurfaceObserved", "consent_surface_observed"]) === true ||
      getBoolean(hybridRuntimeEvidence, ["consentSurfaceObserved", "consent_surface_observed"]) === true ||
      getBoolean(input.snapshot, ["cookie_banner_present", "cookieBannerPresent", "consent_surface_observed", "consentSurfaceObserved"]) === true ||
      getBoolean(firstLayerConsentChoices, ["capturedBeforeInteraction", "captured_before_interaction"]) === true ||
      visibleChoiceLabels.length > 0 ||
      layerInspected === "first_layer"
    );

  if (consentSurfaceObserved) {
    const retainedLayerInspected = simpleCookieNoticeEvidence.layerInspected ?? layerInspected;
    const evidenceRefs = [
      "Evidence: retained consent surface observation",
      ...(
        simpleCookieNoticeEvidence.visibleChoiceLabels.length > 0
          ? simpleCookieNoticeEvidence.visibleChoiceLabels
          : visibleChoiceLabels
      ).map((label) => `Visible choice: ${label}`).slice(0, 3),
      retainedLayerInspected ? `Layer inspected: ${retainedLayerInspected}` : null
    ].filter((value): value is string => Boolean(value));
    return makeOutcome(
      "consent_surface_observed",
      "Observed",
      simpleCookieNoticeWithChoice
        ? "A first-layer cookie notice was observed with actionable Accept and Decline controls."
        : "A consent surface or first-layer consent controls were retained in the tested context.",
      evidenceRefs,
      {
        retainedEvidence: {
          acceptControlObserved: simpleCookieNoticeWithChoice ? simpleCookieNoticeEvidence.acceptControlObserved : undefined,
          consentSurfaceContaminationDetected: simpleCookieNoticeWithChoice ? false : undefined,
          consentSurfaceDecisionStates: simpleCookieNoticeWithChoice ? ["first_layer_cookie_notice_observed"] : undefined,
          consentSurfaceObserved: true,
          firstLayerCookieConsentBannerObserved: simpleCookieNoticeWithChoice ? true : undefined,
          gdprEprivacyConsentSurfaceObserved: simpleCookieNoticeWithChoice ? true : undefined,
          layerInspected: retainedLayerInspected,
          privacyControlPlacement: simpleCookieNoticeWithChoice
            ? retainedLayerInspected === "first_layer" ? "first_layer" : "banner"
            : undefined,
          rejectControlObserved: simpleCookieNoticeWithChoice ? simpleCookieNoticeEvidence.rejectControlObserved : undefined,
          surfacePurpose: simpleCookieNoticeWithChoice ? "cookie_consent" : undefined,
          visibleChoiceLabels: compactArray(
            simpleCookieNoticeEvidence.visibleChoiceLabels.length > 0
              ? simpleCookieNoticeEvidence.visibleChoiceLabels
              : visibleChoiceLabels,
            5
          )
        }
      }
    );
  }

    if (privacyChoiceSurfaceOnly && hasRuntimeCapture(input)) {
      return makeOutcome(
        "consent_surface_observed",
        "Not confirmed",
        "Privacy/ad-choice surface observed; GDPR consent banner not confirmed.",
        [
          "Evidence: consent control lifecycle",
        getString(consentControlLifecycle, ["surfacePurpose", "surface_purpose"]) ? `Surface purpose: ${getString(consentControlLifecycle, ["surfacePurpose", "surface_purpose"])}` : null,
        getString(consentControlLifecycle, ["privacyControlPlacement", "privacy_control_placement"]) ? `Placement: ${getString(consentControlLifecycle, ["privacyControlPlacement", "privacy_control_placement"])}` : null,
        ...visibleChoiceLabels.map((label) => `Visible choice: ${label}`).slice(0, 5),
        layerInspected ? `Layer inspected: ${layerInspected}` : null
      ].filter((value): value is string => Boolean(value)),
      {
        retainedEvidence: {
          adChoicesLinkObserved:
            getBoolean(consentControlLifecycle, ["adChoicesLinkObserved", "ad_choices_link_observed"]) ??
            getBoolean(consentUiPathEvidence, ["adChoicesLinkObserved", "ad_choices_link_observed"]) ??
            getBoolean(rejectPathEvidence, ["adChoicesLinkObserved", "ad_choices_link_observed"]) ??
            false,
          consentSurfaceContaminationDetected:
            getBoolean(consentControlLifecycle, [
              "consentSurfaceContaminationDetected",
              "consent_surface_contamination_detected"
            ]) ??
            getBoolean(consentUiPathEvidence, [
              "consentSurfaceContaminationDetected",
              "consent_surface_contamination_detected"
            ]) ??
            getBoolean(rejectPathEvidence, [
              "consentSurfaceContaminationDetected",
              "consent_surface_contamination_detected"
            ]) ??
            false,
          consentSurfaceDemotionReasons: [...new Set(structuredDemotionReasons)],
          consentSurfaceObserved: false,
          consentSurfaceDecisionStates: ["privacy_choice_surface_only"],
          firstLayerCookieConsentBannerObserved: false,
          gdprEprivacyConsentSurfaceObserved: "unconfirmed",
          privacyControlPlacement:
            getString(consentControlLifecycle, ["privacyControlPlacement", "privacy_control_placement"]) ??
            getString(consentUiPathEvidence, ["privacyControlPlacement", "privacy_control_placement"]) ??
            getString(rejectPathEvidence, ["privacyControlPlacement", "privacy_control_placement"]) ??
            "unknown",
          consentControlLifecycleEvidence: consentControlLifecycle ?? undefined,
          layerInspected,
          visibleChoiceLabels: compactArray(visibleChoiceLabels, 5)
        }
      }
    );
  }

  const consentSurfaceNotObserved =
    getBoolean(input.runtimeArtifacts, ["consentSurfaceObserved", "consent_surface_observed"]) === false ||
    getBoolean(hybridRuntimeEvidence, ["consentSurfaceObserved", "consent_surface_observed"]) === false ||
    getBoolean(input.snapshot, ["cookie_banner_present", "cookieBannerPresent", "consent_surface_observed", "consentSurfaceObserved"]) === false;

  if (consentSurfaceNotObserved && hasRuntimeCapture(input)) {
    return makeOutcome(
      "consent_surface_observed",
      "Not observed",
      "Runtime consent-surface checks completed for the tested context and did not retain an actionable consent surface.",
      ["Evidence: retained consent surface observation"],
      {
        retainedEvidence: {
          consentSurfaceObserved: false,
          runtimeCaptureCompleted: true
        }
      }
    );
  }

  return null;
}

function derivePreConsentCookieStorageOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const storageSummary = getHybridStorageSummary(input.runtimeArtifacts);
  const cookiesBeforeConsentCount =
    getNumber(storageSummary, ["cookiesBeforeConsentCount", "cookies_before_consent_count"]) ??
    (getBoolean(input.snapshot, ["first_party_cookie_set_before_consent", "third_party_cookie_set_before_consent"]) === true
      ? 1
      : null);
  const cookiesSeenCount =
    getNumber(storageSummary, ["cookiesSeenCount", "cookies_seen_count"]) ??
    getNumber(input.snapshot, ["cookie_count_total"]);

  if (cookiesBeforeConsentCount !== null && cookiesBeforeConsentCount > 0) {
    return makeOutcome(
      "pre_consent_cookies_storage",
      "Not observed",
      "Cookie/storage inventory retained before-consent observations, but scanner did not classify the retained examples as eligible non-essential cookie/storage evidence for this row.",
      [
        `Observed before-consent cookie/storage count: ${cookiesBeforeConsentCount}`,
        "Evidence: hybrid runtime storage summary"
      ],
      {
        retainedEvidence: {
          cookiesBeforeConsentCount,
          cookiesSeenCount,
          eligibleNonEssentialCookieStorageFindingProjected: false,
          storageSummaryRetained: Boolean(storageSummary)
        }
      }
    );
  }

  if (cookiesSeenCount !== null || hasRuntimeCapture(input)) {
    return makeOutcome(
      "pre_consent_cookies_storage",
      "Not observed",
      "Cookie/storage inventory was retained for the tested context, and no eligible pre-consent cookie/storage finding was projected.",
      ["Evidence: hybrid runtime storage summary"],
      {
        retainedEvidence: {
          cookiesBeforeConsentCount: cookiesBeforeConsentCount ?? 0,
          cookiesSeenCount,
          runtimeCaptureCompleted: hasRuntimeCapture(input),
          storageSummaryRetained: Boolean(storageSummary)
        }
      }
    );
  }

  return null;
}

function derivePreConsentThirdPartyTrackingOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const trackerVendors = getStringArray(input.runtimeArtifacts, [
    "preconsent_tracker_vendors",
    "tracker_vendors"
  ]);
  const trackerEvidenceUrls = getStringArray(input.runtimeArtifacts, [
    "preconsent_tracker_evidence_urls",
    "tracker_evidence_urls"
  ]);
  const preconsentTrackingDetected =
    getBoolean(input.snapshot, ["preconsent_tracking_detected", "tracking_before_consent_detected"]) === true ||
    trackerVendors.length > 0 ||
    trackerEvidenceUrls.length > 0;
  const trackerVendorCount =
    trackerVendors.length ||
    getNumber(input.snapshot, ["tracker_vendor_count", "tracker_count_total"]) ||
    0;

  if (preconsentTrackingDetected) {
    return makeOutcome(
      "pre_consent_third_party_tracking",
      "Insufficient evidence",
      "Pre-consent third-party tracking evidence was retained, but no eligible unified tracking finding was projected for this row.",
      [
        "Evidence: pre-consent tracking runtime signal",
        trackerVendorCount > 0 ? `Pre-consent tracker vendors: ${trackerVendorCount}` : null
      ].filter((value): value is string => Boolean(value)),
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "CertScore.unifiedFindings.preConsentTrackingFinding",
            "eligible projected unified finding when retained pre-consent tracking evidence satisfies policy gates",
            "missing",
            "Required to classify retained pre-consent tracker observations as a canonical gap.",
            "CertScore"
          )
        ],
        retainedEvidence: {
          preconsentTrackingDetected,
          trackerEvidenceUrls: compactArray(trackerEvidenceUrls, 3),
          trackerVendorCount,
          trackerVendors: compactArray(trackerVendors, 5)
        }
      }
    );
  }

  if (hasRuntimeCapture(input)) {
    return makeOutcome(
      "pre_consent_third_party_tracking",
      "Not observed",
      "Runtime tracking checks completed for the tested context, and no eligible pre-consent third-party tracking finding was projected.",
      ["Evidence: runtime capture completed"],
      {
        retainedEvidence: {
          preconsentTrackingDetected: false,
          runtimeCaptureCompleted: true,
          trackerVendorCount
        }
      }
    );
  }

  return null;
}

function deriveRejectPathOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const consentLifecycleLimitation = getConsentLifecycleAuditLimitation(input.runtimeArtifacts);
  const consentAuditEntry = getEventMetadata(input.events, "consent_audit_entry");
  const rejectDiagnostic = getEventMetadata(input.events, "reject_persistence_diagnostic");
  const rejectPath = getRejectPathDepthAndAvailability(input.runtimeArtifacts);
  const firstLayerChoices = getObject(rejectPath, ["firstLayerConsentChoices", "first_layer_consent_choices"]);
  const attempted = getBoolean(consentAuditEntry, ["shouldAttemptConsentAudit"]) === true;
  const rejectButtonCount = getNumber(input.snapshot, ["consent_reject_button_count"]);
  const preferenceButtonCount = getNumber(input.snapshot, ["consent_preferences_button_count"]);
  const interactionModel = getString(input.snapshot, ["consent_interaction_model"]);
  const skipNegativeReasons = getStringArray(consentAuditEntry, ["consentInteractionSkipNegativeReasonCodes"]);
  const diagnosticNegativeReasons = getStringArray(rejectDiagnostic, ["negativeReasonCodes"]);
  const visibleRejectLabels = getStringArray(firstLayerChoices, ["visibleChoiceLabels", "visible_choice_labels"])
    .filter((label) => /\b(?:decline|reject|refuse|deny|opt[-\s]?out)\b/i.test(label));
  const rejectAvailability = getString(rejectPath, [
    "availability",
    "status",
    "outcome",
    "rejectPathAvailabilityClassification",
    "reject_path_availability_classification"
  ]);
  const rejectInteractionSucceeded =
    getBoolean(rejectPath, ["rejectInteractionSucceeded", "reject_interaction_succeeded"]) === true ||
    getBoolean(input.runtimeArtifacts, ["consent_reject_interaction_succeeded"]) === true;
  const rejectPathAvailable =
    rejectInteractionSucceeded ||
    getBoolean(rejectPath, ["completeRejectPathAvailable", "complete_reject_path_available"]) === true ||
    getBoolean(rejectPath, ["completeRejectPathDetected", "complete_reject_path_detected"]) === true ||
    getBoolean(rejectPath, ["rejectEquivalentFound", "reject_equivalent_found"]) === true ||
    getBoolean(rejectPath, ["rejectAvailableOnFirstLayer", "reject_available_on_first_layer"]) === true ||
    getBoolean(firstLayerChoices, ["rejectVisibleOnFirstLayer", "reject_visible_on_first_layer"]) === true ||
    visibleRejectLabels.length > 0 ||
    rejectAvailability === "available" ||
    rejectAvailability === "reject_available_first_layer";
  const firstLayerGdprBannerConfirmed = getExplicitFirstLayerGdprConsentBannerConfirmed(input);
  
  if (firstLayerGdprBannerConfirmed === false) {
    return makeOutcome(
      "reject_all_path_availability",
      "Not testable",
      "Reject-path availability could not be evaluated because no first-layer GDPR/ePrivacy cookie consent banner was confirmed. Footer privacy/ad-choice controls were observed, but they do not establish an accept/reject consent surface.",
      [
        "Evidence: consent surface demotion",
        "Reason: no_confirmed_first_layer_cookie_consent_banner"
      ],
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "scanner.firstLayerCookieConsentBannerObserved",
            true,
            false,
            "Required before CertScore can evaluate first-layer accept/reject availability."
          )
        ],
        retainedEvidence: {
          firstLayerCookieConsentBannerObserved: false,
          gdprEprivacyConsentSurfaceObserved: "unconfirmed",
          reason: "no_confirmed_first_layer_cookie_consent_banner"
        }
      }
    );
  }
  
  if (rejectPathAvailable) {
    const rejectClickDepth = getNumber(rejectPath, [
      "rejectClickDepth",
      "reject_click_depth",
      "observedRejectPathDepth",
      "observed_reject_path_depth"
    ]);
    const layerInspected = getString(rejectPath, ["layerInspected", "layer_inspected"]);
    const sameLayerDeclineObserved =
      layerInspected === "first_layer" &&
      visibleRejectLabels.some((label) => /\bdecline\b/i.test(label));
    const evidenceRefs = [
      "Evidence: reject path depth and availability",
      layerInspected
        ? `Layer inspected: ${layerInspected}`
        : null,
      rejectClickDepth !== null
        ? `Reject click depth: ${rejectClickDepth}`
        : null,
      ...visibleRejectLabels.map((label) => `Visible choice: ${label}`)
    ].filter((value): value is string => Boolean(value));
  
    return makeOutcome(
      "reject_all_path_availability",
      "Observed",
      sameLayerDeclineObserved
        ? "A Decline control was observed on the same first-layer cookie notice as Accept."
        : "A reject or equivalent refusal path was retained in the tested consent surface.",
      evidenceRefs,
      {
        retainedEvidence: {
          completeRejectPathAvailable: getBoolean(rejectPath, [
            "completeRejectPathAvailable",
            "complete_reject_path_available"
          ]),
          layerInspected,
          rejectClickDepth,
          rejectInteractionSucceeded,
          visibleRejectLabels: compactArray(visibleRejectLabels, 5)
        }
      }
    );
  }

  if (
    attempted &&
    (rejectButtonCount === 0 || skipNegativeReasons.includes("complete_reject_choice_controls_not_detected"))
  ) {
    return makeOutcome(
      "reject_all_path_availability",
      "Insufficient evidence",
      "Consent audit retained evidence that no complete reject-all control was detected, but no eligible reject-path unified finding was projected.",
      [
        "Evidence: consent audit attempted",
        rejectButtonCount !== null ? `Reject controls observed: ${rejectButtonCount}` : null,
        preferenceButtonCount !== null ? `Preference controls observed: ${preferenceButtonCount}` : null,
        interactionModel ? `Consent interaction model: ${interactionModel}` : null,
        ...skipNegativeReasons,
        ...diagnosticNegativeReasons
      ].filter((value): value is string => Boolean(value)),
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "hybridRuntimeEvidence.rejectPathDepthAndAvailability.completeRejectPathAvailable",
            true,
            getRawValue(rejectPath, ["completeRejectPathAvailable", "complete_reject_path_available"]),
            "Required to prove a complete reject-all or equivalent refusal path."
          ),
          sourceGap(
            "scanSnapshots.consent_reject_button_count",
            "greater than 0 or explicit complete-reject negative reason",
            rejectButtonCount,
            "Required to distinguish missing reject controls from incomplete reject-path testing.",
            "CertScore"
          )
        ],
        retainedEvidence: {
          attempted,
          diagnosticNegativeReasons: compactArray(diagnosticNegativeReasons, 5),
          interactionModel,
          preferenceButtonCount,
          rejectButtonCount,
          skipNegativeReasons: compactArray(skipNegativeReasons, 5)
        }
      }
    );
  }

  if (attempted) {
    return makeOutcome(
      "reject_all_path_availability",
      "Not observed",
      "Consent audit ran for the tested context, and no eligible reject-path availability finding was projected.",
      ["Evidence: consent audit attempted"],
      {
        retainedEvidence: {
          attempted,
          completeRejectPathAvailable: false,
          rejectButtonCount,
          rejectInteractionSucceeded: false
        }
      }
    );
  }

  const limitedOutcome = makeConsentLifecycleLimitedOutcome(
    "reject_all_path_availability",
    consentLifecycleLimitation
  );
  if (limitedOutcome) {
    return limitedOutcome;
  }

  return null;
}

const ACCEPT_LABEL_PATTERN = /\b(?:accept|agree|allow|ok|got it|i accept|yes)\b/i;
const REJECT_LABEL_PATTERN = /\b(?:decline|reject|refuse|deny|opt[-\s]?out|essential only|necessary only)\b/i;
const MANAGE_PREFERENCES_LABEL_PATTERN =
  /\b(?:manage|settings|preferences?|customi[sz]e|choices?|options?|cookie center|preference center)\b/i;

function getConsentChoiceQualityEvidence(input: GdprEprivacyCoveragePolicyInput) {
  const hybridRuntimeEvidence = getHybridRuntimeEvidence(input.runtimeArtifacts);
  const lifecycle = getConsentControlLifecycleEvidence(input.runtimeArtifacts);
  const consentUiPathEvidence = getObject(hybridRuntimeEvidence, ["consentUiPathEvidence", "consent_ui_path_evidence"]);
  const rejectPath = getRejectPathDepthAndAvailability(input.runtimeArtifacts);
  const firstLayerChoices =
    getObject(rejectPath, ["firstLayerConsentChoices", "first_layer_consent_choices"]) ??
    getObject(hybridRuntimeEvidence, ["firstLayerConsentChoices", "first_layer_consent_choices"]);
  const visibleChoiceLabels = getStringArray(firstLayerChoices, ["visibleChoiceLabels", "visible_choice_labels"]);
  const firstLayerCookieConsentBannerObserved = getExplicitFirstLayerGdprConsentBannerConfirmed(input);
  const layerInspected =
    getString(firstLayerChoices, ["layerInspected", "layer_inspected"]) ??
    getString(rejectPath, ["layerInspected", "layer_inspected"]) ??
    getString(consentUiPathEvidence, ["layerInspected", "layer_inspected"]) ??
    getString(lifecycle, ["layerInspected", "layer_inspected"]);
  const acceptControlObserved =
    getBoolean(firstLayerChoices, ["acceptControlObserved", "accept_control_observed", "acceptVisibleOnFirstLayer", "accept_visible_on_first_layer"]) ??
    visibleChoiceLabels.some((label) => ACCEPT_LABEL_PATTERN.test(label));
  const rejectControlObserved =
    getBoolean(firstLayerChoices, ["rejectControlObserved", "reject_control_observed", "rejectVisibleOnFirstLayer", "reject_visible_on_first_layer"]) ??
    getBoolean(rejectPath, ["rejectEquivalentFound", "reject_equivalent_found", "completeRejectPathAvailable", "complete_reject_path_available"]) ??
    visibleChoiceLabels.some((label) => REJECT_LABEL_PATTERN.test(label));
  const rejectClickDepth = getNumber(rejectPath, [
    "rejectClickDepth",
    "reject_click_depth",
    "observedRejectPathDepth",
    "observed_reject_path_depth"
  ]);
  const sameLayerRejectObserved =
    getBoolean(firstLayerChoices, ["sameLayerRejectObserved", "same_layer_reject_observed", "rejectVisibleOnFirstLayer", "reject_visible_on_first_layer"]) ??
    getBoolean(rejectPath, ["rejectAvailableOnFirstLayer", "reject_available_on_first_layer"]) ??
    (rejectControlObserved === true && (layerInspected === "first_layer" || rejectClickDepth === 0 || rejectClickDepth === 1));
  const observedControlLabels = lifecycle ? getObservedPreferenceControlLabels(lifecycle) : [];
  const explicitManagePreferencesObserved =
    getBoolean(firstLayerChoices, ["managePreferencesObserved", "manage_preferences_observed", "preferencesControlObserved", "preferences_control_observed"]) ??
    getBooleanAnyTrue(lifecycle, [
      "cookiePreferencesLinkObserved",
      "cookie_preferences_link_observed",
      "manageConsentSurfaceObserved",
      "manage_consent_surface_observed",
      "manageCookiesSurfaceObserved",
      "manage_cookies_surface_observed",
      "preferenceCenterReachableAfterInitialLayer",
      "preference_center_reachable_after_initial_layer"
    ]);
  const managePreferencesObserved =
    explicitManagePreferencesObserved ??
    (
      visibleChoiceLabels.some((label) => MANAGE_PREFERENCES_LABEL_PATTERN.test(label)) ||
      observedControlLabels.some((label) => MANAGE_PREFERENCES_LABEL_PATTERN.test(label))
    );
  const purposeCategoryControlsObserved =
    getBoolean(firstLayerChoices, ["purposeCategoryControlsObserved", "purpose_category_controls_observed"]) ??
    getBoolean(lifecycle, ["confirmedCookieCategoryControlsObserved", "confirmed_cookie_category_controls_observed"]);
  const vendorControlsObserved =
    getBoolean(firstLayerChoices, ["vendorControlsObserved", "vendor_controls_observed"]) ??
    getBoolean(lifecycle, ["vendorControlsObserved", "vendor_controls_observed"]);
  const defaultToggleStatesObserved =
    getBoolean(firstLayerChoices, ["defaultToggleStatesObserved", "default_toggle_states_observed"]) ??
    getBoolean(lifecycle, ["defaultToggleStatesObserved", "default_toggle_states_observed"]);
  const nonEssentialDefaultsOff =
    getBoolean(firstLayerChoices, ["nonEssentialDefaultsOff", "non_essential_defaults_off"]) ??
    getBoolean(lifecycle, ["nonEssentialDefaultsOff", "non_essential_defaults_off"]);
  const visualParityEvidenceObserved =
    getBoolean(firstLayerChoices, ["visualParityEvidenceObserved", "visual_parity_evidence_observed"]) ??
    getBoolean(rejectPath, ["visualParityEvidenceObserved", "visual_parity_evidence_observed"]);
  const acceptRejectProminenceComparison =
    getString(firstLayerChoices, ["acceptRejectProminenceComparison", "accept_reject_prominence_comparison"]) ??
    getString(rejectPath, ["acceptRejectProminenceComparison", "accept_reject_prominence_comparison"]);
  const preferenceCenterOpened =
    getBoolean(firstLayerChoices, ["preferenceCenterOpened", "preference_center_opened"]) ??
    (
      getString(
        getRecord(getRawValue(lifecycle, [
          "postChoicePreferenceControlClickOutcome",
          "post_choice_preference_control_click_outcome"
        ])),
        ["outcome"]
      ) === "opened_preference_center"
    );
  const saveChoicesObserved =
    getBoolean(firstLayerChoices, ["saveChoicesObserved", "save_choices_observed"]) ??
    getBoolean(lifecycle, ["saveChoicesObserved", "save_choices_observed"]);
  const selectedEvidenceArtifactId =
    getString(firstLayerChoices, ["selectedEvidenceArtifactId", "selected_evidence_artifact_id"]) ??
    getString(rejectPath, ["selectedEvidenceArtifactId", "selected_evidence_artifact_id"]) ??
    getString(lifecycle, ["selectedEvidenceArtifactId", "selected_evidence_artifact_id"]) ??
    "consentChoiceQualityEvidence";
  const selectedEvidenceStrength =
    getString(firstLayerChoices, ["selectedEvidenceStrength", "selected_evidence_strength"]) ??
    getString(rejectPath, ["selectedEvidenceStrength", "selected_evidence_strength"]) ??
    getString(lifecycle, ["selectedEvidenceStrength", "selected_evidence_strength"]);

  return {
    acceptControlObserved,
    acceptRejectProminenceComparison,
    defaultToggleStatesObserved,
    firstLayerCookieConsentBannerObserved,
    layerInspected,
    managePreferencesObserved,
    nonEssentialDefaultsOff,
    preferenceCenterOpened,
    purposeCategoryControlsObserved,
    rejectClickDepth,
    rejectControlObserved,
    sameLayerRejectObserved,
    saveChoicesObserved,
    selectedEvidenceArtifactId,
    selectedEvidenceStrength,
    vendorControlsObserved,
    visibleChoiceLabels: compactArray(visibleChoiceLabels, 8),
    visualParityEvidenceObserved
  };
}

function deriveConsentChoiceQualityOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const evidence = getConsentChoiceQualityEvidence(input);
  const missingEvidenceNeeded = [
    evidence.managePreferencesObserved === true ? null : "cookie preference center or manage/preferences/settings control",
    evidence.purposeCategoryControlsObserved === true ? null : "purpose or cookie-category choices",
    evidence.vendorControlsObserved === true ? null : "vendor-level choices when applicable",
    evidence.defaultToggleStatesObserved === true ? null : "default toggle state evidence",
    evidence.nonEssentialDefaultsOff === true ? null : "non-essential defaults observed off",
    evidence.saveChoicesObserved === true ? null : "save or confirm choices control",
    evidence.visualParityEvidenceObserved === true ? null : "accept/reject visual parity evidence"
  ].filter((value): value is string => Boolean(value));
  const evidenceRefs = [
    "Evidence: consent choice quality",
    ...evidence.visibleChoiceLabels.map((label) => `Visible choice: ${label}`).slice(0, 5),
    evidence.layerInspected ? `Layer inspected: ${evidence.layerInspected}` : null,
    evidence.acceptRejectProminenceComparison ? `Prominence comparison: ${evidence.acceptRejectProminenceComparison}` : null
  ].filter((value): value is string => Boolean(value));
  const retainedEvidence = {
    ...evidence,
    missingEvidenceNeeded
  };

  if (evidence.firstLayerCookieConsentBannerObserved === false) {
    return makeOutcome(
      "consent_choice_quality",
      "Not testable",
      "Consent choice quality could not be evaluated because no first-layer GDPR/ePrivacy cookie consent surface was confirmed.",
      evidenceRefs,
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "scanner.firstLayerCookieConsentBannerObserved",
            true,
            false,
            "Required before CertScore can evaluate first-layer consent choice quality."
          )
        ],
        retainedEvidence
      }
    );
  }

  if (evidence.firstLayerCookieConsentBannerObserved !== true) {
    return makeOutcome(
      "consent_choice_quality",
      "Not testable",
      "Consent choice quality could not be evaluated because no first-layer GDPR/ePrivacy cookie consent surface was confirmed.",
      evidenceRefs,
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "scanner.firstLayerCookieConsentBannerObserved",
            true,
            evidence.firstLayerCookieConsentBannerObserved,
            "Required before CertScore can evaluate first-layer consent choice quality."
          )
        ],
        retainedEvidence
      }
    );
  }

  const directGapReasons = [
    evidence.acceptControlObserved === true && evidence.sameLayerRejectObserved !== true ? "accept_without_same_layer_reject" : null,
    evidence.rejectClickDepth !== null && evidence.rejectClickDepth > 1 ? "reject_buried_behind_additional_clicks" : null,
    evidence.defaultToggleStatesObserved === true && evidence.nonEssentialDefaultsOff === false ? "non_essential_toggles_default_on" : null,
    evidence.acceptRejectProminenceComparison && /accept.*(?:more|primary|prominent|emphasized)|reject.*(?:less|secondary|muted)/i.test(evidence.acceptRejectProminenceComparison)
      ? "accept_materially_more_prominent_than_reject"
      : null
  ].filter((value): value is string => Boolean(value));

  if (directGapReasons.length > 0) {
    return makeOutcome(
      "consent_choice_quality",
      "Gap observed",
      "Retained consent-surface evidence directly indicates poor consent choice quality.",
      [...evidenceRefs, ...directGapReasons.map((reason) => `Reason: ${reason}`)],
      {
        retainedEvidence: {
          ...retainedEvidence,
          directGapReasons,
          selectedEvidenceStrength: evidence.selectedEvidenceStrength ?? "strong"
        }
      }
    );
  }

  const strongQualitySignals = [
    evidence.acceptControlObserved === true,
    evidence.sameLayerRejectObserved === true,
    evidence.managePreferencesObserved === true,
    evidence.purposeCategoryControlsObserved === true,
    evidence.vendorControlsObserved === true,
    evidence.defaultToggleStatesObserved === true && evidence.nonEssentialDefaultsOff === true,
    evidence.saveChoicesObserved === true,
    evidence.visualParityEvidenceObserved === true
  ].filter(Boolean).length;

  if (strongQualitySignals >= 6) {
    return makeOutcome(
      "consent_choice_quality",
      "Observed",
      "Retained evidence supports same-layer accept/reject choice, granular preferences, default-state review, save choices, and no obvious accept/reject visual imbalance.",
      evidenceRefs,
      {
        retainedEvidence: {
          ...retainedEvidence,
          selectedEvidenceStrength: evidence.selectedEvidenceStrength ?? "strong",
          strongQualitySignals
        }
      }
    );
  }

  if (
    evidence.acceptControlObserved === true &&
    evidence.sameLayerRejectObserved === true &&
    evidence.managePreferencesObserved !== true &&
    evidence.purposeCategoryControlsObserved !== true &&
    evidence.vendorControlsObserved !== true &&
    evidence.preferenceCenterOpened !== true
  ) {
    return makeOutcome(
      "consent_choice_quality",
      "Review signal",
      "Basic same-layer Accept and Decline controls were observed, but CertScore did not confirm granular cookie preferences, purpose/vendor choices, default toggle states, or a cookie preference center.",
      evidenceRefs,
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "scanner.consentChoiceQuality.granularPreferenceEvidence",
            "granular cookie preferences, purpose/vendor choices, default toggle states, or cookie preference center",
            "missing",
            "Required before CertScore can mark consent choice quality as checked."
          )
        ],
        retainedEvidence: {
          ...retainedEvidence,
          selectedEvidenceStrength: evidence.selectedEvidenceStrength ?? "limited"
        }
      }
    );
  }

  return makeOutcome(
    "consent_choice_quality",
    "Review signal",
    "Consent choice quality requires review because retained consent-surface evidence did not confirm most choice-quality criteria.",
    evidenceRefs,
    {
      missingOrIncompleteSourceSignals: [
        sourceGap(
          "scanner.consentChoiceQuality.completeQualityEvidence",
          "same-layer accept/reject plus granular preferences, default-state evidence, save choices, and visual parity",
          "partial",
          "Required before CertScore can mark consent choice quality as checked."
        )
      ],
      retainedEvidence: {
        ...retainedEvidence,
        selectedEvidenceStrength: evidence.selectedEvidenceStrength ?? "limited"
      }
    }
  );
}

function getPostRejectFailureReason(failureClass: string | null) {
  switch (failureClass) {
    case "consent_surface_not_observed":
      return "Scanner did not retain an observed consent surface during the reject-path audit.";
    case "reject_control_not_found":
      return "Scanner observed a consent surface but did not retain a reject, essential-only, or opt-out control to click.";
    case "reject_click_failed":
      return "Scanner retained a reject-like control candidate, but the reject click was not confirmed.";
    case "reject_clicked_no_state_change":
      return "Scanner clicked a reject-like control, but did not retain enough state change to confirm a valid after-reject state.";
    case "reject_navigation_or_auth_ambiguous":
      return "Scanner clicked a reject-like control, but navigation, redirect, or auth-wall behavior made the after-reject state ambiguous.";
    case "consent_audit_not_completed":
      return "Consent interaction audit was enabled, but no completed reject-path audit was retained.";
    case "consent_audit_not_attempted":
      return "Consent interaction audit was not attempted for this scan.";
    default:
      return null;
  }
}

function getRetainedConsentSurfaceObserved(input: GdprEprivacyCoveragePolicyInput) {
  const hybridRuntimeEvidence = getHybridRuntimeEvidence(input.runtimeArtifacts);
  const lifecycle = getConsentControlLifecycleEvidence(input.runtimeArtifacts);
  if (isPrivacyChoiceSurfaceOnly(lifecycle)) {
    return false;
  }
  return (
    getBoolean(lifecycle, ["initialConsentLayerObserved", "initial_consent_layer_observed"]) === true ||
    getBoolean(input.runtimeArtifacts, ["consentSurfaceObserved", "consent_surface_observed"]) === true ||
    getBoolean(hybridRuntimeEvidence, ["consentSurfaceObserved", "consent_surface_observed"]) === true ||
    getBoolean(input.snapshot, ["cookie_banner_present", "cookieBannerPresent", "consent_surface_observed", "consentSurfaceObserved"]) === true
  );
}

function normalizePostRejectFailureClass(
  input: GdprEprivacyCoveragePolicyInput,
  failureClass: string | null
) {
  if (
    failureClass === "consent_surface_not_observed" &&
    getExplicitFirstLayerGdprConsentBannerConfirmed(input) !== false &&
    getRetainedConsentSurfaceObserved(input)
  ) {
    return "reject_control_not_found";
  }

  return failureClass;
}

function derivePostRejectOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const consentLifecycleLimitation = getConsentLifecycleAuditLimitation(input.runtimeArtifacts);
  const rejectDiagnostic = getEventMetadata(input.events, "reject_persistence_diagnostic");
  const consentOutcomeSummary = getHybridConsentOutcomeSummary(input.runtimeArtifacts);
  const reductionEvidence = getPostRejectTrackingReductionEvidence(input.runtimeArtifacts);
  const attempted = getBoolean(rejectDiagnostic, ["shouldAttemptConsentAudit"]) === true;
  const reductionStatus = getString(reductionEvidence, ["reductionEvaluationStatus", "reduction_evaluation_status"]);
  const rejectInteractionSucceeded =
    getBoolean(reductionEvidence, ["rejectInteractionConfirmed", "reject_interaction_confirmed"]) === true ||
    getBoolean(rejectDiagnostic, ["rejectInteractionSucceeded"]) === true ||
    getBoolean(input.runtimeArtifacts, ["consent_reject_interaction_succeeded"]) === true ||
    getBoolean(consentOutcomeSummary, ["rejectInteractionSucceeded", "reject_interaction_succeeded"]) === true;
  const reductionEvidenceRefs = [
    "Evidence: post-reject tracking reduction evidence",
    ...getStringArray(reductionEvidence, ["reasonCodes", "reason_codes"]),
    ...getStringArray(reductionEvidence, ["negativeReasonCodes", "negative_reason_codes"])
  ];
  const baselineVendors = getStringArray(reductionEvidence, [
    "baselineVendors",
    "baseline_vendors",
    "baselineTrackerVendors",
    "baseline_tracker_vendors"
  ]);
  const postRejectVendors = getStringArray(reductionEvidence, [
    "postRejectVendors",
    "post_reject_vendors",
    "postRejectTrackerVendors",
    "post_reject_tracker_vendors"
  ]);
  const persistedVendors = getStringArray(reductionEvidence, [
    "persistedVendors",
    "persisted_vendors",
    "persistedTrackerVendors",
    "persisted_tracker_vendors"
  ]);
  const postRejectWindowAvailable = getBoolean(reductionEvidence, [
    "postRejectWindowAvailable",
    "post_reject_window_available"
  ]);
  const postRejectRequestRecordsObserved = getBoolean(reductionEvidence, [
    "postRejectRequestRecordsObserved",
    "post_reject_request_records_observed"
  ]);
  const retainedRejectInteractionFailureClass =
    getString(reductionEvidence, ["rejectInteractionFailureClass", "reject_interaction_failure_class"]) ??
      getStringArray(reductionEvidence, ["negativeReasonCodes", "negative_reason_codes"]).find((reason) =>
        /^(?:consent_surface_not_observed|reject_control_not_found|reject_click_failed|reject_clicked_no_state_change|reject_navigation_or_auth_ambiguous|consent_audit_not_completed|consent_audit_not_attempted)$/.test(reason)
      ) ??
      null;
  const rejectInteractionFailureClass = normalizePostRejectFailureClass(input, retainedRejectInteractionFailureClass);
  const rejectInteractionFailureReason =
    rejectInteractionFailureClass === retainedRejectInteractionFailureClass
      ? getString(reductionEvidence, ["rejectInteractionFailureReason", "reject_interaction_failure_reason"]) ??
        getPostRejectFailureReason(rejectInteractionFailureClass)
      : getPostRejectFailureReason(rejectInteractionFailureClass);
  const postRejectRetainedEvidence = {
    baselineVendors: compactArray(baselineVendors, 5),
    persistedVendors: compactArray(persistedVendors, 5),
    postRejectRequestRecordsObserved,
    postRejectVendors: compactArray(postRejectVendors, 5),
    postRejectWindowAvailable,
    reductionEvaluationStatus: reductionStatus,
    rejectInteractionFailureClass,
    rejectInteractionFailureReason,
    rejectInteractionConfirmed: rejectInteractionSucceeded
  };
  const postRejectMissingSignals = [
    rejectInteractionSucceeded
      ? null
      : sourceGap(
          "postRejectTrackingReductionEvidence.rejectInteractionConfirmed",
          true,
          getRawValue(reductionEvidence, ["rejectInteractionConfirmed", "reject_interaction_confirmed"]),
          "Required to establish a valid after-reject state."
        ),
    postRejectWindowAvailable === true
      ? null
      : sourceGap(
          "postRejectTrackingReductionEvidence.postRejectWindowAvailable",
          true,
          postRejectWindowAvailable,
          "Required to compare baseline tracking against the post-reject window."
        ),
    postRejectRequestRecordsObserved === true || reductionStatus === "no_post_reject_non_essential_observed"
      ? null
      : sourceGap(
          "postRejectTrackingReductionEvidence.postRejectRequestRecordsObserved",
          true,
          postRejectRequestRecordsObserved,
          "Required to prove whether non-essential requests persisted after reject."
        )
  ].filter((value): value is GdprEprivacyCoverageSourceSignalGap => Boolean(value));
  const firstLayerGdprBannerConfirmed = getExplicitFirstLayerGdprConsentBannerConfirmed(input);

  if (reductionStatus === "not_testable") {
    return makeOutcome(
      "post_reject_tracking_reduction",
      "Not testable",
      firstLayerGdprBannerConfirmed === false
        ? "Post-reject tracking could not be tested because no first-layer GDPR/ePrivacy consent banner and no valid reject action were confirmed. Footer privacy/ad-choice controls were observed, but they do not establish a reject state for comparison."
        : rejectInteractionFailureReason
        ? `${rejectInteractionFailureReason} Because no valid after-reject state was retained, post-reject tracking reduction could not be evaluated.`
        : "Reject-path audit did not retain a confirmed reject action, so post-reject tracking reduction could not be evaluated.",
      reductionEvidenceRefs,
      {
        missingOrIncompleteSourceSignals: firstLayerGdprBannerConfirmed === false
          ? [
              sourceGap(
                "scanner.firstLayerCookieConsentBannerObserved",
                true,
                false,
                "Required before CertScore can establish a GDPR/ePrivacy reject state for post-choice tracking comparison."
              ),
              ...postRejectMissingSignals
            ]
          : postRejectMissingSignals,
        retainedEvidence: {
          ...postRejectRetainedEvidence,
          ...(firstLayerGdprBannerConfirmed === false
            ? {
                firstLayerCookieConsentBannerObserved: false,
                gdprEprivacyConsentSurfaceObserved: "unconfirmed",
                reason: "no_confirmed_first_layer_cookie_consent_banner"
              }
            : {})
        }
      }
    );
  }

  if (reductionStatus === "insufficient_evidence") {
    return makeOutcome(
      "post_reject_tracking_reduction",
      "Insufficient evidence",
      "A reject action was retained, but the post-reject comparison window or request evidence was incomplete.",
      reductionEvidenceRefs,
      {
        missingOrIncompleteSourceSignals: postRejectMissingSignals,
        retainedEvidence: postRejectRetainedEvidence
      }
    );
  }

  if (reductionStatus === "reduced" || reductionStatus === "no_post_reject_non_essential_observed") {
    return makeOutcome(
      "post_reject_tracking_reduction",
      "Not observed",
      "A reject action and post-reject comparison evidence were retained, and no eligible post-reject tracking persistence finding was projected.",
      reductionEvidenceRefs,
      {
        retainedEvidence: postRejectRetainedEvidence
      }
    );
  }

  if (reductionStatus === "not_reduced") {
    return makeOutcome(
      "post_reject_tracking_reduction",
      "Insufficient evidence",
      "Post-reject persistence evidence was retained, but no eligible unified post-reject tracking finding was projected for this row.",
      reductionEvidenceRefs,
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "CertScore.unifiedFindings.postRejectTrackingPersistenceFinding",
            "eligible projected unified finding when persistence evidence satisfies policy gates",
            "missing",
            "Required to classify retained post-reject persistence evidence as a canonical gap.",
            "CertScore"
          )
        ],
        retainedEvidence: postRejectRetainedEvidence
      }
    );
  }

  if (attempted && !rejectInteractionSucceeded) {
    return makeOutcome(
      "post_reject_tracking_reduction",
      "Not testable",
      "Reject-path audit ran, but no reject action was confirmed, so post-reject tracking reduction cannot be evaluated for this scan.",
      [
        "Evidence: reject persistence diagnostic",
        ...getStringArray(rejectDiagnostic, ["negativeReasonCodes"])
      ],
      {
        missingOrIncompleteSourceSignals: postRejectMissingSignals,
        retainedEvidence: {
          attempted,
          rejectInteractionConfirmed: false,
          rejectPersistenceDiagnosticReasons: compactArray(getStringArray(rejectDiagnostic, ["negativeReasonCodes"]), 5)
        }
      }
    );
  }

  if (rejectInteractionSucceeded) {
    return makeOutcome(
      "post_reject_tracking_reduction",
      "Not observed",
      "A reject action was retained, and no eligible post-reject tracking persistence finding was projected.",
      ["Evidence: reject interaction retained"],
      {
        retainedEvidence: {
          rejectInteractionConfirmed: true
        }
      }
    );
  }

  const limitedOutcome = makeConsentLifecycleLimitedOutcome(
    "post_reject_tracking_reduction",
    consentLifecycleLimitation
  );
  if (limitedOutcome) {
    return limitedOutcome;
  }

  return null;
}

function derivePreferenceWithdrawalOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const consentLifecycleLimitation = getConsentLifecycleAuditLimitation(input.runtimeArtifacts);
  const lifecycle = getConsentControlLifecycleEvidence(input.runtimeArtifacts);
  if (!lifecycle) {
    return makeConsentLifecycleLimitedOutcome(
      "preference_withdrawal_control",
      consentLifecycleLimitation
    );
  }

  const coverageStatus = getString(lifecycle, ["coverageStatus", "coverage_status"]);
  const initialLayerObserved =
    getBoolean(lifecycle, ["initialConsentLayerObserved", "initial_consent_layer_observed"]) === true ||
    getBoolean(input.runtimeArtifacts, ["consentSurfaceObserved", "consent_surface_observed"]) === true;
  const observedControlLabels = getObservedPreferenceControlLabels(lifecycle).slice(0, 3);
  const postChoiceClickOutcome = getRecord(
    getRawValue(lifecycle, [
      "postChoicePreferenceControlClickOutcome",
      "post_choice_preference_control_click_outcome"
    ])
  );
  const postChoiceOutcome = getString(postChoiceClickOutcome, ["outcome"]);
  const postChoiceOutcomeDecisive =
    postChoiceOutcome === "opened_preference_center" ||
    postChoiceOutcome === "navigated_to_policy_or_notice";
  const postChoiceOutcomeCleanAbsence = postChoiceOutcome === "no_qualifying_control_observed";
  const postChoiceOutcomeIncomplete =
    Boolean(postChoiceClickOutcome) &&
    !postChoiceOutcomeDecisive &&
    !postChoiceOutcomeCleanAbsence;
    const explicitControlObserved =
      getBoolean(lifecycle, ["privacySettingsControlObserved", "privacy_settings_control_observed"]) === true ||
      getBoolean(lifecycle, ["cookiePreferencesLinkObserved", "cookie_preferences_link_observed"]) === true ||
      getBoolean(lifecycle, ["withdrawalTextObserved", "withdrawal_text_observed"]) === true ||
      getBoolean(lifecycle, ["footerPreferenceLinkObserved", "footer_preference_link_observed"]) === true;
    const cookieConsentControlLabels = observedControlLabels.filter(isCookieConsentWithdrawalControlLabel);
    const openedCookieConsentPreferenceCenter =
      postChoiceOutcome === "opened_preference_center" &&
      getExplicitFirstLayerGdprConsentBannerConfirmed(input) !== false &&
      (
        getBoolean(lifecycle, ["cookiePreferencesLinkObserved", "cookie_preferences_link_observed"]) === true ||
        getBoolean(lifecycle, ["withdrawalTextObserved", "withdrawal_text_observed"]) === true ||
        getBoolean(lifecycle, ["confirmedCookieCategoryControlsObserved", "confirmed_cookie_category_controls_observed"]) === true ||
        getBoolean(lifecycle, ["manageConsentSurfaceObserved", "manage_consent_surface_observed"]) === true ||
        getBoolean(lifecycle, ["manageCookiesSurfaceObserved", "manage_cookies_surface_observed"]) === true ||
        cookieConsentControlLabels.length > 0
      );
    const cookieConsentWithdrawalControlObserved =
      openedCookieConsentPreferenceCenter ||
      getBoolean(lifecycle, ["cookiePreferencesLinkObserved", "cookie_preferences_link_observed"]) === true ||
      getBoolean(lifecycle, ["withdrawalTextObserved", "withdrawal_text_observed"]) === true ||
      (
        getBoolean(lifecycle, ["cmpReopenControlObserved", "cmp_reopen_control_observed"]) === true &&
        cookieConsentControlLabels.length > 0
      ) ||
      (
        getBoolean(lifecycle, [
          "preferenceCenterReachableAfterInitialLayer",
          "preference_center_reachable_after_initial_layer"
        ]) === true &&
        cookieConsentControlLabels.length > 0
      );
    const privacyAdChoiceOnlyControlObserved =
      !cookieConsentWithdrawalControlObserved &&
      (
        isPrivacyChoiceSurfaceOnly(lifecycle) ||
        getExplicitFirstLayerGdprConsentBannerConfirmed(input) === false ||
        getString(lifecycle, ["surfacePurpose", "surface_purpose"]) === "targeted_ads_opt_out" ||
        getString(lifecycle, ["surfacePurpose", "surface_purpose"]) === "sale_share_opt_out" ||
        getString(lifecycle, ["surfacePurpose", "surface_purpose"]) === "ad_choices" ||
        (
          observedControlLabels.length > 0 &&
          observedControlLabels.every((label) => PRIVACY_AD_CHOICE_ONLY_CONTROL_PATTERN.test(label))
        )
      ) &&
      (explicitControlObserved || observedControlLabels.length > 0 || postChoiceOutcome === "navigated_to_policy_or_notice");
    const controlObserved =
      !postChoiceOutcomeIncomplete &&
      !postChoiceOutcomeCleanAbsence &&
      cookieConsentWithdrawalControlObserved;
  const ambiguousControlEvidence =
    !postChoiceOutcomeCleanAbsence && hasAmbiguousPreferenceControlEvidence(lifecycle, observedControlLabels);
  const evidenceRefs = [
    "Evidence: consent control lifecycle",
    ...getStringArray(lifecycle, ["evidenceRefs", "evidence_refs"]),
    ...observedControlLabels.map((label) => `Observed control: ${label}`),
    postChoiceOutcome ? `Post-choice control outcome: ${postChoiceOutcome}` : null,
    ambiguousControlEvidence ? "Ambiguous control evidence retained" : null
  ].filter((value): value is string => Boolean(value));
    const lifecycleRetainedEvidence = {
    confirmedCookieCategoryControlsObserved: getBoolean(lifecycle, [
      "confirmedCookieCategoryControlsObserved",
      "confirmed_cookie_category_controls_observed"
    ]),
    cmpReopenControlObserved: getBoolean(lifecycle, ["cmpReopenControlObserved", "cmp_reopen_control_observed"]),
    cookiePreferencesLinkObserved: getBoolean(lifecycle, [
      "cookiePreferencesLinkObserved",
      "cookie_preferences_link_observed"
    ]),
    coverageStatus,
    footerPreferenceLinkObserved: getBoolean(lifecycle, [
      "footerPreferenceLinkObserved",
      "footer_preference_link_observed"
    ]),
    cookieConsentControlLabels,
    observedControlLabels,
    openedCookieConsentPreferenceCenter,
    manageConsentSurfaceObserved: getBoolean(lifecycle, ["manageConsentSurfaceObserved", "manage_consent_surface_observed"]),
    manageCookiesSurfaceObserved: getBoolean(lifecycle, ["manageCookiesSurfaceObserved", "manage_cookies_surface_observed"]),
    postChoicePreferenceControlClickOutcome: postChoiceClickOutcome,
    preferenceCenterReachableAfterInitialLayer: getBoolean(lifecycle, [
      "preferenceCenterReachableAfterInitialLayer",
      "preference_center_reachable_after_initial_layer"
    ]),
    trackingRequiringConsentReviewObserved: getBoolean(lifecycle, [
      "trackingRequiringConsentReviewObserved",
      "tracking_requiring_consent_review_observed",
      "consentRelevantTrackingObserved",
      "consent_relevant_tracking_observed",
      "consentDependentTrackingObserved",
      "consent_dependent_tracking_observed"
    ]),
    privacySettingsControlObserved: getBoolean(lifecycle, [
      "privacySettingsControlObserved",
      "privacy_settings_control_observed"
    ]),
    withdrawalTextObserved: getBoolean(lifecycle, ["withdrawalTextObserved", "withdrawal_text_observed"])
  };
  const lifecycleAmbiguousGap = sourceGap(
    "consentControlLifecycleEvidence.postChoicePreferenceControlClickOutcome",
    "tested usable preference or withdrawal control",
    postChoiceOutcome ?? "ambiguous CMP/post-choice signal without a qualifying control label",
    "Required to prove that the retained control actually reopens or changes consent preferences."
  );

    if (controlObserved) {
      return makeOutcome(
      "preference_withdrawal_control",
      "Observed",
      "CertScore observed a post-choice consent or preference control in the tested context.",
      evidenceRefs,
      {
        retainedEvidence: lifecycleRetainedEvidence
      }
    );
    }
  
    if (privacyAdChoiceOnlyControlObserved) {
      return makeOutcome(
        "preference_withdrawal_control",
        "Review signal",
        "Footer privacy/ad-choice and vendor opt-out links were observed, but CertScore did not confirm a GDPR/ePrivacy cookie preference center or consent-withdrawal control.",
        evidenceRefs,
        {
          missingOrIncompleteSourceSignals: [
            sourceGap(
              "consentControlLifecycleEvidence.cookiePreferencesLinkObserved",
              true,
              getRawValue(lifecycle, ["cookiePreferencesLinkObserved", "cookie_preferences_link_observed"]) ?? false,
              "Required before CertScore can treat post-choice GDPR/ePrivacy consent withdrawal as checked."
            )
          ],
          retainedEvidence: {
            ...lifecycleRetainedEvidence,
            privacyAdChoiceOnlyControlObserved: true
          }
        }
      );
    }
  
    if (!initialLayerObserved) {
    return makeOutcome(
      "preference_withdrawal_control",
      "Not testable",
      "Post-choice consent controls were not testable because no initial consent surface was observed in the retained scan context.",
      evidenceRefs,
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "consentControlLifecycleEvidence.initialConsentLayerObserved",
            true,
            initialLayerObserved,
            "Required before CertScore can evaluate whether post-choice consent controls were available."
          )
        ],
        retainedEvidence: lifecycleRetainedEvidence
      }
    );
  }

  if (coverageStatus === "usable" && (ambiguousControlEvidence || postChoiceOutcomeIncomplete)) {
    return makeOutcome(
      "preference_withdrawal_control",
      "Review signal",
      "Post-choice consent controls require review because the retained lifecycle evidence was incomplete or ambiguous.",
      evidenceRefs,
      {
        missingOrIncompleteSourceSignals: [lifecycleAmbiguousGap],
        retainedEvidence: lifecycleRetainedEvidence
      }
    );
  }

  if (coverageStatus === "usable" && postChoiceOutcomeCleanAbsence) {
    return makeOutcome(
      "preference_withdrawal_control",
      "Not observed",
      "CertScore did not retain a qualifying post-choice cookie preference or withdrawal control after the initial consent action.",
      evidenceRefs,
      {
        retainedEvidence: lifecycleRetainedEvidence
      }
    );
  }

  if (coverageStatus === "usable") {
    return makeOutcome(
      "preference_withdrawal_control",
      "Gap observed",
      "CertScore observed an initial consent surface, but did not observe an obvious cookie preferences, privacy settings, or consent-preference reopen control on the tested public pages. Review whether users can later change or withdraw consent through another path.",
      evidenceRefs,
      {
        retainedEvidence: lifecycleRetainedEvidence
      }
    );
  }

  if (coverageStatus === "partial") {
    return makeOutcome(
      "preference_withdrawal_control",
      "Review signal",
      "Post-choice consent controls require review because the retained lifecycle evidence was incomplete or ambiguous.",
      evidenceRefs,
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "consentControlLifecycleEvidence.coverageStatus",
            "usable",
            coverageStatus,
            "Required to treat absence of a preference or withdrawal control as a clean tested observation."
          )
        ],
        retainedEvidence: lifecycleRetainedEvidence
      }
    );
  }

  return makeOutcome(
    "preference_withdrawal_control",
    "Not testable",
    "Consent-control lifecycle evidence was missing or insufficient for the tested context.",
    evidenceRefs,
    {
      missingOrIncompleteSourceSignals: [
        sourceGap(
          "consentControlLifecycleEvidence.coverageStatus",
          "usable or partial lifecycle evidence",
          coverageStatus,
          "Required to evaluate whether a preference or withdrawal control was available."
        )
      ],
      retainedEvidence: lifecycleRetainedEvidence
    }
  );
}

function deriveVendorDisclosureOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const trackerVendorCount = getNumber(input.snapshot, ["tracker_vendor_count", "tracker_count_total"]) ??
    getStringArray(input.runtimeArtifacts, ["preconsent_tracker_vendors", "tracker_vendors"]).length;
  const hasPolicySurface =
    getBoolean(input.snapshot, ["privacy_policy_present"]) === true ||
    getBoolean(input.snapshot, ["cookie_policy_present"]) === true;
  const disclosureEvidence = getRuntimeVendorDisclosureEvidence(input.runtimeArtifacts);
  const unmatchedCount = disclosureEvidence.reduce(
    (sum, row) => sum + Math.max(row.unmatchedRuntimeVendors.length, row.unmatchedRuntimeDomains.length),
    0
  );
  const hasUsableDirectDisclosureMismatch = disclosureEvidence.some((row) => {
    const unmatchedRuntimeCount = row.unmatchedRuntimeVendors.length + row.unmatchedRuntimeDomains.length;
    const observedRuntimeCount = row.observedRuntimeVendors.length + row.observedRuntimeDomains.length;
    const reachedPolicySurfaces = row.policySurfacesSearched.filter((surface) =>
      surface.reached && Boolean(surface.url) && Boolean(surface.snippet)
    ).length;
    return (
      row.coverageStatus === "usable" &&
      row.directVsInferred !== "inferred" &&
      observedRuntimeCount > 0 &&
      unmatchedRuntimeCount > 0 &&
      row.unmatchedVendorDisclosureCount > 0 &&
      reachedPolicySurfaces > 0
    );
  });
  const strongestDisclosureMismatch = disclosureEvidence
    .filter((row) => {
      const unmatchedRuntimeCount = row.unmatchedRuntimeVendors.length + row.unmatchedRuntimeDomains.length;
      const observedRuntimeCount = row.observedRuntimeVendors.length + row.observedRuntimeDomains.length;
      const reachedPolicySurfaces = row.policySurfacesSearched.filter((surface) =>
        surface.reached && Boolean(surface.url) && Boolean(surface.snippet)
      ).length;
      return (
        row.coverageStatus === "usable" &&
        row.directVsInferred !== "inferred" &&
        observedRuntimeCount > 0 &&
        unmatchedRuntimeCount > 0 &&
        row.unmatchedVendorDisclosureCount > 0 &&
        reachedPolicySurfaces > 0
      );
    })
    .sort((left, right) => {
      const confidenceScore = (value: string) => value === "strong" ? 3 : value === "moderate" ? 2 : 1;
      return (
        confidenceScore(right.evidenceConfidence) - confidenceScore(left.evidenceConfidence) ||
        (right.unmatchedRuntimeVendors.length + right.unmatchedRuntimeDomains.length) -
          (left.unmatchedRuntimeVendors.length + left.unmatchedRuntimeDomains.length)
      );
    })[0] ?? null;
  const strongestUnmatchedVendors = strongestDisclosureMismatch
    ? compactArray(strongestDisclosureMismatch.unmatchedRuntimeVendors, 8)
    : [];
  const strongestMismatchCopy = strongestUnmatchedVendors.length > 0
    ? `Observed runtime vendors such as ${formatInlineList(strongestUnmatchedVendors)} were not clearly matched by name or known domain alias in retained policy or cookie disclosure surfaces.`
    : "Runtime vendor disclosure comparison evidence retained observed runtime vendors that were not clearly matched in reviewed disclosure surfaces.";

  if (trackerVendorCount > 0 && !hasPolicySurface) {
    return makeOutcome(
      "runtime_vendor_disclosure_alignment",
      "Not testable",
      "Runtime vendors were observed, but no privacy or cookie policy surface was retained, so disclosure alignment cannot be evaluated.",
      [`Runtime vendor count: ${trackerVendorCount}`],
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "scanSnapshots.privacy_policy_present or scanSnapshots.cookie_policy_present",
            true,
            hasPolicySurface,
            "Required to compare observed runtime vendors against public disclosure surfaces.",
            "CertScore"
          )
        ],
        retainedEvidence: {
          cookiePolicyPresent: getBoolean(input.snapshot, ["cookie_policy_present"]),
          privacyPolicyPresent: getBoolean(input.snapshot, ["privacy_policy_present"]),
          runtimeVendorCount: trackerVendorCount
        }
      }
    );
  }

  if (trackerVendorCount > 0 && hasPolicySurface && disclosureEvidence.length === 0) {
    return makeOutcome(
      "runtime_vendor_disclosure_alignment",
      "Insufficient evidence",
      "Runtime vendors and policy surfaces were retained, but no canonical vendor-disclosure comparison artifact was retained for this scan.",
      [`Runtime vendor count: ${trackerVendorCount}`],
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "runtimeVendorDisclosureEvidence",
            "one or more canonical vendor-disclosure comparison rows",
            disclosureEvidence.length,
            "Required to evaluate whether observed runtime vendors align with retained disclosure surfaces."
          )
        ],
        retainedEvidence: {
          hasPolicySurface,
          runtimeVendorCount: trackerVendorCount
        }
      }
    );
  }

  if (trackerVendorCount > 0 && hasPolicySurface) {
    return makeOutcome(
      "runtime_vendor_disclosure_alignment",
      hasUsableDirectDisclosureMismatch ? "Gap observed" : unmatchedCount > 0 ? "Insufficient evidence" : "Not observed",
      hasUsableDirectDisclosureMismatch
        ? strongestMismatchCopy
        : unmatchedCount > 0
          ? "Runtime vendor disclosure comparison evidence was retained, but no eligible disclosure-alignment finding was projected."
        : "Runtime vendor disclosure comparison evidence was retained, and no eligible disclosure-alignment finding was projected.",
      [
        `Runtime vendor count: ${trackerVendorCount}`,
        `Disclosure comparison rows: ${disclosureEvidence.length}`,
        unmatchedCount > 0 ? `Unmatched runtime vendor/domain count: ${unmatchedCount}` : null
      ].filter((value): value is string => Boolean(value)),
      {
        missingOrIncompleteSourceSignals: unmatchedCount > 0
          ? hasUsableDirectDisclosureMismatch
            ? []
            : [
                sourceGap(
                  "CertScore.unifiedFindings.runtimeVendorDisclosureAlignmentFinding",
                  "eligible projected unified finding when unmatched vendor evidence satisfies policy gates",
                  "missing",
                  "Required to classify retained vendor-disclosure mismatch evidence as a canonical review signal.",
                  "CertScore"
                )
              ]
          : [],
        retainedEvidence: {
          coverageStatus: strongestDisclosureMismatch?.coverageStatus,
          directVsInferred: strongestDisclosureMismatch?.directVsInferred,
          disclosureComparisonRows: disclosureEvidence.length,
          evidenceConfidence: strongestDisclosureMismatch?.evidenceConfidence,
          hasPolicySurface,
          mismatchRationale: strongestDisclosureMismatch?.mismatchRationale,
          policySurfaceCount: strongestDisclosureMismatch?.policySurfacesSearched.length,
          runtimeVendorDisclosureEvidence: disclosureEvidence,
          runtimeVendorCount: trackerVendorCount,
          strongestUnmatchedRuntimeVendors: strongestUnmatchedVendors,
          unmatchedRuntimeVendorOrDomainCount: unmatchedCount
        }
      }
    );
  }

  return null;
}

function deriveSensitiveSurfaceOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const correlation = getEventMetadata(input.events, "sensitive_third_party_tracking_correlation");
  const status = getString(correlation, ["status"]);
  const eligibleSensitiveFieldCount = getNumber(correlation, ["eligibleSensitiveFieldCount"]);
  const rawSensitiveFieldCount = getNumber(correlation, ["rawSensitiveFieldCount"]);
  const evaluation = evaluateSensitiveFormsWithThirdPartyTracking(correlation, input.runtimeArtifacts);

  if (evaluation.status === "Not testable") {
    return makeOutcome(
      "sensitive_surfaces_third_party_tracking",
      "Not testable",
      evaluation.reason,
      evaluation.evidenceRefs,
      {
        missingOrIncompleteSourceSignals: evaluation.missingOrIncompleteSourceSignals,
        retainedEvidence: evaluation.retainedEvidence
      }
    );
  }

  if (status === "ok" || evaluation.coverageUsable) {
    if (evaluation.status === "Gap observed" || evaluation.status === "Review signal") {
      return makeOutcome(
        "sensitive_surfaces_third_party_tracking",
        evaluation.status,
        evaluation.reason,
        evaluation.evidenceRefs,
        {
          retainedEvidence: evaluation.retainedEvidence
        }
      );
    }

    const count = eligibleSensitiveFieldCount ?? rawSensitiveFieldCount ?? 0;
      if (count <= 0) {
        return makeOutcome(
          "sensitive_surfaces_third_party_tracking",
          "Not observed",
          "Sensitive-field correlation completed for the tested context and did not retain eligible sensitive fields alongside third-party tracking.",
          ["Evidence: sensitive third-party tracking correlation completed"],
        {
          retainedEvidence: {
            eligibleSensitiveFieldCount: count,
            rawSensitiveFieldCount,
            sensitiveThirdPartyTrackingCorrelationStatus: status
          }
        }
        );
      }
  
      return makeOutcome(
        "sensitive_surfaces_third_party_tracking",
        "Insufficient evidence",
        "Sensitive-field correlation retained candidate fields, but no eligible sensitive-surface tracking unified finding was projected.",
        [`Eligible sensitive fields: ${count}`],
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "CertScore.unifiedFindings.sensitiveThirdPartyTrackingFinding",
            "eligible projected unified finding when sensitive-field correlation satisfies policy gates",
            "missing",
            "Required to classify retained sensitive-field tracking correlation as a canonical review signal.",
            "CertScore"
          )
        ],
        retainedEvidence: {
          eligibleSensitiveFieldCount: count,
          rawSensitiveFieldCount,
          sensitiveThirdPartyTrackingCorrelationStatus: status
        }
      }
      );
    }

  return null;
}

function evaluateSensitiveFormsWithThirdPartyTracking(
  correlation: Record<string, unknown> | null,
  runtimeArtifacts: Record<string, unknown> | null | undefined
) {
  const sensitiveFieldSelectors = getStringArray(correlation, ["sensitiveFieldSelectors", "sensitive_field_selectors"]);
  const sensitiveFieldLabels = getStringArray(correlation, ["sensitiveFieldLabels", "sensitive_field_labels"]);
  const sensitiveFieldTypes = getStringArray(correlation, ["sensitiveFieldTypes", "sensitive_field_types"]);
  const sensitiveFormUrls = getStringArray(correlation, ["sensitiveFormUrls", "sensitive_form_urls", "sensitiveFormPageUrls", "sensitive_form_page_urls"]);
  const sensitivePayloadRows = uniqueSensitivePayloadRows([
    ...getObjectArray(correlation, ["sensitivePayloadViolations", "sensitive_payload_violations"]),
    ...getObjectArray(runtimeArtifacts, ["sensitivePayloadViolations", "sensitive_payload_violations"])
  ]);
  const thirdPartyTrackingVendors = getStringArray(correlation, ["thirdPartyTrackingVendors", "third_party_tracking_vendors"]);
  const thirdPartyTrackingDomains = getStringArray(correlation, ["thirdPartyTrackingDomains", "third_party_tracking_domains"]);
  const thirdPartyTrackingCategories = getStringArray(correlation, ["thirdPartyTrackingCategories", "third_party_tracking_categories"]);
  const infrastructureOnlyVendors = getStringArray(correlation, ["infrastructureOnlyVendors", "infrastructure_only_vendors"]);
  const thirdPartyTrackingRequestCount = getNumber(correlation, ["thirdPartyTrackingRequestCount", "third_party_tracking_request_count"]);
  const requestTimingRelativeToForm = getString(correlation, ["requestTimingRelativeToForm", "request_timing_relative_to_form"]);
  const coverageStatus = getString(correlation, ["coverageStatus", "coverage_status"]);
    const evidenceConfidence = getString(correlation, ["evidenceConfidence", "evidence_confidence"]);
    const directVsInferred = getString(correlation, ["directVsInferred", "direct_vs_inferred"]);
    const evidenceStrengthFlags = getStringArray(correlation, ["evidenceStrengthFlags", "evidence_strength_flags"]);
  const sensitiveDirect =
    getBoolean(correlation, ["sensitiveCollectionSurfaceObserved", "sensitive_collection_surface_observed"]) === true ||
    getBoolean(correlation, ["highSensitivityDataCollectionDetected", "high_sensitivity_data_collection_detected"]) === true ||
    sensitiveFieldSelectors.length > 0 ||
    sensitiveFieldLabels.length > 0 ||
    sensitiveFieldTypes.length > 0 ||
    sensitiveFormUrls.length > 0;
  const trackingObserved =
    getBoolean(correlation, ["samePageTrackingObserved", "same_page_tracking_observed"]) === true ||
    getBoolean(correlation, ["sameFlowTrackingObserved", "same_flow_tracking_observed"]) === true ||
    getBoolean(correlation, ["behavioralAnalyticsObserved", "behavioral_analytics_observed"]) === true ||
    getBoolean(correlation, ["sessionReplayObserved", "session_replay_observed"]) === true ||
    getBoolean(correlation, ["advertisingPixelObserved", "advertising_pixel_observed"]) === true ||
    getBoolean(correlation, ["analyticsObserved", "analytics_observed"]) === true ||
    getBoolean(correlation, ["tagManagerObserved", "tag_manager_observed"]) === true ||
    thirdPartyTrackingVendors.length > 0 ||
    thirdPartyTrackingDomains.length > 0 ||
    (thirdPartyTrackingRequestCount ?? 0) > 0 ||
    thirdPartyTrackingCategories.some((category) => /advertising|analytics|behavioral|measurement|replay|tag[_ -]?manager|tracking/i.test(category));
  const sameContext =
    getBoolean(correlation, ["samePageTrackingObserved", "same_page_tracking_observed"]) === true ||
    getBoolean(correlation, ["sameFlowTrackingObserved", "same_flow_tracking_observed"]) === true ||
    getBoolean(correlation, ["samePageOrFlow", "same_page_or_flow"]) === true ||
    getBoolean(correlation, [
      "thirdPartyTrackingActiveInSameContext",
      "third_party_tracking_active_in_same_context"
    ]) === true ||
    requestTimingRelativeToForm === "before_form" ||
    requestTimingRelativeToForm === "during_form" ||
    requestTimingRelativeToForm === "after_form";
  const infrastructureOnly =
    thirdPartyTrackingVendors.length > 0 &&
    thirdPartyTrackingVendors.every((vendor) =>
      infrastructureOnlyVendors.some((infraVendor) => infraVendor.toLowerCase() === vendor.toLowerCase())
    );
    const payloadEvidenceRows = sensitivePayloadRows.filter(hasThirdPartyRequestOrVendorRetained);
    const payloadExposureObserved = payloadEvidenceRows.some(payloadExposureObservedInRow);
    const sensitiveValueInThirdPartyRequest = payloadEvidenceRows.some(hasRetainedSensitiveOrPersonalValueInThirdPartyRequest);
    const payloadGapObserved = payloadExposureObserved || sensitiveValueInThirdPartyRequest;
    const fallbackOrPolicyOnly =
      (
        evidenceStrengthFlags.some((flag) => flag === "fallback_only" || flag === "policy_text") ||
        sensitivePayloadRows.some((row) => {
          const strength = getPayloadRowString(row, ["evidenceStrength", "evidence_strength"]);
          const source = getPayloadRowString(row, ["evidenceSource", "evidence_source"]);
          return /fallback|policy/i.test(`${strength} ${source}`);
        })
      ) &&
      !evidenceStrengthFlags.some((flag) => flag === "direct_runtime" || flag === "concrete_payload") &&
      !payloadEvidenceRows.some((row) => {
        const strength = getPayloadRowString(row, ["evidenceStrength", "evidence_strength"]);
          return /concrete|confirmed|direct/i.test(strength ?? "");
      });
  const coverageUsable =
    coverageStatus === "usable" ||
    evidenceConfidence === "high" ||
    evidenceConfidence === "moderate" ||
    getString(correlation, ["status"]) === "ok";
  const retainedEvidence = {
    collectionContextConfidence: getString(correlation, ["collectionContextConfidence", "collection_context_confidence"]),
    collectionContextType: getString(correlation, ["collectionContextType", "collection_context_type"]),
    consentStateAtTime: getString(correlation, ["consentStateAtTime", "consent_state_at_time"]),
    coverageStatus,
    directVsInferred,
    evidenceConfidence,
      evidenceStrengthFlags,
      fallbackOrPolicyOnly,
    correlationMethod: getString(correlation, ["correlationMethod", "correlation_method"]),
    eligibleSensitiveFieldObserved:
      getBoolean(correlation, ["eligibleSensitiveFieldObserved", "eligible_sensitive_field_observed"]) ??
      (sensitiveDirect ? true : null),
    eligibleSensitiveFieldCount: getNumber(correlation, ["eligibleSensitiveFieldCount", "eligible_sensitive_field_count"]),
    fieldLevelPayloadEvidenceObserved: getBoolean(correlation, ["fieldLevelPayloadEvidenceObserved", "field_level_payload_evidence_observed"]),
    infrastructureOnlyVendors,
    payloadEvidenceRows: payloadEvidenceRows.slice(0, 5),
    payloadExposureObserved,
    payloadPersonalDataObserved: getBoolean(correlation, ["payloadPersonalDataObserved", "payload_personal_data_observed"]),
    requestTimingRelativeToForm,
    retainedDomEvidenceRef: getString(correlation, ["retainedDomEvidenceRef", "retained_dom_evidence_ref"]),
    retainedScreenshotRef: getString(correlation, ["retainedScreenshotRef", "retained_screenshot_ref"]),
    sameContext,
    samePageOrFlow: sameContext,
    sensitiveDirect,
    sensitiveFieldLabels: sensitiveFieldLabels.slice(0, 5),
    sensitiveFieldSelectors: sensitiveFieldSelectors.slice(0, 5),
    sensitiveFieldTypes: sensitiveFieldTypes.slice(0, 5),
    sensitiveFormUrls: sensitiveFormUrls.slice(0, 5),
    sensitivePayloadViolationRows: sensitivePayloadRows.slice(0, 5),
    sensitiveValueInThirdPartyRequest,
    thirdPartyTrackingCategories: thirdPartyTrackingCategories.slice(0, 5),
    thirdPartyTrackingDomains: thirdPartyTrackingDomains.slice(0, 5),
    thirdPartyTrackingRequestCount,
    thirdPartyTrackingActiveInSameContext: sameContext && trackingObserved,
    thirdPartyTrackingVendors: thirdPartyTrackingVendors.slice(0, 5),
    trackingObserved
  };
  const evidenceRefs = [
    sensitiveDirect ? "Sensitive collection surface observed" : null,
    payloadGapObserved ? "Sensitive collection with third-party payload evidence observed" : null,
    sameContext ? "Same-page or same-flow tracking correlation retained" : null,
    ...thirdPartyTrackingVendors.slice(0, 3).map((vendor) => `Runtime vendor: ${vendor}`),
    ...thirdPartyTrackingDomains.slice(0, 3).map((domain) => `Runtime domain: ${domain}`),
    ...sensitiveFormUrls.slice(0, 2).map((url) => `Sensitive form URL: ${url}`)
  ].filter((value): value is string => Boolean(value));

    if (!coverageUsable) {
    return {
      coverageUsable,
      evidenceRefs,
      missingOrIncompleteSourceSignals: [
        sourceGap(
          "sensitiveThirdPartyTrackingCorrelation.coverageStatus",
          "usable retained form and runtime tracking evidence",
          coverageStatus ?? "missing",
          "Required to evaluate sensitive-form tracking correlation from retained evidence."
        )
      ],
      reason: "The retained scan context did not include usable form and runtime tracking evidence.",
      retainedEvidence,
      status: "Not testable" as const
    };
    }
  
    if (fallbackOrPolicyOnly && sensitiveDirect && trackingObserved) {
      return {
        coverageUsable,
        evidenceRefs,
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "sensitiveThirdPartyTrackingCorrelation.directSameContextRuntimeCorrelation",
            "direct or moderate same-context runtime correlation",
            "fallback_only_or_policy_text",
            "Required before CertScore can project sensitive-surface tracking as a GDPR/ePrivacy gap."
          )
        ],
        reason:
          "Sensitive-surface/tracking correlation requires review. Retained evidence indicates possible sensitive data context and third-party tracking, but does not conclusively establish same-context sensitive payload exposure.",
        retainedEvidence,
        status: "Review signal" as const
      };
    }
  
    if (payloadGapObserved) {
    return {
      coverageUsable,
      evidenceRefs,
      missingOrIncompleteSourceSignals: [],
      reason:
        "CertScore retained evidence of a sensitive or personal-data value associated with a third-party request in the tested context. Review whether this data flow is necessary, disclosed, consent-gated where required, and excluded from sensitive form interactions.",
      retainedEvidence,
      status: "Gap observed" as const
    };
  }

  const correlationMethod = getString(correlation, ["correlationMethod", "correlation_method"]);
  const directOrModerateCorrelation =
    directVsInferred !== "inferred" &&
    (
      correlationMethod === "direct" ||
      correlationMethod === "moderate" ||
      evidenceConfidence === "high" ||
      evidenceConfidence === "moderate"
    );

  if (sensitiveDirect && trackingObserved && sameContext && !infrastructureOnly && directOrModerateCorrelation) {
    return {
      coverageUsable,
      evidenceRefs,
      missingOrIncompleteSourceSignals: [],
      reason:
        "CertScore observed a sensitive or high-risk collection surface in the same tested page or flow as third-party tracking or measurement scripts. Review whether the tracking is necessary, disclosed, consent-gated where required, and excluded from sensitive form interactions.",
      retainedEvidence,
      status: "Gap observed" as const
    };
  }

  if (sensitiveDirect && trackingObserved) {
    return {
      coverageUsable,
      evidenceRefs,
      missingOrIncompleteSourceSignals: [],
      reason:
        "Sensitive-surface/tracking correlation requires review. Retained evidence indicates possible sensitive data context and third-party tracking, but does not conclusively establish same-context sensitive payload exposure.",
      retainedEvidence,
      status: "Review signal" as const
    };
  }

  return {
    coverageUsable,
    evidenceRefs,
    missingOrIncompleteSourceSignals: [],
    reason: "",
    retainedEvidence,
    status: "Not observed" as const
  };
}

function uniqueSensitivePayloadRows(rows: Record<string, unknown>[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = JSON.stringify(row);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function getPayloadRowString(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function getPayloadRowObject(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return null;
}

function getSensitivePayloadRequestUrl(row: Record<string, unknown>) {
  return getPayloadRowString(row, ["requestUrl", "request_url", "url"]);
}

function getSensitivePayloadVendorHost(row: Record<string, unknown>) {
  const explicitHost = getPayloadRowString(row, [
    "vendorHost",
    "vendor_host",
    "thirdPartyHost",
    "third_party_host",
    "requestHost",
    "request_host",
    "hostname"
  ]);
  if (explicitHost) {
    return explicitHost.toLowerCase();
  }

  return hostFromUrl(getSensitivePayloadRequestUrl(row));
}

function hasThirdPartyRequestOrVendorRetained(row: Record<string, unknown>) {
  const requestUrl = getSensitivePayloadRequestUrl(row);
  const vendorHost = getSensitivePayloadVendorHost(row);
  const thirdParty =
    row.thirdParty === true ||
    row.third_party === true ||
    row.isThirdParty === true ||
    row.is_third_party === true ||
    Boolean(vendorHost && vendorHost.includes("."));

  return thirdParty && (Boolean(vendorHost) || /^https?:\/\//i.test(requestUrl ?? ""));
}

function payloadExposureObservedInRow(row: Record<string, unknown>) {
  const sameFlowLinkage = getPayloadRowObject(row, ["sameFlowLinkage", "same_flow_linkage"]);
  return (
    row.payloadExposureObserved === true ||
    row.payload_exposure_observed === true ||
    row.userValueObserved === true ||
    row.user_value_observed === true ||
    sameFlowLinkage?.userValueObserved === true ||
    sameFlowLinkage?.user_value_observed === true
  );
}

function hasRetainedSensitiveOrPersonalValueInThirdPartyRequest(row: Record<string, unknown>) {
  const detectedType = getPayloadRowString(row, ["detectedType", "detected_type", "valueType", "value_type"]);
  const sourceField = getPayloadRowString(row, ["sourceField", "source_field", "fieldName", "field_name"]);
  const retainedValue = getPayloadRowString(row, [
    "payloadValue",
    "payload_value",
    "observedValue",
    "observed_value",
    "matchedValue",
    "matched_value",
    "userValue",
    "user_value",
    "sensitiveValue",
    "sensitive_value",
    "personalDataValue",
    "personal_data_value",
    "matchSnippet",
    "match_snippet"
  ]);
  const haystack = [detectedType, sourceField, retainedValue].filter(Boolean).join(" ");

  return (
    payloadExposureObservedInRow(row) ||
    /email|e-mail|user[_ -]?value|sensitive[_ -]?value|personal[_ -]?data|personal[_ -]?info|phone|address|ssn|passport|government[_ -]?id|health|medical|financial|payment/i.test(
      haystack
    ) ||
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(retainedValue ?? "")
  );
}

const SESSION_REPLAY_URL_PATTERN =
  /clarity\.ms|hotjar\.com|hotjar\.io|fullstory\.com|logrocket\.com|mouseflow\.com|contentsquare\.(?:com|net)|smartlook\.com|inspectlet\.com|luckyorange\.com|quantummetric\.com|sessioncam\.com/i;
const SESSION_REPLAY_VENDOR_PATTERN =
  /microsoft clarity|clarity|hotjar|fullstory|logrocket|mouseflow|contentsquare|smartlook|inspectlet|lucky orange|quantum metric|sessioncam/i;
const NON_REPLAY_ANALYTICS_VENDOR_PATTERN =
  /google analytics|google tag manager|\bgtm\b|googletagmanager|google-analytics|analytics\.google/i;

function hostFromUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isCollectionEndpointUrl(value: string) {
  return /(?:^|[./-])(?:collect|collection|record|recorder|session|events?|track|ingest|c\.gif|data)(?:[./?_-]|$)/i.test(value) ||
    /(?:^|\.)c\.clarity\.ms$/i.test(hostFromUrl(value) ?? "");
}

function isSessionReplayEvidenceRow(row: Record<string, unknown>) {
  const category = getString(row, ["category", "vendorCategory", "vendor_category", "purpose"]);
  const vendor = getString(row, ["vendor", "vendorName", "vendor_name"]);
  const requestUrl = getString(row, ["requestUrl", "request_url", "url"]);
  const vendorAndUrl = `${vendor ?? ""} ${requestUrl ?? ""}`;

  if (NON_REPLAY_ANALYTICS_VENDOR_PATTERN.test(vendorAndUrl)) {
    return false;
  }

  return (
    /session_replay|session replay|behavioral|recording/i.test(category ?? "") ||
    SESSION_REPLAY_VENDOR_PATTERN.test(vendor ?? "") ||
    SESSION_REPLAY_URL_PATTERN.test(requestUrl ?? "")
  );
}

function getSessionReplayTiming(row: Record<string, unknown>) {
  return (
    getNumber(row, ["firstObservedMs", "first_observed_ms", "firstSeenMs", "first_seen_ms", "timestampMs", "timestamp_ms", "tsMs", "ts_ms"]) ??
    null
  );
}

function buildSessionReplayRuntimeEvidence(input: GdprEprivacyCoveragePolicyInput) {
  const hybrid = getHybridRuntimeEvidence(input.runtimeArtifacts);
  const summary =
    getObject(hybrid, ["sessionReplayEvidenceSummary", "session_replay_evidence_summary"]) ??
    getObject(input.runtimeArtifacts, ["sessionReplayEvidenceSummary", "session_replay_evidence_summary"]);
  const classificationRows = [
    ...getObjectArray(input.runtimeArtifacts, [
      "requestPurposeClassificationConfidence",
      "request_purpose_classification_confidence"
    ]),
    ...getObjectArray(hybrid, ["requestPurposeClassificationConfidence", "request_purpose_classification_confidence"])
  ].filter(isSessionReplayEvidenceRow);
  const postAcceptEvidenceUrls = getStringArray(input.runtimeArtifacts, [
    "consentPostAcceptTrackerEvidenceUrls",
    "consent_post_accept_tracker_evidence_urls"
  ]).filter((url) => SESSION_REPLAY_URL_PATTERN.test(url));
  const postAcceptVendors = getStringArray(input.runtimeArtifacts, [
    "consentAcceptNewTrackerVendorNames",
    "consent_accept_new_tracker_vendor_names",
    "consentPostAcceptTrackerVendorNames",
    "consent_post_accept_tracker_vendor_names"
  ]).filter((vendor) => SESSION_REPLAY_VENDOR_PATTERN.test(vendor));
  const requestUrls = uniqueStrings([
    ...classificationRows.map((row) => getString(row, ["requestUrl", "request_url", "url"])),
    ...getStringArray(summary, ["requestUrls", "request_urls"]),
    ...postAcceptEvidenceUrls
  ]);
  const vendors = uniqueStrings([
    ...classificationRows.map((row) => getString(row, ["vendor", "vendorName", "vendor_name"])),
    ...postAcceptVendors,
    ...getStringArray(summary, ["vendors"]),
    ...getStringArray(input.snapshot, ["session_replay_vendor_names", "sessionReplayVendorNames"]),
    ...getStringArray(input.snapshot, ["session_replay_runtime_vendors", "sessionReplayRuntimeVendors"])
  ]).filter((vendor) => SESSION_REPLAY_VENDOR_PATTERN.test(vendor));
  const snapshotRuntimeArtifacts = getStringArray(input.snapshot, [
    "session_replay_runtime_artifacts",
    "sessionReplayRuntimeArtifacts"
  ]);
  const summaryFirstSeenMs = getNumber(summary, ["firstSeenMs", "first_seen_ms"]);
  const firstSeenMsValues = [
    ...classificationRows.map(getSessionReplayTiming),
    summaryFirstSeenMs
  ]
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);
  const consentStates = uniqueStrings([
    ...classificationRows.map((row) => getString(row, ["runtimePhase", "runtime_phase", "timingStatus", "timing_status"])),
    ...getStringArray(summary, ["consentStates", "consent_states"]),
    getBoolean(summary, ["preConsentObserved", "pre_consent_observed"]) === true ? "pre_consent" : null,
    postAcceptEvidenceUrls.length > 0 || postAcceptVendors.length > 0 ? "post_accept" : null
  ]);
  const disclosureRows = getRuntimeVendorDisclosureEvidence(input.runtimeArtifacts).filter((row) =>
    [...row.observedRuntimeVendors, ...row.unmatchedRuntimeVendors].some((vendor) => SESSION_REPLAY_VENDOR_PATTERN.test(vendor)) ||
    [...row.observedRuntimeDomains, ...row.unmatchedRuntimeDomains].some((domain) => SESSION_REPLAY_URL_PATTERN.test(domain))
  );
  const postChoiceControls = getConsentControlLifecycleEvidence(input.runtimeArtifacts);
  const artifactCount = getNumber(summary, ["artifactCount", "artifact_count"]);

  if (
    vendors.length === 0 &&
    requestUrls.length === 0 &&
    snapshotRuntimeArtifacts.length === 0 &&
    (artifactCount ?? 0) === 0
  ) {
    return null;
  }

  return compactRecord({
    acceptInteractionConfirmed: getBoolean(input.runtimeArtifacts, [
      "consentAcceptInteractionSucceeded",
      "consent_accept_interaction_succeeded"
    ]),
    collectionEndpointObserved:
      getBoolean(summary, ["collectionEndpointObserved", "collection_endpoint_observed"]) === true ||
      requestUrls.some(isCollectionEndpointUrl),
    consentStates,
    firstSeenMs: firstSeenMsValues[0] ?? null,
    libraryLoadObserved:
      getBoolean(summary, ["libraryOnly", "library_only"]) === true ||
      requestUrls.some((url) => /(?:script|tag|recorder|clarity\.ms\/tag|hotjar|fullstory|logrocket)/i.test(url)),
    maskingOrExclusionObserved: getBoolean(summary, [
      "maskingOrExclusionObserved",
      "masking_or_exclusion_observed"
    ]),
    postAcceptObserved: consentStates.some((state) => /post.?accept|post.?consent/i.test(state)),
    postChoiceConsentControlsObserved:
      getBoolean(postChoiceControls, [
        "preferenceCenterReachableAfterInitialLayer",
        "preference_center_reachable_after_initial_layer",
        "cmpReopenControlObserved",
        "cmp_reopen_control_observed",
        "withdrawalTextObserved",
        "withdrawal_text_observed"
      ]) === true,
    preConsentObserved:
      getBoolean(summary, ["preConsentObserved", "pre_consent_observed"]) === true ||
      consentStates.some((state) => /pre.?consent/i.test(state)),
    requestUrls: compactArray(requestUrls, 5),
    runtimeArtifacts: compactArray(snapshotRuntimeArtifacts, 5),
    sensitiveSurfaceOverlap: getBoolean(summary, ["sensitiveSurfaceOverlap", "sensitive_surface_overlap"]),
    vendorDisclosed: disclosureRows.some((row) => row.matchedVendorDisclosureCount > 0 && row.unmatchedVendorDisclosureCount === 0),
    vendorDisclosureGap: disclosureRows.some((row) => row.unmatchedVendorDisclosureCount > 0),
    vendors: compactArray(vendors, 5)
  });
}

function deriveSessionReplayFingerprintingOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const sessionReplayEvidence = buildSessionReplayRuntimeEvidence(input);
  const sessionReplayVendors = getStringArray(sessionReplayEvidence, ["vendors"]);
  const sessionReplayConsentStates = getStringArray(sessionReplayEvidence, ["consentStates"]);
  const sessionReplayPreConsentObserved = getBoolean(sessionReplayEvidence, ["preConsentObserved"]) === true;
  const sessionReplayPostAcceptObserved = getBoolean(sessionReplayEvidence, ["postAcceptObserved"]) === true;
  const sessionReplayCount =
    getNumber(input.snapshot, ["session_replay_tracker_count"]) ??
    getNumber(input.snapshot, ["session_replay_count"]);
  const sessionReplayObserved =
    getBoolean(input.snapshot, ["session_replay_tool_detected", "session_replay_detected"]) === true ||
    (sessionReplayCount !== null && sessionReplayCount > 0) ||
    sessionReplayVendors.length > 0;
  const fingerprintingObserved =
    getBoolean(input.snapshot, ["fingerprinting_or_identity_vendor_detected", "fingerprinting_detected"]) === true;

  if (sessionReplayPreConsentObserved) {
    return makeOutcome(
      "session_replay_fingerprinting_review",
      "Gap observed",
      "Session replay or behavioral recording evidence was retained before a recorded consent action.",
      [
        "Session replay signal observed before consent",
        ...sessionReplayVendors.map((vendor) => `Runtime vendor: ${vendor}`),
        ...sessionReplayConsentStates.map((state) => `Consent state: ${state}`)
      ],
      {
        retainedEvidence: {
          sessionReplayEvidence
        }
      }
    );
  }

  if (sessionReplayPostAcceptObserved || (sessionReplayObserved && sessionReplayEvidence && !sessionReplayPreConsentObserved)) {
    return makeOutcome(
      "session_replay_fingerprinting_review",
      "Observed",
      sessionReplayPostAcceptObserved
        ? "Session replay or behavioral analytics were retained only after a recorded accept/consent state; no pre-consent replay evidence was retained."
        : "Session replay or behavioral analytics were retained in runtime evidence, with no pre-consent replay evidence retained for the tested context.",
      [
        sessionReplayPostAcceptObserved
          ? "Session replay signal observed after consent"
          : "Session replay signal observed; pre-consent replay not retained",
        ...sessionReplayVendors.map((vendor) => `Runtime vendor: ${vendor}`),
        ...(
          sessionReplayConsentStates.length > 0
            ? sessionReplayConsentStates.map((state) => `Consent state: ${state}`)
            : ["Consent timing: no pre-consent replay evidence retained"]
        )
      ],
      {
        retainedEvidence: {
          sessionReplayEvidence
        }
      }
    );
  }

  if (sessionReplayObserved || fingerprintingObserved) {
    return makeOutcome(
      "session_replay_fingerprinting_review",
      "Insufficient evidence",
      "Replay or fingerprinting-like runtime evidence was retained, but no eligible replay/fingerprinting unified finding was projected.",
      [
        sessionReplayObserved ? "Session replay signal observed" : null,
        fingerprintingObserved ? "Fingerprinting or identity vendor signal observed" : null
      ].filter((value): value is string => Boolean(value)),
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "CertScore.unifiedFindings.sessionReplayFingerprintingFinding",
            "eligible projected unified finding when retained replay/fingerprinting evidence satisfies policy gates",
            "missing",
            "Required to classify retained replay or fingerprinting-like runtime evidence as a canonical review signal.",
            "CertScore"
          )
        ],
        retainedEvidence: {
          fingerprintingObserved,
          sessionReplayCount,
          sessionReplayEvidence,
          sessionReplayObserved
        }
      }
    );
  }

  if (hasRuntimeCapture(input) || sessionReplayCount !== null) {
    return makeOutcome(
      "session_replay_fingerprinting_review",
      "Not observed",
      "Runtime vendor/fingerprinting checks completed for the tested context, and no eligible replay or fingerprinting finding was projected.",
      ["Evidence: runtime capture completed"],
      {
        retainedEvidence: {
          fingerprintingObserved: false,
          runtimeCaptureCompleted: hasRuntimeCapture(input),
          sessionReplayCount: sessionReplayCount ?? 0,
          sessionReplayObserved: false
        }
      }
    );
  }

  return null;
}

function deriveCrossBorderOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const hybridRuntimeEvidence = getHybridRuntimeEvidence(input.runtimeArtifacts);
  const endpointJurisdictionRows = [
    ...getObjectArray(input.runtimeArtifacts, [
      "endpointJurisdictionEvidence",
      "endpoint_jurisdiction_evidence",
      "crossBorderEndpointEvidence",
      "cross_border_endpoint_evidence"
    ]),
    ...getObjectArray(hybridRuntimeEvidence, [
      "endpointJurisdictionEvidence",
      "endpoint_jurisdiction_evidence",
      "crossBorderEndpointEvidence",
      "cross_border_endpoint_evidence"
    ])
  ];
  const networkSummary = getHybridNetworkSummary(input.runtimeArtifacts);
  const thirdPartyDomainCount =
    getNumber(networkSummary, ["thirdPartyDomainCount", "third_party_domain_count"]) ??
    getNumber(input.snapshot, ["third_party_script_domain_count"]);

  if (endpointJurisdictionRows.length > 0) {
    const transferReviewRows = endpointJurisdictionRows.filter((row) =>
      getBoolean(row, ["transferReviewSignal", "transfer_review_signal"]) === true
    ).length;
      return makeOutcome(
        "cross_border_endpoint_review",
        transferReviewRows > 0 ? "Review signal" : "Not observed",
        transferReviewRows > 0
          ? "Endpoint geography creates a transfer-review signal. The gap status is based on retained disclosure mismatch for transfer-relevant advertising/analytics vendors."
          : "Endpoint jurisdiction evidence was retained, and no eligible cross-border endpoint finding was projected.",
      [
        `Endpoint jurisdiction rows: ${endpointJurisdictionRows.length}`,
        transferReviewRows > 0 ? `Transfer review signal rows: ${transferReviewRows}` : null
        ].filter((value): value is string => Boolean(value)),
      {
        missingOrIncompleteSourceSignals: transferReviewRows > 0
          ? [
              sourceGap(
                "CertScore.unifiedFindings.crossBorderVendorDisclosureGap",
                "eligible projected unified finding when retained transfer-relevant endpoint evidence intersects with vendor-disclosure mismatch evidence",
                "missing",
                "Required before CertScore can classify endpoint geography as a disclosure gap rather than a transfer-review signal.",
                "CertScore"
              )
            ]
          : [],
        retainedEvidence: {
          endpointJurisdictionRows: endpointJurisdictionRows.length,
          transferReviewSignalRows: transferReviewRows
        }
      }
      );
    }

  if (thirdPartyDomainCount !== null && thirdPartyDomainCount > 0) {
    return makeOutcome(
        "cross_border_endpoint_review",
        "Not testable",
        "Third-party endpoint inventory was retained, but endpoint jurisdiction or transfer-region evidence was not retained for this scan.",
        [`Third-party endpoint domains observed: ${thirdPartyDomainCount}`],
      {
        missingOrIncompleteSourceSignals: [
          sourceGap(
            "hybridRuntimeEvidence.endpointJurisdictionEvidence",
            "one or more endpoint jurisdiction evidence rows",
            endpointJurisdictionRows.length,
            "Required to evaluate whether observed third-party endpoints create a transfer-region review signal."
          )
        ],
        retainedEvidence: {
          endpointJurisdictionRows: 0,
          thirdPartyDomainCount
        }
      }
      );
    }

  return null;
}

function deriveAccessibilityConsentControlsOutcome(input: GdprEprivacyCoveragePolicyInput) {
  const visualAccessReview = getObject(input.runtimeArtifacts, ["visualAccessReview", "visual_access_review"]);
  const axeEvidenceRows = getObjectArray(input.runtimeArtifacts, ["accessibilityAxeEvidence", "accessibility_axe_evidence"]);
  const californiaPrivacyEvidence = getObject(input.runtimeArtifacts, ["californiaPrivacyEvidence", "california_privacy_evidence"]);
  const controlAccessibilityIssueObserved = getBoolean(californiaPrivacyEvidence, [
    "privacyControlAccessibilityIssueObserved",
    "privacy_control_accessibility_issue_observed"
  ]);
  const controlAccessibilitySignals = getStringArray(californiaPrivacyEvidence, [
    "privacyControlAccessibilitySignals",
    "privacy_control_accessibility_signals"
  ]);
  const keyboardIssueCount = getNumber(input.snapshot, ["wcag_keyboard_navigation_issue_count"]);
  const focusIssueCount = getNumber(input.snapshot, ["wcag_focus_indicator_issue_count"]);
  const ariaIssueCount = getNumber(input.snapshot, ["wcag_aria_error_count"]);
  const labelIssueCount = getNumber(input.snapshot, ["wcag_form_label_error_count"]);
  const retainedIssueCount =
    (keyboardIssueCount ?? 0) +
    (focusIssueCount ?? 0) +
    (ariaIssueCount ?? 0) +
    (labelIssueCount ?? 0);
  const accessibilityEvidenceRetained =
    Boolean(visualAccessReview) ||
    axeEvidenceRows.length > 0 ||
    retainedIssueCount > 0 ||
    controlAccessibilityIssueObserved !== null;
  const gdprCookieConsentSurfaceObserved = getBoolean(californiaPrivacyEvidence, [
    "gdprCookieConsentSurfaceObserved",
    "gdpr_cookie_consent_surface_observed"
  ]);
  const privacyAdChoiceSurfaceObserved = getBoolean(californiaPrivacyEvidence, [
    "privacyAdChoiceSurfaceObserved",
    "privacy_ad_choice_surface_observed"
  ]);
  const privacyChoiceSurfaceObserved = getBoolean(californiaPrivacyEvidence, [
    "privacyChoiceSurfaceObserved",
    "privacy_choice_surface_observed"
  ]);
  const rawConsentSurfaceObserved =
    getBoolean(input.runtimeArtifacts, ["consentSurfaceObserved", "consent_surface_observed"]) ??
    getBoolean(getHybridRuntimeEvidence(input.runtimeArtifacts), ["consentSurfaceObserved", "consent_surface_observed"]) ??
    getBoolean(input.snapshot, ["cookie_banner_present", "cookieBannerPresent", "consent_surface_observed", "consentSurfaceObserved"]);
  const consentSurfaceObserved =
    gdprCookieConsentSurfaceObserved === false &&
    (privacyChoiceSurfaceObserved === true || privacyAdChoiceSurfaceObserved === true)
      ? false
      : rawConsentSurfaceObserved;
  const evaluation = evaluateConsentControlAccessibility({
    accessibilityAuditRan: accessibilityEvidenceRetained,
    affectedControlLabels: getStringArray(californiaPrivacyEvidence, ["affectedControlLabels", "affected_control_labels"]),
    affectedControlRoles: getStringArray(californiaPrivacyEvidence, ["affectedControlRoles", "affected_control_roles"]),
    affectedControlTypes: getStringArray(californiaPrivacyEvidence, ["affectedControlTypes", "affected_control_types"]),
    affectedSelectors: getStringArray(californiaPrivacyEvidence, ["affectedSelectors", "affected_selectors"]),
    affectedUrls: getStringArray(californiaPrivacyEvidence, ["affectedUrls", "affected_urls"]),
    ariaIssueCount,
    axeEvidenceRows: axeEvidenceRows.length,
    buttonNameIssueCount: getNumber(californiaPrivacyEvidence, ["buttonNameIssueCount", "button_name_issue_count"]),
    consentControlsObserved: getStringArray(californiaPrivacyEvidence, ["consentControlsObserved", "consent_controls_observed"]),
    consentSurfaceObserved,
    contrastIssueCount: getNumber(californiaPrivacyEvidence, ["contrastIssueCount", "contrast_issue_count"]),
    controlAccessibilityIssueCount: getNumber(californiaPrivacyEvidence, ["controlAccessibilityIssueCount", "control_accessibility_issue_count"]),
    controlAccessibilityIssueObserved,
    controlAccessibilitySignals,
    controlScopeConfidence: getString(californiaPrivacyEvidence, ["controlScopeConfidence", "control_scope_confidence"]),
    cookieConsentAccessibilityIssueObserved: getBoolean(californiaPrivacyEvidence, [
      "cookieConsentAccessibilityIssueObserved",
      "cookie_consent_accessibility_issue_observed"
    ]),
    coverageStatus: getString(californiaPrivacyEvidence, ["coverageStatus", "coverage_status"]),
    directVsInferred: getString(californiaPrivacyEvidence, ["directVsInferred", "direct_vs_inferred"]),
    evidenceConfidence: getString(californiaPrivacyEvidence, ["evidenceConfidence", "evidence_confidence"]),
    examplesAreGeneralPageOnly: getBoolean(californiaPrivacyEvidence, ["examplesAreGeneralPageOnly", "examples_are_general_page_only"]),
    focusIssueCount,
    gdprCookieConsentSurfaceObserved,
    generalPageAccessibilityIssuesObserved: retainedIssueCount > 0 || axeEvidenceRows.length > 0,
    keyboardIssueCount,
    labelIssueCount,
    linkNameIssueCount: getNumber(californiaPrivacyEvidence, ["linkNameIssueCount", "link_name_issue_count"]),
    privacyAdChoiceSurfaceObserved,
    privacyChoiceAccessibilityIssueObserved: getBoolean(californiaPrivacyEvidence, [
      "privacyChoiceAccessibilityIssueObserved",
      "privacy_choice_accessibility_issue_observed"
    ]),
    privacyChoiceSurfaceObserved,
    privacyControlObserved: getBoolean(californiaPrivacyEvidence, ["privacyControlObserved", "privacy_control_observed"]),
    privacyControlsObserved: getStringArray(californiaPrivacyEvidence, ["privacyControlsObserved", "privacy_controls_observed"]),
    retainedDomEvidenceRef: getString(californiaPrivacyEvidence, ["retainedDomEvidenceRef", "retained_dom_evidence_ref"]),
    retainedScreenshotRef: getString(californiaPrivacyEvidence, ["retainedScreenshotRef", "retained_screenshot_ref"]),
    visualAccessReviewRetained: Boolean(visualAccessReview)
  });

  if (evaluation.status === "Gap observed") {
    return makeOutcome(
      "accessibility_consent_controls",
      "Gap observed",
      "CertScore retained basic automated accessibility evidence for consent or privacy controls, including button-name, link-name, color-contrast, ARIA, focus, or keyboard-related issues. Review whether users can perceive, understand, and operate the consent or privacy-choice controls, including with keyboard navigation and assistive technology.",
      evaluation.evidenceRefs,
      {
        retainedEvidence: evaluation.retainedEvidence
      }
    );
  }

  if (evaluation.status === "Review signal") {
    return makeOutcome(
      "accessibility_consent_controls",
      "Review signal",
      "Automated accessibility issues were observed in the tested page context, but the retained examples are not clearly tied to consent or privacy-choice controls. Review whether the consent banner, preference center, or related controls are affected.",
      evaluation.evidenceRefs,
      {
        retainedEvidence: evaluation.retainedEvidence
      }
    );
  }

  if (evaluation.status === "Not observed") {
    return makeOutcome(
      "accessibility_consent_controls",
      "Not observed",
      evaluation.retainedEvidence.examplesAreGeneralPageOnly === true
        ? "Automated accessibility issues were retained for the tested page context, such as a general page or navigation control, but scanner did not tie the retained examples to the observed consent banner, preference center, or privacy-choice controls."
        : "No basic automated accessibility issue was retained for the observed consent or privacy controls in the tested context.",
      evaluation.evidenceRefs,
      {
        retainedEvidence: evaluation.retainedEvidence
      }
    );
  }

  if (evaluation.status === "Not testable") {
    return makeOutcome(
      "accessibility_consent_controls",
      "Not testable",
      "Consent/privacy control accessibility was not testable because no usable consent/privacy-control accessibility evidence was retained.",
      evaluation.evidenceRefs,
      {
        missingOrIncompleteSourceSignals: evaluation.missingOrIncompleteSourceSignals,
        retainedEvidence: evaluation.retainedEvidence
      }
    );
  }

  return null;
}

function evaluateConsentControlAccessibility(input: {
  accessibilityAuditRan: boolean;
  affectedControlLabels: string[];
  affectedControlRoles: string[];
  affectedControlTypes: string[];
  affectedSelectors: string[];
  affectedUrls: string[];
  ariaIssueCount: number | null;
  axeEvidenceRows: number;
  buttonNameIssueCount: number | null;
  consentControlsObserved: string[];
  consentSurfaceObserved: boolean | null;
  contrastIssueCount: number | null;
  controlAccessibilityIssueCount: number | null;
  controlAccessibilityIssueObserved: boolean | null;
  controlAccessibilitySignals: string[];
  controlScopeConfidence: string | null;
  cookieConsentAccessibilityIssueObserved: boolean | null;
  coverageStatus: string | null;
  directVsInferred: string | null;
  evidenceConfidence: string | null;
  examplesAreGeneralPageOnly: boolean | null;
  focusIssueCount: number | null;
  gdprCookieConsentSurfaceObserved: boolean | null;
  generalPageAccessibilityIssuesObserved: boolean;
  keyboardIssueCount: number | null;
  labelIssueCount: number | null;
  linkNameIssueCount: number | null;
  privacyAdChoiceSurfaceObserved: boolean | null;
  privacyChoiceAccessibilityIssueObserved: boolean | null;
  privacyChoiceSurfaceObserved: boolean | null;
  privacyControlObserved: boolean | null;
  privacyControlsObserved: string[];
  retainedDomEvidenceRef: string | null;
  retainedScreenshotRef: string | null;
  visualAccessReviewRetained: boolean;
}) {
  const controlObserved =
    input.gdprCookieConsentSurfaceObserved === true ||
    input.privacyChoiceSurfaceObserved === true ||
    input.privacyAdChoiceSurfaceObserved === true ||
    input.consentSurfaceObserved === true ||
    input.privacyControlObserved === true ||
    input.consentControlsObserved.length > 0 ||
    input.privacyControlsObserved.length > 0 ||
    input.controlAccessibilityIssueObserved !== null ||
    input.controlAccessibilitySignals.length > 0;
  const issueCount =
    input.controlAccessibilityIssueCount ??
    (input.controlAccessibilitySignals.length > 0
      ? input.controlAccessibilitySignals.length
      : (input.ariaIssueCount ?? 0) + (input.focusIssueCount ?? 0) + (input.keyboardIssueCount ?? 0) + (input.labelIssueCount ?? 0));
  const controlScopedIssue =
    (input.cookieConsentAccessibilityIssueObserved === true ||
      input.privacyChoiceAccessibilityIssueObserved === true ||
      (input.cookieConsentAccessibilityIssueObserved === null &&
        input.privacyChoiceAccessibilityIssueObserved === null &&
        input.controlAccessibilityIssueObserved === true)) &&
    input.examplesAreGeneralPageOnly !== true &&
    (
      input.controlScopeConfidence === "high" ||
      input.controlScopeConfidence === "moderate" ||
      input.controlAccessibilitySignals.length > 0 ||
      input.affectedControlTypes.length > 0 ||
      input.affectedControlLabels.length > 0 ||
      input.affectedSelectors.length > 0
    );
  const evidenceRefs = [
    "Evidence: accessibility audit context",
    issueCount > 0 ? `Accessibility issue count: ${issueCount}` : null,
    ...input.controlAccessibilitySignals.slice(0, 6).map((signal) => `Control accessibility signal: ${signal}`),
    ...input.affectedControlTypes.slice(0, 3).map((type) => `Affected control type: ${type}`),
    ...input.affectedControlLabels.slice(0, 3).map((label) => `Affected control label: ${label}`),
    ...input.affectedUrls.slice(0, 2).map((url) => `Affected URL: ${url}`)
  ].filter((value): value is string => Boolean(value));
  const retainedEvidence = {
    affectedControlLabels: input.affectedControlLabels,
    affectedControlRoles: input.affectedControlRoles,
    affectedControlTypes: input.affectedControlTypes,
    affectedSelectors: input.affectedSelectors,
    affectedUrls: input.affectedUrls,
    ariaIssueCount: input.ariaIssueCount ?? 0,
    axeEvidenceRows: input.axeEvidenceRows,
    buttonNameIssueCount: input.buttonNameIssueCount,
    consentControlsObserved: input.consentControlsObserved,
    consentSurfaceObserved: input.consentSurfaceObserved,
    contrastIssueCount: input.contrastIssueCount,
    controlAccessibilityIssueCount: issueCount,
    controlAccessibilityIssueObserved: input.controlAccessibilityIssueObserved,
    controlAccessibilitySignals: input.controlAccessibilitySignals,
    controlScopeConfidence: input.controlScopeConfidence,
    cookieConsentAccessibilityIssueObserved: input.cookieConsentAccessibilityIssueObserved,
    coverageStatus: input.coverageStatus,
    directVsInferred: input.directVsInferred,
    evidenceConfidence: input.evidenceConfidence,
    examplesAreGeneralPageOnly: input.examplesAreGeneralPageOnly,
    focusIssueCount: input.focusIssueCount ?? 0,
    gdprCookieConsentSurfaceObserved: input.gdprCookieConsentSurfaceObserved,
    keyboardIssueCount: input.keyboardIssueCount ?? 0,
    labelIssueCount: input.labelIssueCount ?? 0,
    linkNameIssueCount: input.linkNameIssueCount,
    privacyAdChoiceSurfaceObserved: input.privacyAdChoiceSurfaceObserved,
    privacyChoiceAccessibilityIssueObserved: input.privacyChoiceAccessibilityIssueObserved,
    privacyChoiceSurfaceObserved: input.privacyChoiceSurfaceObserved,
    privacyControlObserved: input.privacyControlObserved,
    privacyControlsObserved: input.privacyControlsObserved,
    retainedDomEvidenceRef: input.retainedDomEvidenceRef,
    retainedScreenshotRef: input.retainedScreenshotRef,
    visualAccessReviewRetained: input.visualAccessReviewRetained
  };

  if (!input.accessibilityAuditRan || !controlObserved) {
    return {
      evidenceRefs,
      missingOrIncompleteSourceSignals: [
        !input.accessibilityAuditRan
          ? sourceGap(
              "accessibilityAuditRan",
              true,
              input.accessibilityAuditRan,
              "Required before CertScore can evaluate consent/privacy-control accessibility evidence."
            )
          : null,
        !controlObserved
          ? sourceGap(
              "consentPrivacyControlObserved",
              true,
              controlObserved,
              "Required before CertScore can evaluate accessibility evidence for consent or privacy-choice controls."
            )
          : null
      ].filter((value): value is GdprEprivacyCoverageSourceSignalGap => Boolean(value)),
      retainedEvidence,
      status: "Not testable" as const
    };
  }

  if (controlScopedIssue) {
    return {
      evidenceRefs,
      missingOrIncompleteSourceSignals: [],
      retainedEvidence,
      status: "Gap observed" as const
    };
  }

  if (input.examplesAreGeneralPageOnly === true && input.controlAccessibilityIssueObserved === false) {
    return {
      evidenceRefs,
      missingOrIncompleteSourceSignals: [],
      retainedEvidence,
      status: "Not observed" as const
    };
  }

  if (input.generalPageAccessibilityIssuesObserved) {
    return {
      evidenceRefs,
      missingOrIncompleteSourceSignals: [],
      retainedEvidence,
      status: "Review signal" as const
    };
  }

  return {
    evidenceRefs,
    missingOrIncompleteSourceSignals: [],
    retainedEvidence,
    status: "Not observed" as const
  };
}

export function deriveGdprEprivacyCoveragePolicyOutcomes(input: GdprEprivacyCoveragePolicyInput) {
  const outcomes = [
    deriveConsentSurfaceOutcome(input),
    derivePreConsentCookieStorageOutcome(input),
    derivePreConsentThirdPartyTrackingOutcome(input),
    deriveRejectPathOutcome(input),
    deriveConsentChoiceQualityOutcome(input),
    derivePostRejectOutcome(input),
    derivePreferenceWithdrawalOutcome(input),
    deriveVendorDisclosureOutcome(input),
    deriveSensitiveSurfaceOutcome(input),
    deriveSessionReplayFingerprintingOutcome(input),
    deriveCrossBorderOutcome(input),
    deriveAccessibilityConsentControlsOutcome(input)
  ];

  return Object.fromEntries(
    outcomes
      .filter((outcome): outcome is GdprEprivacyCoverageOutcome => Boolean(outcome))
      .map((outcome) => [outcome.rowId, outcome])
  );
}

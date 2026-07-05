import type { GdprEprivacyCoverageChecklistItem } from "./gdpr-eprivacy-coverage-checklist";

export type ScanEvidenceTriageRow = {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warning" | "muted";
};

export type ScanEvidenceTriageSummary = {
  consent: {
    rows: ScanEvidenceTriageRow[];
    candidateLabels: string[];
    rejectionReasons: string[];
  };
  hasAnySignal: boolean;
  policy: {
    rows: ScanEvidenceTriageRow[];
    failureClasses: ScanEvidenceTriageRow[];
    notTestableRows: string[];
    selectedUrls: string[];
  };
  timing: {
    rows: ScanEvidenceTriageRow[];
    slowestBuckets: ScanEvidenceTriageRow[];
  };
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return asArray(value).filter((item): item is Record<string, unknown> => Boolean(asRecord(item)));
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBooleanLabel(value: unknown) {
  return typeof value === "boolean" ? (value ? "Yes" : "No") : "Unknown";
}

function stringArray(value: unknown, maxItems: number) {
  return asArray(value)
    .map((item) => asString(item))
    .filter((item): item is string => Boolean(item))
    .map((item) => item.slice(0, 160))
    .slice(0, maxItems);
}

function formatDurationMs(value: unknown) {
  const durationMs = asNumber(value);
  if (durationMs === null) {
    return "Unknown";
  }
  if (durationMs < 1000) {
    return `${Math.round(durationMs)} ms`;
  }
  return `${(durationMs / 1000).toFixed(durationMs >= 10_000 ? 1 : 2)} s`;
}

function formatCount(value: unknown) {
  const count = asNumber(value);
  return count === null ? "Unknown" : String(count);
}

function getNestedRecord(runtimeArtifacts: Record<string, unknown> | null | undefined, ...keys: string[]) {
  for (const key of keys) {
    const record = asRecord(runtimeArtifacts?.[key]);
    if (record) {
      return record;
    }
  }
  return null;
}

function getPolicyDiagnostics(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  const diagnostics = getNestedRecord(runtimeArtifacts, "policySurfaceDiagnostics", "policy_surface_diagnostics");
  return diagnostics?.schemaVersion === "certscore.policy_surface_diagnostics.v2" ? diagnostics : null;
}

function getConsentInventoryDiagnostics(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  return getNestedRecord(runtimeArtifacts, "consentControlInventoryDiagnostics", "consent_control_inventory_diagnostics");
}

function getPolicyDisclosureSummary(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  return getNestedRecord(runtimeArtifacts, "policyDisclosureSummary", "policy_disclosure_summary");
}

function getFirstLayerConsentChoices(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  return getNestedRecord(runtimeArtifacts, "firstLayerConsentChoices", "first_layer_consent_choices");
}

function getScanTimingSummary(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  const summary = getNestedRecord(runtimeArtifacts, "scanTimingSummary", "scan_timing_summary");
  return summary?.schemaVersion === "certscore.scan_timing_summary.v1" ? summary : null;
}

function row(label: string, value: string, tone?: ScanEvidenceTriageRow["tone"]): ScanEvidenceTriageRow {
  return { label, value, tone };
}

function buildPolicyRows(input: {
  checklistItems: GdprEprivacyCoverageChecklistItem[];
  runtimeArtifacts: Record<string, unknown> | null | undefined;
}) {
  const diagnostics = getPolicyDiagnostics(input.runtimeArtifacts);
  const summary = diagnostics ? asRecord(diagnostics.summary) : null;
  const observationCounts = asRecord(summary?.observationCounts);
  const candidateCounts = asRecord(summary?.candidateCounts);
  const policyDisclosureSummary = getPolicyDisclosureSummary(input.runtimeArtifacts);
  const productionDiagnostics = asRecord(policyDisclosureSummary?.gdprTransparencyProductionEvidenceDiagnostics);
  const limitationKeys = stringArray(summary?.limitationKeys, 8);
  const notTestableRows = input.checklistItems
    .filter((item) => item.evidenceState === "not_testable")
    .map((item) => item.label)
    .slice(0, 10);
  const selectedUrls = stringArray(diagnostics?.selectedCanonicalPolicyUrls, 6);
  const failureClasses = asRecordArray(diagnostics?.failureClasses)
    .map((entry) => row(
      asString(entry.failureClass) ?? "unknown",
      `${formatCount(entry.count)} occurrence${asNumber(entry.count) === 1 ? "" : "s"}`,
      asNumber(entry.count) && asNumber(entry.count)! > 0 ? "warning" : "neutral"
    ))
    .slice(0, 6);

  const rows = [
    row(
      "Diagnostic source",
      diagnostics ? "Policy surface diagnostics v2" : policyDisclosureSummary ? "Policy disclosure summary" : "Not retained",
      diagnostics || policyDisclosureSummary ? "good" : "muted"
    ),
    row("Core policy retained", asBooleanLabel(summary?.corePolicySurfaceRetained ?? policyDisclosureSummary?.privacyPolicyPresent), summary?.corePolicySurfaceRetained === true ? "good" : "muted"),
    row("Production Article 13 signals", formatCount(productionDiagnostics?.productionCreditSignalCount), (asNumber(productionDiagnostics?.productionCreditSignalCount) ?? 0) > 0 ? "good" : "muted"),
    row("Not testable checklist rows", String(notTestableRows.length), notTestableRows.length > 0 ? "warning" : "good"),
    row("Policy observations fetched", formatCount(observationCounts?.fetched), (asNumber(observationCounts?.fetched) ?? 0) > 0 ? "good" : "muted"),
    row("Policy observations failed", formatCount(observationCounts?.failed), (asNumber(observationCounts?.failed) ?? 0) > 0 ? "warning" : "neutral"),
    row("Common-path guesses", formatCount(candidateCounts?.guessedCommonPath), (asNumber(candidateCounts?.guessedCommonPath) ?? 0) > 0 ? "neutral" : "muted"),
    row("Limitation keys", limitationKeys.length > 0 ? limitationKeys.join(", ") : "None retained", limitationKeys.length > 0 ? "warning" : "good")
  ];

  return { rows, failureClasses, notTestableRows, selectedUrls };
}

function buildConsentRows(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  const choices = getFirstLayerConsentChoices(runtimeArtifacts);
  const diagnostics = getConsentInventoryDiagnostics(runtimeArtifacts);
  const geometry = asRecord(diagnostics?.geometry);
  const candidateLabels = stringArray(diagnostics?.candidateLabels, 10);
  const rejectionReasons = stringArray(diagnostics?.rejectionReasons, 10);
  const rows = [
    row(
      "Diagnostic source",
      diagnostics ? "Consent inventory triage v1" : choices ? "First-layer consent choices" : "Not retained",
      diagnostics || choices ? "good" : "muted"
    ),
    row("Consent surface observed", asBooleanLabel(runtimeArtifacts?.consentSurfaceObserved ?? runtimeArtifacts?.consent_surface_observed ?? diagnostics?.likelyPresent), (runtimeArtifacts?.consentSurfaceObserved ?? runtimeArtifacts?.consent_surface_observed ?? diagnostics?.likelyPresent) === true ? "good" : "muted"),
    row("Scoreable inventory retained", asBooleanLabel(choices?.actionableControlInventoryRetained), choices?.actionableControlInventoryRetained === true ? "good" : "warning"),
    row("Accept control", asBooleanLabel(choices?.acceptControlObserved), choices?.acceptControlObserved === true ? "good" : "muted"),
    row("Reject/refuse control", asBooleanLabel(choices?.rejectControlObserved), choices?.rejectControlObserved === true ? "good" : "warning"),
    row("Options/preferences control", asBooleanLabel(choices?.managePreferencesControlObserved), choices?.managePreferencesControlObserved === true ? "good" : "muted"),
    row("Candidate controls", formatCount(diagnostics?.candidateControlCount), (asNumber(diagnostics?.candidateControlCount) ?? 0) > 0 ? "neutral" : "muted"),
    row("Retained controls", formatCount(diagnostics?.retainedControlCount), (asNumber(diagnostics?.retainedControlCount) ?? 0) > 0 ? "good" : "warning"),
    row("Geometry candidates", formatCount(geometry?.candidateCount), (asNumber(geometry?.candidateCount) ?? 0) > 0 ? "neutral" : "muted")
  ];

  return { rows, candidateLabels, rejectionReasons };
}

function buildTimingRows(runtimeArtifacts: Record<string, unknown> | null | undefined) {
  const policyDiagnostics = getPolicyDiagnostics(runtimeArtifacts);
  const timingSummary = getScanTimingSummary(runtimeArtifacts);
  const moduleTimings = asRecordArray(timingSummary?.moduleTimings)
    .map((entry) => ({
      durationMs: asNumber(entry.durationMs) ?? 0,
      label: asString(entry.moduleName) ?? asString(entry.moduleId) ?? "module"
    }))
    .filter((entry) => entry.durationMs > 0)
    .sort((left, right) => right.durationMs - left.durationMs)
    .slice(0, 5);
  const policyBuckets = asRecordArray(policyDiagnostics?.timingBuckets)
    .map((entry) => ({
      durationMs: asNumber(entry.durationMs) ?? 0,
      label: asString(entry.bucket) ?? "policy bucket"
    }))
    .filter((entry) => entry.durationMs > 0)
    .sort((left, right) => right.durationMs - left.durationMs)
    .slice(0, 5);
  const slowestBuckets = [...moduleTimings, ...policyBuckets]
    .sort((left, right) => right.durationMs - left.durationMs)
    .slice(0, 6)
    .map((entry) => row(entry.label, formatDurationMs(entry.durationMs), entry.durationMs > 15_000 ? "warning" : "neutral"));
  const handoff = asRecord(timingSummary?.handoffTimings);
  const rows = [
    row("Timing source", timingSummary ? "Scan timing summary v1" : policyDiagnostics ? "Policy diagnostics only" : "Basic runtime artifact", timingSummary || policyDiagnostics ? "good" : "muted"),
    row("Scan core duration", formatDurationMs(runtimeArtifacts?.local_v2_dag_scan_core_duration_ms)),
    row("Policy capture duration", formatDurationMs(policyDiagnostics?.policyCaptureDurationMs), (asNumber(policyDiagnostics?.policyCaptureDurationMs) ?? 0) > 15_000 ? "warning" : "neutral"),
    row("Artifact mirror", formatDurationMs(handoff?.artifactMirrorDurationMs)),
    row("Lambda to WC01 result", formatDurationMs(handoff?.lambdaToWc01ResultRecordedMs))
  ];

  return { rows, slowestBuckets };
}

export function buildScanEvidenceTriage(input: {
  gdprEprivacyCoverageItems?: GdprEprivacyCoverageChecklistItem[];
  runtimeArtifacts: Record<string, unknown> | null | undefined;
}): ScanEvidenceTriageSummary {
  const policy = buildPolicyRows({
    checklistItems: input.gdprEprivacyCoverageItems ?? [],
    runtimeArtifacts: input.runtimeArtifacts
  });
  const consent = buildConsentRows(input.runtimeArtifacts);
  const timing = buildTimingRows(input.runtimeArtifacts);
  const hasAnySignal =
    policy.rows.some((item) => item.value !== "Unknown" && item.value !== "Not retained") ||
    policy.failureClasses.length > 0 ||
    policy.notTestableRows.length > 0 ||
    policy.selectedUrls.length > 0 ||
    consent.rows.some((item) => item.value !== "Unknown" && item.value !== "Not retained") ||
    consent.candidateLabels.length > 0 ||
    consent.rejectionReasons.length > 0 ||
    timing.slowestBuckets.length > 0;

  return {
    consent,
    hasAnySignal,
    policy,
    timing
  };
}

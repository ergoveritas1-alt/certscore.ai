import { REPORT_UNIFIED_FINDINGS } from "@website-signal-risk-scanner/shared";

export type UnifiedFindingTriggerShape = "mixed" | "policy" | "snapshot" | "runtime" | "unmapped" | "validation";
export type UnifiedFindingSupportBucket =
  | "direct_scanner"
  | "needs_nano_backfill"
  | "needs_narrower_signal_gating"
  | "move_to_validation_internal"
  | "suppress_or_rework";
export type UnifiedFindingAction = "backfill with nano" | "keep" | "keep but narrow" | "move to validation/internal" | "suppress/rework";

export type UnifiedFindingSupportAnalysisRecord = {
  action: UnifiedFindingAction;
  bucket: UnifiedFindingSupportBucket;
  currentTriggerShape: UnifiedFindingTriggerShape;
  id: string;
  label: string;
  minimumMergedSignalContract: string[];
  nanoBackfillRequired: boolean;
  scannerSupportStatus: "direct" | "partial" | "unsupported";
};

function deriveTriggerShape(input: { hasPolicy: boolean; hasRuntime: boolean; hasSnapshot: boolean; hasValidation: boolean }) {
  const sourceCount = [input.hasSnapshot, input.hasRuntime, input.hasPolicy].filter(Boolean).length;

  if (sourceCount > 1 || (sourceCount > 0 && input.hasValidation)) {
    return "mixed" as const;
  }
  if (input.hasSnapshot) {
    return "snapshot" as const;
  }
  if (input.hasRuntime) {
    return "runtime" as const;
  }
  if (input.hasPolicy) {
    return "policy" as const;
  }
  if (input.hasValidation) {
    return "validation" as const;
  }
  return "unmapped" as const;
}

export function buildUnifiedFindingSupportAnalysis(): UnifiedFindingSupportAnalysisRecord[] {
  return REPORT_UNIFIED_FINDINGS.map((finding) => {
    const hasSnapshot = finding.signalMappings.some((mapping) => mapping.source === "snapshot_signal");
    const hasRuntime = finding.signalMappings.some((mapping) => mapping.source === "runtime_artifact_signal");
    const hasPolicy = finding.signalMappings.some(
      (mapping) => mapping.source === "policy_enrichment_signal" || mapping.source === "document_semantic_signal"
    );
    const hasValidation = finding.validationRuleKeys.length > 0;
    const currentTriggerShape = deriveTriggerShape({ hasPolicy, hasRuntime, hasSnapshot, hasValidation });

    let bucket: UnifiedFindingSupportBucket;
    let action: UnifiedFindingAction;
    let scannerSupportStatus: "direct" | "partial" | "unsupported";

    if (currentTriggerShape === "snapshot" || currentTriggerShape === "runtime") {
      bucket = "direct_scanner";
      action = "keep";
      scannerSupportStatus = "direct";
    } else if (currentTriggerShape === "policy") {
      bucket = "needs_nano_backfill";
      action = "backfill with nano";
      scannerSupportStatus = "unsupported";
    } else if (currentTriggerShape === "mixed") {
      bucket = "needs_narrower_signal_gating";
      action = "keep but narrow";
      scannerSupportStatus = hasPolicy ? "partial" : "direct";
    } else if (currentTriggerShape === "validation") {
      bucket = "move_to_validation_internal";
      action = "move to validation/internal";
      scannerSupportStatus = "unsupported";
    } else {
      bucket = "suppress_or_rework";
      action = "suppress/rework";
      scannerSupportStatus = "unsupported";
    }

    return {
      action,
      bucket,
      currentTriggerShape,
      id: finding.id,
      label: finding.label,
      minimumMergedSignalContract: [
        ...new Set([
          ...finding.signalMappings.map((mapping) => `${mapping.source}:${mapping.key}`),
          ...finding.validationRuleKeys.map((ruleKey) => `validation:${ruleKey}`)
        ])
      ],
      nanoBackfillRequired: hasPolicy,
      scannerSupportStatus
    } satisfies UnifiedFindingSupportAnalysisRecord;
  }).sort((left, right) => left.id.localeCompare(right.id));
}

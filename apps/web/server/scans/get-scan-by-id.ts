"use server";

import { policyModelReviewArtifactSchema } from "@certscore/contracts";
import {
  type AccessPostureClass,
  type BlockPageClassification,
  type BlockVendorGuess,
  type MergedSignalRecord,
  type PopulatedSignalRecord,
  type RecoverableFindingClass,
  SCAN_EVENT_TYPES,
  type ScanExecutionTier,
  buildAgencyMappings,
  buildRegulatoryRiskAssessment,
  getScannerExecutionSummary,
  type AgencyMapping,
  type RegulatoryRiskAssessment,
  type ScannerExecutionSummary
} from "@website-signal-risk-scanner/shared";
import { deriveSignalEnrichmentWorkflowState } from "@website-signal-risk-scanner/shared";
import { deriveAccessPosturePresentation } from "../../lib/scans/access-posture-presentation";
import { normalizeAccessPostureSummary } from "../../lib/scans/normalize-access-posture-summary";
import { deriveScanStopReason } from "../../lib/scans/scan-stop-reason";
import {
  getHybridDerivedTrackerVendors,
  getHybridNanoSignalPopulations,
  withHybridRuntimeArtifactFallbacks
} from "../../lib/scans/hybrid-runtime-evidence";
import type { ScanValidationFinding } from "../../lib/scans/validation-review-linking";
import { buildAgencyMappingSource } from "../../lib/scans/agency-mapping-source";
import { buildRegulatoryRiskSource } from "../../lib/scans/regulatory-risk-source";
import { getPrimaryCategoryDescription, getPrimaryCategoryLabel, mapSignalKeyToTaxonomy, type PrimaryScanCategoryId } from "../../lib/scans/signal-taxonomy";
import { deriveSupplementalSnapshotSignals } from "../../lib/scans/scan-detail-supplemental-signals";
import { deriveSupplementalCoverageSignals, type SupplementalCoverageSignal } from "../../lib/scans/supplemental-coverage-signals";
import { deriveSupplementalPolicySignals, type SupplementalPolicySignal } from "../../lib/scans/supplemental-policy-signals";
import {
  mergeNanoPolicyInputsWithFallback,
  shouldPreferNanoDocumentSources
} from "../../lib/scans/nano-document-sources";
import {
  buildNanoPolicySignalRows,
  MANAGED_NANO_POLICY_SIGNAL_KEYS,
  type PersistedNanoSignalRow
} from "../../lib/scans/nano-policy-signals";
import { deriveRuntimeVendorDisclosureEvidenceFromRetainedSources } from "../../lib/scans/runtime-vendor-disclosure";
import { getPrimaryPolicyEnrichmentRow, getPolicyPageType } from "../../lib/scans/policy-enrichment-row";
import { buildMergedSignalRecords } from "../../lib/scans/merged-signals";
import { isPlatformAdminEmail } from "../admin/platform-admin";
import { loadSupplementalValidationFindingsForScan } from "../validation/repository";
import { deriveDisplayCreatedAt, deriveScanDisplayState } from "./display-state";
import {
  collectPolicyEvidenceHashes,
  dereferencePolicyEvidenceSnippets
} from "./policy-enrichment-normalization";
import {
  insertScanEventRecord,
  loadPolicyEvidenceByHash,
  loadRecentDomainBenchmarkEvent,
  loadScanComparisonArtifacts,
  loadScanCoreRecord,
  loadScanDetailArtifacts,
  loadScanValidationFindingRows,
  type ScanAccessibilityRuleCountRow as AccessibilityRuleCountRow,
  type ScanAccessibilityRuleExampleRow as AccessibilityRuleExampleRow,
  type ScanDetailQueryRow as ScanRow,
  type ScanEventQueryRow as ScanEventRow,
  type ScanPreconsentViolationRow as PreconsentViolationRow,
  type ScanSignalQueryRow as SignalRow,
  type ScanValidationRunFindingRow as ValidationRunFindingRow,
  type ScanValidationVerdictRow as ValidationVerdictRow
} from "./repository";
import { repairFindingFamilyPacketEvents } from "./family-packet-event-repair";
import {
  DOMAIN_BENCHMARK_EVENT_TYPE,
  buildDomainBenchmarkEstimateFromMacroEnrichment,
  generateDomainBenchmarkEstimate,
  getDomainBenchmarkEstimateOverride,
  normalizeDomainBenchmarkEstimate,
  shouldPreferMacroBenchmarkEstimate,
  type DomainBenchmarkEstimate
} from "./domain-benchmark-estimate";
import { getFullScanUrlscanSupplement } from "./urlscan-supplement";
import { getScanFromDisplay } from "../../lib/scans/scan-from";
import { deriveBrowserScanCanonicalMaterializationFromStoredSignalRows } from "../browser-scans/canonical-materialization";
import {
  buildScanExecutionProvenance,
  type ScanExecutionProvenanceRecord
} from "./scan-execution-provenance";
import { selectConfiguredCustomerGdprEprivacyScore } from "./customer-score-cutover-server";
import { loadLatestVersionedScoreAssessments } from "./score-assessment-repository";
import { withPersistedFirstLayerConsentEvidence } from "./scan-report-consent-projection";

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function mergePolicyDisclosureSummaries(
  existing: Record<string, unknown> | null,
  incoming: Record<string, unknown> | null
) {
  if (!existing) return incoming;
  if (!incoming) return existing;

  const merged: Record<string, unknown> = { ...incoming, ...existing };
  for (const key of [
    "article13DisclosureSignals",
    "article13_disclosure_signals",
    "gdprTransparencyTopics",
    "gdpr_transparency_topics",
    "gdprTransparencyTopicCandidates",
    "gdpr_transparency_topic_candidates",
  ]) {
    const values = [existing[key], incoming[key]].flatMap((value) =>
      Array.isArray(value) ? value : []
    );
    if (values.length > 0) {
      const deduped = values.filter((value, index, all) =>
        all.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(value)) === index
      );
      merged[key] = deduped.slice(0, 200);
    }
  }
  return merged;
}

function normalizeTrackerScriptHostForDisplay(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  const trimmed = value.trim().replace(/^www\./i, "").toLowerCase();
  return /^[a-z0-9](?:[a-z0-9-]*\.)+[a-z0-9-]{2,}$/i.test(trimmed) ? trimmed : null;
}

export type ScanDetailRecord = {
  id: string;
  domainId: string | null;
  domainHostname: string | null;
  scanType: string;
  status: string;
  pagesRequested: number;
  pagesScanned: number;
  scanConfigJson: Record<string, unknown> | null;
  scanFromLabel: string;
  scanFromValue: string;
  executionSummary: ScannerExecutionSummary | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  errorMessage: string | null;
  provenance: ScanExecutionProvenanceRecord;
};

export type ScanEventRecord = {
  id: string;
  eventType: string;
  message: string;
  metadataJson: unknown;
  createdAt: string;
};

export type ScanSignalRecord = {
  category: string;
  primaryCategory: PrimaryScanCategoryId;
  primaryCategoryDescription: string;
  primaryCategoryLabel: string;
  key: string;
  label: string;
  subcategory: string | null;
  value: boolean | number | string | string[];
  valueType: string;
};

export type ScanMergedSignalRecord = MergedSignalRecord;

export type ScanSnapshotRecord = {
  [key: string]: unknown;
} | null;

export type ScanRuntimeArtifactRecord = {
  [key: string]: unknown;
} | null;

export type ScanMacroEnrichmentRecord = {
  [key: string]: unknown;
} | null;

export type RelatedPreviewSnapshotRecord = {
  [key: string]: unknown;
} | null;

export type PreviousSnapshotRecord = {
  [key: string]: unknown;
} | null;

export type PolicyEnrichmentRecord = {
  [key: string]: unknown;
};

export type PolicyReviewQueueRecord = {
  [key: string]: unknown;
};

export type ScanTrackerVendorRecord = {
  beforeConsent: boolean | null;
  collectionEndpointType: string;
  confidence: number;
  detectionSource: string;
  firstSeenMs?: number | null;
  firstPartyOrThirdParty: string;
  matchedSignatureId: string | null;
  scriptHost: string | null;
  vendorCategory: string;
  vendorName: string;
};

export type TrackerChangeRecord = {
  changeType: "added" | "removed";
  confidence: number;
  previousScanId: string | null;
  vendorCategory: string;
  vendorName: string;
};

export type PreconsentChangeRecord = {
  changeType: "new" | "resolved";
  confidence: number;
  previousScanId: string | null;
  vendorCategory: string;
  vendorName: string;
};

export type PreconsentViolationRecord = {
  collectionEndpointType: string;
  confidence: number;
  detectionSource: string;
  evidenceUrls: string[];
  firstPartyOrThirdParty: string;
  matchedSignatureId: string | null;
  scriptHost: string | null;
  vendorCategory: string;
  vendorName: string;
};

export type AccessibilityRuleCountRecord = {
  instanceCount: number;
  ruleCode: string;
  ruleGroup: string;
  severity: string;
};

export type AccessibilityRuleExampleRecord = {
  description: string;
  help: string;
  helpUrl: string;
  impact: string | null;
  nodeCount: number;
  pageUrl: string;
  representativeSelectors: string[];
  ruleCode: string;
  ruleGroup: string;
  severity: string;
};

export type ScanValidationFindingRecord = ScanValidationFinding;

export type ScanPageEvidenceRecord = {
  evidence_id?: string | null;
  matched_text?: string | null;
  metadata?: unknown;
  page_role?: string | null;
  page_type?: string | null;
  page_url?: string | null;
};

export type ScanSignalHitRecord = {
  evidence_refs?: unknown;
  id?: string | null;
  matched_text?: string | null;
  matched_snippet?: string | null;
  page_role?: string | null;
  page_type?: string | null;
  page_url?: string | null;
  payload?: unknown;
  signal_key?: string | null;
};

function isMissingOptionalTableError(error: { code?: string | null; message?: string | null } | null | undefined) {
  const message = error?.message ?? "";
  return error?.code === "PGRST205" || message.includes("schema cache") || message.includes("Could not find the table");
}

async function resolveDomainBenchmarkEstimate(input: {
  currentEvents: ScanEventRecord[];
  domainHostname: string | null;
  domainId: string | null;
  macroEnrichment?: Record<string, unknown> | null;
  organizationId: string | null;
  scanId: string;
}): Promise<DomainBenchmarkEstimate | null> {
  const overrideEstimate = getDomainBenchmarkEstimateOverride(input.domainHostname);
  if (overrideEstimate) {
    return overrideEstimate;
  }

  const macroEstimate = buildDomainBenchmarkEstimateFromMacroEnrichment(input.macroEnrichment);
  const currentEvent = [...input.currentEvents].reverse().find((event) => event.eventType === DOMAIN_BENCHMARK_EVENT_TYPE);
  const currentEstimate = normalizeDomainBenchmarkEstimate(currentEvent?.metadataJson);
  if (shouldPreferMacroBenchmarkEstimate({ currentEstimate, macroEstimate })) {
    await insertScanEventRecord({
      scanId: input.scanId,
      domainId: input.domainId,
      organizationId: input.organizationId,
      eventType: DOMAIN_BENCHMARK_EVENT_TYPE,
      message: "Estimated domain benchmark for executive summary from scan macro enrichment.",
      metadataJson: macroEstimate
    });
    return macroEstimate;
  }
  if (currentEstimate) {
    return currentEstimate;
  }

  if (input.domainId) {
    const recentDomainEvent = await loadRecentDomainBenchmarkEvent({
      domainId: input.domainId,
      eventType: DOMAIN_BENCHMARK_EVENT_TYPE,
      scanId: input.scanId
    });
    const cachedEstimate = normalizeDomainBenchmarkEstimate(recentDomainEvent?.metadata_json);
    if (shouldPreferMacroBenchmarkEstimate({ currentEstimate: cachedEstimate, macroEstimate })) {
      await insertScanEventRecord({
        scanId: input.scanId,
        domainId: input.domainId,
        organizationId: input.organizationId,
        eventType: DOMAIN_BENCHMARK_EVENT_TYPE,
        message: "Estimated domain benchmark for executive summary from scan macro enrichment.",
        metadataJson: macroEstimate
      });
      return macroEstimate;
    }
    if (cachedEstimate) {
      return cachedEstimate;
    }
  }

  if (macroEstimate) {
    await insertScanEventRecord({
      scanId: input.scanId,
      domainId: input.domainId,
      organizationId: input.organizationId,
      eventType: DOMAIN_BENCHMARK_EVENT_TYPE,
      message: "Estimated domain benchmark for executive summary from scan macro enrichment.",
      metadataJson: macroEstimate
    });
    return macroEstimate;
  }

  if (!input.domainHostname) {
    return null;
  }

  const generatedEstimate = await generateDomainBenchmarkEstimate({
    domainHostname: input.domainHostname
  });

  if (!generatedEstimate) {
    return null;
  }

  await insertScanEventRecord({
    scanId: input.scanId,
    domainId: input.domainId,
    organizationId: input.organizationId,
    eventType: DOMAIN_BENCHMARK_EVENT_TYPE,
    message: "Estimated domain benchmark for executive summary.",
    metadataJson: generatedEstimate
  });

  return generatedEstimate;
}

function getPrimaryPolicyEnrichment(rows: Array<Record<string, unknown>>) {
  return getPrimaryPolicyEnrichmentRow(rows);
}

function deriveHostnameFromTargetUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).hostname || null;
  } catch {
    return null;
  }
}

function toIsoTimestamp(value: string | Date | null | undefined) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value ?? "");
}

function getStringRecordValue(record: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!record) {
    return null;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return null;
}

function buildStoredSignalPopulationRecords(input: {
  observedAt: string | null;
  rows: SignalRow[];
  source: "browser_extension_bx01" | "nano" | "validation";
}) {
  return input.rows.flatMap((row) => {
    const populationStatus =
      row.population_status === "present" ||
      row.population_status === "missing" ||
      row.population_status === "conflicting" ||
      row.population_status === "insufficient"
        ? row.population_status
        : "present";

    return [
      {
        confidence: typeof row.confidence === "number" ? row.confidence : null,
        evidenceRefs: Array.isArray(row.evidence_refs) ? row.evidence_refs.filter((value): value is string => typeof value === "string") : [],
        key: row.signal_key,
        label: row.signal_label,
        observedAt: row.observed_at ?? input.observedAt,
        populationStatus,
        provenance: Array.isArray(row.provenance_json)
          ? row.provenance_json.filter(
              (
                value
              ): value is { detail: string; kind: "document" | "runtime" | "signal" | "validation" } =>
                Boolean(value) &&
                typeof value === "object" &&
                typeof (value as { detail?: unknown }).detail === "string" &&
                ((value as { kind?: unknown }).kind === "document" ||
                  (value as { kind?: unknown }).kind === "runtime" ||
                  (value as { kind?: unknown }).kind === "signal" ||
                  (value as { kind?: unknown }).kind === "validation")
            )
          : [],
        reportSignalSource:
          input.source === "browser_extension_bx01"
            ? row.signal_key.startsWith("privacy.") ||
                row.signal_key.startsWith("commerce.") ||
                row.signal_key.startsWith("financial.") ||
                row.signal_key.startsWith("entity.") ||
                row.signal_key.startsWith("disclosure.") ||
                row.signal_key.startsWith("context.") ||
                row.signal_key.startsWith("accessibility.")
              ? "snapshot_signal"
              : null
            : "document_semantic_signal",
        source: input.source,
        value: row.signal_value_json,
        valueType:
          row.value_type === "boolean" || row.value_type === "number" || row.value_type === "text" || row.value_type === "string_array"
            ? row.value_type
            : Array.isArray(row.signal_value_json)
              ? "string_array"
              : typeof row.signal_value_json === "boolean"
                ? "boolean"
                : typeof row.signal_value_json === "number"
                  ? "number"
                  : "text"
      } satisfies PopulatedSignalRecord
    ];
  });
}

function getNanoSignalValueType(value: PersistedNanoSignalRow["value"]): PopulatedSignalRecord["valueType"] {
  if (Array.isArray(value)) {
    return "string_array";
  }
  if (typeof value === "boolean") {
    return "boolean";
  }
  if (typeof value === "number") {
    return "number";
  }
  return "text";
}

function buildManagedNanoSignalPopulationRecords(input: {
  observedAt: string | null;
  rows: PersistedNanoSignalRow[];
}) {
  return input.rows.map((row): PopulatedSignalRecord => ({
    confidence: row.confidence,
    evidenceRefs: row.evidence_refs,
    key: row.key,
    label: row.label,
    observedAt: input.observedAt,
    populationStatus: row.population_status,
    provenance: [{ detail: row.provenance_detail, kind: "document" }],
    reportSignalSource: row.report_signal_source,
    source: "nano",
    value: row.value,
    valueType: getNanoSignalValueType(row.value)
  }));
}

function deriveHostnameFromScanConfig(value: Record<string, unknown> | null | undefined) {
  const directUrl = deriveHostnameFromTargetUrl(
    getStringRecordValue(value, ["targetUrl", "startUrl", "homepageUrl", "normalizedUrl", "url"])
  );
  if (directUrl) {
    return directUrl;
  }

  const executionSummary =
    value && typeof value.executionSummary === "object" && value.executionSummary !== null && !Array.isArray(value.executionSummary)
      ? (value.executionSummary as Record<string, unknown>)
      : null;
  const stages = Array.isArray(executionSummary?.stages) ? executionSummary.stages : [];

  for (const stage of stages) {
    if (!stage || typeof stage !== "object" || Array.isArray(stage)) {
      continue;
    }

    const metadata =
      "metadata" in stage &&
      stage.metadata &&
      typeof stage.metadata === "object" &&
      !Array.isArray(stage.metadata)
        ? (stage.metadata as Record<string, unknown>)
        : null;
    const hostname = deriveHostnameFromTargetUrl(
      getStringRecordValue(metadata, ["targetUrl", "startUrl", "homepageUrl", "finalUrl", "resolvedHostname", "canonicalHost"])
    );
    if (hostname) {
      return hostname;
    }
  }

  return null;
}

function stripSnapshotRecord(snapshot: Record<string, unknown>) {
  const next = { ...snapshot };
  delete next.id;
  delete next.created_at;
  delete next.updated_at;
  return next;
}

function stripTimestampFields(record: Record<string, unknown>) {
  const next = { ...record };
  delete next.created_at;
  delete next.updated_at;
  return next;
}

function hasCaptchaOrSecurityDocumentSource(documentSources: Array<Record<string, unknown>>) {
  return documentSources.some((source) => {
    const text = [
      typeof source.canonical_url === "string" ? source.canonical_url : "",
      typeof source.source_url === "string" ? source.source_url : "",
      typeof source.title === "string" ? source.title : "",
      typeof source.document_text === "string" ? source.document_text.slice(0, 1000) : ""
    ]
      .join(" ")
      .toLowerCase();

    return /splashui\/captcha|captcha|security measure|verify yourself|verify you are human|request blocked|access denied/.test(text);
  });
}


function normalizeSupplementalPolicySignals(signals: SupplementalPolicySignal[]): ScanSignalRecord[] {
  return signals.map((signal) => {
    const taxonomy = mapSignalKeyToTaxonomy({
      category: signal.category,
      key: signal.key,
      label: signal.label
    });

    return {
      category: signal.category,
      primaryCategory: taxonomy.primaryCategory,
      primaryCategoryDescription: getPrimaryCategoryDescription(taxonomy.primaryCategory),
      primaryCategoryLabel: getPrimaryCategoryLabel(taxonomy.primaryCategory),
      key: signal.key,
      label: signal.label,
      subcategory: taxonomy.subcategory ?? null,
      value: signal.value,
      valueType: "boolean"
    } satisfies ScanSignalRecord;
  });
}

function buildScannerSignalPopulationRecords(input: {
  observedAt: string | null;
  signalHits?: ScanSignalHitRecord[];
  signals: ScanSignalRecord[];
}): PopulatedSignalRecord[] {
  return input.signals.map((signal) => {
    const matchedTexts: string[] = [];
    if (input.signalHits) {
      for (const hit of input.signalHits) {
        if (hit.signal_key !== signal.key) {
          continue;
        }
        let payload: Record<string, unknown> | null = null;
        if (typeof hit.payload === "string") {
          try {
            payload = JSON.parse(hit.payload) as Record<string, unknown>;
          } catch {
            payload = null;
          }
        } else if (hit.payload && typeof hit.payload === "object" && !Array.isArray(hit.payload)) {
          payload = hit.payload as Record<string, unknown>;
        }
        const texts = payload?.matchedTexts;
        if (Array.isArray(texts)) {
          for (const text of texts) {
            if (typeof text === "string" && text.trim().length > 0) {
              matchedTexts.push(text.trim());
            }
          }
        }
      }
    }
    return {
      confidence: 1,
      evidenceRefs: matchedTexts,
      key: signal.key,
      label: signal.label,
      observedAt: input.observedAt,
      populationStatus: "present",
      provenance: [
        {
          detail: "scanner_retained_signal",
          kind: "signal"
        }
      ],
      reportSignalSource:
        signal.key.startsWith("privacy.") && /reject_reduced|weak_cookie_security|gpc_signal_not_honored/i.test(signal.key)
          ? "runtime_artifact_signal"
          : signal.key.startsWith("privacy.") ||
              signal.key.startsWith("commerce.") ||
              signal.key.startsWith("financial.") ||
              signal.key.startsWith("entity.") ||
              signal.key.startsWith("disclosure.") ||
              signal.key.startsWith("context.") ||
              signal.key.startsWith("accessibility.")
            ? "snapshot_signal"
            : null,
      source: "scanner",
      value: signal.value,
      valueType:
        signal.valueType === "number" || signal.valueType === "string_array" || signal.valueType === "text"
          ? signal.valueType
          : "boolean"
    };
  });
}

function mergeRelatedPreviewSnapshot(
  snapshot: Record<string, unknown> | null,
  relatedPreviewSnapshot: Record<string, unknown> | null
) {
  if (!snapshot) {
    return null;
  }

  if (!relatedPreviewSnapshot) {
    return snapshot;
  }

  const merged = { ...snapshot };
  const previewFallbackFields = [
    "tracking_before_consent_detected",
    "preconsent_tracking_detected",
    "third_party_cookie_set_before_consent",
    "cookie_banner_present",
    "reject_all_present",
    "granular_preferences_present",
    "consent_maturity_score",
    "tracker_regulatory_risk_score",
    "mentions_gdpr",
    "cross_border_transfer_mechanism_detected",
    "mentions_cross_border_transfer"
  ];

  for (const field of previewFallbackFields) {
    const currentValue = merged[field];
    const previewValue = relatedPreviewSnapshot[field];

    if ((currentValue === null || currentValue === undefined || currentValue === false || currentValue === 0) && previewValue !== null && previewValue !== undefined) {
      merged[field] = previewValue;
    }
  }

  return merged;
}

async function loadScanDetailRecord(input: {
  organizationId: string | null;
  scanId: string;
  allowAnonymousFallback?: boolean;
  anonymousOnly?: boolean;
  publicAccess?: boolean;
  includeUrlscanSupplement?: boolean;
  includeDomainBenchmark?: boolean;
  viewerEmail?: string | null;
}) {
  const scanCore = await loadScanCoreRecord(input).catch((error) => {
    if (error instanceof Error && error.message === "Scan not found.") {
      return null;
    }
    throw error;
  });

  if (!scanCore) {
    return null;
  }

  const { domainHostname: initialDomainHostname, previousScanId, scan, scanOrganizationId } = scanCore;
  const scanRow = scan;
  let domainHostname = initialDomainHostname;

  if (!domainHostname) {
    domainHostname = deriveHostnameFromScanConfig(scanRow.scan_config_json ?? null);
  }

  const {
    accessibilityRuleCounts,
    accessibilityRuleExamples,
    documentSources,
    events,
    macroEnrichment,
    modelPolicyReviewArtifact,
    pageEvidence,
    policyEnrichment,
    policyReviewQueue,
    preconsentViolations,
    runtimeArtifacts,
    signals,
    signalHits,
    snapshot,
    trackerVendors,
    validationRunId
  } = await loadScanDetailArtifacts(input.scanId);

  const validationFindingsPromise = validationRunId
    ? loadScanValidationFindingRows(input.scanId, validationRunId).then(async ({ findings: findingRows }) => {
      const validationFindings = findingRows.map((row) => {
      const verdictRows = Array.isArray(row.validation_verdicts)
        ? row.validation_verdicts
        : row.validation_verdicts
          ? [row.validation_verdicts]
          : [];
      const verdict = verdictRows[0];

      return {
        agreementScore: verdict?.agreement_score ?? null,
        category: row.category,
        description: row.description,
        evidence: row.evidence_json ?? null,
        findingFamily: row.finding_family,
        findingScope: row.finding_scope,
        findingSource: row.finding_source,
        findingSubject: row.finding_subject,
        id: row.id,
        model: verdict?.model ?? null,
        modelConfidence: verdict?.confidence ?? null,
        pageUrl: row.page_url,
        promptVersion: verdict?.prompt_version ?? null,
        rationale: verdict?.rationale ?? null,
        ruleKey: row.rule_key,
        severity: row.severity,
        subtype: row.subtype,
        systemConfidenceBand: verdict?.system_confidence_band ?? null,
        systemConfidenceExplanation: verdict?.system_confidence_explanation ?? null,
        systemConfidenceScore: verdict?.system_confidence_score ?? null,
        title: row.title,
        verdict: verdict?.verdict ?? null
      } satisfies ScanValidationFindingRecord;
    });

    const supplementalValidationFindings = await loadSupplementalValidationFindingsForScan({
      existingFindings: validationFindings.map((finding) => ({
        ruleKey: finding.ruleKey,
        title: finding.title
      })),
      scanId: input.scanId
    });

      return [...validationFindings, ...supplementalValidationFindings];
    })
    : Promise.resolve([] as ScanValidationFindingRecord[]);

  const comparisonArtifactsPromise = loadScanComparisonArtifacts({
    domainField: snapshot && typeof (snapshot as Record<string, unknown>).domain === "string" ? ((snapshot as Record<string, unknown>).domain as string) : null,
    previousScanId,
    scanId: input.scanId
  });
  const [
    validationFindings,
    { previousPolicyRows, previousSnapshot, previousTrackerRows, relatedPreviewSnapshot }
  ] = await Promise.all([validationFindingsPromise, comparisonArtifactsPromise]);
  const rawPolicyEnrichmentRows = ((policyEnrichment ?? []) as Array<Record<string, unknown>>).map((row) => stripTimestampFields(row));
  const policyEvidenceHashes = collectPolicyEvidenceHashes(rawPolicyEnrichmentRows);
  const policyEvidenceByHash = await loadPolicyEvidenceByHash(policyEvidenceHashes);
  const normalizedPolicyEnrichment = dereferencePolicyEvidenceSnippets({
    evidenceByHash: policyEvidenceByHash,
    rows: rawPolicyEnrichmentRows
  });
  const normalizedPolicyReviewQueue = ((policyReviewQueue ?? []) as Array<Record<string, unknown>>).map((row) => stripTimestampFields(row));
  const normalizedDocumentSources = ((documentSources ?? []) as Array<Record<string, unknown>>);
  const scannedHostname = snapshot && typeof (snapshot as Record<string, unknown>).domain === "string"
    ? ((snapshot as Record<string, unknown>).domain as string)
    : null;
  const displayPolicyEnrichment = shouldPreferNanoDocumentSources(normalizedDocumentSources, { scannedHostname })
    ? mergeNanoPolicyInputsWithFallback({
        documentSources: normalizedDocumentSources,
        fallbackRows: normalizedPolicyEnrichment,
        scannedHostname
      })
    : normalizedPolicyEnrichment;
  const primaryPolicyEnrichment = getPrimaryPolicyEnrichment(displayPolicyEnrichment);
  const previousPrimaryPolicyEnrichment = getPrimaryPolicyEnrichment((previousPolicyRows as Array<Record<string, unknown>>).map((row) => stripTimestampFields(row)));
  const rawNormalizedEvents: ScanEventRecord[] = ((events ?? []) as ScanEventRow[]).map(
    (event) =>
      ({
        id: event.id,
        eventType: event.event_type,
        message: event.message,
        metadataJson: event.metadata_json,
        createdAt: toIsoTimestamp(event.created_at)
      }) satisfies ScanEventRecord
  );
  const normalizedRelatedPreviewSnapshot = relatedPreviewSnapshot
    ? stripSnapshotRecord(relatedPreviewSnapshot as Record<string, unknown>)
    : null;
  const rawSignalRows = ((signals ?? []) as SignalRow[]);
  const scannerSignalRows = rawSignalRows.filter((signal) => !signal.population_source || signal.population_source === "scanner");
  const storedNanoSignalRows = rawSignalRows.filter((signal) => signal.population_source === "nano");
  const storedValidationSignalRows = rawSignalRows.filter((signal) => signal.population_source === "validation");
  const storedBrowserExtensionSignalRows = rawSignalRows.filter((signal) => signal.population_source === "browser_extension_bx01");
  const normalizedSignals = scannerSignalRows.map(
    (signal) => {
      const taxonomy = mapSignalKeyToTaxonomy({
        category: signal.category,
        key: signal.signal_key,
        label: signal.signal_label
      });

      return {
        category: signal.category,
        primaryCategory: taxonomy.primaryCategory,
        primaryCategoryDescription: getPrimaryCategoryDescription(taxonomy.primaryCategory),
        primaryCategoryLabel: getPrimaryCategoryLabel(taxonomy.primaryCategory),
        key: signal.signal_key,
        label: signal.signal_label,
        subcategory: taxonomy.subcategory ?? null,
        value: signal.signal_value_json,
        valueType: signal.value_type
      } satisfies ScanSignalRecord;
    }
  );
  const normalizedEvents: ScanEventRecord[] = repairFindingFamilyPacketEvents({
    events: rawNormalizedEvents,
    policyEnrichment: displayPolicyEnrichment
  });
  const displayState = deriveScanDisplayState(scanRow, normalizedEvents);
  const displayCreatedAt = deriveDisplayCreatedAt({
    completedAt: displayState.completedAt,
    createdAt: scanRow.created_at,
    startedAt: displayState.startedAt
  });
  const scanFromDisplay =
    scanRow.scan_type === "browser_extension"
      ? { label: "Reviewer Chrome browser", value: "local_extension" }
      : getScanFromDisplay(scanRow.scan_config_json);
  const scanObservedAt = displayState.completedAt ?? displayState.startedAt ?? scanRow.created_at;
  const supplementalCoverageSignals = deriveSupplementalCoverageSignals({
    events: normalizedEvents,
    existingSignals: normalizedSignals
  });
  const browserExtensionMaterialization =
    scanRow.scan_type === "browser_extension" && storedBrowserExtensionSignalRows.length > 0
      ? deriveBrowserScanCanonicalMaterializationFromStoredSignalRows(storedBrowserExtensionSignalRows)
      : null;
  const browserExtensionSnapshotOverrides: Record<string, unknown> = browserExtensionMaterialization
    ? {
        accept_all_present: browserExtensionMaterialization.acceptAllPresent,
        advertising_tracker_count: browserExtensionMaterialization.vendorCategoryCounts.advertising,
        analytics_tracker_count: browserExtensionMaterialization.vendorCategoryCounts.analytics,
        cookie_banner_present: browserExtensionMaterialization.cookieBannerPresent,
        cookie_count_total: browserExtensionMaterialization.cookieCountTotal,
        granular_preferences_present: browserExtensionMaterialization.granularPreferencesPresent,
        preconsent_tracking_detected: browserExtensionMaterialization.preconsentTrackingDetected,
        privacy_score: browserExtensionMaterialization.privacyScore,
        reject_all_present: browserExtensionMaterialization.rejectAllPresent,
        session_replay_tracker_count: browserExtensionMaterialization.sessionReplayTrackerCount,
        tag_manager_present: browserExtensionMaterialization.tagManagerPresent,
        third_party_script_domain_count: browserExtensionMaterialization.thirdPartyScriptDomainCount,
        tracker_count_total: browserExtensionMaterialization.trackerVendorCount,
        tracker_vendor_count: browserExtensionMaterialization.trackerVendorCount,
        tracking_before_consent_detected: browserExtensionMaterialization.preconsentTrackingDetected,
        certscore_overall: browserExtensionMaterialization.score
      }
    : {};
  const normalizedSnapshot = snapshot
    ? ({
        ...stripSnapshotRecord(snapshot as Record<string, unknown>),
        ...supplementalCoverageSignals.snapshotOverrides,
        ...browserExtensionSnapshotOverrides
      } satisfies Record<string, unknown>)
    : null;
  const previewPayload = input.includeUrlscanSupplement === false
    ? null
    : await getFullScanUrlscanSupplement({
        domainHostname,
        snapshot: normalizedSnapshot
      });
  const supplementalPolicySignals = normalizeSupplementalPolicySignals(deriveSupplementalPolicySignals({
    existingSignalKeys: normalizedSignals.map((signal) => signal.key),
    policyEnrichment: displayPolicyEnrichment,
    primaryPolicyEnrichment,
    snapshot: normalizedSnapshot
  }));
  const supplementalSnapshotSignals = deriveSupplementalSnapshotSignals({
    existingSignals: [...normalizedSignals, ...supplementalPolicySignals],
    events: normalizedEvents,
    primaryPolicyEnrichment,
    snapshot: normalizedSnapshot
  });
  const scannerSignalPopulations = buildScannerSignalPopulationRecords({
    observedAt: scanObservedAt,
    signalHits,
    signals: [
      ...normalizedSignals,
      ...supplementalSnapshotSignals,
      ...supplementalPolicySignals,
      ...supplementalCoverageSignals.supplementalSignals.map((signal) => {
        const taxonomy = mapSignalKeyToTaxonomy({
          category: "disclosure",
          key: signal.key,
          label: signal.label
        });

        return {
          category: "disclosure",
          primaryCategory: taxonomy.primaryCategory,
          primaryCategoryDescription: getPrimaryCategoryDescription(taxonomy.primaryCategory),
          primaryCategoryLabel: getPrimaryCategoryLabel(taxonomy.primaryCategory),
          key: signal.key,
          label: signal.label,
          subcategory: taxonomy.subcategory ?? null,
          value: signal.value,
          valueType: Array.isArray(signal.value) ? "string_array" : "boolean"
        } satisfies ScanSignalRecord;
      })
    ]
  });
  const regulatorySnapshot = mergeRelatedPreviewSnapshot(normalizedSnapshot, normalizedRelatedPreviewSnapshot);
  const regulatoryRisk = snapshot
    ? buildRegulatoryRiskAssessment({
        source: buildRegulatoryRiskSource({
          snapshot: regulatorySnapshot as Record<string, unknown>,
          runtimeArtifacts: runtimeArtifacts as Record<string, unknown> | null,
          hostname: domainHostname
        }),
        previousOverallScore: previousSnapshot
          ? buildRegulatoryRiskAssessment({
              source: buildRegulatoryRiskSource({
                snapshot: previousSnapshot as Record<string, unknown>
              })
            }).overallScore
          : null
      })
    : null;
  const persistedTrackerVendors = ((trackerVendors ?? []) as Array<Record<string, unknown>>).map(
    (tracker) =>
      ({
        vendorName: String(tracker.vendor_name),
        vendorCategory: String(tracker.vendor_category),
        detectionSource: String(tracker.detection_source),
        confidence: Number(tracker.confidence ?? 0),
        firstPartyOrThirdParty: String(tracker.first_party_or_third_party),
        collectionEndpointType: String(tracker.collection_endpoint_type ?? "unknown"),
        beforeConsent: typeof tracker.before_consent === "boolean" ? tracker.before_consent : null,
        scriptHost: normalizeTrackerScriptHostForDisplay(tracker.script_host),
        matchedSignatureId: (tracker.matched_signature_id as string | null) ?? null
      }) satisfies ScanTrackerVendorRecord
  );
  const runtimeDerivedTrackerVendors = getHybridDerivedTrackerVendors((runtimeArtifacts as Record<string, unknown> | null) ?? null).map(
    (tracker) =>
      ({
        beforeConsent: tracker.beforeConsent,
        collectionEndpointType: tracker.collectionEndpointType,
        confidence: tracker.confidence,
        detectionSource: tracker.detectionSource,
        firstPartyOrThirdParty: tracker.firstPartyOrThirdParty,
        matchedSignatureId: tracker.matchedSignatureId,
        scriptHost: normalizeTrackerScriptHostForDisplay(tracker.scriptHost),
        vendorCategory: tracker.vendorCategory,
        vendorName: tracker.vendorName
      }) satisfies ScanTrackerVendorRecord
  );
  const normalizedTrackerVendors = [
    ...new Map(
      [...persistedTrackerVendors, ...runtimeDerivedTrackerVendors].map((tracker) => [
        `${tracker.vendorName}|${tracker.detectionSource}|${tracker.scriptHost ?? ""}`,
        tracker
      ])
    ).values()
  ].sort(
    (left, right) =>
      left.vendorCategory.localeCompare(right.vendorCategory) ||
      left.vendorName.localeCompare(right.vendorName) ||
      (left.scriptHost ?? "").localeCompare(right.scriptHost ?? "")
  );
  const normalizedPreconsentViolations = ((preconsentViolations ?? []) as PreconsentViolationRow[]).map(
    (violation) =>
      ({
        collectionEndpointType: violation.collection_endpoint_type ?? "unknown",
        confidence: Number(violation.confidence ?? 0),
        detectionSource: violation.detection_source,
        evidenceUrls: violation.evidence_urls ?? [],
        firstPartyOrThirdParty: violation.first_party_or_third_party,
        matchedSignatureId: violation.matched_signature_id ?? null,
        scriptHost: violation.script_host ?? null,
        vendorCategory: violation.vendor_category,
        vendorName: violation.vendor_name
      }) satisfies PreconsentViolationRecord
  );
  const normalizedAccessibilityRuleCounts = ((accessibilityRuleCounts ?? []) as AccessibilityRuleCountRow[]).map(
    (rule) =>
      ({
        instanceCount: Number(rule.instance_count ?? 0),
        ruleCode: rule.rule_code,
        ruleGroup: rule.rule_group,
        severity: rule.severity
      }) satisfies AccessibilityRuleCountRecord
  );
  const normalizedAccessibilityRuleExamples = ((accessibilityRuleExamples ?? []) as AccessibilityRuleExampleRow[]).map(
    (example) =>
      ({
        description: example.description,
        help: example.help,
        helpUrl: example.help_url,
        impact: example.impact,
        nodeCount: Number(example.node_count ?? 0),
        pageUrl: example.page_url,
        representativeSelectors: example.representative_selectors ?? [],
        ruleCode: example.rule_code,
        ruleGroup: example.rule_group,
        severity: example.severity
      }) satisfies AccessibilityRuleExampleRecord
  );
  const previousTrackerVendorNames = new Set(
    (previousTrackerRows as Array<Record<string, unknown>>).map((tracker) => String(tracker.vendor_name))
  );
  const currentTrackerVendorNames = new Set(normalizedTrackerVendors.map((tracker) => tracker.vendorName));
  const previousPreconsentVendorMap = new Map(
    (previousTrackerRows as Array<Record<string, unknown>>)
      .filter((tracker) => tracker.before_consent === true)
      .map((tracker) => [
        String(tracker.vendor_name),
        {
          confidence: Number(tracker.confidence ?? 0),
          vendorCategory: String(tracker.vendor_category)
        }
      ])
  );
  const currentPreconsentVendorMap = new Map(
    normalizedTrackerVendors
      .filter((tracker) => tracker.beforeConsent === true)
      .map((tracker) => [
        tracker.vendorName,
        {
          confidence: tracker.confidence,
          vendorCategory: tracker.vendorCategory
        }
      ])
  );
  const trackerChanges: TrackerChangeRecord[] = [
    ...normalizedTrackerVendors
      .filter((tracker) => !previousTrackerVendorNames.has(tracker.vendorName))
      .map(
        (tracker) =>
          ({
            changeType: "added",
            confidence: tracker.confidence,
            previousScanId,
            vendorCategory: tracker.vendorCategory,
            vendorName: tracker.vendorName
          }) satisfies TrackerChangeRecord
      ),
    ...(previousTrackerRows as Array<Record<string, unknown>>)
      .filter((tracker) => !currentTrackerVendorNames.has(String(tracker.vendor_name)))
      .map(
        (tracker) =>
          ({
            changeType: "removed",
            confidence: Number(tracker.confidence ?? 0),
            previousScanId,
            vendorCategory: String(tracker.vendor_category),
            vendorName: String(tracker.vendor_name)
          }) satisfies TrackerChangeRecord
      )
  ].sort((left, right) => left.vendorName.localeCompare(right.vendorName));
  const preconsentChanges: PreconsentChangeRecord[] = [
    ...[...currentPreconsentVendorMap.entries()]
      .filter(([vendorName]) => !previousPreconsentVendorMap.has(vendorName))
      .map(
        ([vendorName, tracker]) =>
          ({
            changeType: "new",
            confidence: tracker.confidence,
            previousScanId,
            vendorCategory: tracker.vendorCategory,
            vendorName
          }) satisfies PreconsentChangeRecord
      ),
    ...[...previousPreconsentVendorMap.entries()]
      .filter(([vendorName]) => !currentPreconsentVendorMap.has(vendorName))
      .map(
        ([vendorName, tracker]) =>
          ({
            changeType: "resolved",
            confidence: tracker.confidence,
            previousScanId,
            vendorCategory: tracker.vendorCategory,
            vendorName
          }) satisfies PreconsentChangeRecord
      )
  ].sort((left, right) => left.vendorName.localeCompare(right.vendorName));

  const accessPostureClass =
    typeof normalizedSnapshot?.access_posture_class === "string"
      ? (normalizedSnapshot.access_posture_class as AccessPostureClass)
      : null;
  const rawHighestSuccessfulTier =
    typeof normalizedSnapshot?.highest_successful_tier === "string"
      ? (normalizedSnapshot.highest_successful_tier as ScanExecutionTier)
      : null;
  const rawStopTier =
    typeof normalizedSnapshot?.stop_tier === "string"
      ? (normalizedSnapshot.stop_tier as ScanExecutionTier)
      : null;
  const totalSignals =
    typeof normalizedSnapshot?.total_signals === "number"
      ? normalizedSnapshot.total_signals
      : null;
  const homepageFetchHttpStatus =
    typeof normalizedSnapshot?.homepage_fetch_http_status === "number"
      ? normalizedSnapshot.homepage_fetch_http_status
      : null;
  const homepageFetchStatus =
    typeof normalizedSnapshot?.homepage_fetch_status === "string"
      ? normalizedSnapshot.homepage_fetch_status
      : null;
  const recoverableFindingClasses = Array.isArray(normalizedSnapshot?.recoverable_finding_classes)
    ? normalizedSnapshot.recoverable_finding_classes.filter(
        (value): value is RecoverableFindingClass => typeof value === "string"
      )
    : [];
  const accessPostureSummary = normalizeAccessPostureSummary({
    accessPostureClass,
    highestSuccessfulTier: rawHighestSuccessfulTier,
    homepageFetchHttpStatus,
    homepageFetchStatus,
    pagesScanned: scanRow.pages_scanned,
    recoverableFindingClasses,
    stopTier: rawStopTier,
    totalSignals
  });
  const highestSuccessfulTier = accessPostureSummary.highestSuccessfulTier;
  const stopTier = accessPostureSummary.stopTier;
  const stopReason = normalizedSnapshot
    ? deriveScanStopReason({
        accessPostureClass,
        authWallDetected: normalizedSnapshot.auth_wall_detected === true,
        blockedFlag: normalizedSnapshot.blocked_flag === true,
        captchaFlag: normalizedSnapshot.captcha_flag === true,
        homepageFetchHttpStatus,
        homepageFetchStatus,
        normalizedBodyMissing: !normalizedSnapshot.normalized_body_hash,
        pagesScanned: scanRow.pages_scanned,
        robotsAllowed:
          normalizedSnapshot.robots_allowed === true
            ? true
            : normalizedSnapshot.robots_allowed === false
              ? false
              : null,
        robotsFetchHttpStatus:
          typeof normalizedSnapshot.robots_fetch_http_status === "number" ? normalizedSnapshot.robots_fetch_http_status : null,
        robotsFetchStatus:
          typeof normalizedSnapshot.robots_fetch_status === "string" ? normalizedSnapshot.robots_fetch_status : null,
        blockPageClassification:
          typeof normalizedSnapshot.block_page_classification === "string"
            ? (normalizedSnapshot.block_page_classification as BlockPageClassification)
            : null,
        blockVendorGuess:
          typeof normalizedSnapshot.block_vendor_guess === "string"
            ? (normalizedSnapshot.block_vendor_guess as BlockVendorGuess)
            : null,
        challengeSuspected: normalizedSnapshot.challenge_suspected === true,
        authWallSuspected: normalizedSnapshot.auth_wall_suspected === true,
        rateLimitSuspected: normalizedSnapshot.rate_limit_suspected === true,
        geoBlockSuspected: normalizedSnapshot.geo_block_suspected === true,
        fingerprintBlockSuspected: normalizedSnapshot.fingerprint_block_suspected === true
      })
    : null;
  const accessPosturePresentation = deriveAccessPosturePresentation({
    accessPostureClass: accessPostureSummary.accessPostureClass,
    highestSuccessfulTier,
    stopTier,
    totalSignals,
    pagesScanned: scanRow.pages_scanned,
    recoverableFindingClasses: accessPostureSummary.recoverableFindingClasses
  });
  const baseRuntimeArtifacts = runtimeArtifacts
    ? stripSnapshotRecord(runtimeArtifacts as Record<string, unknown>)
    : null;
  const snapshotBackedRuntimeArtifacts = normalizedSnapshot
    ? {
        ...(baseRuntimeArtifacts ?? {}),
        ...(baseRuntimeArtifacts?.scan_no_go_assessment ?? normalizedSnapshot.scan_no_go_assessment
          ? { scan_no_go_assessment: baseRuntimeArtifacts?.scan_no_go_assessment ?? normalizedSnapshot.scan_no_go_assessment }
          : {}),
        ...(baseRuntimeArtifacts?.visual_access_review ?? normalizedSnapshot.visual_access_review
          ? { visual_access_review: baseRuntimeArtifacts?.visual_access_review ?? normalizedSnapshot.visual_access_review }
          : {}),
        ...(baseRuntimeArtifacts?.visual_evidence_artifacts ?? normalizedSnapshot.visual_evidence_artifacts
          ? { visual_evidence_artifacts: baseRuntimeArtifacts?.visual_evidence_artifacts ?? normalizedSnapshot.visual_evidence_artifacts }
          : {})
      }
    : baseRuntimeArtifacts;
  const browserExtensionRuntimeArtifacts: Record<string, unknown> | null =
    browserExtensionMaterialization
      ? (() => {
          const existingHybrid =
            snapshotBackedRuntimeArtifacts?.hybrid_runtime_evidence &&
            typeof snapshotBackedRuntimeArtifacts.hybrid_runtime_evidence === "object" &&
            !Array.isArray(snapshotBackedRuntimeArtifacts.hybrid_runtime_evidence)
              ? (snapshotBackedRuntimeArtifacts.hybrid_runtime_evidence as Record<string, unknown>)
              : {};
          const mergedHybrid = {
            ...browserExtensionMaterialization.hybridRuntimeEvidencePatch,
            ...existingHybrid
          };
          const transportSecuritySummary =
            browserExtensionMaterialization.hybridRuntimeEvidencePatch.transportSecuritySummary;
          const mergedHybridRecord = mergedHybrid as Record<string, unknown>;
          const existingPolicySummary =
            recordValue(snapshotBackedRuntimeArtifacts?.policyDisclosureSummary) ??
            recordValue(snapshotBackedRuntimeArtifacts?.policy_disclosure_summary) ??
            recordValue(snapshotBackedRuntimeArtifacts?.policySurfaceSummary) ??
            recordValue(snapshotBackedRuntimeArtifacts?.policy_surface_summary);
          const extensionPolicySummary =
            recordValue(mergedHybridRecord.policySurfaceSummary) ??
            recordValue(mergedHybridRecord.policy_surface_summary);
          const policyDisclosureSummary = mergePolicyDisclosureSummaries(
            existingPolicySummary,
            extensionPolicySummary
          );

          return {
            ...(snapshotBackedRuntimeArtifacts ?? {}),
            consent_baseline_tracker_evidence_urls: browserExtensionMaterialization.preconsentTrackerEvidenceUrls,
            consent_baseline_tracker_vendor_names: browserExtensionMaterialization.preconsentTrackerVendors,
            consent_preconsent_violation_count: browserExtensionMaterialization.preconsentViolationCount,
            hybrid_runtime_evidence: {
              ...mergedHybrid,
              ...(policyDisclosureSummary
                ? {
                    policySurfaceSummary: policyDisclosureSummary,
                    policy_surface_summary: policyDisclosureSummary,
                  }
                : {}),
            },
            initial_cookie_count: browserExtensionMaterialization.cookieCountTotal,
            policy_disclosure_summary: policyDisclosureSummary,
            policyDisclosureSummary,
            third_party_request_count: browserExtensionMaterialization.thirdPartyRequestCount,
            third_party_request_domains: browserExtensionMaterialization.thirdPartyRequestDomains,
            transport_security_summary: transportSecuritySummary,
            transportSecuritySummary
          } satisfies Record<string, unknown>;
        })()
      : snapshotBackedRuntimeArtifacts;
  const normalizedRuntimeArtifacts = browserExtensionRuntimeArtifacts
    ? withHybridRuntimeArtifactFallbacks(browserExtensionRuntimeArtifacts) ?? browserExtensionRuntimeArtifacts
    : null;
  const parsedModelPolicyReview =
    policyModelReviewArtifactSchema.safeParse(modelPolicyReviewArtifact);
  const productionModelPolicyReview =
    parsedModelPolicyReview.success &&
    parsedModelPolicyReview.data.mode === "enforced" &&
    parsedModelPolicyReview.data.status === "completed" &&
    parsedModelPolicyReview.data.productionEligible &&
    parsedModelPolicyReview.data.provenance.usedForProductionProjection
      ? parsedModelPolicyReview.data
      : null;
  const modelReviewBackedRuntimeArtifacts = productionModelPolicyReview
    ? {
        ...(normalizedRuntimeArtifacts ?? {}),
        policy_model_review_artifact: productionModelPolicyReview,
        policyModelReviewArtifact: productionModelPolicyReview
      }
    : normalizedRuntimeArtifacts;
  const runtimeVendorDisclosureEvidence = deriveRuntimeVendorDisclosureEvidenceFromRetainedSources({
    documentSources: normalizedDocumentSources,
    runtimeArtifacts: modelReviewBackedRuntimeArtifacts,
    trackerVendors: normalizedTrackerVendors
  });
  const vendorDisclosureRuntimeArtifacts =
    modelReviewBackedRuntimeArtifacts && runtimeVendorDisclosureEvidence.length > 0
      ? {
          ...modelReviewBackedRuntimeArtifacts,
          runtime_vendor_disclosure_evidence: runtimeVendorDisclosureEvidence,
          runtimeVendorDisclosureEvidence: runtimeVendorDisclosureEvidence
        }
      : modelReviewBackedRuntimeArtifacts;
  const reportRuntimeArtifacts = withPersistedFirstLayerConsentEvidence(
    vendorDisclosureRuntimeArtifacts,
    normalizedSnapshot
  );
  const hybridRuntimeSignalPopulations = getHybridNanoSignalPopulations(reportRuntimeArtifacts).map((signal) => ({
    ...signal,
    observedAt: signal.observedAt ?? scanObservedAt,
    source: "scanner" as const
  }));
  const unmanagedStoredNanoSignalRows = storedNanoSignalRows.filter(
    (row) => !MANAGED_NANO_POLICY_SIGNAL_KEYS.has(row.signal_key)
  );
  const managedNanoPolicySignalPopulations = buildManagedNanoSignalPopulationRecords({
    observedAt: scanObservedAt,
    rows: buildNanoPolicySignalRows({
      policyEnrichments: displayPolicyEnrichment,
      policyReviewQueue: normalizedPolicyReviewQueue,
      runtimeArtifacts: reportRuntimeArtifacts,
      snapshot: normalizedSnapshot
    })
  });
  const mergedSignals = buildMergedSignalRecords({
    browserExtensionSignals: buildStoredSignalPopulationRecords({
      observedAt: scanObservedAt,
      rows: storedBrowserExtensionSignalRows,
      source: "browser_extension_bx01"
    }),
    nanoSignals: [
      ...buildStoredSignalPopulationRecords({
        observedAt: scanObservedAt,
        rows: unmanagedStoredNanoSignalRows,
        source: "nano"
      }),
      ...managedNanoPolicySignalPopulations
    ],
    scannerSignals: [
      ...scannerSignalPopulations,
      ...hybridRuntimeSignalPopulations
    ],
    validationSignals: buildStoredSignalPopulationRecords({
      observedAt: scanObservedAt,
      rows: storedValidationSignalRows,
      source: "validation"
    })
  });
  const latestUnifiedFindingsCompletedEvent = [...normalizedEvents]
    .reverse()
    .find((event) => event.eventType === SCAN_EVENT_TYPES.unifiedFindingsDerivedCompleted);
  const latestNanoDocRetrievalCompletedEvent = [...normalizedEvents]
    .reverse()
    .find((event) => event.eventType === SCAN_EVENT_TYPES.nanoDocRetrievalCompleted);
  const workflowDocumentSourceCount =
    typeof (latestNanoDocRetrievalCompletedEvent?.metadataJson as { documentSourceCount?: unknown } | undefined)?.documentSourceCount === "number" &&
    Number.isFinite((latestNanoDocRetrievalCompletedEvent?.metadataJson as { documentSourceCount?: number } | undefined)?.documentSourceCount)
      ? (latestNanoDocRetrievalCompletedEvent?.metadataJson as { documentSourceCount: number }).documentSourceCount
      : undefined;
  const workflowFindingCount =
    validationFindings.length > 0
      ? validationFindings.length
      : typeof (latestUnifiedFindingsCompletedEvent?.metadataJson as { findingCount?: unknown } | undefined)?.findingCount === "number" &&
          Number.isFinite((latestUnifiedFindingsCompletedEvent?.metadataJson as { findingCount?: number } | undefined)?.findingCount)
        ? (latestUnifiedFindingsCompletedEvent?.metadataJson as { findingCount: number }).findingCount
        : 0;
  const reusedExtractionCount = normalizedDocumentSources.filter((row) => {
    const metadata = row.metadata_json;
    return Boolean(
      metadata &&
      typeof metadata === "object" &&
      !Array.isArray(metadata) &&
      typeof (metadata as Record<string, unknown>).extraction_reuse_reason === "string"
    );
  }).length;
  const skippedExtractionReasons = Object.fromEntries(
    normalizedDocumentSources
      .flatMap((row) => {
        const extractionStatus = row.extraction_status;
        const metadata = row.metadata_json;
        const reason =
          typeof extractionStatus === "string" &&
          extractionStatus === "insufficient" &&
          metadata &&
          typeof metadata === "object" &&
          !Array.isArray(metadata) &&
          typeof (metadata as Record<string, unknown>).extraction_skip_reason === "string"
            ? (metadata as Record<string, unknown>).extraction_skip_reason
            : null;

        return typeof reason === "string" ? [reason] : [];
      })
      .reduce((counts, reason) => {
        counts.set(reason, (counts.get(reason) ?? 0) + 1);
        return counts;
      }, new Map<string, number>())
      .entries()
  );
  const skippedExtractionCount = Object.values(skippedExtractionReasons).reduce((sum, count) => sum + count, 0);
  const freshExtractionCount = Math.max(
    0,
    normalizedDocumentSources.filter((row) => {
      const extractionStatus = row.extraction_status;
      return typeof extractionStatus === "string" && extractionStatus === "ready";
    }).length - reusedExtractionCount
  );
  const signalEnrichmentWorkflow = deriveSignalEnrichmentWorkflowState({
    documentSourceCount: workflowDocumentSourceCount,
    events: normalizedEvents.map((event) => ({
      createdAt: event.createdAt,
      eventType: event.eventType
    })),
    freshExtractionCount,
    findingsCount: workflowFindingCount,
    mergedSignalCount: mergedSignals.length,
    nanoSignalCount: storedNanoSignalRows.length,
    policyDocumentCount: normalizedPolicyEnrichment.length,
    reusedExtractionCount,
    skippedExtractionCount,
    skippedExtractionReasons,
    scanCompletedAt: displayState.completedAt,
    scanStatus: displayState.status,
    scannerSignalCount: scannerSignalPopulations.length + hybridRuntimeSignalPopulations.length
  });
  const domainBenchmark = input.includeDomainBenchmark === false
    ? null
    : await resolveDomainBenchmarkEstimate({
        currentEvents: normalizedEvents,
        domainHostname,
        domainId: scanRow.domain_id,
        macroEnrichment: macroEnrichment as Record<string, unknown> | null,
        organizationId: scanOrganizationId,
        scanId: input.scanId
      });
  const [legacyScoreAssessmentMap, candidateScoreAssessmentMap] = await Promise.all([
    loadLatestVersionedScoreAssessments({
      scanIds: [input.scanId],
      scoreKind: "gdpr_eprivacy_evidence"
    }),
    loadLatestVersionedScoreAssessments({
      scanIds: [input.scanId],
      scoreKind: "gdpr_eprivacy_posture"
    })
  ]);
  const customerGdprEprivacyScoreSelection = selectConfiguredCustomerGdprEprivacyScore({
    candidateAssessment: candidateScoreAssessmentMap.get(input.scanId) ?? null,
    legacyAssessment: legacyScoreAssessmentMap.get(input.scanId) ?? null
  });

  return {
    customerGdprEprivacyScoreSelection,
    accessPostureSummary: {
      accessPostureClass: accessPostureSummary.accessPostureClass,
      highestSuccessfulTier,
      stopTier,
      recoverableFindingClasses: accessPostureSummary.recoverableFindingClasses,
      totalSignals,
      pagesScanned: scanRow.pages_scanned,
      homepageFetchHttpStatus,
      homepageFetchStatus,
      finalEffectiveUrl: typeof normalizedSnapshot?.final_effective_url === "string" ? normalizedSnapshot.final_effective_url : null,
      serverHeader: typeof normalizedSnapshot?.server_header === "string" ? normalizedSnapshot.server_header : null,
      blockVendorGuess:
        typeof normalizedSnapshot?.block_vendor_guess === "string"
          ? (normalizedSnapshot.block_vendor_guess as BlockVendorGuess)
          : null,
      blockPageClassification:
        typeof normalizedSnapshot?.block_page_classification === "string"
          ? (normalizedSnapshot.block_page_classification as BlockPageClassification)
          : null,
      cmpVendorName: typeof normalizedSnapshot?.cmp_vendor_name === "string" ? normalizedSnapshot.cmp_vendor_name : null,
      robotsAllowed:
        normalizedSnapshot?.robots_allowed === true ? true : normalizedSnapshot?.robots_allowed === false ? false : null,
      robotsFetchHttpStatus:
        typeof normalizedSnapshot?.robots_fetch_http_status === "number" ? normalizedSnapshot.robots_fetch_http_status : null,
      stopOutcomeTitle: stopReason?.outcomeTitle ?? null,
      stopReason: stopReason?.reason ?? null,
      stopReviewTitle: stopReason?.reviewTitle ?? null,
      whatThisMeans: stopReason?.whatThisMeans ?? [],
      verifiedPublicSurfacesCount: Array.isArray(normalizedSnapshot?.verified_public_surfaces)
        ? normalizedSnapshot.verified_public_surfaces.length
        : 0,
      interruptionLabel: accessPosturePresentation.label,
      interruptionReason: accessPosturePresentation.reason
    },
    scan: {
      id: scanRow.id,
      domainId: scanRow.domain_id,
      domainHostname,
      scanType: scanRow.scan_type,
      status: displayState.status,
      pagesRequested: scanRow.pages_requested,
      pagesScanned: scanRow.pages_scanned,
      scanConfigJson: scanRow.scan_config_json,
      scanFromLabel: scanFromDisplay.label,
      scanFromValue: scanFromDisplay.value,
      executionSummary: getScannerExecutionSummary(scanRow.scan_config_json),
      createdAt: displayCreatedAt,
      startedAt: displayState.startedAt,
      completedAt: displayState.completedAt,
      durationMs: scanRow.duration_ms,
      errorMessage: scanRow.error_message,
      provenance: buildScanExecutionProvenance({
        events: normalizedEvents,
        runtimeArtifacts: reportRuntimeArtifacts,
        scanConfig: scanRow.scan_config_json,
        scanFromLabel: scanFromDisplay.label,
        scanFromValue: scanFromDisplay.value
      })
    } satisfies ScanDetailRecord,
    snapshot: normalizedSnapshot ? (normalizedSnapshot satisfies Exclude<ScanSnapshotRecord, null>) : null,
    runtimeArtifacts: reportRuntimeArtifacts
      ? (reportRuntimeArtifacts satisfies Exclude<ScanRuntimeArtifactRecord, null>)
      : null,
    macroEnrichment:
      macroEnrichment
        ? (stripTimestampFields(macroEnrichment as Record<string, unknown>) satisfies Exclude<ScanMacroEnrichmentRecord, null>)
        : null,
    pageEvidence: pageEvidence as ScanPageEvidenceRecord[],
    preconsentViolations: normalizedPreconsentViolations,
    accessibilityRuleCounts: normalizedAccessibilityRuleCounts,
    accessibilityRuleExamples: normalizedAccessibilityRuleExamples,
    preconsentChanges,
    trackerChanges,
    trackerVendors: normalizedTrackerVendors,
    previousSnapshot: previousSnapshot ? (stripSnapshotRecord(previousSnapshot as Record<string, unknown>) satisfies Exclude<PreviousSnapshotRecord, null>) : null,
    relatedPreviewSnapshot: normalizedRelatedPreviewSnapshot
      ? (normalizedRelatedPreviewSnapshot satisfies Exclude<RelatedPreviewSnapshotRecord, null>)
      : null,
    policyEnrichment: displayPolicyEnrichment,
    primaryPolicyEnrichment,
    policyReviewQueue: normalizedPolicyReviewQueue,
    coverageMicrocards: hasCaptchaOrSecurityDocumentSource(normalizedDocumentSources)
      ? [{ label: "CAPTCHA/security page", tone: "amber" as const }]
      : [],
    signalHits: signalHits as ScanSignalHitRecord[],
    signalEnrichmentWorkflow,
    domainBenchmark,
    validationFindings,
    previewPayload,
    regulatoryRisk,
    agencyMappings: regulatorySnapshot
      ? buildAgencyMappings(buildAgencyMappingSource(regulatorySnapshot as Record<string, unknown>), regulatoryRisk)
      : ([] satisfies AgencyMapping[]),
    signals: [
      ...normalizedSignals,
      ...supplementalSnapshotSignals,
      ...supplementalPolicySignals,
      ...supplementalCoverageSignals.supplementalSignals.map((signal) => {
        const taxonomy = mapSignalKeyToTaxonomy({
          category: "disclosure",
          key: signal.key,
          label: signal.label
        });

        return {
          category: "disclosure",
          primaryCategory: taxonomy.primaryCategory,
          primaryCategoryDescription: getPrimaryCategoryDescription(taxonomy.primaryCategory),
          primaryCategoryLabel: getPrimaryCategoryLabel(taxonomy.primaryCategory),
          key: signal.key,
          label: signal.label,
          subcategory: taxonomy.subcategory ?? null,
          value: signal.value,
          valueType: Array.isArray(signal.value) ? "string_array" : "boolean"
        } satisfies ScanSignalRecord;
      })
    ],
    mergedSignals,
    events: normalizedEvents
  };
}

export async function getScanById(input: { organizationId: string; scanId: string; viewerEmail?: string | null }) {
  return loadScanDetailRecord({
    allowAnonymousFallback: false,
    includeUrlscanSupplement: false,
    organizationId: input.organizationId,
    scanId: input.scanId,
    viewerEmail: input.viewerEmail
  });
}

export async function getAnonymousScanById(scanId: string) {
  return loadScanDetailRecord({
    anonymousOnly: true,
    organizationId: null,
    scanId,
    viewerEmail: null
  });
}

export async function getPublicScanById(scanId: string) {
  return loadScanDetailRecord({
    includeUrlscanSupplement: false,
    organizationId: null,
    publicAccess: true,
    scanId
  });
}

export async function getPublicScanByIdForReadOnlyAnalysis(scanId: string) {
  return loadScanDetailRecord({
    includeDomainBenchmark: false,
    includeUrlscanSupplement: false,
    organizationId: null,
    publicAccess: true,
    scanId
  });
}

export type ScanDetailResponse = NonNullable<Awaited<ReturnType<typeof getAnonymousScanById>>>;

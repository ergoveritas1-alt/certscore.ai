import type {
  MergedSignalRecord,
  PopulatedSignalRecord,
  SignalPopulationSource,
  SignalPopulationStatus,
  SignalProvenanceRecord,
  ReportUnifiedFindingId
} from "@website-signal-risk-scanner/shared";
import { getReportUnifiedFindingForSignal, type ReportSignalSource } from "@website-signal-risk-scanner/shared";
import { shouldSurfacePrimarySignalFinding } from "./finding-evidence-gates";
import type { UnifiedFindingCandidate } from "./unified-findings";

const BOUNDED_DISCOVERY_SIGNAL_KEY = "disclosure.key_page_discovery_unresolved_after_bounded_search";
const BOUNDED_DISCOVERY_SIGNAL_LABEL = "Bounded key-page discovery unresolved";

const MAJOR_INSUFFICIENT_FINDING_IDS = new Set<ReportUnifiedFindingId>([
  "privacy_rights_path_present",
  "privacy_contact_path_present",
  "gpc_disclosure_present",
  "tracking_technologies_disclosure_present",
  "targeted_advertising_disclosure_present",
  "third_party_advertising_disclosure_present"
]);

type MergeableSignalInput = {
  confidence?: number | null;
  evidenceRefs?: string[];
  key: string;
  label: string;
  observedAt?: string | null;
  populationStatus?: SignalPopulationStatus;
  provenance?: SignalProvenanceRecord[];
  reportSignalSource?: ReportSignalSource | null;
  source: SignalPopulationSource;
  value: boolean | number | string | string[];
  valueType: "boolean" | "number" | "text" | "string_array";
};

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function normalizeConfidence(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null;
}

function normalizePopulation(input: MergeableSignalInput): PopulatedSignalRecord {
  return {
    confidence: normalizeConfidence(input.confidence),
    evidenceRefs: uniqueStrings(input.evidenceRefs ?? []),
    key: input.key,
    label: input.label,
    observedAt: typeof input.observedAt === "string" && input.observedAt.trim().length > 0 ? input.observedAt : null,
    populationStatus: input.populationStatus ?? "present",
    provenance: input.provenance ?? [],
    reportSignalSource: input.reportSignalSource ?? null,
    source: input.source,
    value: input.value,
    valueType: input.valueType
  };
}

function getSourcePriority(source: SignalPopulationSource) {
  switch (source) {
    case "scanner":
      return 3;
    case "nano":
      return 2;
    default:
      return 1;
  }
}

function getPopulationStatusPriority(status: SignalPopulationStatus) {
  switch (status) {
    case "present":
      return 4;
    case "conflicting":
      return 3;
    case "insufficient":
      return 2;
    default:
      return 1;
  }
}

function comparePopulationValue(left: PopulatedSignalRecord, right: PopulatedSignalRecord) {
  if (left.valueType !== right.valueType) {
    return false;
  }

  if (Array.isArray(left.value) || Array.isArray(right.value)) {
    const leftArray = Array.isArray(left.value) ? left.value : null;
    const rightArray = Array.isArray(right.value) ? right.value : null;
    if (!leftArray || !rightArray) {
      return false;
    }
    if (leftArray.length !== rightArray.length) {
      return false;
    }

    return leftArray.every((value, index) => value === rightArray[index]);
  }

  return left.value === right.value;
}

function getMergedSignalValue(mergedSignals: MergedSignalRecord[], key: string) {
  const signal = mergedSignals.find((entry) => entry.key === key);
  if (signal?.populationStatus !== "present") {
    return null;
  }
  return signal.selectedPopulation?.value ?? signal.value ?? null;
}

function getMergedSignalStringArray(mergedSignals: MergedSignalRecord[], key: string) {
  const value = getMergedSignalValue(mergedSignals, key);
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

function getMergedSignalNumber(mergedSignals: MergedSignalRecord[], key: string) {
  const value = getMergedSignalValue(mergedSignals, key);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildSiblingEvidenceForMergedSignal(signal: MergedSignalRecord, mergedSignals: MergedSignalRecord[]) {
  if (signal.key === "privacy.privacy_contact_path_present") {
    const privacyContactChannelType = getMergedSignalValue(mergedSignals, "privacyContactChannelType");
    return typeof privacyContactChannelType === "string" && privacyContactChannelType.trim().length > 0
      ? { privacyContactChannelType: privacyContactChannelType.trim() }
      : {};
  }

  if (signal.key === "privacy.cookie_runtime_disclosure_gap_detected") {
    const runtimeCookieNames = getMergedSignalStringArray(mergedSignals, "cookieRuntimeNames");
    const unmatchedCookieNames = getMergedSignalStringArray(mergedSignals, "cookieUnmatchedNames");
    const unmatchedCookieVendors = getMergedSignalStringArray(mergedSignals, "cookieUnmatchedVendors");
    const unmatchedCookieCategories = getMergedSignalStringArray(mergedSignals, "cookieUnmatchedCategories");
    const disclosedCookieNames = getMergedSignalStringArray(mergedSignals, "cookieDisclosedNames");
    const disclosedCookieProviders = getMergedSignalStringArray(mergedSignals, "cookieDisclosedProviders");
    const unmatchedCookieCount = getMergedSignalNumber(mergedSignals, "cookieUnmatchedCount") ?? unmatchedCookieNames.length;
    const unmatchedThirdPartyCookieCount =
      getMergedSignalNumber(mergedSignals, "cookieUnmatchedThirdPartyCount") ?? unmatchedCookieCount;
    return {
      disclosedCookieNames,
      disclosedCookieProviders,
      runtimeCookieNames,
      unmatchedCookieCategories,
      unmatchedCookieCount,
      unmatchedCookieNames,
      unmatchedCookieVendors,
      unmatchedThirdPartyCookieCount
    };
  }

  return {};
}

function selectPopulation(populations: PopulatedSignalRecord[]) {
  return [...populations].sort((left, right) => {
    const statusDelta = getPopulationStatusPriority(right.populationStatus) - getPopulationStatusPriority(left.populationStatus);
    if (statusDelta !== 0) {
      return statusDelta;
    }

    const sourceDelta = getSourcePriority(right.source) - getSourcePriority(left.source);
    if (sourceDelta !== 0) {
      return sourceDelta;
    }

    const confidenceDelta = (right.confidence ?? 0) - (left.confidence ?? 0);
    if (confidenceDelta !== 0) {
      return confidenceDelta;
    }

    return (right.observedAt ?? "").localeCompare(left.observedAt ?? "");
  })[0] ?? null;
}

export function buildMergedSignalRecords(input: {
  nanoSignals?: MergeableSignalInput[];
  scannerSignals?: MergeableSignalInput[];
  validationSignals?: MergeableSignalInput[];
}) {
  const grouped = new Map<string, PopulatedSignalRecord[]>();
  const rows = [
    ...(input.scannerSignals ?? []),
    ...(input.nanoSignals ?? []),
    ...(input.validationSignals ?? [])
  ].map(normalizePopulation);

  for (const row of rows) {
    const existing = grouped.get(row.key) ?? [];
    existing.push(row);
    grouped.set(row.key, existing);
  }

  const merged: MergedSignalRecord[] = [];

  for (const [key, populations] of grouped.entries()) {
    const selectedPopulation = selectPopulation(populations);
    const presentPopulations = populations.filter((row) => row.populationStatus === "present");
    const conflicting =
      presentPopulations.length > 1 &&
      presentPopulations.some((row) => !comparePopulationValue(row, presentPopulations[0] ?? row));

    let populationStatus: SignalPopulationStatus = "missing";
    if (conflicting) {
      populationStatus = "conflicting";
    } else if (presentPopulations.length > 0) {
      populationStatus = "present";
    } else if (populations.some((row) => row.populationStatus === "insufficient")) {
      populationStatus = "insufficient";
    }

    merged.push({
      confidence: selectedPopulation?.confidence ?? null,
      evidenceRefs: uniqueStrings(populations.flatMap((row) => row.evidenceRefs)),
      key,
      label: selectedPopulation?.label ?? populations[0]?.label ?? key,
      observedAt: selectedPopulation?.observedAt ?? null,
      populationStatus,
      populations: [...populations].sort((left, right) => {
        const sourceDelta = getSourcePriority(right.source) - getSourcePriority(left.source);
        if (sourceDelta !== 0) {
          return sourceDelta;
        }
        return (right.confidence ?? 0) - (left.confidence ?? 0);
      }),
      reportSignalSource: selectedPopulation?.reportSignalSource ?? null,
      selectedPopulation,
      value: selectedPopulation?.value ?? null,
      valueType: selectedPopulation?.valueType ?? null
    });
  }

  return merged.sort((left, right) => left.key.localeCompare(right.key));
}

export function buildReviewFindingCandidatesFromMergedSignals(input: {
  linkedValidationEvidenceBySignalKey?: Map<string, Record<string, unknown> | null | undefined>;
  mergedSignals: MergedSignalRecord[];
}) {
  const candidates: UnifiedFindingCandidate[] = [];
  const emittedInsufficientFindingIds = new Set<string>();

  for (const signal of input.mergedSignals) {
    if (signal.populationStatus === "insufficient" && signal.reportSignalSource) {
      const mappedFinding = getReportUnifiedFindingForSignal(signal.reportSignalSource, signal.key);
      if (mappedFinding && MAJOR_INSUFFICIENT_FINDING_IDS.has(mappedFinding.id) && !emittedInsufficientFindingIds.has(mappedFinding.id)) {
        emittedInsufficientFindingIds.add(mappedFinding.id);
        candidates.push({
          description: `${mappedFinding.label} could not be verified from retained scan evidence.`,
          fallbackEvidence: {
            evidenceRefs: signal.evidenceRefs,
            inferredTargetFindingId: mappedFinding.id,
            inferredTargetFindingLabel: mappedFinding.label,
            keyPageDiscoverySource: "merged_signal_insufficient",
            keyPageGuessedOnly: false,
            mergedSignalConfidence: signal.confidence,
            mergedSignalObservedAt: signal.observedAt,
            mergedSignalPopulationStatus: signal.populationStatus,
            mergedSignalSources: signal.populations.map((row) => row.source),
            provenance: signal.selectedPopulation?.provenance ?? [],
            selectedSignalSource: signal.selectedPopulation?.source ?? null,
            signalKey: BOUNDED_DISCOVERY_SIGNAL_KEY,
            signalLabel: BOUNDED_DISCOVERY_SIGNAL_LABEL,
            signalValue: true,
            sourceUrls: signal.evidenceRefs
          } satisfies Record<string, unknown>,
          observedValue: mappedFinding.label,
          severity: "medium",
          signalKey: BOUNDED_DISCOVERY_SIGNAL_KEY,
          signalLabel: BOUNDED_DISCOVERY_SIGNAL_LABEL,
          signalSource: "snapshot_signal",
          sourceType: "signal",
          title: `${mappedFinding.label} unverified`
        });
      }
      continue;
    }

    if (signal.populationStatus !== "present" || !signal.selectedPopulation || !signal.reportSignalSource) {
      continue;
    }

    const siblingEvidence = buildSiblingEvidenceForMergedSignal(signal, input.mergedSignals);
    const fallbackEvidence = {
      evidenceRefs: signal.evidenceRefs,
      mergedSignalConfidence: signal.confidence,
      mergedSignalObservedAt: signal.observedAt,
      mergedSignalPopulationStatus: signal.populationStatus,
      mergedSignalSources: signal.populations.map((row) => row.source),
      provenance: signal.selectedPopulation.provenance,
      selectedSignalSource: signal.selectedPopulation.source,
      signalKey: signal.key,
      signalLabel: signal.label,
      signalValue: signal.value,
      ...siblingEvidence
    } satisfies Record<string, unknown>;

    const linkedValidationEvidence = input.linkedValidationEvidenceBySignalKey?.get(signal.key) ?? null;
    if (
      !shouldSurfacePrimarySignalFinding({
        fallbackEvidence,
        key: signal.key,
        linkedValidationEvidence,
        signalSource: signal.reportSignalSource
      })
    ) {
      continue;
    }

    candidates.push({
      description: signal.label,
      fallbackEvidence,
      observedValue:
        typeof signal.value === "string" ? signal.value : typeof signal.value === "number" ? String(signal.value) : null,
      severity: "medium",
      signalKey: signal.key,
      signalLabel: signal.label,
      signalSource: signal.reportSignalSource,
      sourceType: "signal",
      title: signal.label
    });
  }

  return candidates;
}

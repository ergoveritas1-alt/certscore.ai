import type { ReportSignalSource } from "../taxonomy/report-pillars";

export type SignalPopulationSource = "scanner" | "nano" | "validation";

export type SignalPopulationStatus = "present" | "missing" | "conflicting" | "insufficient";

export type SignalProvenanceRecord = {
  detail: string;
  kind: "document" | "runtime" | "signal" | "validation";
};

export type PopulatedSignalRecord = {
  confidence: number | null;
  evidenceRefs: string[];
  key: string;
  label: string;
  observedAt: string | null;
  populationStatus: SignalPopulationStatus;
  provenance: SignalProvenanceRecord[];
  reportSignalSource: ReportSignalSource | null;
  source: SignalPopulationSource;
  value: boolean | number | string | string[];
  valueType: "boolean" | "number" | "text" | "string_array";
};

export type MergedSignalRecord = {
  confidence: number | null;
  evidenceRefs: string[];
  key: string;
  label: string;
  observedAt: string | null;
  populationStatus: SignalPopulationStatus;
  populations: PopulatedSignalRecord[];
  reportSignalSource: ReportSignalSource | null;
  selectedPopulation: PopulatedSignalRecord | null;
  value: boolean | number | string | string[] | null;
  valueType: "boolean" | "number" | "text" | "string_array" | null;
};

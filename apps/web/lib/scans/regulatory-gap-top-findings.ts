import type { CertScoreFinding } from "./finding-registry";

export type RegulatoryGapTopFindingRow = {
  assessmentStatus?: string;
  evidenceRefs?: string[];
  explanation?: string;
  id: string;
  label: string;
  note?: string;
  regulatoryMapping?: string[];
  status?: string;
  statusLabel?: string;
};

export type RegulatoryGapTopFindingArea = {
  id: string;
  navLabel?: string;
  rows: RegulatoryGapTopFindingRow[];
  title: string;
};

export type RegulatoryGapTopFindingInput = {
  californiaPrivacyArea?: RegulatoryGapTopFindingArea | null;
  gdprEprivacyArea?: RegulatoryGapTopFindingArea | null;
};

type RegulatoryGapAreaConfig = {
  idPrefix: string;
  labelPrefix: string;
  lawLabel: string;
  priorityBase: number;
};

const GDPR_CONFIG: RegulatoryGapAreaConfig = {
  idPrefix: "gdpr_eprivacy",
  labelPrefix: "GDPR/ePrivacy",
  lawLabel: "GDPR/ePrivacy",
  priorityBase: 140
};

const CALIFORNIA_CONFIG: RegulatoryGapAreaConfig = {
  idPrefix: "california_ccpa_cpra",
  labelPrefix: "CCPA/CPRA",
  lawLabel: "CCPA/CPRA",
  priorityBase: 150
};

export function buildRegulatoryGapTopFindings(input: RegulatoryGapTopFindingInput): CertScoreFinding[] {
  return [
    ...findingsForArea(input.californiaPrivacyArea, CALIFORNIA_CONFIG),
    ...findingsForArea(input.gdprEprivacyArea, GDPR_CONFIG)
  ];
}

function findingsForArea(
  area: RegulatoryGapTopFindingArea | null | undefined,
  config: RegulatoryGapAreaConfig
): CertScoreFinding[] {
  if (!area) {
    return [];
  }

  return area.rows
    .filter((row) => row.assessmentStatus === "gap_observed")
    .map((row, index): CertScoreFinding => {
      const statusLabel = row.statusLabel ?? humanizeStatus(row.status ?? "gap_observed");
      const label = `${config.labelPrefix} gap observed: ${row.label}`;
      return {
        id: `regulatory_gap__${config.idPrefix}__${safeId(row.id)}`,
        label,
        section: "Privacy & Tracking",
        defaultSurfacePriority: config.priorityBase - index,
        whyItMatters:
          `${config.lawLabel} coverage projected this row as gap observed from retained checklist evidence. This is a high-priority review signal, not a legal conclusion.`,
        remediation:
          "Review the retained checklist evidence, confirm whether the row is applicable to the site, and address the underlying implementation or disclosure gap if confirmed.",
        confidence: "good",
        directVsInferred: "mixed",
        evidenceDetails: {
          policyEvidenceDetails: {
            assessmentStatus: row.assessmentStatus,
            evidenceRefs: row.evidenceRefs ?? [],
            explanation: row.explanation ?? null,
            regulatoryAreaId: area.id,
            regulatoryAreaTitle: area.title,
            regulatoryMapping: row.regulatoryMapping ?? [],
            rowId: row.id,
            rowLabel: row.label,
            rowNote: row.note ?? null,
            status: row.status ?? row.statusLabel ?? "gap_observed"
          }
        },
        evidencePreview: [
          `${area.title}: ${row.label}`,
          row.note ?? row.explanation ?? `${config.lawLabel} checklist row projected as ${statusLabel}.`
        ],
        evidenceRefs: row.evidenceRefs ?? [],
        severity: "high",
        shortSummary: `${config.lawLabel} checklist gap observed: ${row.label}.`
      };
    });
}

function safeId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "row";
}

function humanizeStatus(value: string) {
  return value.replace(/_/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

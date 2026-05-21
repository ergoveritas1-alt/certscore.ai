import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { isExecutiveSummaryTopFindingId } from "../lib/scans/rank-findings";

type JsonObject = Record<string, unknown>;

type ReviewIndexRow = JsonObject & {
  accessPostureClass?: unknown;
  domain?: unknown;
  evidenceDetailBlockCount?: unknown;
  manifestRow?: unknown;
  normalizedUrl?: unknown;
  pagesScanned?: unknown;
  projectedTopFindingCount?: unknown;
  publicUrls?: unknown;
  scanId?: unknown;
  scanOutcome?: unknown;
  scanStatus?: unknown;
  trancoRank?: unknown;
};

type ReviewEvidenceRow = JsonObject & {
  accessPostureClass?: unknown;
  domain?: unknown;
  normalizedUrl?: unknown;
  pagesScanned?: unknown;
  projectedTopFindings?: unknown;
  projectedTopFindingCount?: unknown;
  publicUrls?: unknown;
  reportFacingEvidence?: unknown;
  scanId?: unknown;
  scanOutcome?: unknown;
  scanStatus?: unknown;
};

type ReviewIndexPayload = JsonObject & {
  rows?: unknown;
  summary?: JsonObject;
};

export type TrancoReviewExportAuditSummary = {
  completedScansWithJsonlPacketEvidence: number;
  completedScansMissingJsonlPacketEvidence: number;
  completedScansWithJsonlLine: number;
  projectedScansWithFullFindingIds: number;
  projectedFindingCountDisagreements: number;
  top25ScansByProjectedTopFindingCount: Array<{
    domain: string | null;
    normalizedUrl: string | null;
    scanId: string | null;
    scanStatus: string | null;
    projectedTopFindingCount: number;
    evidenceDetailBlockCount: number;
  }>;
};

export type TrancoReviewExportValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  reviewerAuditSummary: TrancoReviewExportAuditSummary;
};

const REQUIRED_COMPLETED_MATCH_FIELDS = [
  "domain",
  "normalizedUrl",
  "scanId",
  "scanStatus",
  "pagesScanned",
  "scanOutcome",
  "accessPostureClass",
  "publicUrls"
] as const;

const SENSITIVE_SURFACE_FINDING_ID = "sensitive_data_collection_with_third_party_tracking_present";

function asRecord(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function asRows(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.flatMap((row) => {
    const record = asRecord(row);
    return record ? [record] : [];
  }) : [];
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as JsonObject)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function evidenceDetailsFromRow(row: ReviewEvidenceRow): JsonObject[] {
  const reportFacingEvidence = asRecord(row.reportFacingEvidence);
  return [
    ...asRows(reportFacingEvidence?.evidenceDetails),
    ...asRows(reportFacingEvidence?.detailedReviewJsonBlocks)
  ];
}

function packetBlocksFromRow(row: ReviewEvidenceRow): JsonObject[] {
  const reportFacingEvidence = asRecord(row.reportFacingEvidence);
  return [
    ...asRows(reportFacingEvidence?.projectedTopFindingEvidenceBlocks),
    ...asRows(reportFacingEvidence?.topFindingUniverseReferencedBlocks),
    ...evidenceDetailsFromRow(row).flatMap((block) => {
      if (block.ok === true) {
        const json = asRecord(block.json);
        return json ? [json] : [];
      }
      return "id" in block ? [block] : [];
    })
  ];
}

function projectedFindingIds(row: ReviewEvidenceRow): string[] {
  return asRows(row.projectedTopFindings)
    .map((finding) => getString(finding.id))
    .filter((id): id is string => Boolean(id));
}

function isPlaceholderEvidenceRow(row: ReviewEvidenceRow) {
  const reportFacingEvidence = asRecord(row.reportFacingEvidence);
  return (
    !getString(row.scanId) &&
    getNumber(row.projectedTopFindingCount) === 0 &&
    (!reportFacingEvidence || Object.values(reportFacingEvidence).every((value) => {
      if (Array.isArray(value)) {
        return value.length === 0;
      }
      return value === null || value === undefined || value === "";
    }))
  );
}

function hasSensitiveSurfaceStructuredEvidence(block: JsonObject) {
  const details = asRecord(block.evidenceDetails);
  const sensitive = asRecord(details?.sensitiveDataEvidence);
  return (
    typeof sensitive?.samePageOrFlowLinked === "boolean" &&
    Array.isArray(sensitive.fieldTypes) &&
    Array.isArray(sensitive.thirdPartyDomains) &&
    sensitive.rawValuesRetained === false &&
    typeof sensitive.payloadExposureObserved === "boolean" &&
    getString(sensitive.evidenceBasisType) !== null &&
    getString(sensitive.sameFlowBasis) !== null
  );
}

function buildReviewerAuditSummary(indexRows: ReviewIndexRow[], evidenceRowsByScanId: Map<string, ReviewEvidenceRow>) {
  const completedRows = indexRows.filter((row) => row.scanStatus === "completed");
  const completedScansMissingJsonlPacketEvidence = completedRows.filter((row) => {
    const scanId = getString(row.scanId);
    return !scanId || !evidenceRowsByScanId.has(scanId);
  });
  const projectedCountDisagreements = indexRows.filter((row) => {
    const scanId = getString(row.scanId);
    if (!scanId) {
      return false;
    }
    const evidenceRow = evidenceRowsByScanId.get(scanId);
    return Boolean(evidenceRow && getNumber(row.projectedTopFindingCount) !== projectedFindingIds(evidenceRow).length);
  });

  return {
    completedScansWithJsonlLine: completedRows.filter((row) => {
      const scanId = getString(row.scanId);
      return Boolean(scanId && evidenceRowsByScanId.has(scanId));
    }).length,
    completedScansWithJsonlPacketEvidence: completedRows.filter((row) => {
      const scanId = getString(row.scanId);
      const evidenceRow = scanId ? evidenceRowsByScanId.get(scanId) : null;
      return Boolean(evidenceRow && packetBlocksFromRow(evidenceRow).length > 0);
    }).length,
    completedScansMissingJsonlPacketEvidence: completedScansMissingJsonlPacketEvidence.length,
    projectedScansWithFullFindingIds: indexRows.filter((row) => {
      if (getNumber(row.projectedTopFindingCount) <= 0) {
        return false;
      }
      const scanId = getString(row.scanId);
      const evidenceRow = scanId ? evidenceRowsByScanId.get(scanId) : null;
      return Boolean(evidenceRow && projectedFindingIds(evidenceRow).length === getNumber(row.projectedTopFindingCount));
    }).length,
    projectedFindingCountDisagreements: projectedCountDisagreements.length,
    top25ScansByProjectedTopFindingCount: indexRows
      .filter((row) => getString(row.scanId))
      .slice()
      .sort((left, right) => getNumber(right.projectedTopFindingCount) - getNumber(left.projectedTopFindingCount))
      .slice(0, 25)
      .map((row) => ({
        domain: getString(row.domain),
        evidenceDetailBlockCount: getNumber(row.evidenceDetailBlockCount),
        normalizedUrl: getString(row.normalizedUrl),
        projectedTopFindingCount: getNumber(row.projectedTopFindingCount),
        scanId: getString(row.scanId),
        scanStatus: getString(row.scanStatus)
      }))
  } satisfies TrancoReviewExportAuditSummary;
}

export function validateTrancoReviewExport(input: {
  allowEmpty?: boolean;
  evidenceRows: ReviewEvidenceRow[];
  index: ReviewIndexPayload;
}): TrancoReviewExportValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const indexRows = asRows(input.index.rows) as ReviewIndexRow[];
  const selectedCount = getNumber(input.index.summary?.selectedCount);
  const targetsWithLatestScan = getNumber(input.index.summary?.targetsWithLatestScan);
  const evidenceRowsByScanId = new Map<string, ReviewEvidenceRow>();

  for (const row of input.evidenceRows) {
    const scanId = getString(row.scanId);
    if (scanId && !evidenceRowsByScanId.has(scanId)) {
      evidenceRowsByScanId.set(scanId, row);
    }
  }

  if (selectedCount > 0 && targetsWithLatestScan === 0 && input.allowEmpty !== true) {
    errors.push("selectedCount is non-zero but targetsWithLatestScan is zero; pass --allow-empty only for an intentional non-reviewable export.");
  }

  if (targetsWithLatestScan > 0 && input.evidenceRows.every(isPlaceholderEvidenceRow)) {
    errors.push("Index reports latest scans, but JSONL contains placeholder-only rows.");
  }

  for (const row of indexRows) {
    const scanId = getString(row.scanId);
    const label = `${getString(row.domain) ?? "unknown"}:${scanId ?? "missing-scan-id"}`;
    if (row.scanStatus === "completed") {
      if (!getString(row.domain)) {
        errors.push(`Completed scan row is missing top-level domain: ${label}.`);
      }
      if (!scanId) {
        errors.push(`Completed scan row is missing scanId: ${label}.`);
        continue;
      }
      const evidenceRow = evidenceRowsByScanId.get(scanId);
      if (!evidenceRow) {
        errors.push(`Completed scan row has no matching JSONL line by scanId: ${label}.`);
        continue;
      }
      for (const field of REQUIRED_COMPLETED_MATCH_FIELDS) {
        if (stableStringify(row[field]) !== stableStringify(evidenceRow[field])) {
          errors.push(`Index/JSONL ${field} mismatch for ${label}.`);
        }
      }
      if (getNumber(row.projectedTopFindingCount) > 0) {
        const ids = projectedFindingIds(evidenceRow);
        if (ids.length === 0) {
          errors.push(`Projected scan is missing projectedTopFindings IDs in JSONL: ${label}.`);
        }
        if (ids.length !== getNumber(row.projectedTopFindingCount)) {
          errors.push(`Projected finding count mismatch for ${label}: index=${getNumber(row.projectedTopFindingCount)} jsonl=${ids.length}.`);
        }
        const nonUniverseIds = ids.filter((id) => !isExecutiveSummaryTopFindingId(id));
        if (nonUniverseIds.length > 0) {
          errors.push(`Projected scan includes non-universe top finding IDs for ${label}: ${nonUniverseIds.join(", ")}.`);
        }
      }
      if (getNumber(row.evidenceDetailBlockCount) > 0 && evidenceDetailsFromRow(evidenceRow).length === 0) {
        errors.push(`Index reports evidence detail blocks but JSONL reportFacingEvidence has none: ${label}.`);
      }
      for (const block of packetBlocksFromRow(evidenceRow)) {
        if (block.id === SENSITIVE_SURFACE_FINDING_ID && !hasSensitiveSurfaceStructuredEvidence(block)) {
          errors.push(`Sensitive-surface packet is missing structured reviewer-grade evidence fields: ${label}.`);
        }
      }
    }
  }

  const placeholderRows = input.evidenceRows.filter(isPlaceholderEvidenceRow).length;
  if (placeholderRows > 0) {
    warnings.push(`${placeholderRows} JSONL rows are placeholder-like.`);
  }

  return {
    errors,
    ok: errors.length === 0,
    reviewerAuditSummary: buildReviewerAuditSummary(indexRows, evidenceRowsByScanId),
    warnings
  };
}

export function parseReviewEvidenceJsonl(input: string): ReviewEvidenceRow[] {
  return input
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line) as ReviewEvidenceRow;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid JSONL on line ${index + 1}: ${message}`);
      }
    });
}

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

async function main() {
  const indexPath = getArgValue("--index");
  const evidencePath = getArgValue("--evidence");
  const outputPath = getArgValue("--out");

  if (!indexPath || !evidencePath) {
    throw new Error("Usage: validate-tranco-review-export --index <batch-review-index.json> --evidence <batch-report-facing-evidence.jsonl> [--allow-empty] [--out <summary.json>]");
  }

  const result = validateTrancoReviewExport({
    allowEmpty: hasFlag("--allow-empty"),
    evidenceRows: parseReviewEvidenceJsonl(readFileSync(evidencePath, "utf8")),
    index: JSON.parse(readFileSync(indexPath, "utf8")) as ReviewIndexPayload
  });

  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (outputPath) {
    writeFileSync(outputPath, output);
  }
  process.stdout.write(output);
  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

type PacketRow = {
  reviewId: string;
  category: "positive_retention" | "legacy_false_to_unknown";
  scanId: string;
  url: string;
  geometryStatus: string;
  assessmentStatus: string;
  surfaceStatus: string;
  coverageStatus: string;
  limitationCodes: string[];
  changedFields: string[];
  positiveRetentions: string[];
  artifacts: { bundle: string; geometry: string | null };
};

type Packet = { rows: PacketRow[]; summary: Record<string, number> };

type TriageLane = {
  lane: string;
  decision: "needs_luna_adjudication";
  purpose: string;
  rows: number;
  representativeCases: Array<{ reviewId: string; scanId: string; url: string; artifacts: PacketRow["artifacts"] }>;
};

function parseArgs(argv: string[]) {
  const args = {
    packet: "artifacts/consent-control-assessment-adjudication-packet-20260727.json",
    out: "artifacts/consent-control-assessment-adjudication-triage-20260727.json",
    limit: 10,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--packet" && value) { args.packet = value; index += 1; }
    else if (arg === "--out" && value) { args.out = value; index += 1; }
    else if (arg === "--limit" && value) { args.limit = Math.max(1, Number.parseInt(value, 10) || 10); index += 1; }
  }
  return args;
}

function representative(rows: PacketRow[], limit: number) {
  return rows.slice(0, limit).map((row) => ({
    reviewId: row.reviewId,
    scanId: row.scanId,
    url: row.url,
    artifacts: row.artifacts,
  }));
}

function buildLanes(rows: PacketRow[], limit: number): TriageLane[] {
  const lanes: Array<[string, string, (row: PacketRow) => boolean]> = [
    [
      "positive_retention_same_document",
      "Confirm that earlier positive controls are attributable to the canonical document and that later geometry is collapsed or non-authoritative.",
      (row) => row.category === "positive_retention",
    ],
    [
      "legacy_false_to_unknown_missing_or_blocked",
      "Confirm that missing, no-go, or incomplete evidence must remain unknown and must not become missing-control findings.",
      (row) => row.category === "legacy_false_to_unknown" && (row.geometryStatus === "missing" || row.coverageStatus === "none" || row.assessmentStatus === "limited"),
    ],
    [
      "legacy_false_to_unknown_complete_surface_review",
      "Confirm that complete evidence with no actionable first-layer controls is an explicit not-observed/non-actionable result, not a legacy replacement artifact.",
      (row) => row.category === "legacy_false_to_unknown" && row.assessmentStatus === "complete" && row.coverageStatus === "complete",
    ],
  ];
  return lanes.map(([lane, purpose, predicate]) => {
    const matching = rows.filter(predicate);
    return { lane, decision: "needs_luna_adjudication", purpose, rows: matching.length, representativeCases: representative(matching, limit) };
  });
}

export function buildConsentAssessmentAdjudicationTriage(packet: Packet, limit = 10) {
  const rows = [...packet.rows].sort((left, right) => left.reviewId.localeCompare(right.reviewId));
  const lanes = buildLanes(rows, limit);
  return {
    artifactType: "consent_control_assessment_adjudication_triage",
    artifactVersion: "1.0",
    readOnly: true,
    decision: "blocked_pending_luna_adjudication",
    sourcePacket: "artifacts/consent-control-assessment-adjudication-packet-20260727.json",
    acceptancePolicy: {
      noAutomaticApproval: true,
      unknownEvidenceRemainsUnknown: true,
      positiveRetentionRequiresSameDocumentReview: true,
      scoreOrChecklistEffectsRequireSeparateReview: true,
    },
    summary: {
      totalCases: rows.length,
      positiveRetention: rows.filter((row) => row.category === "positive_retention").length,
      legacyFalseToUnknown: rows.filter((row) => row.category === "legacy_false_to_unknown").length,
      lanes: Object.fromEntries(lanes.map((lane) => [lane.lane, lane.rows])),
    },
    lanes,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const packetPath = path.resolve(args.packet);
  const outPath = path.resolve(args.out);
  const packet = JSON.parse(await readFile(packetPath, "utf8")) as Packet;
  const triage = buildConsentAssessmentAdjudicationTriage(packet, args.limit);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify({ ...triage, generatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ out: outPath, decision: triage.decision, summary: triage.summary }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
